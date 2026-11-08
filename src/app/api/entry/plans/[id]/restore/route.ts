// POST /api/entry/plans/<id>/restore — Undo of Delete.
import { requireUser } from '@/lib/admin/guard';
import { restorePlan } from '@/lib/entry/save';
import { reply, type IdCtx } from '@/lib/entry/reply';

export async function POST(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await restorePlan(g.userId, (await params).id));
}
