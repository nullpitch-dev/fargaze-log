// /api/entry/stamps/<id> (#71)
//   GET                       → { stamp, used }
//   PUT { note?, end? }       → { stamp }   (End now sends end; an empty end clears it)
//   DELETE                    → { stamp }   (the toast's Undo sends it back as { restore })
import { requireUser } from '@/lib/admin/guard';
import { deleteStamp, getStamp, updateStamp } from '@/lib/entry/stamps';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function GET(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await getStamp(g.userId, (await params).id));
}

export async function PUT(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  return reply(await updateStamp(g.userId, (await params).id, { note: b?.note, end: b?.end }));
}

export async function DELETE(_req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await deleteStamp(g.userId, (await params).id));
}
