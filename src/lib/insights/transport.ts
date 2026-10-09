// src/lib/insights/transport.ts
// Transport Summary.
//
// Scope: activity.category === '이동' only. Rows elsewhere that borrow the
// transport fields (이사, 등산, 가족 기록 …) are notes, not travel.
//
// ── Journeys ────────────────────────────────────────────────────────────────
// Legs are joined into journeys by transport-journeys.ts (30-min rule).
// Flights (method 비행기) are taken out BEFORE joining and reported on their own
// line, so one long-haul flight cannot swamp the averages.
//
// ── Day a journey belongs to ────────────────────────────────────────────────
// Its local start date, except that a start before 06:00 belongs to the previous
// day (the Sleep rule) — so a 01:10 trip home after 회식 is that evening's.
// Weekday / weekend is decided on that day.
//
// ONE unbounded fetch (~8.3k rows) and the period is cut in memory, because two
// things need all of history: the workplace list, and the journey just before
// a 퇴근길 식사/볼일 journey home.
//
// The period runs from its start to min(period end, YESTERDAY): an unfinished
// today would lower every per-day figure.
//
// ── Commute OUT ─────────────────────────────────────────────────────────────
// The FIRST 출근 journey of each day, unless it starts at a workplace or ends
// at 집. Later 출근 journeys that day are moves between workplaces (회사 → 2단지),
// even when they pass through 집 to drop the car, and are left out.
//
// A workplace (used for the 퇴근 rules below) is any final destination of 3+
// 출근 journeys, all-time, never 집. It includes car parks and campuses you
// commute to (정문 주차타워, 미래기술캠퍼스) — "places you commute to".
//
// Commute BACK = a journey home with ReturnType
//   근무 후 귀가            → the journey itself (also 퇴근길 식사/볼일 when the
//                           journey itself starts at a workplace)
//   퇴근길 식사/볼일 후 귀가 → the journey before it (workplace → the stop) plus
//                           this one. Departure = leaving the workplace,
//                           arrival = reaching 집.
// For every 퇴근길 식사/볼일 trip, the duration is the SUM OF ITS LEGS' travel
// time, so the time at the stop is never counted. Both legs are usually logged
// with purpose 귀가, so when the stop was under 30 min the two legs are joined
// into one journey — summing legs (not first start → last end) covers that too.
// Ordinary 퇴근 keeps first start → last end, so transfer waits count.
//
// ── Clock-time averages ─────────────────────────────────────────────────────
// Evening times (퇴근 departure / arrival, coming home) use the 6 am rule:
// 01:10 counts as 25:10, so late nights average correctly. 출근 times do not.
//
// ── Distance ────────────────────────────────────────────────────────────────
// Straight line between From and To coordinates. Coordinates come from the
// geocoding step, which is not built yet — until then every distance is null
// and coverage is 0.

import Log from '@/models/Log';
import FavoritePlace from '@/models/FavoritePlace';
import { buildJourneys, legsFromDocs, HOME, type Journey, type Leg } from './transport-journeys';
import { resolveFavoritePlace, type FavoritePlaceDoc } from '@/lib/migration/favoritePlace';
import { percentile } from './util';

export const FLIGHT = '비행기';
export const GOLF = '골프';
export const WORKPLACE_MIN_COMMUTES = 3;
export const STOP_MAX_HOURS = 6;           // workplace → stop → 집 must fit in this
const EVENING_WRAP_HOUR = 6;

export const RT_WORK = '근무 후 귀가';
export const RT_WORK_MEAL = '퇴근길 식사 후 귀가';
export const RT_WORK_ERRAND = '퇴근길 볼일 후 귀가';
export const RT_DINNER = '업무회식 후 귀가';
export const RT_SOCIAL = '친목모임 후 귀가';

const COMING_HOME_GROUPS = [
  { key: 'work',   label: 'From work',               returnTypes: [RT_WORK, RT_WORK_MEAL, RT_WORK_ERRAND], excludeGolf: false },
  { key: 'dinner', label: 'After work dinner',       returnTypes: [RT_DINNER],                             excludeGolf: true },
  { key: 'social', label: 'After dinner with friends', returnTypes: [RT_SOCIAL],                         excludeGolf: true },
] as const;

export type DayKind = 'all' | 'weekday' | 'weekend';
const DAY_KINDS: DayKind[] = ['all', 'weekday', 'weekend'];

