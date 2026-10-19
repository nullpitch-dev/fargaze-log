'use client';
// src/app/insights/_widgets/JourneysTrendView.tsx
// Journeys widget (WBS #63) — Trend view on the shared grain × count window,
// counted back from the end of the selected period or YESTERDAY, whichever is
// earlier. Every bucket is a Journeys Summary over its own dates
// (transport-trend.ts), so a Month bucket always agrees with the Summary for
// that month. This file only draws.
//
// Layout
//   Row 1  pills: Per day · Mix · Commute · Getting home · People (left) ·
//          All / Wkday / Wkend (right)
//   Row 2  the tab's own switches (left) · grain × count (right)
//   Row 3  resolved range
//
// Tabs
//   Per day       one line: journeys, time or km per day. In Distance mode a
//                 dashed "% known" line on the right; a bucket under half known
//                 shows no km point.
//   Mix           Purpose / Method × Count / Time / Distance, a stacked area of
//                 shares. Every category; the largest over the window at the
//                 bottom, coloured in the same rank order as the Summary pies.
//   Commute       출근 / 퇴근. Sleep-Session band from average leave to average
//                 arrival, dashed average travel time on the right; below it the
//                 average km per commute with "% known".
//   Getting home  All / From work / Work dinner / Friends: earliest, average and
//                 latest arrival, Diet-Servings style.
//   People        rank flow of who you travelled with, on the short count, with
//                 the Relation filter every other People chart has.
//
// No minimum count anywhere: one commute is a real band, one arrival a real
// point (earliest = average = latest). An empty bucket is a gap. Buckets before
// the first one with any journey are dropped, so Month × 120 starts where the
// logging does.

import React, { useMemo } from 'react';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useLiveFilter } from '../_lib/useLiveFilter';
import {
  CssTrendChart, CssStackedAreaChart, CssDualLineChart, minsToClockStr,
  type StackedAreaPoint, type StackedAreaSegmentDef,
} from '../_components/charts/css-chart-components';
import { CssRankFlowChart, type RankFlowBucket } from '../_components/charts/CssRankFlowChart';
import { Segmented } from '../_components/Segmented';
import { BUCKET_OPTIONS } from './WeightTrendView';
import { chartColors, autoColorMap } from '../_lib/chart-colors';
import type { TrendGrain } from '@/lib/insights/trend-window';

// ── Payload from /api/insights/stats?metric=transport.trend ──────────────────

export type DayKind = 'all' | 'weekday' | 'weekend';
interface TrendShare { count: number; minutes: number; km: number | null }
interface TrendCommute {
  count: number; depart: number | null; arrive: number | null;
  durationMin: number | null; km: number | null; kmCoverage: number;
}
interface TrendArrival { count: number; earliest: number | null; average: number | null; latest: number | null }
interface TrendBlock {
  days: number;
  journeys: number;
  minutes: number;
  km: number | null;
  kmCoverage: number;
  perDay: { journeys: number; minutes: number; km: number | null };
  purpose: Record<string, TrendShare>;
  method: Record<string, TrendShare>;
  commute: { out: TrendCommute; back: TrendCommute };
  gettingHome: Record<string, TrendArrival>;
  alone: number;
  people: { name: string; count: number; categories: Record<string, number> }[];
}
interface TrendBucket { label: string; start: string; end: string; blocks: Record<DayKind, TrendBlock> }

export interface JourneysTrend {
  grain: TrendGrain;
  windowStart: string;
  windowEnd: string;
  kmMinCoverage: number;
  gettingHomeGroups: { key: string; label: string }[];
  buckets: TrendBucket[];
}

export type JourneysTrendTab = 'perDay' | 'mix' | 'commute' | 'home' | 'people';
export const JOURNEYS_SHORT_COUNT_TABS: JourneysTrendTab[] = ['people'];
export const JOURNEYS_SHORT_COUNTS = [3, 6, 12];

