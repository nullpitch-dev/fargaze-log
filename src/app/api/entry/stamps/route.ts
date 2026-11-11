// /api/entry/stamps (#71, Hyoje 10 Nov): a time saved with one tap, with an optional note.
//   GET                                  → { stamps } waiting, newest first
//   POST { start, note?, id?, end? }     → { stamp, already } (id from the phone: offline)
//   POST { restore: <stamp> }            → Undo of a delete
import { requireUser } from '@/lib/admin/guard';
import { createStamp, listStamps, restoreStamp } from '@/lib/entry/stamps';
import { reply, body } from '@/lib/entry/reply';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply({ ok: true, stamps: await listStamps(g.userId) });
}

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (b?.restore) return reply(await restoreStamp(g.userId, b.restore));
  return reply(await createStamp(g.userId, b?.start, b?.note, b?.id, b?.end));
}
