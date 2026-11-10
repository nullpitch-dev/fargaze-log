// src/app/api/calendar/route.ts
//
// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/London
//   optional: excludeCategories=a,b   crossActivities=x,y   shape=days
//             excludeCrossActivities=x,y   excludeNames=n1,n2   (the Year view's counts)
//
// `from` / `to` are DISPLAY dates in `tz`, both inclusive. Returns every record
// touching the range (events), or per-day counts (shape=days, for the Year
// view). Logic lives in @/lib/calendar/calendar.
// Open plans (log_plan, #71) are added to the events, marked plan: true; they are not
// counted in the Year view.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import LogPlan from '@/models/LogPlan';
import {
  isValidZone, daySpan, resolveRange, candidateFilter, CANDIDATE_PROJECTION,
  buildCalendarEvents, buildRecordEvents, countByDay, MAX_RANGE_DAYS, PLAN_PROJECTION, buildPlanEvents, sortEvents,
} from '@/lib/calendar/calendar';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sp   = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '';
  const to   = sp.get('to') ?? '';
  const tz   = sp.get('tz') || 'Europe/London';

  if (!DATE_RE.test(from) || !DATE_RE.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
  }
  if (to < from) return NextResponse.json({ error: 'to is before from' }, { status: 400 });
  if (daySpan(from, to) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `range is longer than ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }
  if (!isValidZone(tz)) return NextResponse.json({ error: `unknown time zone: ${tz}` }, { status: 400 });

  await connectDB();

  const range = resolveRange(from, to, tz);
  const days  = sp.get('shape') === 'days';
  // The Year view counts records as they are; the other views draw a record still going
  // to its planned end (untilPlanned).
  const docs  = await Log.find(candidateFilter(userId, range), days ? CANDIDATE_PROJECTION : PLAN_PROJECTION).lean();
  const filters = {
    excludeCategories: list(sp.get('excludeCategories')),
    crossActivities:   list(sp.get('crossActivities')),
    excludeCrossActivities: list(sp.get('excludeCrossActivities')),
    excludeNames:      list(sp.get('excludeNames')),
  };
  const { events, diagnostics } = days
    ? buildCalendarEvents(docs, range, Date.now(), filters)
    : buildRecordEvents(docs, range, Date.now(), filters);

  const head = {
    range: { from, to, tz, start: new Date(range.startMs).toISOString(), end: new Date(range.endMs).toISOString() },
    total: events.length,
  };

  if (days) {
    return NextResponse.json({ ...head, days: countByDay(events, range), diagnostics });
  }
  const plans = await LogPlan.find({ ...candidateFilter(userId, range), 'plan.state': 'open' }, PLAN_PROJECTION).lean();
  const all = sortEvents([...events, ...buildPlanEvents(plans, range, Date.now(), filters)]);
  return NextResponse.json({ ...head, total: all.length, diagnostics, events: all });
}
