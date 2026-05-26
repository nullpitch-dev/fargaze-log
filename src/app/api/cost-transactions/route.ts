// src/app/api/cost-transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const categoryDetail = searchParams.get('categoryDetail');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const crossActivitiesParam = searchParams.get('crossActivities');

  if (!category || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'category, dateFrom, dateTo are required' }, { status: 400 });
  }

  await connectDB();

  // Filter by start.year/month/day (local date fields) to match the same records
  // that cost-summary groups and counts. Using start.datetime (UTC) would shift
  // records across day boundaries for non-UTC timezones.
  const [fromYear, fromMonth, fromDay] = dateFrom.split('-').map(Number);
  const [toYear, toMonth, toDay] = dateTo.split('-').map(Number);

  const match: any = {
    userId,
    'cost.category': category,
    'cost.amountKRW': { $gt: 0 },
    $expr: {
      $and: [
        {
          $gte: [
            { $dateFromParts: { year: '$start.year', month: '$start.month', day: '$start.day' } },
            { $dateFromParts: { year: fromYear, month: fromMonth, day: fromDay } },
          ],
        },
        {
          $lte: [
            { $dateFromParts: { year: '$start.year', month: '$start.month', day: '$start.day' } },
            { $dateFromParts: { year: toYear, month: toMonth, day: toDay } },
          ],
        },
      ],
    },
  };

  if (categoryDetail) {
    match['cost.categoryDetail'] = categoryDetail;
  }
  if (crossActivitiesParam) {
    match['activity.crossActivity'] = {
      $in: crossActivitiesParam.split(',').map(s => s.trim()),
    };
  }

  const results = await Log.find(match)
    .sort({ 'start.datetime': 1 })
    .select('-userId -sync.eventId -__v')
    .lean();

  return NextResponse.json({ total: results.length, results });
}
