'use client';
// src/app/insights/_widgets/JourneysWidget.tsx
//
// Journeys widget (이동) — Summary view.
//
// Header row: tab pills (left, Trend-view style) · All / Wkday / Wkend (right).
// The day switch applies to every tab; the API sends all three blocks at once,
// so switching never refetches.
//
// Tabs:
//   Overview      — per-day figures (left) · By purpose, By method, With whom
//                   pies and Most often with list (2 × 2, right)
//   Commute       — 출근 / 퇴근 switch · headline row · time strip per method
//                   combination (2/3) beside where (1/3)
//   Getting home  — 귀가 시간: From work / After work dinner / After dinner with
//                   friends, Diet-style box plots with avg, earliest, latest
//   Places        — top places and routes (the map comes with geocoding)
//
// Chart rule: a pie for a fixed, mutually exclusive set of categories (every
// category shown, no "Other"); bars for open lists (top N of many).
//
// All rules (joining legs, the day a journey belongs to, commute and 퇴근,
// golf, flights) live in src/lib/insights/transport.ts. This file lays out.
// Distances are null until geocoding; those slots read "—".

import { useEffect, useState, type ReactNode } from 'react';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { Segmented } from '../_components/Segmented';
import { Title } from '../_components/charts/bars';
import { CssVerticalBoxPlotChart, minsToClockStr } from '../_components/charts/css-chart-components';
import { MetricPieBlock, type Seg } from './SleepWidget';
import { autoColorMap } from '../_lib/chart-colors';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps } from '../_lib/types';

// ── Types (mirror src/lib/insights/transport.ts) ──────────────────────────────

type DayKind = 'all' | 'weekday' | 'weekend';
interface ClockAvg { minutes: number; label: string }
interface Share { key: string; count: number; minutes: number; km: number | null }
interface CommuteFigures {
  count: number;
  avgDepart: ClockAvg | null;
  avgArrive: ClockAvg | null;
  avgDurationMin: number | null;
  avgKm: number | null;
}
interface CommuteSide extends CommuteFigures {
  places: { name: string; count: number }[];
  combos: ({ key: string } & CommuteFigures)[];
}
interface Block {
  days: number;
  overview: {
    journeys: number; legs: number; minutes: number; km: number | null; kmCoverage: number;
    perDay:  { journeys: number; minutes: number; km: number | null };
    perWeek: { journeys: number; minutes: number; km: number | null };
  };
  byPurpose: Share[];
  byMethod: Share[];
  withWhom: {
    alone: { count: number; minutes: number };
    byCategory: { key: string; count: number; minutes: number }[];
    people: { name: string; category: string; count: number; minutes: number }[];
  };
  commute: { out: CommuteSide; back: CommuteSide };
  comingHome: {
    key: string; label: string; count: number; avgArrive: ClockAvg | null;
    box: { min: number; p25: number; avg: number; p75: number; max: number } | null;
  }[];
  map: {
    places: { name: string; arrivals: number }[];
    routes: { from: string; to: string; count: number }[];
  };
  flights: { count: number; minutes: number; km: number | null };
}
interface Summary {
  period: { from: string; to: string };
  blocks: Record<DayKind, Block>;
}

type Tab = 'overview' | 'commute' | 'home' | 'places';
type Measure = 'count' | 'minutes' | 'km';

const ACCENT_LIGHT = '#1d4ed8';   // blue-700
const ACCENT_DARK  = '#2dd4bf';   // teal-400

// ── Formatting ────────────────────────────────────────────────────────────────

// 75 → '1h 15m', 40 → '40m'
function dur(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  const m = Math.round(min);
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Minutes after midnight, possibly past 24:00 (the 6 am rule) → '00:40 +1'
function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return minutes >= 1440 ? `${t} +1` : t;
}

