// GET /api/entry/ingredients?kind=foods|drinks&item=… → { ingredients } — the ingredients
// of the latest record with that food or drink (#71, Hyoje 10 Nov): the form fills them in
// once the item's name is typed, when they are still empty.
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import Log from '@/models/Log';

export async function GET(req: Request) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind') === 'drinks' ? 'drinks' : 'foods';
  const item = (q.get('item') ?? '').trim();
  if (!item) return NextResponse.json({ ingredients: [] });
  const path = `food.${kind}`;
  const rows = await Log.find({ userId: g.userId, [path]: { $elemMatch: { item, 'ingredients.0': { $exists: true } } } })
    .sort({ 'start.datetime': -1 }).limit(1).select(path).lean() as any[];
  const hit = (rows[0]?.food?.[kind] ?? []).find((x: any) => x?.item === item && x?.ingredients?.length);
  return NextResponse.json({ ingredients: hit?.ingredients ?? [] });
}
