// POST /api/entry/records { id, form, presetId? } → { id, kind, already } (#71, Design §15.7).
// A start still to come makes a plan, anything else a record. `id` is made on the phone
// (24 hex characters): sending the same one again returns what was saved, so a retried
// upload never makes a record twice. 422 = refused, with { problems }.
import { requireUser } from '@/lib/admin/guard';
import { createEntry } from '@/lib/entry/save';
import { presetUsed } from '@/lib/entry/presets';
import { reply, body } from '@/lib/entry/reply';

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  const out = await createEntry(g.userId, b?.id, b?.form);
  if (out.ok && !out.already && typeof b?.presetId === 'string') await presetUsed(g.userId, b.presetId);
  return reply(out);
}