function Clock({ c }: { c: ClockAvg | null }) {
  if (!c) return <span className="text-stone-400 dark:text-zinc-500">—</span>;
  const m = c.minutes % 1440;
  return (
    <span className="tabular-nums">
      {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
      {c.minutes >= 1440 && <sup className="ml-0.5 text-[8px] text-stone-400 dark:text-zinc-500">+1</sup>}
    </span>
  );
}

const km = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 10) / 10} km`);
const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : String(Math.round(v * 10) / 10));

// ── Small pieces ──────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide truncate">{label}</span>
      <span className="text-sm font-mono font-medium text-stone-900 dark:text-zinc-50 leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-stone-400 dark:text-zinc-500 leading-tight">{sub}</span>}
    </div>
  );
}

function Pills<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
            value === v
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Bars for open lists (top N of many).
function RankBars({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = rows[0]?.value ?? 1;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <Title>{title}</Title>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-32 shrink-0 truncate text-stone-600 dark:text-zinc-300" title={r.label}>{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-stone-400 dark:bg-zinc-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right tabular-nums text-stone-500 dark:text-zinc-400">{num(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Pie segments: every category, largest first. No "Other" — seeing all of
// them beats a tidier pie.
function allSegs(rows: { key: string; value: number }[], isDark: boolean): Seg[] {
  const list = rows.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  const colors = autoColorMap(list.map(r => r.key), isDark);
  return list.map(r => ({ key: r.key, label: r.key, value: Math.round(r.value), color: colors[r.key] }));
}

function shareValue(s: Share, m: Measure): number {
  return m === 'count' ? s.count : m === 'minutes' ? s.minutes : (s.km ?? 0);
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
//
// Wide card: per-day figures stacked on the left; By purpose, By method, With
// whom and Most often with as a 2 × 2 on the right. Narrow card: stacked.
// The @container is what MetricPieBlock reads to put its legend in two columns.

function Overview({ b, isDark }: { b: Block; isDark: boolean }) {
  const kmAvailable = b.overview.km !== null;
  const [by, setBy] = useState<Measure>('count');
  const o = b.overview;
  const w = b.withWhom;
  const unit = by === 'count' ? 'journey' : by === 'minutes' ? 'min' : 'km';
  const measureOpts: [Measure, string][] = kmAvailable
    ? [['count', 'Count'], ['minutes', 'Time'], ['km', 'Distance']]
    : [['count', 'Count'], ['minutes', 'Time']];

  // Legend text: the measure the switch has selected, after the %.
  const detail = (list: { key: string; count: number; minutes: number }[]) => {
    const m = new Map(list.map(x => [x.key, x]));
    return (seg: Seg) => {
      const x = m.get(seg.key);
      if (!x) return '';
      return by === 'minutes' ? dur(x.minutes) : num(x.count);
    };
  };
  const people = [...w.people]
    .sort((p, q) => (by === 'minutes' ? q.minutes - p.minutes : q.count - p.count))
    .slice(0, 8);
  const peopleMax = people.length ? (by === 'minutes' ? people[0].minutes : people[0].count) : 1;
  const whom = [{ key: 'Alone', count: w.alone.count, minutes: w.alone.minutes }, ...w.byCategory];
  const whomSegs = allSegs(whom.map(x => ({ key: x.key, value: by === 'count' ? x.count : x.minutes })), isDark);
  const whomColor = new Map(whomSegs.map(x => [x.key, x.color]));

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid grid-cols-1 @[36rem]:grid-cols-[8.5rem_1fr] gap-4">
        {/* Left: figures on top, the Count / Time switch at the bottom, so the
            column spans the same height as the 2 × 2 beside it. */}
        <div className="flex flex-col justify-between gap-4">
          <div className="grid grid-cols-3 @[36rem]:grid-cols-1 gap-3 @[36rem]:gap-5">
            <Stat label="Journeys / day" value={num(o.perDay.journeys)} sub={`${num(o.perWeek.journeys)} / week`} />
            <Stat label="Time / day" value={dur(o.perDay.minutes)} sub={`${dur(o.perWeek.minutes)} / week`} />
            <Stat label="Distance / day" value={km(o.perDay.km)}
              sub={kmAvailable ? `${km(o.perWeek.km)} / week · ${Math.round(o.kmCoverage * 100)}% known` : 'after geocoding'} />
          </div>
          <div className="flex flex-col gap-1">
            <Title>Share by</Title>
            <Segmented value={by} onChange={setBy} options={measureOpts} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-1 @[24rem]:grid-cols-2 gap-x-4 gap-y-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <Title>By purpose</Title>
              <MetricPieBlock title="By purpose" isDark={isDark} unit={unit} legendCols={2}
                segments={allSegs(b.byPurpose.map(x => ({ key: x.key, value: shareValue(x, by) })), isDark)}
                legendDetail={detail(b.byPurpose)} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Title>By method</Title>
              <MetricPieBlock title="By method" isDark={isDark} unit={unit} legendCols={2}
                segments={allSegs(b.byMethod.map(x => ({ key: x.key, value: shareValue(x, by) })), isDark)}
                legendDetail={detail(b.byMethod)} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Title>With whom</Title>
              <MetricPieBlock title="With whom" isDark={isDark} unit={unit} legendCols={2}
                segments={whomSegs}
                legendDetail={detail(whom)} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <Title>Most often with</Title>
              {people.map(p => {
                const v = by === 'minutes' ? p.minutes : p.count;
                return (
                  <div key={p.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 shrink-0 truncate text-stone-600 dark:text-zinc-300">
                      {p.name} <span className="text-[10px] text-stone-400 dark:text-zinc-500">{p.category}</span>
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${(v / peopleMax) * 100}%`, background: whomColor.get(p.category) ?? (isDark ? '#52525b' : '#a8a29e') }} />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums text-stone-500 dark:text-zinc-400 whitespace-nowrap">
                      {by === 'minutes' ? dur(p.minutes) : num(p.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-stone-400 dark:text-zinc-500">
        Flights (not in the figures above): {b.flights.count} · {dur(b.flights.minutes)}
        {b.flights.km !== null && ` · ${km(b.flights.km)}`}
      </p>
    </div>
  );
}

