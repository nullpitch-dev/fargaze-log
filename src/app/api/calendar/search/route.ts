// src/app/api/calendar/search/route.ts
//
// GET /api/calendar/search — the Calendar's search (WBS #59).
//   q                       main box, all text fields
//   conditions              "activity.name:대변|people.target:윤지" (the 상세 검색 rows)
//   not                     "Doesn't have"
//   dateFrom, dateTo        display dates, inclusive (optional)
//   tz                      display zone
//   excludeCategories, excludeCrossActivities, excludeNames   the page's filters
//   hides                   the Hide list's ticked entries (hides.ts hidesParam)
//
// Returns the newest SEARCH_LIMIT matches as Calendar events, newest first,
// plus the total. Rules: src/lib/calendar/search.ts.
// Plans (Hyoje, 25 Nov): open plans matching the same search come apart — `plans`, soonest
// first (overdue ones first), with their own total — so they never use up the records' limit
// and never count as things that happened. Done plans are left out (their record is found).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import LogPlan from '@/models/LogPlan';
import { hidesFromParam } from '@/lib/calendar/hides';
import {
  isValidZone, resolveRange, buildCalendarEvents, buildPlanEvents, CANDIDATE_PROJECTION, PLAN_PROJECTION, zonedDayStart, addDays,
} from '@/lib/calendar/calendar';
import {
  buildSearchFilter, parseConditions, SEARCH_LIMIT, SEARCH_SCAN_LIMIT, SEARCH_SORT,
} from '@/lib/calendar/search';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAD = 15 * 3_600_000;
const list = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const tz = sp.get('tz') || 'Europe/London';
  if (!isValidZone(tz)) return NextResponse.json({ error: `unknown time zone: ${tz}` }, { status: 400 });
  const dateFrom = sp.get('dateFrom') || null;
  const dateTo   = sp.get('dateTo') || null;
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    return NextResponse.json({ error: 'dateFrom and dateTo must be YYYY-MM-DD' }, { status: 400 });
  }

  const filter = buildSearchFilter(userId, {
    q: sp.get('q') ?? '',
    conditions: parseConditions(sp.get('conditions')),
    not: sp.get('not') ?? '',
    excludeCategories: list(sp.get('excludeCategories')),
    excludeCrossActivities: list(sp.get('excludeCrossActivities')),
    excludeNames: list(sp.get('excludeNames')),
    fromMs: dateFrom ? zonedDayStart(dateFrom, tz) - PAD : null,
    toMs:   dateTo ? zonedDayStart(addDays(dateTo, 1), tz) + PAD : null,
    fromYear: dateFrom ? Number(dateFrom.slice(0, 4)) : null,
    toYear:   dateTo ? Number(dateTo.slice(0, 4)) : null,
  });
  if (!filter) return NextResponse.json({ error: 'enter something to search for' }, { status: 400 });

  await connectDB();
  const t0 = Date.now();
  const [docs, planDocs] = await Promise.all([
    Log.find(filter, CANDIDATE_PROJECTION).sort(SEARCH_SORT).limit(SEARCH_SCAN_LIMIT).lean(),
    LogPlan.find({ ...filter, 'plan.state': 'open' }, PLAN_PROJECTION).limit(SEARCH_SCAN_LIMIT).lean(),
  ]);
  const ms = Date.now() - t0;

  // Exact cut: a match must START on a display date inside the range (records
  // are found by when they happened, as in Search).
  const from = dateFrom ?? '1900-01-01', to = dateTo ?? '2999-12-31';
  const range = resolveRange(from, to, tz);
  // The Hide list (26 Nov): records and plans each by their own entries.
  const hides = hidesFromParam(sp.get('hides'));
  const { events } = buildCalendarEvents(docs, range, Date.now(), { hides });
  const inRange = events
    .filter(e => e.startDate >= from && e.startDate <= to)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || (b.start ?? '').localeCompare(a.start ?? ''));

  const plans = buildPlanEvents(planDocs, range, Date.now(), { hides })
    .filter(e => e.startDate >= from && e.startDate <= to)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.start ?? '').localeCompare(b.start ?? ''));

  return NextResponse.json({
    plans: plans.slice(0, SEARCH_LIMIT),
    planTotal: plans.length,
    total: inRange.length,
    totalIsMinimum: docs.length >= SEARCH_SCAN_LIMIT,   // true → "2000+"
    shown: Math.min(inRange.length, SEARCH_LIMIT),
    ms,
    events: inRange.slice(0, SEARCH_LIMIT),
  });
}