// ── Output types ──────────────────────────────────────────────────────────────

export interface ClockAvg { minutes: number; label: string }   // label 'HH:MM', may exceed 24:00

export interface Share { key: string; count: number; minutes: number; km: number | null }

export interface CommuteFigures {
  count: number;
  avgDepart: ClockAvg | null;
  avgArrive: ClockAvg | null;
  avgDurationMin: number | null;
  avgKm: number | null;
}

export interface CommuteSide extends CommuteFigures {
  places: { name: string; count: number }[];             // workplaces (out: destination, back: departure point)
  combos: ({ key: string } & CommuteFigures)[];          // top 5 method combinations
}

export interface TransportBlock {
  days: number;
  overview: {
    journeys: number;
    legs: number;
    minutes: number;
    km: number | null;
    kmCoverage: number;                                   // share of journeys with a distance, 0–1
    perDay:  { journeys: number; minutes: number; km: number | null };
    perWeek: { journeys: number; minutes: number; km: number | null };
  };
  byPurpose: Share[];                                     // per journey
  byMethod: Share[];                                      // per leg
  withWhom: {
    alone: { count: number; minutes: number };
    byCategory: { key: string; count: number; minutes: number }[];   // journey's dominant category
    people: { name: string; category: string; count: number; minutes: number }[];
  };
  commute: { out: CommuteSide; back: CommuteSide };
  comingHome: {
    key: string; label: string; count: number; avgArrive: ClockAvg | null;
    // Arrival times in minutes (6 am rule): true earliest / latest, quartiles, mean
    box: { min: number; p25: number; avg: number; p75: number; max: number } | null;
  }[];
  map: {
    places: { name: string; arrivals: number }[];
    routes: { from: string; to: string; count: number }[];
  };
  flights: { count: number; minutes: number; km: number | null };
}

