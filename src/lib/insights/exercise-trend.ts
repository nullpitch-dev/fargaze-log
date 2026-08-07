// src/lib/insights/exercise-trend.ts
// Exercise Trend (WBS — Trend view for #58's widget).
//
// Two metrics live here:
//   • computeExerciseTrend     — the view: frequency per bucket + a grouped
//     item timeline (active days per bucket, for the Gantt-style grid)
//   • computeExerciseItemTrend — the modal: per-bucket averages for one item
//     (day total, and biggest straight set where the two differ)
//
// Everything is period-scoped — no all-time stats — but the fetch stays
// unbounded and the period is cut in memory, matching exercise.ts: at ~1.2k
// records that is cheaper than pushing a $expr date filter to MongoDB, and
// 'YYYY-MM-DD' string comparison means no UTC boundary can shift a day.
//
// 총 records (setStyle === '총') are DAY TOTALS with an unknown set split,
// not rest-pause sets — see design doc §9.3.6. They count as activity (the
// timeline, frequency, day totals) but never as sets (biggest set). This file
// names the marker honestly rather than repeating the REST_PAUSE misnomer.

import Log from '@/models/Log';

export type ExerciseTrendGrain = 'day' | 'week' | 'month';

// The only non-null value in exercise[].setStyle. Verified: 1159 null, 51 총.
const DAY_TOTAL_MARK = '총';

const r2   = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');
const mean = (vals: number[]) => vals.reduce((t, v) => t + v, 0) / vals.length;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExerciseTrendItem {
  item:       string;
  unit:       string;
  totalDays:  number;     // distinct exercise days in the period — row ordering
  activeDays: number[];   // days exercised per bucket, aligned to buckets[]
}

export interface ExerciseTrendGroup {
  group: string;                // from activity.name (근육 운동 / 유산소 운동 / …)
  items: ExerciseTrendItem[];   // totalDays desc; zero-day items never appear
}

export interface ExerciseTrend {
  grain:      ExerciseTrendGrain;
  buckets:    string[];   // bucket start dates 'YYYY-MM-DD', ascending
  bucketDays: number[];   // PERIOD days inside each bucket (a partial edge
                          // week counts its real days, so ratios stay honest)
  frequency:  number[];   // days exercised per bucket, any item
  groups:     ExerciseTrendGroup[];
}

export interface ExerciseItemTrendSeries {
  value: (number | null)[];          // null = no qualifying day in the bucket
  load:  (number | null)[] | null;   // null = the item carries no load at all
}

