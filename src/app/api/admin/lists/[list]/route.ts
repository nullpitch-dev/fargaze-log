// GET /api/admin/lists/<slug>[?since=YYYY-MM-DD] — one master list: its columns,
// its rows with how many records use each, values used in records but missing
// from the list, the changes made since a date (default: the last 30 days) and every
// change not yet repeated in the sheet, however old (#67).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { getList, toRow, lockedColumns } from '@/lib/admin/lists';
import { addRow } from '@/lib/admin/write';
import TimezoneMaster from '@/models/TimezoneMaster';
import { computeUsage } from '@/lib/admin/usage';
import MasterChange from '@/models/MasterChange';

export async function GET(req: Request, { params }: { params: Promise<{ list: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;

  const { list } = await params;
  const def = getList(list);
  if (!def) return NextResponse.json({ error: `Unknown list: ${list}` }, { status: 404 });

  const sinceParam = new URL(req.url).searchParams.get('since');
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam)
    ? new Date(sinceParam + 'T00:00:00Z')
    : new Date(Date.now() - 30 * 86400_000);

  const docs = await def.model().find({ userId, ...(def.filter ?? {}) }).sort(def.sort).lean();
  const rows = (docs as any[]).map(d => toRow(def, d));

  const needsZones = def.columns.some(c => c.type === 'zoneTime');
  const [usage, changes, zones] = await Promise.all([
    computeUsage(def, userId, rows),
    // Unticked changes always show, however old; ticked ones only since the date.
    MasterChange.find({ userId, list: def.slug, $or: [{ createdAt: { $gte: since } }, { sheetDone: false }] })
      .sort({ createdAt: -1 })
      .select('-recordIds -userId -__v')
      .lean(),
    needsZones ? TimezoneMaster.find({ userId }).sort({ code: 1 }).select('code').lean() : Promise.resolve([]),
  ]);

  return NextResponse.json({
    list: {
      slug: def.slug,
      title: def.title,
      group: def.group,
      note: def.note ?? null,
      columns: def.columns,
      unique: def.unique,
      recordsFollow: !!def.recordsFollow,
      usageCounted: usage.counted,
      locked: lockedColumns(def),
      fixedOnEdit: def.fixedOnEdit ?? [],
      zoneCodes: (zones as any[]).map(z => z.code),
    },
    rows: rows.map(r => ({ ...r, used: usage.counted ? usage.used[r._id] : null })),
    orphans: usage.orphans,
    since: since.toISOString().slice(0, 10),
    changes,
  });
}

// POST /api/admin/lists/<slug>  { values, confirmNew? } — adds a row.
export async function POST(req: Request, { params }: { params: Promise<{ list: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;

  const { list } = await params;
  const def = getList(list);
  if (!def) return NextResponse.json({ error: `Unknown list: ${list}` }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.values !== 'object' || body.values === null) {
    return NextResponse.json({ error: 'Send { values }' }, { status: 400 });
  }
  const r = await addRow(def, g.userId, body.values, body.confirmNew === true);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.status });
}
