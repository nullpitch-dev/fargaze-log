// src/app/api/cost-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function generateMonths(dateFrom: string, dateTo: string): string[] {
  const months: string[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  start.setDate(1);
  end.setDate(1);
  const cur = new Date(end);
  while (cur >= start) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() - 1);
  }
  return months;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const defaults = getDefaultDateRange();
  const dateFrom = searchParams.get('dateFrom') ?? defaults.from;
  const dateTo = searchParams.get('dateTo') ?? defaults.to;
  const categoriesParam = searchParams.get('categories');
  const detailsParam = searchParams.get('categoryDetails');
  const crossActivitiesParam = searchParams.get('crossActivities');
  const excludePurchaseItemsParam = searchParams.get('excludePurchaseItems')?.trim();
  const excludePurchaseItems = excludePurchaseItemsParam
    ? excludePurchaseItemsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  await connectDB();

  const matchStage: any = {
    userId,
    'cost.amountKRW': { $gt: 0 },
    'cost.category': { $ne: null },
    'start.datetime': {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo),
    },
  };

  if (categoriesParam) {
    matchStage['cost.category'] = { $in: categoriesParam.split(',').map(s => s.trim()) };
  }
  if (detailsParam) {
    matchStage['cost.categoryDetail'] = { $in: detailsParam.split(',').map(s => s.trim()) };
  }
  if (crossActivitiesParam) {
    matchStage['activity.crossActivity'] = {
      $in: crossActivitiesParam.split(',').map(s => s.trim()),
    };
  }
  if (excludePurchaseItems.length > 0) {
    matchStage['purchase'] = {
      $not: {
        $elemMatch: {
          item: {
            $in: excludePurchaseItems.map(item =>
              new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
            ),
          },
        },
      },
    };
  }

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          category: '$cost.category',
          categoryDetail: '$cost.categoryDetail',
          year: '$start.year',
          month: '$start.month',
        },
        total: { $sum: '$cost.amountKRW' },
      },
    },
    { $sort: { '_id.category': 1, '_id.categoryDetail': 1, '_id.year': 1, '_id.month': 1 } },
  ];

  const raw = await Log.aggregate(pipeline);
  const months = generateMonths(dateFrom, dateTo);

  // Build row map: category -> categoryDetail -> monthKey -> total
  const rowMap = new Map<string, Map<string, Map<string, number>>>();

  for (const doc of raw) {
    const { category, categoryDetail, year, month } = doc._id;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    if (!months.includes(monthKey)) continue;

    const detail = categoryDetail ?? '(미분류)';
    if (!rowMap.has(category)) rowMap.set(category, new Map());
    const detailMap = rowMap.get(category)!;
    if (!detailMap.has(detail)) detailMap.set(detail, new Map());
    detailMap.get(detail)!.set(monthKey, (detailMap.get(detail)!.get(monthKey) ?? 0) + doc.total);
  }

  // Compute category totals for sorting
  const categoryTotals = new Map<string, number>();
  for (const [cat, detailMap] of rowMap) {
    let catTotal = 0;
    for (const [, monthMap] of detailMap) {
      for (const v of monthMap.values()) catTotal += v;
    }
    categoryTotals.set(cat, catTotal);
  }

  // Build rows array sorted by category total desc, then detail total desc
  const rows: any[] = [];
  const sortedCategories = [...rowMap.keys()].sort(
    (a, b) => (categoryTotals.get(b) ?? 0) - (categoryTotals.get(a) ?? 0)
  );

  for (const category of sortedCategories) {
    const detailMap = rowMap.get(category)!;

    // Category summary row
    const catMonths: Record<string, number> = {};
    let catTotal = 0;
    for (const [, monthMap] of detailMap) {
      for (const [mk, v] of monthMap) {
        catMonths[mk] = (catMonths[mk] ?? 0) + v;
        catTotal += v;
      }
    }
    rows.push({ category, categoryDetail: null, months: catMonths, total: catTotal });

    // Detail rows sorted by total desc
    const sortedDetails = [...detailMap.keys()].sort((a, b) => {
      const aTotal = [...detailMap.get(a)!.values()].reduce((s, v) => s + v, 0);
      const bTotal = [...detailMap.get(b)!.values()].reduce((s, v) => s + v, 0);
      return bTotal - aTotal;
    });

    for (const detail of sortedDetails) {
      const monthMap = detailMap.get(detail)!;
      const detailMonths: Record<string, number> = {};
      let detailTotal = 0;
      for (const [mk, v] of monthMap) {
        detailMonths[mk] = v;
        detailTotal += v;
      }
      rows.push({ category, categoryDetail: detail, months: detailMonths, total: detailTotal });
    }
  }

  // Column totals
  const columnTotals: Record<string, number> = {};
  for (const row of rows.filter(r => r.categoryDetail !== null)) {
    for (const [mk, v] of Object.entries(row.months)) {
      columnTotals[mk] = (columnTotals[mk] ?? 0) + (v as number);
    }
  }

  return NextResponse.json({ months, rows, columnTotals });
}
