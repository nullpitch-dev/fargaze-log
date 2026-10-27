// /api/records/<id> — one record for the edit form (#70, Design §15.6).
//   GET                              → { form, updatedAt, category, tab, findRow }
//   PUT    { form, updatedAt }       → saves; one change-list entry, one line per changed cell
//   DELETE { updatedAt }             → moves the record to log_trash; one change-list entry
// updatedAt is the value GET returned: a record changed since is refused (409).
// 422 = refused, with { problems } (the same list the preview shows).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { getForEdit, saveEdit, deleteRecord } from '@/lib/records/edit';

type Ctx = { params: Promise<{ id: string }> };
const reply = (out: any) => (out.ok ? NextResponse.json(out) : NextResponse.json(out, { status: out.status }));

export async function GET(_req: Request, { params }: Ctx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { id } = await params;
  return reply(await getForEdit(g.userId, id));
}

export async function PUT(req: Request, { params }: Ctx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.form || typeof body.updatedAt !== 'string') {
    return NextResponse.json({ error: 'Send { form, updatedAt }' }, { status: 400 });
  }
  return reply(await saveEdit(g.userId, id, body.form, body.updatedAt));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.updatedAt !== 'string') return NextResponse.json({ error: 'Send { updatedAt }' }, { status: 400 });
  return reply(await deleteRecord(g.userId, id, body.updatedAt));
}
