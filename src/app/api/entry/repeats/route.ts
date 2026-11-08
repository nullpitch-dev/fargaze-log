// /api/entry/repeats (#71, Design §15.7)
//   GET  → { rules } (each with its next date)
//   POST { name, form, allDay, startTime, minutes, iana, freq, interval, weekdays,
//          monthDay, from, until, count, mode: 'ask' | 'auto' } → { rule, made, problem }
import { requireUser } from '@/lib/admin/guard';
import { listRules, createRule } from '@/lib/entry/repeats';
import { reply, body } from '@/lib/entry/reply';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await listRules(g.userId));
}

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await createRule(g.userId, await body(req)));
}