export interface ExerciseItemTrend {
  item:      string;
  unit:      string;
  collapsed: boolean;    // one record per day, no 총 → biggestSet would repeat
  buckets:   string[];   // same bucketing as the main call, trimmed to this item
  dayTotal:  ExerciseItemTrendSeries;
  biggestSet: ExerciseItemTrendSeries | null;   // null when collapsed
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Private mirrors of the same helpers in exercise.ts (module-private there).
// If they grow a third copy, extract them to dates.ts instead.

function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

function eachDate(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = Date.UTC(ty, tm - 1, td);
  const out: string[] = [];
  while (cur.getTime() <= end) {
    out.push(`${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ── Bucketing ─────────────────────────────────────────────────────────────────

// day → the date itself; week → its Monday; month → its first day.
function bucketKey(date: string, grain: ExerciseTrendGrain): string {
  if (grain === 'day') return date;
  const [y, m, d] = date.split('-').map(Number);
  if (grain === 'month') return `${y}-${pad2(m)}-01`;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));   // back to Monday
  return utcDateStr(dt);
}

interface BucketFrame {
  keys:       string[];
  daysInside: number[];              // period days per bucket
  indexOf:    Map<string, number>;   // bucket key → index
}

// Walk the period's dates once; buckets fall out in order, and a bucket that
// straddles the period edge counts only the days actually inside the period.
function buildBuckets(dates: string[], grain: ExerciseTrendGrain): BucketFrame {
  const keys: string[] = [];
  const daysInside: number[] = [];
  const indexOf = new Map<string, number>();
  for (const d of dates) {
    const k = bucketKey(d, grain);
    let i = indexOf.get(k);
    if (i === undefined) {
      i = keys.length;
      keys.push(k);
      daysInside.push(0);
      indexOf.set(k, i);
    }
    daysInside[i] += 1;
  }
  return { keys, daysInside, indexOf };
}

// ── Flattened record ──────────────────────────────────────────────────────────

interface Rec {
  date:    string;
  group:   string;          // activity.name — the grouping label
  item:    string;
  unit:    string;
  amount:  number;
  loadKg:  number | null;
  unsplit: boolean;         // setStyle === 총 — a day total, not a set
}

async function fetchRecs(userId: string, crossActivities: string[]): Promise<Rec[]> {
  const filter: Record<string, any> = {
    userId,
    'activity.category': '운동',
    exercise: { $exists: true, $not: { $size: 0 } },
  };
  if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };

  const docs = await Log.find(filter, {
    'start.year': 1, 'start.month': 1, 'start.day': 1,
    'activity.name': 1, exercise: 1,
  }).lean();

  const out: Rec[] = [];
  for (const d of docs as any[]) {
    const y = d.start?.year, m = d.start?.month, day = d.start?.day;
    if (!y || !m || !day) continue;
    const date  = `${y}-${pad2(m)}-${pad2(day)}`;
    const group = (d.activity?.name ?? '').trim() || '기타';

    for (const e of (d.exercise ?? []) as any[]) {
      const item = (e?.item ?? '').trim();
      if (!item) continue;
      if (typeof e.amount !== 'number' || !Number.isFinite(e.amount)) continue;

      out.push({
        date,
        group,
        item,
        unit:    (e.unit ?? '').trim(),
        amount:  e.amount,
        loadKg:  typeof e.loadKg === 'number' && Number.isFinite(e.loadKg) ? e.loadKg : null,
        unsplit: e.setStyle === DAY_TOTAL_MARK,
      });
    }
  }
  return out;
}

// Period bounds, end capped at today — same rule as the Summary and Weight.
function periodDates(periodStart: Date, periodEnd: Date): string[] {
  const startStr = utcDateStr(periodStart);
  const rawEnd   = utcDateStr(periodEnd);
  const today    = todayStr();
  const endStr   = rawEnd < today ? rawEnd : today;
  return endStr < startStr ? [] : eachDate(startStr, endStr);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export async function computeExerciseTrend(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  grain: ExerciseTrendGrain,
  crossActivities: string[],
): Promise<ExerciseTrend> {

  const dates = periodDates(periodStart, periodEnd);
  const frame = buildBuckets(dates, grain);
  const nB    = frame.keys.length;

  const all  = await fetchRecs(userId, crossActivities);
  const from = dates[0], to = dates[dates.length - 1];
  const recs = dates.length ? all.filter(r => r.date >= from && r.date <= to) : [];

  // Distinct exercise days per bucket — any item.
  const freqSets: Set<string>[] = frame.keys.map(() => new Set());
  for (const r of recs) freqSets[frame.indexOf.get(bucketKey(r.date, grain))!].add(r.date);

  // Per item: which dates it was done, per bucket and in total.
  interface Acc { group: string; unit: string; sets: Set<string>[]; allDates: Set<string> }
  const byItem = new Map<string, Acc>();
  for (const r of recs) {
    let a = byItem.get(r.item);
    if (!a) {
      a = { group: r.group, unit: r.unit, sets: frame.keys.map(() => new Set()), allDates: new Set() };
      byItem.set(r.item, a);
    }
    if (!a.unit && r.unit) a.unit = r.unit;
    a.sets[frame.indexOf.get(bucketKey(r.date, grain))!].add(r.date);
    a.allDates.add(r.date);
  }

  // Trim LEADING empty buckets only; interior empties are information.
  let first = freqSets.findIndex(s => s.size > 0);
  if (first < 0) first = nB;

  const buckets    = frame.keys.slice(first);
  const bucketDays = frame.daysInside.slice(first);
  const frequency  = freqSets.slice(first).map(s => s.size);

  // Group the items. Zero-day items never entered byItem, so they are already
  // hidden. Items sort by totalDays desc inside a group; groups sort by their
  // items' combined days desc — the busiest group lands on top.
  const groupMap = new Map<string, ExerciseTrendItem[]>();
  for (const [item, a] of byItem) {
    const entry: ExerciseTrendItem = {
      item,
      unit:       a.unit,
      totalDays:  a.allDates.size,
      activeDays: a.sets.slice(first).map(s => s.size),
    };
    const arr = groupMap.get(a.group);
    if (arr) arr.push(entry);
    else groupMap.set(a.group, [entry]);
  }

  const groups: ExerciseTrendGroup[] = [...groupMap.entries()]
    .map(([group, items]) => {
      items.sort((x, y) => y.totalDays - x.totalDays || x.item.localeCompare(y.item));
      return { group, items };
    })
    .sort((x, y) => {
      const dx = x.items.reduce((t, i) => t + i.totalDays, 0);
      const dy = y.items.reduce((t, i) => t + i.totalDays, 0);
      return dy - dx || x.group.localeCompare(y.group);
    });

  return { grain, buckets, bucketDays, frequency, groups };
}

// ── Per-item modal ────────────────────────────────────────────────────────────

export async function computeExerciseItemTrend(
  userId: string,
  item: string,
  periodStart: Date,
  periodEnd: Date,
  grain: ExerciseTrendGrain,
  crossActivities: string[],
): Promise<ExerciseItemTrend> {

  const dates = periodDates(periodStart, periodEnd);
  const frame = buildBuckets(dates, grain);

  const all  = await fetchRecs(userId, crossActivities);
  const from = dates[0], to = dates[dates.length - 1];
  const recs = dates.length
    ? all.filter(r => r.item === item && r.date >= from && r.date <= to)
    : [];

  const unit    = recs.find(r => r.unit)?.unit ?? '';
  const hasLoad = recs.some(r => r.loadKg !== null);

  // Group the item's records by day once; every per-bucket figure is an
  // average over these per-day values.
  const byDate = new Map<string, Rec[]>();
  for (const r of recs) {
    const arr = byDate.get(r.date);
    if (arr) arr.push(r);
    else byDate.set(r.date, [r]);
  }

  // Collapse test, scoped to the selected period — one record per day and no
  // 총 means the biggest set IS the day total, so one chart tells the story.
  const collapsed = recs.length === byDate.size && !recs.some(r => r.unsplit);

  interface DayFig {
    total:    number;                                    // 총 included
    loadAvg:  number | null;                             // mean of set loads, null→0
    best:     { amount: number; load: number } | null;   // biggest straight set
  }
  const dayFigs = new Map<string, DayFig>();
  for (const [date, rows] of byDate) {
    const total   = rows.reduce((t, r) => t + r.amount, 0);
    const loadAvg = hasLoad ? mean(rows.map(r => r.loadKg ?? 0)) : null;

    // Biggest set = max reps among straight sets (the simple rule, confirmed);
    // a tie on reps goes to the heavier load. A 총-only day has no set at all.
    let best: DayFig['best'] = null;
    for (const r of rows) {
      if (r.unsplit) continue;
      const load = r.loadKg ?? 0;
      if (!best || r.amount > best.amount || (r.amount === best.amount && load > best.load)) {
        best = { amount: r.amount, load };
      }
    }
    dayFigs.set(date, { total, loadAvg, best });
  }

  // Trim leading buckets empty FOR THIS ITEM — the modal is its own chart and
  // owes the Gantt no alignment; opening on months of nothing helps nobody.
  const activePerBucket: string[][] = frame.keys.map(() => []);
  for (const date of dayFigs.keys()) {
    activePerBucket[frame.indexOf.get(bucketKey(date, grain))!].push(date);
  }
  let firstIdx = activePerBucket.findIndex(a => a.length > 0);
  if (firstIdx < 0) firstIdx = frame.keys.length;

  const buckets = frame.keys.slice(firstIdx);
  const active  = activePerBucket.slice(firstIdx);

  const dayTotalValue: (number | null)[] = [];
  const dayTotalLoad:  (number | null)[] = [];
  const bestValue:     (number | null)[] = [];
  const bestLoad:      (number | null)[] = [];

  for (const datesIn of active) {
    const figs = datesIn.map(d => dayFigs.get(d)!);

    dayTotalValue.push(figs.length ? r2(mean(figs.map(f => f.total))) : null);
    dayTotalLoad.push(
      hasLoad && figs.length ? r2(mean(figs.map(f => f.loadAvg as number))) : null,
    );

    const bests = figs.map(f => f.best).filter((b): b is NonNullable<DayFig['best']> => b !== null);
    bestValue.push(bests.length ? r2(mean(bests.map(b => b.amount))) : null);
    bestLoad.push(hasLoad && bests.length ? r2(mean(bests.map(b => b.load))) : null);
  }

  return {
    item,
    unit,
    collapsed,
    buckets,
    dayTotal: { value: dayTotalValue, load: hasLoad ? dayTotalLoad : null },
    biggestSet: collapsed ? null : { value: bestValue, load: hasLoad ? bestLoad : null },
  };
}
