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

  const match: any = {
    userId,
    'cost.category': category,
    'cost.amountKRW': { $gt: 0 },
    'start.datetime': {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo),
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
