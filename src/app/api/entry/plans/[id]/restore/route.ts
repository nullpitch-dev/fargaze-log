// POST /api/entry/plans/<id>/restore — Undo of Delete.
import { requireUser } from '@/lib/admin/guard';
import { restorePlan } from '@/lib/entry/save';
import { reply, type IdCtx } from '@/lib/entry/reply';
import { syncAfter } from '@/lib/gcal/sync';

export async function POST(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  syncAfter(g.userId);   // Google Calendar (§15.9): after the answer
  return reply(await restorePlan(g.userId, (await params).id));
}
