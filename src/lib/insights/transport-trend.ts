// src/lib/insights/transport-trend.ts
// Journeys widget — Trend view (WBS #63, Trend).
//
// Every bucket is a Journeys Summary run over the bucket's own dates, so a
// Month bucket always agrees with the Summary for that month: the 6 am rule,
// flights set aside, the 퇴근길 식사/볼일 sum of legs, workplaces and the first
// commute of the day all come from the same code (transport.ts). The costly,
// all-of-history part is prepared ONCE (prepareTransport); each bucket is only
// a cut of it. The map is not built for buckets.
//
// Every figure is given for All / Weekday / Weekend, so the switch does not
// need a new request.
//
// Rules shown in the view, decided here or there:
//   • A bucket with no journeys / commutes / arrivals has nulls → a gap.
//     There is NO minimum count: one commute is a real band, one arrival a
//     real point (earliest = average = latest).
//   • Distance figures carry their coverage; the view hides a km point when
//     under half of its journeys / trips have a distance (KM_MIN_COVERAGE).
//   • Clock times are minutes after midnight. Evening times (퇴근, getting
//     home) use the 6 am rule, so 01:10 is 1510 (25:10).

import Log from '@/models/Log';
import FavoritePlace from '@/models/FavoritePlace';
import PlaceCoord from '@/models/PlaceCoord';
import {
  prepareTransport, cutPeriod, blocksFor, lastDayOf, DAY_KINDS,
  type DayKind, type TransportBlock, type CommuteSide,
} from './transport';
import type { FavoritePlaceDoc } from '@/lib/migration/favoritePlace';
import type { PlaceCoordDoc } from '@/lib/migration/placeCoord';
import {
  buildBucketStarts, bucketLabel, fromYMD, ymd, type TrendGrain,
} from './trend-window';

export const KM_MIN_COVERAGE = 0.5;

// ── Output types ──────────────────────────────────────────────────────────────

export interface TrendShare { count: number; minutes: number; km: number | null }

export interface TrendCommute {
  count: number;
  depart: number | null;          // average, minutes after midnight
  arrive: number | null;
  durationMin: number | null;     // average travel time (퇴근길 식사/볼일: sum of legs)
  km: number | null;              // average over trips with a distance
  kmCoverage: number;             // 0–1
}

export interface TrendArrival {
  count: number;
  earliest: number | null;        // minutes, 6 am rule
  average: number | null;
  latest: number | null;
}

export interface TransportTrendBlock {
  days: number;
  journeys: number;
  minutes: number;
  km: number | null;              // total over journeys with a distance
  kmCoverage: number;             // 0–1, journeys with a distance
  perDay: { journeys: number; minutes: number; km: number | null };
  purpose: Record<string, TrendShare>;
  method: Record<string, TrendShare>;  // per leg, as the Summary
  commute: { out: TrendCommute; back: TrendCommute };
  gettingHome: Record<string, TrendArrival>;   // all / work / dinner / social
  alone: number;                  // journeys with nobody
  // Everyone in the bucket, busiest first, with journeys per relation so the
  // view's Relation filter can re-rank (as Diet's People does).
  people: { name: string; count: number; categories: Record<string, number> }[];
}

export interface TransportTrendBucket {
  label: string;
  start: string;
  end: string;
  blocks: Record<DayKind, TransportTrendBlock>;
}

export interface TransportTrend {
  grain: TrendGrain;
  windowStart: string;
  windowEnd: string;
  kmMinCoverage: number;
  gettingHomeGroups: { key: string; label: string }[];
  buckets: TransportTrendBucket[];
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function computeTransportTrend(
  userId: string,
  grain: TrendGrain,
  windowStart: Date,
  windowEnd: Date,
  crossActivities: string[],
): Promise<TransportTrend> {
  const [docs, favorites, places] = await Promise.all([
    Log.find(
      { userId, 'activity.category': '이동' },
      { start: 1, end: 1, activity: 1, location: 1, transport: 1, people: 1 },
    ).lean(),
    FavoritePlace.find({ userId }).lean(),
    PlaceCoord.find({ userId }, { name: 1, lat: 1, lng: 1 }).lean(),
  ]);
  return buildTransportTrend(
    docs as any[], favorites as any[], grain, ymd(windowStart), ymd(windowEnd),
    crossActivities, localToday(), places as any[],
  );
}

// Pure, like buildTransportSummary: runs against an export without a database.
export function buildTransportTrend(
  docs: any[],
  favorites: FavoritePlaceDoc[],
  grain: TrendGrain,
  startStr: string,
  endStr: string,
  crossActivities: string[],
  todayStr: string,
  placeCoords: Pick<PlaceCoordDoc, 'name' | 'lat' | 'lng'>[] = [],
): TransportTrend {
  const ctx = prepareTransport(docs, favorites, placeCoords);
  const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return fromYMD(y, m, d); };
  const ws = toDate(startStr);
  const we = toDate(lastDayOf(endStr, todayStr));

  let groups: { key: string; label: string }[] = [];
  const buckets = buildBucketStarts(grain, ws, we).map(bs => {
    const be = new Date(bs);
    if (grain === 'week') be.setUTCDate(be.getUTCDate() + 6);
    else if (grain === 'month') { be.setUTCMonth(be.getUTCMonth() + 1); be.setUTCDate(be.getUTCDate() - 1); }
    const from = ymd(bs < ws ? ws : bs);
    const to = ymd(be > we ? we : be);

    const full = blocksFor(ctx, cutPeriod(ctx, from, to, crossActivities), from, to, false);
    if (!groups.length) groups = full.all.comingHome.map(g => ({ key: g.key, label: g.label }));

    const blocks = {} as Record<DayKind, TransportTrendBlock>;
    for (const kind of DAY_KINDS) blocks[kind] = slim(full[kind]);
    return { label: bucketLabel(grain, bs), start: from, end: to, blocks };
  });

  return {
    grain,
    windowStart: ymd(ws),
    windowEnd: ymd(we),
    kmMinCoverage: KM_MIN_COVERAGE,
    gettingHomeGroups: groups,
    buckets,
  };
}

// ── A Summary block → the figures the Trend draws ────────────────────────────

function slim(b: TransportBlock): TransportTrendBlock {
  const o = b.overview;
  const shareRec = (list: TransportBlock['byPurpose']) =>
    Object.fromEntries(list.map(s => [s.key, { count: s.count, minutes: s.minutes, km: s.km }]));
  const commute = (c: CommuteSide): TrendCommute => ({
    count: c.count,
    depart: c.avgDepart?.minutes ?? null,
    arrive: c.avgArrive?.minutes ?? null,
    durationMin: c.avgDurationMin,
    km: c.avgKm,
    kmCoverage: c.kmCoverage,
  });
  return {
    days: b.days,
    journeys: o.journeys,
    minutes: o.minutes,
    km: o.km,
    kmCoverage: o.kmCoverage,
    perDay: o.perDay,
    purpose: shareRec(b.byPurpose),
    method: shareRec(b.byMethod),
    commute: { out: commute(b.commute.out), back: commute(b.commute.back) },
    gettingHome: Object.fromEntries(b.comingHome.map(g => [g.key, {
      count: g.count,
      earliest: g.box?.min ?? null,
      average: g.box?.avg ?? null,
      latest: g.box?.max ?? null,
    }])),
    alone: b.withWhom.alone.count,
    people: b.withWhom.people.map(p => ({ name: p.name, count: p.count, categories: p.categories })),
  };
}

function localToday(): string {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}
