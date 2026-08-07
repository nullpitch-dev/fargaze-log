// src/lib/insights/exercise.ts
// Exercise Summary (WBS #58).
//
// Scope: activity.category === '운동'.
//
// Two time frames live in one payload:
//   • period-scoped — days, total, boxes, daily line
//   • all-time      — the four personal bests, never cut to the period
//
// So the query is unbounded and the period is cut in memory. That is cheap at
// ~1.2k records, and it means the date filter never reaches MongoDB: dates are
// compared as 'YYYY-MM-DD' strings built from start.year/month/day, so no UTC
// boundary can shift a day. Revisit the single fetch above ~20k records.

import Log from '@/models/Log';
import { percentile } from './util';

// The only non-null value in exercise[].setStyle. Verified: 1159 null, 51 총.
const REST_PAUSE = '총';

// A distribution under three days is noise, not a shape. The widget prints
// plain numbers instead when boxes is null.
const MIN_BOX_DAYS = 3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExerciseBest {
  value: number;
  date:  string;
}

// Matches BoxPlotBucket in css-chart-components.tsx exactly, so the widget
// hands it straight to CssVerticalBoxPlotChart with no reshaping.
export interface ExerciseBoxStats {
  label: string;
  min:   number;
  max:   number;
  avg:   number;
  p25:   number;
  p75:   number;
}

export interface ExerciseItemSummary {
  item: string;
  unit: string;

  // period-scoped
  days:           number;
  daysPerWeek:    number;
  total:          number;
  restPauseCount: number;               // drives the "set box excludes N" caption
	boxes:          ExerciseBoxStats[] | null;   // 1 or 2 boxes; null under MIN_BOX_DAYS
	daily:          (number | null)[];    // aligned to ExerciseSummary.dates
  // Biggest straight set per day, also aligned to dates. null for the whole
  // item when it would just repeat `daily` — same test that collapses the boxes.
  dailySetMax:    (number | null)[] | null;

  // all-time — null means "does not apply", so the widget omits the line
  bestSet:          ExerciseBest | null;
  bestSetRestPause: ExerciseBest | null;
  bestDay:          ExerciseBest;
  bestLoadKg:       ExerciseBest | null;
}

export interface ExerciseSummary {
  dates:        string[];                 // every day in the period, ascending
  exerciseDays: number;
  periodDays:   number;                   // capped at today
  daysPerWeek:  number;
  dayCounts:    Record<string, number>;   // date → record count, for HeatStrip
  items:        ExerciseItemSummary[];    // sorted by days desc
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// buildDateRange returns a UTC instant, so the calendar date is read from the
// UTC fields. Reading it locally would turn 2026-07-31T23:59:59.999Z into
// 1 August under BST and shift the period edge by a day.
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

// ── Stat helpers ──────────────────────────────────────────────────────────────

// percentile() requires an ascending array, so sort here rather than trusting
// the caller. Copies first — the caller's array order is not ours to change.
function boxOf(label: string, values: number[]): ExerciseBoxStats | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    label,
    min: r2(s[0]),
    max: r2(s[s.length - 1]),
    avg: r2(s.reduce((t, v) => t + v, 0) / s.length),
    p25: r2(percentile(s, 25)),
    p75: r2(percentile(s, 75)),
  };
}

// Ties go to the earliest date — the first time the best was reached.
function bestOf(rows: { value: number; date: string }[]): ExerciseBest | null {
  let best: ExerciseBest | null = null;
  for (const r of rows) {
    if (!best || r.value > best.value || (r.value === best.value && r.date < best.date)) {
      best = { value: r2(r.value), date: r.date };
    }
  }
  return best;
}

// ── Flattened record ──────────────────────────────────────────────────────────

interface Rec {
  date:      string;
  item:      string;
  unit:      string;
  amount:    number;
  loadKg:    number | null;
  restPause: boolean;
}

function groupByItem(rows: Rec[]): Map<string, Rec[]> {
  const m = new Map<string, Rec[]>();
  for (const r of rows) {
    const arr = m.get(r.item);
    if (arr) arr.push(r);
    else m.set(r.item, [r]);
  }
  return m;
}

