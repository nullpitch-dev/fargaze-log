// /api/entry/repeats/<id>
//   PUT (as POST) → replaces untouched occurrences still to come → { rule, removed, made }
//   DELETE        → stop: untouched occurrences still to come are removed → { removed }
import { requireUser } from '@/lib/admin/guard';
import { updateRule, stopRule } from '@/lib/entry/repeats';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function PUT(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await updateRule(g.userId, (await params).id, await body(req)));
}

export async function DELETE(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await stopRule(g.userId, (await params).id));
}