// ── Tab: Commute ──────────────────────────────────────────────────────────────
//
// Time strip: one row per method combination, a bar from the average leave
// time to the average arrival time on a shared clock axis. "All" comes first.
// The label column sizes to the longest combination, so none is cut.

function TimeStrip({ rows, isDark }: {
  rows: ({ key: string } & CommuteFigures)[];
  isDark: boolean;
}) {
  const valid = rows.filter(r => r.avgDepart && r.avgArrive);
  if (!valid.length) return null;
  const lo = Math.floor(Math.min(...valid.map(r => r.avgDepart!.minutes)) / 60) * 60;
  let hi = Math.ceil(Math.max(...valid.map(r => r.avgArrive!.minutes)) / 60) * 60;
  if (hi - lo < 120) hi = lo + 120;
  const span = hi - lo;
  // A light line every hour (every 30 min when the span is short); labels on
  // every line when they fit, otherwise every other one.
  const lineStep = span <= 180 ? 30 : 60;
  const lines: number[] = [];
  for (let t = lo; t <= hi; t += lineStep) lines.push(t);
  const labelEvery = span / lineStep > 6 ? 2 : 1;
  const pct = (m: number) => ((m - lo) / span) * 100;
  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  const ROW = 'h-4';

  return (
    <div className="flex gap-2 text-[11px]">
      {/* labels */}
      <div className="flex flex-col shrink-0">
        <div className="h-3" />
        {valid.map((r, i) => (
          <span key={r.key} className={`${ROW} flex items-center whitespace-nowrap ${i === 0 ? 'font-medium text-stone-800 dark:text-zinc-100' : 'text-stone-600 dark:text-zinc-300'}`}>
            {r.key}&nbsp;<span className="text-stone-400 dark:text-zinc-500 tabular-nums">({r.count})</span>
          </span>
        ))}
      </div>

      {/* plot: axis labels, full-height hour lines, bars */}
      <div className="relative flex-1 min-w-[4rem] flex flex-col">
        {lines.map(t => (
          <div key={t} className="absolute top-3 bottom-0 w-px bg-stone-200/70 dark:bg-zinc-700/60" style={{ left: `${pct(t)}%` }} />
        ))}
        <div className="relative h-3 text-[9px] text-stone-400 dark:text-zinc-500">
          {lines.map((t, i) => (i % labelEvery === 0 ? (
            <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap leading-none" style={{ left: `${pct(t)}%` }}>
              {clockText(t).replace(' +1', '')}
            </span>
          ) : null))}
        </div>
        {valid.map((r, i) => {
          const left = pct(r.avgDepart!.minutes);
          const width = Math.max(1, pct(r.avgArrive!.minutes) - left);
          return (
            <div key={r.key} className={`relative ${ROW}`}>
              <div className="absolute top-1 bottom-1 rounded-sm"
                style={{ left: `${left}%`, width: `${width}%`, background: accent, opacity: i === 0 ? 1 : 0.65 }}
                title={`${clockText(r.avgDepart!.minutes)} → ${clockText(r.avgArrive!.minutes)}`} />
            </div>
          );
        })}
      </div>

      {/* travel time */}
      <div className="flex flex-col shrink-0">
        <div className="h-3" />
        {valid.map(r => (
          <span key={r.key} className={`${ROW} flex items-center justify-end tabular-nums text-stone-500 dark:text-zinc-400 whitespace-nowrap`}>
            {dur(r.avgDurationMin)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Narrow-column ranking: name and count on one line, the bar underneath.
function StackedRank({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = rows[0]?.value ?? 1;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Title>{title}</Title>
      {rows.map(r => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <div className="flex justify-between gap-2 text-[11px]">
            <span className="truncate text-stone-600 dark:text-zinc-300" title={r.label}>{r.label}</span>
            <span className="tabular-nums text-stone-500 dark:text-zinc-400">{num(r.value)}</span>
          </div>
          <div className="h-1 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-stone-400 dark:bg-zinc-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Commute({ b, isDark }: { b: Block; isDark: boolean }) {
  const [dir, setDir] = useState<'out' | 'back'>('out');
  const side = b.commute[dir];

  return (
    <div className="@container flex flex-col gap-4">
      <Segmented value={dir} onChange={setDir} options={[['out', '출근'], ['back', '퇴근']]} />

      {!side.count ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500">No {dir === 'out' ? '출근' : '퇴근'} in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Leave" value={<Clock c={side.avgDepart} />} sub={`${side.count} trips`} />
            <Stat label="Arrive" value={<Clock c={side.avgArrive} />} />
            <Stat label="Takes" value={dur(side.avgDurationMin)} />
            <Stat label="Distance" value={km(side.avgKm)} />
          </div>

          <div className="grid grid-cols-1 @lg:grid-cols-[2fr_1fr] gap-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <Title>By method — average leave → arrive</Title>
              <TimeStrip isDark={isDark} rows={[{ key: 'All', ...side }, ...side.combos]} />
            </div>
            <StackedRank title={dir === 'out' ? 'Commuted to' : 'Left from'}
              rows={side.places.slice(0, 5).map(p => ({ label: p.name, value: p.count }))} />
          </div>

          <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-snug">
            {dir === 'out'
              ? '출근 is the first commute of the day; later moves between workplaces are left out.'
              : '퇴근 includes 퇴근길 식사 / 볼일: leaving work to reaching 집. Their travel time leaves out the time spent at the stop.'}
          </p>
        </>
      )}
    </div>
  );
}

// ── Tab: Getting home ─────────────────────────────────────────────────────────
//
// Diet Summary style: one column per group, title (with count) on top and a
// compact box plot. Whiskers are the true earliest and latest arrival, so the
// extreme nights stay visible.

const clockOver = (v: number) => minsToClockStr(v, true);   // '+00:40' past midnight, as in Diet

function GettingHome({ b, isDark }: { b: Block; isDark: boolean }) {
  const groups = b.comingHome;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map(g => (
          <div key={g.key} className="flex flex-col gap-1 min-w-0">
            <Title><span className="block w-full text-center whitespace-normal">{g.label} ({g.count})</span></Title>
            {g.box ? (
              <>
                <CssVerticalBoxPlotChart buckets={[{ label: '', ...g.box }]} isDark={isDark}
                  formatY={clockOver} height={100} compact emphasizeLast={false} />
              </>
            ) : (
              <p className="text-xs text-center text-stone-400 dark:text-zinc-500">No data</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-snug">
        Time of arriving at 집. All = the three groups together. Box = middle half, whiskers = earliest and latest. &ldquo;+&rdquo; means past midnight.
        From work includes 퇴근길 식사 / 볼일. Journeys after golf are left out of the two dinner groups.
        Arrivals before 06:00 count as the previous evening.
      </p>
    </div>
  );
}

// ── Tab: Places ───────────────────────────────────────────────────────────────

function Places({ b }: { b: Block }) {
  return (
    <div className="flex flex-col gap-4">
      <RankBars title="Most visited (arrivals)"
        rows={b.map.places.slice(0, 10).map(p => ({ label: p.name, value: p.arrivals }))} />
      <RankBars title="Most travelled routes"
        rows={b.map.routes.slice(0, 10).map(r => ({ label: `${r.from} → ${r.to}`, value: r.count }))} />
      <p className="text-[10px] text-stone-400 dark:text-zinc-500">The map view comes with geocoding.</p>
    </div>
  );
}

// ── JourneysWidget ────────────────────────────────────────────────────────────

export function JourneysWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [data,    setData]    = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [days,    setDays]    = useState<DayKind>('all');
  const [tab,     setTab]     = useState<Tab>('overview');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams({ metric: 'transport.summary', mode: 'summary' }, globalFilter)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  const b = data?.blocks[days];
  const hasData = !!b && b.overview.journeys > 0;

  return (
    <WidgetCard title="Journeys" floor={1} loading={loading} error={error}
      action={<ViewToggle value="summary" onChange={() => {}} disabled />}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Pills value={tab} onChange={setTab}
            options={[['overview', 'Overview'], ['commute', 'Commute'], ['home', 'Getting home'], ['places', 'Places']]} />
          <Segmented value={days} onChange={setDays}
            options={[['all', 'All'], ['weekday', 'Wkday'], ['weekend', 'Wkend']]} />
        </div>
        {b && (
          <span className="text-[10px] text-stone-400 dark:text-zinc-500 -mt-1">
            {b.days} days · {b.overview.journeys} journeys
          </span>
        )}

        {!hasData ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>
        ) : tab === 'overview' ? (
          <Overview b={b!} isDark={isDark} />
        ) : tab === 'commute' ? (
          <Commute b={b!} isDark={isDark} />
        ) : tab === 'home' ? (
          <GettingHome b={b!} isDark={isDark} />
        ) : (
          <Places b={b!} />
        )}
      </div>
    </WidgetCard>
  );
}