function sumByDate(rows: Rec[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.amount);
  return m;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function computeExerciseSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[],
): Promise<ExerciseSummary> {

  // ── Period bounds ───────────────────────────────────────────────────────────
  // End caps at today so the current month is not scored against days that
  // have not happened yet. Same rule as the Weight widget.
  const startStr = utcDateStr(periodStart);
  const rawEnd   = utcDateStr(periodEnd);
  const today    = todayStr();
  const endStr   = rawEnd < today ? rawEnd : today;

  const dates      = endStr < startStr ? [] : eachDate(startStr, endStr);
  const periodDays = dates.length;

  // ── One unbounded fetch ─────────────────────────────────────────────────────
  const filter: Record<string, any> = {
    userId,
    'activity.category': '운동',
    exercise: { $exists: true, $not: { $size: 0 } },
  };
  if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };

  const docs = await Log.find(filter, {
    'start.year': 1, 'start.month': 1, 'start.day': 1, exercise: 1,
  }).lean();

  // ── Flatten to one row per exercise entry ───────────────────────────────────
  const all: Rec[] = [];
  for (const d of docs as any[]) {
    const y = d.start?.year, m = d.start?.month, day = d.start?.day;
    if (!y || !m || !day) continue;
    const date = `${y}-${pad2(m)}-${pad2(day)}`;

    for (const e of (d.exercise ?? []) as any[]) {
      const item = (e?.item ?? '').trim();
      if (!item) continue;
      // amount is a Number in the schema, but a blank cell migrates as null.
      if (typeof e.amount !== 'number' || !Number.isFinite(e.amount)) continue;

      all.push({
        date,
        item,
        unit:      (e.unit ?? '').trim(),
        amount:    e.amount,
        loadKg:    typeof e.loadKg === 'number' && Number.isFinite(e.loadKg) ? e.loadKg : null,
        restPause: e.setStyle === REST_PAUSE,
      });
    }
  }

  const periodRecs = all.filter(r => r.date >= startStr && r.date <= endStr);

  // ── Row 1: whole period ─────────────────────────────────────────────────────
  const dayCounts: Record<string, number> = {};
  for (const r of periodRecs) dayCounts[r.date] = (dayCounts[r.date] ?? 0) + 1;

  const exerciseDays = Object.keys(dayCounts).length;
  const daysPerWeek  = periodDays ? r2((exerciseDays / periodDays) * 7) : 0;

  // ── Row 2: one block per item ───────────────────────────────────────────────
  const allByItem    = groupByItem(all);
  const periodByItem = groupByItem(periodRecs);

  const items: ExerciseItemSummary[] = [];

  for (const [item, pRecs] of periodByItem) {
    const aRecs = allByItem.get(item) ?? pRecs;

    // One unit per item is verified. First non-empty wins if that ever breaks.
    const unit = pRecs.find(r => r.unit)?.unit ?? aRecs.find(r => r.unit)?.unit ?? '';

    // ── Period ────────────────────────────────────────────────────────────────
    const dayTotals = sumByDate(pRecs);
    const days      = dayTotals.size;
    const total     = r2([...dayTotals.values()].reduce((t, v) => t + v, 0));

    const restPauseCount = pRecs.filter(r => r.restPause).length;

    // Set box is straight sets only; day box is everything, summed per day.
    // A 19-rep rest-pause set is not the same act as a 19-rep straight set,
    // so folding them together would inflate the set box.
    const setValues = pRecs.filter(r => !r.restPause).map(r => r.amount);
    const dayValues = [...dayTotals.values()];

		// The two boxes only differ when a day can hold more than one straight set.
    // One record per day with no rest-pause makes them the same numbers drawn
    // twice, so collapse to a single box.
    const twinned = pRecs.length === days && restPauseCount === 0;
    const candidates = twinned
      ? [boxOf('', dayValues)]
      : [boxOf('Set', setValues), boxOf('Day', dayValues)];

    let boxes: ExerciseBoxStats[] | null = null;
    if (days >= MIN_BOX_DAYS) {
      const kept = candidates.filter((b): b is ExerciseBoxStats => b !== null);
      if (kept.length === 1) kept[0].label = '';   // a lone box needs no label
      boxes = kept.length ? kept : null;
    }

		const daily = dates.map(d => {
      const v = dayTotals.get(d);
      return v === undefined ? null : r2(v);
    });

    // Biggest straight set per day. Rest-pause sets are excluded, matching the
    // Set box. A day holding only rest-pause records therefore has no straight
    // set at all, and stays null rather than falling back to the day total.
    const setMaxByDate = new Map<string, number>();
    for (const r of pRecs) {
      if (r.restPause) continue;
      const cur = setMaxByDate.get(r.date);
      if (cur === undefined || r.amount > cur) setMaxByDate.set(r.date, r.amount);
    }
    const dailySetMax = twinned
      ? null   // one straight set per day means the biggest set IS the day total
      : dates.map(d => {
          const v = setMaxByDate.get(d);
          return v === undefined ? null : r2(v);
        });

    // ── All-time ──────────────────────────────────────────────────────────────
    const allDayTotals = sumByDate(aRecs);

    const bestSet = bestOf(
      aRecs.filter(r => !r.restPause).map(r => ({ value: r.amount, date: r.date })),
    );
    const bestSetRestPause = bestOf(
      aRecs.filter(r => r.restPause).map(r => ({ value: r.amount, date: r.date })),
    );
    const bestDay = bestOf(
      [...allDayTotals.entries()].map(([date, value]) => ({ value, date })),
    ) as ExerciseBest;   // aRecs is non-empty, so this is always found
    const bestLoadKg = bestOf(
      aRecs.filter(r => r.loadKg !== null)
           .map(r => ({ value: r.loadKg as number, date: r.date })),
    );

    items.push({
      item,
      unit,
      days,
      daysPerWeek: periodDays ? r2((days / periodDays) * 7) : 0,
      total,
      restPauseCount,
			boxes,
      daily,
      dailySetMax,
      bestSet,
      bestSetRestPause,
      bestDay,
      bestLoadKg,
    });
  }

  items.sort((a, b) =>
    b.days - a.days || b.total - a.total || a.item.localeCompare(b.item),
  );

  return { dates, exerciseDays, periodDays, daysPerWeek, dayCounts, items };
}
