// GET /api/admin/lists — every master list with its row count and last change, and
// whether it is pinned to the gear menu (#67).

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import { LISTS } from '@/lib/admin/lists';
import MasterChange from '@/models/MasterChange';
import { getPins } from '@/lib/admin/pins';

export async function GET() {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const { userId } = g;

  const [last, pins] = await Promise.all([
    MasterChange.aggregate([
      { $match: { userId } },
      { $group: { _id: '$list', at: { $max: '$createdAt' } } },
    ]),
    getPins(userId),
  ]);
  const lastBy = new Map(last.map((d: any) => [d._id, d.at]));

  const lists = await Promise.all(LISTS.map(async def => ({
    slug: def.slug,
    title: def.title,
    group: def.group,
    rows: await def.model().countDocuments({ userId, ...(def.filter ?? {}) }),
    lastChange: lastBy.get(def.slug) ?? null,
    pinned: pins.includes(def.slug),
  })));

  return NextResponse.json({ lists });
}
