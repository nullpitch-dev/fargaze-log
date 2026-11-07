// GET /api/records/changes?since=YYYY-MM-DD&limit=100 — the Record changes page (#70).
// Every change not yet repeated in the sheet, however old, plus the ticked ones since
// the date. Tick with PATCH /api/admin/changes/<id>; Undo with POST …/<id>/undo.
// ?count=1 → { waiting } only: the gear menu's badge (5 Nov).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { listRecordChanges, RECORDS_LIST } from '@/lib/records/edit';
import MasterChange from '@/models/MasterChange';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const q = new URL(req.url).searchParams;
  if (q.get('count')) {
    return NextResponse.json({ waiting: await MasterChange.countDocuments({ userId: g.userId, list: RECORDS_LIST, sheetDone: false }) });
  }
  const since = q.get('since');
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return NextResponse.json({ error: 'since must look like 2026-10-27' }, { status: 400 });
  const limit = Number(q.get('limit') ?? 100);
  return NextResponse.json({ changes: await listRecordChanges(g.userId, { since: since ? new Date(`${since}T00:00:00Z`) : null, limit }) });
}
