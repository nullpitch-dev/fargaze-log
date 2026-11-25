// /api/entry/repeats (#71, Design §15.7)
//   GET  → { rules } (each with its next date); ?record=<id> → { rule } the repeat it came from, or null
//   POST { name, form, allDay, startTime, minutes, iana, freq (daily|weekly|monthly|yearly), interval, weekdays,
//          monthDay | monthWeek + monthWeekday, from, until, count, mode: 'ask' | 'auto',
//          doneAs?: { date, recordId }, adopt?: { planId, updatedAt, form } } → { rule, made, problem }
import { requireUser } from '@/lib/admin/guard';
import { listRules, createRule, ruleOfRecord } from '@/lib/entry/repeats';
import { reply, body } from '@/lib/entry/reply';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const record = new URL(req.url).searchParams.get('record');
  if (record) return reply(await ruleOfRecord(g.userId, record));
  return reply(await listRules(g.userId));
}

export async function POST(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  return reply(await createRule(g.userId, await body(req)));
}
