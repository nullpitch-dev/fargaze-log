// POST /api/entry/records/<id>/end { end: { date, hour, timezone }, updatedAt } — End now
// on the home screen's Open list (#71). No change-list entry, like a new record.
import { requireUser } from '@/lib/admin/guard';
import { endRecord } from '@/lib/entry/save';
import { reply, body, type IdCtx } from '@/lib/entry/reply';

export async function POST(req: Request, { params }: IdCtx) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const b = await body(req);
  if (!b?.end || typeof b.updatedAt !== 'string') return reply({ ok: false, status: 400, error: 'Send { end, updatedAt }' });
  return reply(await endRecord(g.userId, (await params).id, b.end, b.updatedAt));
}
