// POST /api/records/<id>/preview { form } — what a save would do, writing nothing (#70):
// { problems[] (a save is refused while any), warnings[], title, tab, findRow,
//   moveTo, lines[] (one per changed cell: column, what, before, after, calculated?) }

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { previewEdit } from '@/lib/records/edit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.form) return NextResponse.json({ error: 'Send { form }' }, { status: 400 });
  const out = await previewEdit(g.userId, id, body.form);
  return out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status });
}