export interface TransportSummary {
  period: { from: string; to: string };
  blocks: Record<DayKind, TransportBlock>;
  checks: {
    workplaces: { name: string; commutes: number }[];
    betweenWorkplaces: number;                 // 출근 journeys that are not the day's first commute
    stopTripsMatched: number;                  // 퇴근길 식사/볼일 joined to the leg from work
    stopTripsUnmatched: { date: string; from: string; returnType: string }[];
    favoritePlaces: number;                    // rows in favorite_place (0 → names not resolved)
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function computeTransportSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[],
): Promise<TransportSummary> {
  const [docs, favorites] = await Promise.all([
    Log.find(
      { userId, 'activity.category': '이동' },
      { start: 1, end: 1, activity: 1, location: 1, transport: 1, people: 1 },
    ).lean(),
    FavoritePlace.find({ userId }).lean(),
  ]);
  return buildTransportSummary(
    docs as any[], favorites as any[], utcDateStr(periodStart), utcDateStr(periodEnd), crossActivities, localToday(),
  );
}

// Pure: every rule lives here, so it can be run against an export without a database.
export function buildTransportSummary(
  docs: any[],
  favorites: FavoritePlaceDoc[],
  startStr: string,
  endStr: string,
  crossActivities: string[],
  todayStr: string,
): TransportSummary {
  const yesterday = addDays(todayStr, -1);
  const lastDay = endStr < yesterday ? endStr : yesterday;

  const allLegs = legsFromDocs(docs);
  const flightLegs = allLegs.filter(l => l.method === FLIGHT);
  const journeys = buildJourneys(allLegs.filter(l => l.method !== FLIGHT));

  // Display names: 집 / 회사 / 사이트 / 내차 → the real place at that moment.
  const fav = favorites.map(f => ({
    ...f,
    from: f.from ? { ...f.from, at: new Date(f.from.at) } : null,
    to: f.to ? { ...f.to, at: new Date(f.to.at) } : null,
  }));
  const named = (label: string, atMs: number) =>
    resolveFavoritePlace(fav, label, new Date(atMs)) ?? label;

  // Workplaces (all-time)
  const commuteCounts = tally(journeys.filter(j => j.purpose === '출근').map(j => j.to));
  // 집 is never a workplace, even when a few 출근 rows end there (working from home).
  const workplaces = new Set([...commuteCounts]
    .filter(([k, n]) => n >= WORKPLACE_MIN_COMMUTES && k !== HOME).map(([k]) => k));

  // 퇴근 trips, built on all journeys so the leg before the stop can sit outside the period edge
  const backTrips: BackTrip[] = [];
  const unmatched: TransportSummary['checks']['stopTripsUnmatched'] = [];
  journeys.forEach((j, i) => {
    if (j.purpose !== '귀가' || j.to !== HOME) return;
    // A 퇴근길 볼일/식사 journey that itself starts at a workplace had no separate
    // leg to the stop — it is an ordinary 퇴근.
    if (j.returnType === RT_WORK) {
      backTrips.push({ day: dayOf(j.startLocal), parts: [j], placeName: named(j.from, j.startAt), travelMin: j.durationMin });
    } else if (workplaces.has(j.from) && (j.returnType === RT_WORK_MEAL || j.returnType === RT_WORK_ERRAND)) {
      backTrips.push({ day: dayOf(j.startLocal), parts: [j], placeName: named(j.from, j.startAt), travelMin: legsMinutes([j]) });
    } else if (j.returnType === RT_WORK_MEAL || j.returnType === RT_WORK_ERRAND) {
      const prev = journeys[i - 1];
      const ok = prev && prev.to === j.from && workplaces.has(prev.from)
        && j.startAt - prev.endAt <= STOP_MAX_HOURS * 3600_000;
      if (ok) backTrips.push({ day: dayOf(j.startLocal), parts: [prev, j], placeName: named(prev.from, prev.startAt), travelMin: legsMinutes([prev, j]) });
      else unmatched.push({ date: dayOf(j.startLocal), from: j.from, returnType: j.returnType });
    }
  });

  const inPeriod = (day: string) => day >= startStr && day <= lastDay;
  const crossOk = (j: Journey) => !crossActivities.length || crossActivities.includes(j.crossActivity);
  const periodJourneys = journeys.filter(j => inPeriod(dayOf(j.startLocal)) && crossOk(j));
  const periodBack = backTrips.filter(t => inPeriod(t.day) && crossOk(t.parts[t.parts.length - 1]));
  const periodFlights = flightLegs.filter(l => inPeriod(dayOf(l.startLocal)));

  // First 출근 journey of each day (all-time; the period cut comes later)
  const firstCommute = new Set<Journey>();
  const seenDays = new Set<string>();
  for (const j of journeys) {
    if (j.purpose !== '출근') continue;
    const day = dayOf(j.startLocal);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    if (!workplaces.has(j.from) && j.to !== HOME) firstCommute.add(j);
  }

  const blocks = {} as Record<DayKind, TransportBlock>;
  for (const kind of DAY_KINDS) {
    const match = (day: string) => kind === 'all' || (kind === 'weekend') === isWeekend(day);
    blocks[kind] = buildBlock({
      days: countDays(startStr, lastDay, kind),
      journeys: periodJourneys.filter(j => match(dayOf(j.startLocal))),
      back: periodBack.filter(t => match(t.day)),
      flights: periodFlights.filter(l => match(dayOf(l.startLocal))),
      firstCommute,
      named,
    });
  }

  const betweenWorkplaces = periodJourneys.filter(j => j.purpose === '출근' && !firstCommute.has(j)).length;

  return {
    period: { from: startStr, to: lastDay },
    blocks,
    checks: {
      workplaces: [...commuteCounts].filter(([k]) => workplaces.has(k))
        .sort((a, b) => b[1] - a[1]).map(([name, commutes]) => ({ name, commutes })),
      betweenWorkplaces,
      stopTripsMatched: backTrips.filter(t => t.parts.length === 2).length,
      stopTripsUnmatched: unmatched,
      favoritePlaces: favorites.length,
    },
  };
}

// ── One block (all days / weekdays / weekend) ────────────────────────────────

interface Trip { parts: Journey[]; placeName: string; travelMin: number }
interface BackTrip extends Trip { day: string }

/** Travel time only: the sum of every leg, with no waiting between legs. */
function legsMinutes(parts: Journey[]): number {
  return sum(parts.flatMap(p => p.legs).map(legMinutes));
}

function buildBlock(a: {
  days: number;
  journeys: Journey[];
  back: BackTrip[];
  flights: Leg[];
  firstCommute: Set<Journey>;
  named: (label: string, atMs: number) => string;
}): TransportBlock {
  const { days, journeys } = a;
  const legs = journeys.flatMap(j => j.legs);
  const minutes = sum(journeys.map(j => j.durationMin));
  const kmList = journeys.map(journeyKm);
  const withKm = kmList.filter((v): v is number => v !== null);
  const km = withKm.length ? round1(sum(withKm)) : null;
  const per = (v: number, mult: number) => (days ? round1((v / days) * mult) : 0);

  // With whom
  const alone = journeys.filter(j => !j.people.length);
  const catAgg = new Map<string, { count: number; minutes: number }>();
  const personAgg = new Map<string, { category: string; count: number; minutes: number }>();
  for (const j of journeys) {
    if (!j.people.length) continue;
    const dom = [...tally(j.people.map(p => p.category))].sort((x, y) => y[1] - x[1])[0][0];
    bump(catAgg, dom, j.durationMin);
    for (const p of j.people) {
      const cur = personAgg.get(p.name) ?? { category: p.category, count: 0, minutes: 0 };
      cur.count++; cur.minutes += j.durationMin;
      personAgg.set(p.name, cur);
    }
  }

  // Commute OUT
  const outTrips = journeys
    .filter(j => a.firstCommute.has(j))
    .map(j => ({ parts: [j], placeName: a.named(j.to, j.endAt), travelMin: j.durationMin }));

  // Map
  const arrivals = tally(journeys.map(j => a.named(j.to, j.endAt)));
  const routes = tally(journeys.map(j => `${a.named(j.from, j.startAt)}\u0000${a.named(j.to, j.endAt)}`));

  return {
    days,
    overview: {
      journeys: journeys.length,
      legs: legs.length,
      minutes,
      km,
      kmCoverage: journeys.length ? round2(withKm.length / journeys.length) : 0,
      perDay:  { journeys: per(journeys.length, 1), minutes: per(minutes, 1), km: km === null ? null : per(km, 1) },
      perWeek: { journeys: per(journeys.length, 7), minutes: per(minutes, 7), km: km === null ? null : per(km, 7) },
    },
    byPurpose: shares(journeys.map(j => ({ key: j.purpose || '(none)', minutes: j.durationMin, km: journeyKm(j) }))),
    byMethod: shares(legs.map(l => ({ key: l.method || '(none)', minutes: legMinutes(l), km: legKm(l) }))),
    withWhom: {
      alone: { count: alone.length, minutes: sum(alone.map(j => j.durationMin)) },
      byCategory: [...catAgg].map(([key, v]) => ({ key, ...v })).sort((x, y) => y.count - x.count),
      people: [...personAgg].map(([name, v]) => ({ name, ...v }))
        .sort((x, y) => y.count - x.count).slice(0, 15),
    },
    commute: {
      out: commuteSide(outTrips, false),
      back: commuteSide(a.back, true),
    },
    comingHome: comingHome(journeys),
    map: {
      places: [...arrivals].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([name, n]) => ({ name, arrivals: n })),
      routes: [...routes].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, n]) => {
        const [from, to] = k.split('\u0000');
        return { from, to, count: n };
      }),
    },
    flights: {
      count: a.flights.length,
      minutes: sum(a.flights.map(legMinutes)),
      km: a.flights.length && a.flights.every(l => legKm(l) !== null) ? round1(sum(a.flights.map(l => legKm(l)!))) : null,
    },
  };
}

