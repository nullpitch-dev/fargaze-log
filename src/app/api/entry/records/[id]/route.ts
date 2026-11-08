// DELETE /api/entry/records/<id> — Undo on the toast right after saving: removes a record
// or plan made here in the last 15 minutes and not changed since (a record goes to
// log_trash). Anything older is deleted from its own page.
import { requireUser } from '@/lib/admin/guard';
import { discardNew } from '@/lib/entry/save';
import { reply, type IdCtx } from '@/lib/entry/reply';

export async function DELETE(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await discardNew(g.userId, (await params).id));
}
