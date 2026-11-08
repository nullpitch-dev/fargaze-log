// GET /api/entry/home?tz=Europe/London — the entry app's home (#71, Design §15.7):
// { today, toConfirm, open, todayRecords, comingUp, presets, refreshed }. Opening it
// tops up the repeats and settles "count as done" plans whose end has passed.
import { requireUser } from '@/lib/admin/guard';
import { home } from '@/lib/entry/home';
import { reply } from '@/lib/entry/reply';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const tz = new URL(req.url).searchParams.get('tz') || 'Europe/London';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); } catch { return reply({ ok: false, status: 400, error: `Unknown time zone '${tz}'.` }); }
  return reply(await home(g.userId, tz));
}
