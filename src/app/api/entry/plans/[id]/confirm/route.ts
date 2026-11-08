// POST /api/entry/plans/<id>/confirm { updatedAt } → { recordId } — Started / Done as
// planned: a record with the plan's own times (a plan still under way keeps its planned end).
import { requireUser } from '@/lib/admin/guard';
import { confirmPlan } from '@/lib/entry/save';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function POST(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (typeof b?.updatedAt !== 'string') return reply({ ok: false, status: 400, error: 'Send { updatedAt }' });
  return reply(await confirmPlan(g.userId, (await params).id, b.updatedAt));
}
