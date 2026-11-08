// /api/entry/presets/<id> — PUT { name?, form?, time?, order? } · DELETE
import { requireUser } from '@/lib/admin/guard';
import { updatePreset, deletePreset } from '@/lib/entry/presets';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function PUT(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await updatePreset(g.userId, (await params).id, await body(req)));
}

export async function DELETE(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await deletePreset(g.userId, (await params).id));
}
