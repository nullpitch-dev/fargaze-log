// src/app/api/calendar/route.ts
//
// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/London
//   optional: excludeCategories=a,b   crossActivities=x,y   shape=days
//
// `from` / `to` are DISPLAY dates in `tz`, both inclusive. Returns every record
// touching the range (events), or per-day counts (shape=days, for the Year
// view). Logic lives in @/lib/calendar/calendar.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import {
  isValidZone, daySpan, resolveRange, candidateFilter, CANDIDATE_PROJECTION,
  buildCalendarEvents, countByDay, MAX_RANGE_DAYS,
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
  const docs  = await Log.find(candidateFilter(userId, range), CANDIDATE_PROJECTION).lean();
  const { events, diagnostics } = buildCalendarEvents(docs, range, Date.now(), {
    excludeCategories: list(sp.get('excludeCategories')),
    crossActivities:   list(sp.get('crossActivities')),
  });

  const head = {
    range: { from, to, tz, start: new Date(range.startMs).toISOString(), end: new Date(range.endMs).toISOString() },
    total: events.length,
  };

  if (sp.get('shape') === 'days') {
    return NextResponse.json({ ...head, days: countByDay(events, range), diagnostics });
  }
  return NextResponse.json({ ...head, diagnostics, events });
}
