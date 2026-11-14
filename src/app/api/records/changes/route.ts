// GET /api/records/changes?since=YYYY-MM-DD&limit=100 — the Record changes page (#70): the
// record edits, deletes and Find & replace since the date, newest first; Undo with
// POST /api/admin/changes/<id>/undo. (Ticks and the waiting count went with the freeze, 14 Nov.)

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { listRecordChanges } from '@/lib/records/edit';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const q = new URL(req.url).searchParams;
  const since = q.get('since');
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return NextResponse.json({ error: 'since must look like 2026-10-27' }, { status: 400 });
  const limit = Number(q.get('limit') ?? 100);
  return NextResponse.json({ changes: await listRecordChanges(g.userId, { since: since ? new Date(`${since}T00:00:00Z`) : null, limit }) });
}
