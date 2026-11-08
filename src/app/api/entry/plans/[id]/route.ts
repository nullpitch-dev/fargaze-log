// /api/entry/plans/<id> (#71, Design §15.7)
//   GET                         → { form, updatedAt, state, repeatId, recordId }
//   PUT    { form, updatedAt }  → Adjust: a start still to come keeps it a plan
//                                 ({ kind: 'plan' }), otherwise it becomes a record ({ kind: 'record', id })
//   DELETE { updatedAt }        → Delete (Undo: POST …/restore)
import { requireUser } from '@/lib/admin/guard';
import { getPlan, adjustPlan, deletePlan } from '@/lib/entry/save';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function GET(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await getPlan(g.userId, (await params).id));
}

export async function PUT(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (!b?.form || typeof b.updatedAt !== 'string') return reply({ ok: false, status: 400, error: 'Send { form, updatedAt }' });
  return reply(await adjustPlan(g.userId, (await params).id, b.form, b.updatedAt));
}

export async function DELETE(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (typeof b?.updatedAt !== 'string') return reply({ ok: false, status: 400, error: 'Send { updatedAt }' });
  return reply(await deletePlan(g.userId, (await params).id, b.updatedAt));
}
