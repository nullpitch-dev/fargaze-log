// GET /api/entry/ingredients?kind=foods|drinks&item=… → { ingredients } — the ingredients
// of the latest record with that food or drink (#71, Hyoje 10 Nov): the form fills them in
// once the item's name is typed, when they are still empty.
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import Log from '@/models/Log';

//   ?all=1 → { foods: { item: ingredients }, drinks: { … } } — every item's latest
//   ingredients at once, kept on the phone so the fill works with no signal (#71 step 3).
async function all(userId: string) {
  const out: Record<string, Record<string, string[]>> = { foods: {}, drinks: {} };
  for (const kind of ['foods', 'drinks'] as const) {
    const path = `food.${kind}`;
    const rows = await Log.aggregate([
      { $match: { userId, [`${path}.ingredients.0`]: { $exists: true } } },
      { $project: { _id: 0, at: '$start.datetime', x: `$${path}` } },
      { $unwind: '$x' },
      { $match: { 'x.item': { $nin: [null, ''] }, 'x.ingredients.0': { $exists: true } } },
      { $sort: { at: -1 } },
      { $group: { _id: '$x.item', ingredients: { $first: '$x.ingredients' } } },
    ]);
    for (const r of rows) out[kind][r._id] = r.ingredients;
  }
  return out;
}

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const q = new URL(req.url).searchParams;
  if (q.get('all') === '1') return NextResponse.json(await all(g.userId));
  const kind = q.get('kind') === 'drinks' ? 'drinks' : 'foods';
  const item = (q.get('item') ?? '').trim();
  if (!item) return NextResponse.json({ ingredients: [] });
  const path = `food.${kind}`;
  const rows = await Log.find({ userId: g.userId, [path]: { $elemMatch: { item, 'ingredients.0': { $exists: true } } } })
    .sort({ 'start.datetime': -1 }).limit(1).select(path).lean() as any[];
  const hit = (rows[0]?.food?.[kind] ?? []).find((x: any) => x?.item === item && x?.ingredients?.length);
  return NextResponse.json({ ingredients: hit?.ingredients ?? [] });
}
