// src/app/api/calendar/options/route.ts
//
// GET /api/calendar/options — what the Calendar filters offer:
//   categories      every activity.category with its all-time record count
//   crossActivities every distinct activity.crossActivity
//   longestTimed    the longest timed (not all-day) record
//   longTimedCount  timed records longer than MAX_TIMED_SPAN_DAYS; the events
//                   query fetches these by duration, not by the look-back

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import { MAX_TIMED_SPAN_DAYS } from '@/lib/calendar/calendar';

export async function GET() {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await connectDB();

  const [cats, cross, longest, longTimedCount] = await Promise.all([
    Log.aggregate([
      { $match: { userId } },
      { $group: { _id: '$activity.category', count: { $sum: 1 } } },
    ]),
    Log.distinct('activity.crossActivity', {
      userId, 'activity.crossActivity': { $exists: true, $nin: [null, ''] },
    }),
    Log.find(
      { userId, allDay: { $ne: true }, 'duration.totalSeconds': { $ne: null } },
      { 'duration.totalSeconds': 1, activity: 1, 'start.year': 1, 'start.month': 1, 'start.day': 1 },
    ).sort({ 'duration.totalSeconds': -1 }).limit(1).lean(),
    Log.countDocuments({
      userId, allDay: { $ne: true }, 'duration.totalSeconds': { $gt: MAX_TIMED_SPAN_DAYS * 86_400 },
    }),
  ]);

  const categories = cats
    .filter(c => c._id)
    .map(c => ({ name: c._id as string, count: c.count as number }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const l: any = longest[0];
  const longestTimed = l ? {
    id: String(l._id),
    hours: Math.round((l.duration.totalSeconds / 3600) * 10) / 10,
    date: `${l.start?.year}-${String(l.start?.month).padStart(2, '0')}-${String(l.start?.day).padStart(2, '0')}`,
    what: [l.activity?.category, l.activity?.name, l.activity?.title].filter(Boolean).join(' / '),
  } : null;

  return NextResponse.json({
    categories,
    crossActivities: (cross as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    longestTimed,
    longTimedCount,
    longTimedLimitDays: MAX_TIMED_SPAN_DAYS,
  });
}
