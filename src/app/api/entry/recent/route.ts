// GET /api/entry/recent?q=… → { recent } — Copy recent's search over every record (#71).
import { requireUser } from '@/lib/admin/guard';
import { searchRecent } from '@/lib/entry/home';
import { reply } from '@/lib/entry/reply';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await searchRecent(g.userId, new URL(req.url).searchParams.get('q') ?? ''));
}
