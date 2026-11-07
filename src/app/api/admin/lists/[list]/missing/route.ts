// /api/admin/lists/<slug>/missing — Place points > Missing points (7 Nov 2026).
//   GET  ?months=3|6|12|all  names in Place / From / To with no place point, in records
//        starting in the last N months; names Hyoje excluded come back separately
//        (with their counts in the same period, 0 when unused there).
//   POST { exclude: name } | { putBack: name }  — the exclusion list lives in
//        admin_settings.pointExcluded. Only the list: no record changes, no sheet step.
//   POST { rename: { from, to }, expectRecords? }  — rename a name with no point
//        (exactly as logged; renamePlace.ts). Without expectRecords: the preview; with
//        it: the change (one change-list entry, Undo until the next migration).
// Only for lists with page.missingPoints (place points).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { getList } from '@/lib/admin/lists';
import { missingPoints, type MissingPoint } from '@/lib/admin/usage';
import AdminSettings from '@/models/AdminSettings';
import { previewNameRename, applyNameRename } from '@/lib/admin/renamePlace';

const MONTHS = new Set(['3', '6', '12', 'all']);

/** Today's date in London (local dates are the truth), N months back, as YYYYMMDD. */
function fromYmd(months: number): number {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()).split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate();
  return back.getUTCFullYear() * 10000 + (back.getUTCMonth() + 1) * 100 + Math.min(d, last);
}

async function excludedList(userId: string): Promise<{ name: string; at: string | null }[]> {
  const doc = await AdminSettings.findOne({ userId }).select('pointExcluded').lean() as { pointExcluded?: { name: string; at?: Date }[] } | null;
  return (doc?.pointExcluded ?? []).map(e => ({ name: e.name, at: e.at ? new Date(e.at).toISOString() : null }));
}

async function guardList(params: Promise<{ list: string }>) {
  const { list } = await params;
  const def = getList(list);
  return def?.page?.missingPoints ? def : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ list: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;
  const def = await guardList(params);
  if (!def) return NextResponse.json({ error: 'No missing points for this list' }, { status: 404 });

  const m = new URL(req.url).searchParams.get('months') ?? '3';
  if (!MONTHS.has(m)) return NextResponse.json({ error: 'months must be 3, 6, 12 or all' }, { status: 400 });
  const from = m === 'all' ? null : fromYmd(Number(m));

  const [all, ex] = await Promise.all([missingPoints(def, userId, from), excludedList(userId)]);
  const exNames = new Set(ex.map(e => e.name));
  const byName = new Map(all.map(n => [n.name, n]));
  const excluded = ex
    .map(e => ({ ...(byName.get(e.name) ?? { name: e.name, records: 0, byField: {}, last: '', details: [], exact: 0 } as MissingPoint), at: e.at }))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const ymd = from ? `${String(from).slice(0, 4)}-${String(from).slice(4, 6)}-${String(from).slice(6, 8)}` : null;
  return NextResponse.json({ months: m, from: ymd, names: all.filter(n => !exNames.has(n.name)), excluded });
}

export async function POST(req: Request, { params }: { params: Promise<{ list: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;
  const def = await guardList(params);
  if (!def) return NextResponse.json({ error: 'No missing points for this list' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { exclude?: unknown; putBack?: unknown; rename?: { from?: unknown; to?: unknown }; expectRecords?: unknown };
  if (body.rename && typeof body.rename === 'object') {
    const { from, to } = body.rename;
    if (typeof body.expectRecords === 'number') {
      const r = await applyNameRename(def, userId, from, to, body.expectRecords);
      return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
    }
    const r = await previewNameRename(def, userId, from, to);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ preview: { ...r.preview, plan: undefined } });
  }
  const name = typeof body.exclude === 'string' ? body.exclude.trim() : typeof body.putBack === 'string' ? body.putBack.trim() : '';
  if (!name) return NextResponse.json({ error: 'Send { exclude: name } or { putBack: name }' }, { status: 400 });

  if (typeof body.exclude === 'string') {
    // Once only: a name already excluded stays as it was.
    await AdminSettings.updateOne(
      { userId, 'pointExcluded.name': { $ne: name } },
      { $push: { pointExcluded: { name, at: new Date() } } },
    );
    if (!(await AdminSettings.exists({ userId }))) {
      await AdminSettings.create({ userId, pointExcluded: [{ name, at: new Date() }] });
    }
  } else {
    await AdminSettings.updateOne({ userId }, { $pull: { pointExcluded: { name } } });
  }
  return NextResponse.json({ ok: true, excluded: await excludedList(userId) });
}
