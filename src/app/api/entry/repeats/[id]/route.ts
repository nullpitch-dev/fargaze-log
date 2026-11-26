// /api/entry/repeats/<id>
//   GET           → { rule } (the form shows its schedule on a repeating plan)
//   PUT (as POST) → "All events": + planId, updatedAt, planForm (that plan's edits, saved first);
//                   replaces untouched occurrences still to come → { rule, removed, made, kind, id }
//   DELETE        → no body: stop (untouched occurrences still to come removed) → { removed };
//                   { scope: 'one' | 'following' | 'all', planId, updatedAt, at, keepId? } — deleting a
//                   repeating plan, as Google Calendar (24 Nov) → { removed }
import { requireUser } from '@/lib/admin/guard';
import { deleteScoped, getRule, stopRule, updateAll } from '@/lib/entry/repeats';
import { reply, body, type IdCtx } from '@/lib/entry/reply';
import { syncAfter } from '@/lib/gcal/sync';

export async function GET(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await getRule(g.userId, (await params).id));
}

export async function PUT(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  syncAfter(g.userId);   // Google Calendar (§15.9): after the answer
  return reply(await updateAll(g.userId, (await params).id, await body(req)));
}

export async function DELETE(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  syncAfter(g.userId);   // Google Calendar (§15.9): after the answer
  const b = await req.json().catch(() => null);
  const id = (await params).id;
  return reply(b?.scope ? await deleteScoped(g.userId, id, b) : await stopRule(g.userId, id));
}
