// PATCH  /api/admin/lists/<slug>/<id>  { values, confirmNew? } — edits a row.
// DELETE /api/admin/lists/<slug>/<id>                          — deletes a row no record uses.
// Checks and logging: src/lib/admin/write.ts (#67 step 2).

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { requireUser } from '@/lib/admin/guard';
import { getList } from '@/lib/admin/lists';
import { editRow, deleteRow } from '@/lib/admin/write';

type Ctx = { params: Promise<{ list: string; id: string }> };

async function resolve(ctx: Ctx) {
  const { list, id } = await ctx.params;
  const def = getList(list);
  if (!def) return { error: NextResponse.json({ error: `Unknown list: ${list}` }, { status: 404 }) };
  if (!isValidObjectId(id)) return { error: NextResponse.json({ error: 'Unknown row' }, { status: 404 }) };
  return { def, id };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const r0 = await resolve(ctx);
  if ('error' in r0) return r0.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.values !== 'object' || body.values === null) {
    return NextResponse.json({ error: 'Send { values }' }, { status: 400 });
  }
  const r = await editRow(r0.def, g.userId, r0.id, body.values, body.confirmNew === true);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.status });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const r0 = await resolve(ctx);
  if ('error' in r0) return r0.error;

  const r = await deleteRow(r0.def, g.userId, r0.id);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.status });
}
