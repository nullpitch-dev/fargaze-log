// GET /api/places/point?name=<place as logged>&at=<ms> → where a record's place is, for the
// record pane's Map link (Hyoje, 22 Nov).
//   { real, pointName, lat, lng }  real = 집 / 회사 … resolved at `at`; pointName = the
//                                   longest form with a point ("A - B" uses A's) — or null,
//                                   then `add` is the name to give a point (the head of real).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/admin/guard';
import FavoritePlace from '@/models/FavoritePlace';
import PlaceCoord from '@/models/PlaceCoord';
import { pointNameFor, splitHead, withFavorite } from '@/lib/places/details';
import { resolveFavoritePlace } from '@/lib/migration/favoritePlace';

export async function GET(req: NextRequest) {
  const g = await requireUser();
  if (g.denied) return g.denied;
  const name = (req.nextUrl.searchParams.get('name') ?? '').trim();
  const at = Number(req.nextUrl.searchParams.get('at')) || Date.now();
  if (!name) return NextResponse.json({ error: 'Send ?name=' }, { status: 400 });
  const [favs, coords] = await Promise.all([
    FavoritePlace.find({ userId: g.userId }).lean() as Promise<any[]>,
    PlaceCoord.find({ userId: g.userId }, { name: 1, lat: 1, lng: 1 }).lean() as Promise<any[]>,
  ]);
  const fav = favs.map(f => ({ ...f, from: f.from ? { ...f.from, at: new Date(f.from.at) } : null, to: f.to ? { ...f.to, at: new Date(f.to.at) } : null }));
  const real = withFavorite(name, x => resolveFavoritePlace(fav, x, new Date(at)));
  const byName = new Map(coords.map(c => [c.name, c]));
  const pointName = pointNameFor(real, n => byName.has(n));
  const p = pointName ? byName.get(pointName) : null;
  return NextResponse.json(
    { real, pointName, lat: p?.lat ?? null, lng: p?.lng ?? null, add: p ? null : splitHead(real).head.trim() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
