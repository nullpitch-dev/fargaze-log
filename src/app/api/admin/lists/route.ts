// GET /api/admin/lists — every master list with its row count and last change,
// and the number of changes not yet repeated in the sheet (#67).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { LISTS } from '@/lib/admin/lists';
import MasterChange from '@/models/MasterChange';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;

  const [last, pending] = await Promise.all([
    MasterChange.aggregate([
      { $match: { userId } },
      { $group: { _id: '$list', at: { $max: '$createdAt' } } },
    ]),
    MasterChange.aggregate([
      { $match: { userId, sheetDone: false } },
      { $group: { _id: '$list', n: { $sum: 1 } } },
    ]),
  ]);
  const lastBy = new Map(last.map((d: any) => [d._id, d.at]));
  const pendingBy = new Map(pending.map((d: any) => [d._id, d.n]));

  const lists = await Promise.all(LISTS.map(async def => ({
    slug: def.slug,
    title: def.title,
    group: def.group,
    rows: await def.model().countDocuments({ userId, ...(def.filter ?? {}) }),
    lastChange: lastBy.get(def.slug) ?? null,
    pendingSheet: pendingBy.get(def.slug) ?? 0,
  })));

  const pendingSheet = lists.reduce((a, l) => a + l.pendingSheet, 0);
  return NextResponse.json({ lists, pendingSheet });
}
