// POST /api/entry/repeats/<id>/split — "This and following events" (24 Nov): the rule's
// fields with from = the plan's date, + planId, updatedAt, planForm → the old repeat ends the
// day before, a new one starts there → { rule, made, problem, kind, id }
import { requireUser } from '@/lib/admin/guard';
import { splitRule } from '@/lib/entry/repeats';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function POST(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await splitRule(g.userId, (await params).id, await body(req)));
}
