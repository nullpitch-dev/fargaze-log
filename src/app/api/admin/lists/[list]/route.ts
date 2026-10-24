// GET /api/admin/lists/<slug>[?since=YYYY-MM-DD] — one master list: its columns,
// its rows with how many records use each, values used in records but missing
// from the list, the changes made since a date (default: the last 30 days) and every
// change not yet repeated in the sheet, however old (#67).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { getList, toRow } from '@/lib/admin/lists';
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

  const [usage, changes] = await Promise.all([
    computeUsage(def, userId, rows),
    // Unticked changes always show, however old; ticked ones only since the date.
    MasterChange.find({ userId, list: def.slug, $or: [{ createdAt: { $gte: since } }, { sheetDone: false }] })
      .sort({ createdAt: -1 })
      .select('-recordIds -userId -__v')
      .lean(),
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
    },
    rows: rows.map(r => ({ ...r, used: usage.counted ? usage.used[r._id] : null })),
    orphans: usage.orphans,
    since: since.toISOString().slice(0, 10),
    changes,
  });
}