// Getting home: "All" (the three groups together) first, then each group.
function comingHome(journeys: Journey[]): TransportBlock['comingHome'] {
  const lists = COMING_HOME_GROUPS.map(g => ({
    key: g.key as string, label: g.label as string,
    list: journeys.filter(j => j.purpose === '귀가' && j.to === HOME
      && (g.returnTypes as readonly string[]).includes(j.returnType)
      && !(g.excludeGolf && j.crossActivity === GOLF)),
  }));
  const all = { key: 'all', label: 'All', list: lists.flatMap(x => x.list) };
  return [all, ...lists].map(({ key, label, list }) => {
    const mins = list.map(j => clockMin(j.endLocal, true));
    const sorted = [...mins].sort((x, y) => x - y);
    return {
      key, label, count: list.length, avgArrive: clockAvg(mins),
      box: sorted.length ? {
        min: sorted[0], p25: Math.round(percentile(sorted, 25)), avg: Math.round(sum(sorted) / sorted.length),
        p75: Math.round(percentile(sorted, 75)), max: sorted[sorted.length - 1],
      } : null,
    };
  });
}

function commuteSide(trips: Trip[], evening: boolean): CommuteSide {
  const figures = (list: typeof trips): CommuteFigures => {
    const kms = list.map(t => sumOrNull(t.parts.map(journeyKm)));
    const known = kms.filter((v): v is number => v !== null);
    return {
      count: list.length,
      avgDepart: clockAvg(list.map(t => clockMin(t.parts[0].startLocal, evening))),
      avgArrive: clockAvg(list.map(t => clockMin(t.parts[t.parts.length - 1].endLocal, evening))),
      avgDurationMin: list.length ? Math.round(sum(list.map(t => t.travelMin)) / list.length) : null,
      avgKm: known.length ? round1(sum(known) / known.length) : null,
    };
  };
  const comboOf = (t: (typeof trips)[number]) => {
    const methods: string[] = [];
    for (const m of t.parts.flatMap(p => p.legs.map(l => l.method))) if (m && methods[methods.length - 1] !== m) methods.push(m);
    return methods.join(' → ') || '(none)';
  };
  const byCombo = new Map<string, typeof trips>();
  for (const t of trips) byCombo.set(comboOf(t), [...(byCombo.get(comboOf(t)) ?? []), t]);

  return {
    ...figures(trips),
    places: [...tally(trips.map(t => t.placeName))].sort((x, y) => y[1] - x[1]).map(([name, count]) => ({ name, count })),
    combos: [...byCombo].sort((x, y) => y[1].length - x[1].length).slice(0, 5)
      .map(([key, list]) => ({ key, ...figures(list) })),
  };
}

