// POST /api/entry/plans/<id>/confirm { updatedAt, how, now? } → { recordId } (#71; Hyoje 9 Nov)
//   how 'now'    Start now: an open record starting now (send now: { date, hour, timezone })
//   how 'onTime' Started on time: an open record starting at the planned start
//   how 'done'   Done as planned: a record with the plan's own times
import { requireUser } from '@/lib/admin/guard';
import { confirmPlan } from '@/lib/entry/save';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function POST(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (typeof b?.updatedAt !== 'string') return reply({ ok: false, status: 400, error: 'Send { updatedAt, how }' });
  const how = b.how === 'now' || b.how === 'onTime' ? b.how : 'done';
  return reply(await confirmPlan(g.userId, (await params).id, b.updatedAt, how, b.now));
}