type Measure = 'count' | 'minutes' | 'km';
type MixBy = 'purpose' | 'method';
type Side = 'out' | 'back';

// Short labels so the switch fits beside All / Wkday / Wkend; the full name is
// in the note under the chart.
const HOME_SHORT: Record<string, string> = {
  all: 'All', work: 'From work', dinner: 'Work dinner', social: 'Friends',
};
const PEOPLE_TOP = 7;

const fmtPct = (v: number) => `${Math.round(v)}%`;
const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtKm = (v: number) => `${fmt1(Math.round(v * 10) / 10)} km`;
const fmtDur = (m: number) => {
  const t = Math.round(m), h = Math.floor(t / 60), mm = t % 60;
  return h ? `${h}h${String(mm).padStart(2, '0')}m` : `${mm}m`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function NoData({ isDark }: { isDark: boolean }) {
  return (
    <p className="text-xs py-6 text-center" style={{ color: isDark ? '#a1a1aa' : '#a8a29e' }}>
      No data for this range.
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">{children}</p>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: JourneysTrend | null;
  isDark: boolean;
  tab: JourneysTrendTab;
  onTabChange: (t: JourneysTrendTab) => void;
  days: DayKind;
  onDaysChange: (d: DayKind) => void;
  grain: TrendGrain;
  onGrainChange: (g: TrendGrain) => void;
  count: number;
  onCountChange: (n: number) => void;
  shortCount: number;
  onShortCountChange: (n: number) => void;
  // Tab switches, kept by the widget so they survive Summary ⇄ Trend
  measure: Measure;
  onMeasureChange: (m: Measure) => void;
  mixBy: MixBy;
  onMixByChange: (m: MixBy) => void;
  side: Side;
  onSideChange: (s: Side) => void;
  homeGroup: string;
  onHomeGroupChange: (g: string) => void;
}

const TABS: [JourneysTrendTab, string][] = [
  ['perDay', 'Per day'], ['mix', 'Mix'], ['commute', 'Commute'], ['home', 'Getting home'], ['people', 'People'],
];

export function JourneysTrendView(p: Props) {
  const { data, isDark, tab, days } = p;
  const cc = chartColors(isDark);
  const minCov = data?.kmMinCoverage ?? 0.5;

  // Drop the empty run before logging began
  const buckets = useMemo(() => {
    const all = data?.buckets ?? [];
    const first = all.findIndex(b => b.blocks.all.journeys > 0);
    return first < 0 ? [] : all.slice(first);
  }, [data]);
  const n = buckets.length;
  const labels = buckets.map(b => b.label);
  const blocks = buckets.map(b => b.blocks[days]);
  const showValues = n <= 16;
  // Whole labels (a thinned compressed label can lose its year), at most 8 so
  // they fit beside a right-hand axis in a 3-column card. Lines stop at gaps.
  const lineProps = { maxXLabels: 8, showValues, compressXLabels: false, breakOnNull: true } as const;
  const rangeText = n ? `${buckets[0].start} → ${data!.windowEnd}` : '';
  const hasKm = blocks.some(b => b.km !== null);
  const relationTypes = useMemo(
    // Over all three day kinds, so switching Wkday / Wkend keeps the selection
    () => [...new Set(buckets.flatMap(b => Object.values(b.blocks)
      .flatMap(k => k.people.flatMap(x => Object.keys(x.categories)))))]
      .filter(t => t.trim()).sort(),
    [buckets],
  );
  const relation = useLiveFilter(relationTypes);
  const measure: Measure = p.measure === 'km' && !hasKm ? 'count' : p.measure;
  const measureOptions: [Measure, string][] = hasKm
    ? [['count', 'Count'], ['minutes', 'Time'], ['km', 'Distance']]
    : [['count', 'Count'], ['minutes', 'Time']];

  // ── Per day ─────────────────────────────────────────────────────────────────
  function renderPerDay() {
    if (!blocks.some(b => b.journeys > 0)) return <NoData isDark={isDark} />;
    const known = (b: TrendBlock) => b.journeys > 0 && b.kmCoverage >= minCov;
    const values = blocks.map(b =>
      !b.days ? null
      : measure === 'count' ? b.perDay.journeys
      : measure === 'minutes' ? b.perDay.minutes
      : known(b) ? b.perDay.km : null);
    const fmt = measure === 'count' ? fmt1 : measure === 'minutes' ? fmtDur : fmtKm;
    const label = measure === 'count' ? 'Journeys a day' : measure === 'minutes' ? 'Time a day' : 'Km a day';
    const notes = blocks.map(b => {
      if (!b.days) return null;
      const base = `${plural(b.journeys, 'journey')} · ${plural(b.days, 'day')}`;
      return measure === 'km' ? `${base} · ${Math.round(b.kmCoverage * 100)}% known` : base;
    });
    return (
      <>
        <CssTrendChart
          series={[{ values, color: cc.lineStroke, label }]}
          rightSeries={measure === 'km'
            ? { values: blocks.map(b => (b.journeys ? b.kmCoverage * 100 : null)), color: cc.dotNeutral, label: '% known', dim: true }
            : undefined}
          formatYRight={fmtPct}
          labels={labels}
          formatY={fmt}
          yAxis={{ baseline: 0 }}
          notes={notes}
          isDark={isDark}
          {...lineProps}
        />
        <Note>
          {measure === 'km'
            ? `Straight-line km a day over journeys whose distance is known; the dashed line on the right is the share known. A bucket under ${Math.round(minCov * 100)}% known shows no point.`
            : measure === 'minutes'
              ? 'Travel time a day, flights left out (as in the Summary).'
              : 'Journeys a day, flights left out (as in the Summary).'}
        </Note>
      </>
    );
  }

  // ── Mix ─────────────────────────────────────────────────────────────────────
  const mix = useMemo(() => {
    const rec = (b: TrendBlock) => (p.mixBy === 'purpose' ? b.purpose : b.method);
    const val = (s: TrendShare) => (measure === 'count' ? s.count : measure === 'minutes' ? s.minutes : (s.km ?? 0));
    const totals = new Map<string, number>();
    for (const b of blocks) for (const [k, s] of Object.entries(rec(b))) totals.set(k, (totals.get(k) ?? 0) + val(s));
    const keys = [...totals].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const colors = autoColorMap(keys, isDark);
    const defs: StackedAreaSegmentDef[] = keys.map(k => ({ key: k, label: k, color: colors[k] }));
    const unit = p.mixBy === 'purpose' ? 'journey' : 'leg';
    const points: StackedAreaPoint[] = buckets.map((bk, i) => {
      const r = rec(blocks[i]);
      const segs = Object.fromEntries(keys.map(k => [k, r[k] ? val(r[k]) : 0]));
      const total = Object.values(segs).reduce((a, v) => a + v, 0);
      const items = Object.values(r).reduce((a, s) => a + s.count, 0);
      return {
        label: bk.label,
        total: total > 0 ? total : null,
        segments: total > 0 ? segs : null,
        meta: items ? plural(items, unit) : undefined,
      };
    });
    return { defs, points };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, days, p.mixBy, measure, isDark]);

  function renderMix() {
    if (!mix.points.some(pt => pt.total !== null)) return <NoData isDark={isDark} />;
    const what = p.mixBy === 'purpose' ? 'journeys by purpose' : 'legs by method';
    const by = measure === 'count' ? 'count' : measure === 'minutes' ? 'travel time' : 'known km';
    return (
      <>
        <CssStackedAreaChart
          points={mix.points} segmentDefs={mix.defs} isDark={isDark}
          mode="percent" highlightable maxXLabels={12} formatY={fmtPct} height={190} />
        <Note>
          Share of {what}, by {by}. The largest over the whole range sits at the bottom.
          {p.mixBy === 'method' && ' Method is per leg, so a journey by bus then on foot counts in both.'}
        </Note>
      </>
    );
  }

  // ── Commute ─────────────────────────────────────────────────────────────────
  function renderCommute() {
    const cs = blocks.map(b => b.commute[p.side]);
    if (!cs.some(c => c.count > 0)) return <NoData isDark={isDark} />;
    const session = buckets.map((bk, i) => ({
      label: bk.label,
      avgStartMins: cs[i].depart,
      avgEndMins: cs[i].arrive,
      avgDurationSeconds: cs[i].durationMin === null ? null : cs[i].durationMin! * 60,
    }));
    const notes = cs.map(c => (c.count ? plural(c.count, 'commute') : null));
    const kmVals = cs.map(c => (c.count && c.kmCoverage >= minCov ? c.km : null));
    const out = p.side === 'out';
    return (
      <>
        <CssDualLineChart
          buckets={session} isDark={isDark} maxXLabels={12} showValues={showValues}
          names={{ from: 'Leave', to: 'Arrive', duration: 'Takes' }} notes={notes} />
        <Note>
          {out
            ? 'The band runs from average leaving time to average arrival at work (the first 출근 of each day); the dashed line on the right is the average travel time.'
            : 'The band runs from average leaving work to average arrival home; the dashed line on the right is the average travel time. For 퇴근길 식사 / 볼일 the time is the sum of the legs, so it can be shorter than the band.'}
        </Note>
        {kmVals.some(v => v !== null) && (
          <>
            <p className="text-[11px] font-medium text-stone-600 dark:text-zinc-300 mt-1">Distance</p>
            <CssTrendChart
              series={[{ values: kmVals, color: cc.lineStroke, label: 'Km per commute' }]}
              rightSeries={{ values: cs.map(c => (c.count ? c.kmCoverage * 100 : null)), color: cc.dotNeutral, label: '% known', dim: true }}
              formatYRight={fmtPct}
              labels={labels}
              formatY={fmtKm}
              notes={notes}
              isDark={isDark}
              {...lineProps}
            />
            <Note>
              Average straight-line km per commute whose distance is known; the dashed line is the share known.
              Under {Math.round(minCov * 100)}% known shows no point.
            </Note>
          </>
        )}
      </>
    );
  }

  // ── Getting home ────────────────────────────────────────────────────────────
  function renderHome() {
    const as = blocks.map(b => b.gettingHome[p.homeGroup]);
    if (!as.some(a => a && a.count > 0)) return <NoData isDark={isDark} />;
    const avgC = isDark ? '#2dd4bf' : '#1d4ed8';
    const lateC = isDark ? '#5eead4' : '#60a5fa';
    const earlyC = isDark ? '#99f6e4' : '#93c5fd';
    const full = data?.gettingHomeGroups.find(g => g.key === p.homeGroup)?.label ?? '';
    return (
      <>
        <CssTrendChart
          series={[
            { values: as.map(a => a?.average ?? null), color: avgC, label: 'Average' },
            { values: as.map(a => a?.latest ?? null), color: lateC, label: 'Latest' },
            { values: as.map(a => a?.earliest ?? null), color: earlyC, label: 'Earliest' },
          ]}
          labels={labels}
          formatY={v => minsToClockStr(v, true)}
          listOrder={[1, 0, 2]}
          notes={as.map(a => (a && a.count ? plural(a.count, 'arrival') : null))}
          isDark={isDark}
          {...lineProps}
        />
        <Note>
          Arrival home{p.homeGroup === 'all' ? ' — from work, after work dinners and after dinners with friends together' : ` — ${full.toLowerCase()}`}.
          Times after midnight count as the evening before (01:10 is 25:10). Golf is left out of the dinner groups.
        </Note>
      </>
    );
  }

  // ── People ──────────────────────────────────────────────────────────────────
  // Relation filter as in Diet: live, but an empty selection is held until the
  // dropdown closes. A person counts only their journeys in the chosen
  // relations, then everyone is re-ranked.
  function renderPeople() {
    const sel = new Set(relation.applied);
    const rf: RankFlowBucket[] = buckets.map((bk, i) => ({
      label: bk.label,
      ranked: blocks[i].people
        .map(x => ({
          name: x.name,
          count: Object.entries(x.categories).reduce((a, [c, v]) => a + (sel.has(c) ? v : 0), 0),
        }))
        .filter(x => x.count > 0)
        .sort((x, y) => y.count - x.count)
        .slice(0, PEOPLE_TOP),
    }));
    const control = (
      <MultiSelectDropdown label="Relation" options={relationTypes}
        selected={relation.draft} onChange={relation.onChange} onClose={relation.onClose} />
    );
    return (
      <>
        {rf.some(b => b.ranked.length)
          ? <CssRankFlowChart buckets={rf} topN={PEOPLE_TOP} isDark={isDark} controls={control} />
          : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-end">{control}</div>
              <NoData isDark={isDark} />
            </div>
          )}
        <Note>Who you travelled with most in each bucket, by journeys. Journeys alone are left out.</Note>
      </>
    );
  }

  // ── Row 2: the tab's own switches ───────────────────────────────────────────
  function tabSwitches() {
    switch (tab) {
      case 'perDay':
        return <Segmented<Measure> value={measure} onChange={p.onMeasureChange} options={measureOptions} />;
      case 'mix':
        return (
          <div className="flex flex-wrap gap-2">
            <Segmented<MixBy> value={p.mixBy} onChange={p.onMixByChange}
              options={[['purpose', 'Purpose'], ['method', 'Method']]} />
            <Segmented<Measure> value={measure} onChange={p.onMeasureChange} options={measureOptions} />
          </div>
        );
      case 'commute':
        return <Segmented<Side> value={p.side} onChange={p.onSideChange} options={[['out', '출근'], ['back', '퇴근']]} />;
      case 'home':
        return (
          <Segmented<string> value={p.homeGroup} onChange={p.onHomeGroupChange}
            options={(data?.gettingHomeGroups ?? []).map(g => [g.key, HOME_SHORT[g.key] ?? g.label] as [string, string])} />
        );
      default:
        return <span />;
    }
  }

  const isShort = JOURNEYS_SHORT_COUNT_TABS.includes(tab);

  return (
    <div className="flex flex-col gap-3 flex-1">
      {/* Row 1: pills · day kind */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => p.onTabChange(t)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                tab === t
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <Segmented<DayKind> value={days} onChange={p.onDaysChange}
          options={[['all', 'All'], ['weekday', 'Wkday'], ['weekend', 'Wkend']]} />
      </div>

      {/* Row 2: the tab's switches · grain × count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tabSwitches()}
        <div className="flex items-center gap-2">
          <Segmented<TrendGrain> value={p.grain} onChange={p.onGrainChange}
            options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
          {isShort ? (
            <Segmented<number> value={p.shortCount} onChange={p.onShortCountChange}
              options={JOURNEYS_SHORT_COUNTS.map(v => [v, String(v)]) as [number, string][]} />
          ) : (
            <Segmented<number> value={p.count} onChange={p.onCountChange}
              options={BUCKET_OPTIONS[p.grain].map(v => [v, String(v)]) as [number, string][]} />
          )}
        </div>
      </div>

      {/* Row 3: resolved range */}
      {rangeText && <span className="text-[10px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</span>}

      {!n ? <NoData isDark={isDark} />
        : tab === 'perDay' ? renderPerDay()
        : tab === 'mix' ? renderMix()
        : tab === 'commute' ? renderCommute()
        : tab === 'home' ? renderHome()
        : renderPeople()}
    </div>
  );
}