// ── Distance (filled in by the geocoding step) ──────────────────────────────

const PLACE_COORDS = new Map<string, { lat: number; lng: number }>();

function legKm(l: Leg): number | null {
  const a = PLACE_COORDS.get(l.from), b = PLACE_COORDS.get(l.to);
  return a && b ? haversineKm(a, b) : null;
}

function journeyKm(j: Journey): number | null {
  return sumOrNull(j.legs.map(legKm));
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function shares(items: { key: string; minutes: number; km: number | null }[]): Share[] {
  const m = new Map<string, { count: number; minutes: number; km: number; kmKnown: boolean }>();
  for (const it of items) {
    const cur = m.get(it.key) ?? { count: 0, minutes: 0, km: 0, kmKnown: false };
    cur.count++; cur.minutes += it.minutes;
    if (it.km !== null) { cur.km += it.km; cur.kmKnown = true; }
    m.set(it.key, cur);
  }
  return [...m].map(([key, v]) => ({ key, count: v.count, minutes: v.minutes, km: v.kmKnown ? round1(v.km) : null }))
    .sort((x, y) => y.count - x.count);
}

function legMinutes(l: Leg): number {
  return Math.round((l.endAt - l.startAt) / 60000);
}

/** Minutes after local midnight; with `evening`, times before 06:00 count as the previous day (+24 h). */
function clockMin(local: Date, evening: boolean): number {
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return evening && m < EVENING_WRAP_HOUR * 60 ? m + 1440 : m;
}

function clockAvg(mins: number[]): ClockAvg | null {
  if (!mins.length) return null;
  const avg = Math.round(sum(mins) / mins.length);
  return { minutes: avg, label: `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}` };
}

/** The day a journey belongs to: local start date, or the day before when it starts before 06:00. */
function dayOf(local: Date): string {
  const d = new Date(local);
  if (d.getUTCHours() < EVENING_WRAP_HOUR) d.setUTCDate(d.getUTCDate() - 1);
  return utcDateStr(d);
}

function isWeekend(day: string): boolean {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

function countDays(from: string, to: string, kind: DayKind): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (kind === 'all' || (kind === 'weekend') === isWeekend(d)) n++;
  return n;
}

function tally(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function bump(m: Map<string, { count: number; minutes: number }>, key: string, minutes: number) {
  const cur = m.get(key) ?? { count: 0, minutes: 0 };
  cur.count++; cur.minutes += minutes;
  m.set(key, cur);
}

const sum = (v: number[]) => v.reduce((x, y) => x + y, 0);
const sumOrNull = (v: (number | null)[]) => (v.every(x => x !== null) && v.length ? sum(v as number[]) : null);
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');

function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDateStr(new Date(Date.UTC(y, m - 1, d + n)));
}

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}
