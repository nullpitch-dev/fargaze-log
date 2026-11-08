// POST /api/entry/check { form } → { kind: 'record' | 'plan', problems, warnings } — the
// checks a save would run, writing nothing (the form checks as you type).
import { requireUser } from '@/lib/admin/guard';
import { previewNew } from '@/lib/entry/save';
import { reply, body } from '@/lib/entry/reply';

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  return reply(await previewNew(g.userId, b?.form));
}
