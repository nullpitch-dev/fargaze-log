'use client';
// src/app/insights/_widgets/ExerciseTrendView.tsx
// Exercise Trend view.
//
// Three layers, top to bottom:
//   1. Frequency — days exercised per bucket, as a line chart. Hidden at day
//      grain, where it would be a 0/1 square wave repeating the grid below.
//   2. Item timeline — a Gantt-style grid, one row per item under its group
//      header (the grouping comes from the data, not a hardcoded list). Each
//      cell is coloured by how much of the bucket was active, in five zones.
//   3. Per-item modal, fetched on tap — bucket averages per active day, with
//      a dashed load line on its own right axis where load exists.
//
// Unlike WeightTrendView this view owns its own fetches: it follows the
// global filter period like every other trend, and fetching here keeps the
// parent widget's wiring to a toggle and a mount.

import { useEffect, useState } from 'react';
import { ModalShell } from '../_components/ModalShell';
import { Segmented } from '../_components/Segmented';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps } from '../_lib/types';
import { CssTrendChart } from '../_components/charts/css-chart-components';

// ── Contract (mirrors src/lib/insights/exercise-trend.ts) ─────────────────────

type Grain = 'day' | 'week' | 'month';

// Weight-style controls: the window is grain × count, anchored server-side to
// min(end of the filter period, today). Options and defaults match the Weight
// widget exactly. Long windows stay readable because dense charts hide their
// printed values (hover shows them) and the timeline tightens its cell gap.
const BUCKET_OPTIONS: Record<Grain, number[]> = {
  day:   [14, 30, 60, 90],
  week:  [12, 26, 52, 104],
  month: [12, 24, 60, 120],
};
const DEFAULT_BUCKETS: Record<Grain, number> = { day: 30, week: 26, month: 24 };

interface TrendItem {
  item:       string;
  unit:       string;
  totalDays:  number;
  activeDays: number[];
}

interface TrendGroup {
  group: string;
  items: TrendItem[];
}

interface Trend {
  grain:      Grain;
  buckets:    string[];
  bucketDays: number[];
  frequency:  number[];
  groups:     TrendGroup[];
}

interface ItemSeries {
  value: (number | null)[];
  load:  (number | null)[] | null;
}

interface ItemTrend {
  item:       string;
  unit:       string;
  collapsed:  boolean;
  buckets:    string[];
  dayTotal:   ItemSeries;
  biggestSet: ItemSeries | null;
}

// ── Colours ───────────────────────────────────────────────────────────────────

// Same pinned accent as the Summary side of the widget — presence and
// intensity are one hue, graded by opacity, so the timeline and the heat
// strip read as the same language.
const ACCENT_LIGHT = '#1d4ed8';   // blue-700
const ACCENT_DARK  = '#2dd4bf';   // teal-400

// Load is a second scale, so it gets a second colour — the amber the charts
// already use for average markers, pinned like weight-colors.ts.
const LOAD_LIGHT = '#d97706';     // amber-600
const LOAD_DARK  = '#fbbf24';     // amber-400

// The five zones: ≤5% barely-there, ≤35% seldom, ≤65% so-so, ≤95% routine,
// >95% treated as 100%. Opacity steps on the single accent.
const ZONES: { max: number; opacity: number; label: string }[] = [
  { max: 0.05, opacity: 0.15, label: '≤5%'  },
  { max: 0.35, opacity: 0.35, label: '≤35%' },
  { max: 0.65, opacity: 0.55, label: '≤65%' },
  { max: 0.95, opacity: 0.78, label: '≤95%' },
  { max: Infinity, opacity: 1, label: '100%' },
];

function zoneOpacity(ratio: number): number {
  for (const z of ZONES) if (ratio <= z.max) return z.opacity;
  return 1;
}

// ── Label helpers ─────────────────────────────────────────────────────────────
// Local mirrors of WeightTrendView's converters — a third copy is the signal
// to extract them into _lib/format.ts.

const pad2 = (n: number) => String(n).padStart(2, '0');

function isoWeekNo(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);   // → Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
}

// 'YYYY-MM-DD' bucket start → the short form the shared charts expect.
function shortLabel(iso: string, grain: Grain): string {
  const [y, m, d] = iso.split('-').map(Number);
  const yy = pad2(y % 100);
  if (grain === 'month') return `${yy}.${pad2(m)}`;
  if (grain === 'week')  return `${yy}W${pad2(isoWeekNo(y, m, d))}`;
  return `${pad2(m)}/${pad2(d)}`;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : String(Math.round(v * 100) / 100);
}

// Window end for the resolved-range line: the last bucket's final day, clamped
// to today so the label never claims days that have not happened yet.
function windowEnd(lastBucketStart: string, grain: Grain): string {
  const [y, m, d] = lastBucketStart.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (grain === 'week') t.setUTCDate(t.getUTCDate() + 6);
  else if (grain === 'month') { t.setUTCMonth(t.getUTCMonth() + 1); t.setUTCDate(0); }
  const iso = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return iso < today ? iso : today;
}

// ── Item timeline row ─────────────────────────────────────────────────────────

const LABEL_W = 64;   // px — item name column

function TimelineRow({ it, bucketDays, labels, isDark, onOpen }: {
  it: TrendItem;
  bucketDays: number[];
  labels: string[];
  isDark: boolean;
  onOpen: () => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const accent  = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  const emptyBg = isDark ? '#27272a' : '#f5f5f4';   // zinc-800 / stone-100
  const gap     = it.activeDays.length > 60 ? 1 : 2;   // long windows: thin cells need thin gaps

  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      className="flex items-center gap-2 rounded p-0.5 -mx-0.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
      <span className="shrink-0 truncate text-[10px] text-stone-600 dark:text-zinc-300"
        style={{ width: LABEL_W }}>
        {it.item}
      </span>
      <div className="flex-1 flex" style={{ gap }}>
        {it.activeDays.map((n, i) => (
          <div key={i} className="relative flex-1"
            style={{ height: 14, zIndex: hoverIdx === i ? 10 : undefined }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}>
            {/* The bar itself clips its rounding; the wrapper stays unclipped
                so the tooltip can float above the row. */}
            <div className="w-full h-full rounded-sm overflow-hidden" style={{ background: emptyBg }}>
              {n > 0 && (
                <div className="w-full h-full"
                  style={{ background: accent, opacity: zoneOpacity(n / (bucketDays[i] || 1)) }} />
              )}
            </div>
            {hoverIdx === i && (
              <div className="absolute text-[10px] leading-tight whitespace-nowrap text-center rounded pointer-events-none"
                style={{ left: '50%', bottom: '100%',
                  transform: 'translate(-50%, -4px)',
                  color: isDark ? '#f4f4f5' : '#292524',
                  background: isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.92)',
                  padding: '1px 4px', zIndex: 20 }}>
                <span className="font-semibold">{n}/{bucketDays[i]} days</span>
                <div style={{ color: isDark ? '#a1a1aa' : '#a8a29e' }}>{labels[i]}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

type Props = Pick<WidgetProps, 'globalFilter'> & { isDark: boolean };

export function ExerciseTrendView({ globalFilter, isDark }: Props) {
  const [grain,   setGrain]   = useState<Grain>('week');
  const [count,   setCount]   = useState<number>(DEFAULT_BUCKETS.week);
  const [data,    setData]    = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [openItem,    setOpenItem]    = useState<string | null>(null);
  const [itemData,    setItemData]    = useState<ItemTrend | null>(null);
  const [itemLoading, setItemLoading] = useState(false);

  // Main view — refetched on filter or grain change.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'exercise.trend', grain, buckets: count },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d.trend ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, grain, count]);

  // The modal's item may not exist under a new filter or grain — close it.
  useEffect(() => { setOpenItem(null); setItemData(null); }, [globalFilter, grain, count]);

  // Per-item modal — fetched on tap, not up front.
  useEffect(() => {
    if (!openItem) return;
    setItemLoading(true);
    setItemData(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'exercise.itemTrend', item: openItem, grain, buckets: count },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setItemData(d.itemTrend ?? null); setItemLoading(false); })
      .catch(() => { setItemLoading(false); });
  }, [openItem]);   // eslint-disable-line react-hooks/exhaustive-deps

  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  const load   = isDark ? LOAD_DARK : LOAD_LIGHT;

  if (loading) return <p className="text-xs text-stone-400 dark:text-zinc-500 mt-2">Loading…</p>;
  if (error)   return <p className="text-xs text-stone-400 dark:text-zinc-500 mt-2">{error}</p>;

  const hasData = !!data && data.buckets.length > 0 && data.groups.length > 0;

  const labels = hasData ? data!.buckets.map(b => shortLabel(b, grain)) : [];

  // Timeline x labels: fixed stride walked back from the newest bucket, so
  // the newest always prints — same convention as the shared charts.
  const maxXLabels = 8;
  const stride = hasData ? Math.max(1, Math.ceil(labels.length / maxXLabels)) : 1;
  const showXLabel = (i: number) => (labels.length - 1 - i) % stride === 0;
  const cellGap = labels.length > 60 ? 1 : 2;   // must match TimelineRow's gap

  const itemLabels = itemData ? itemData.buckets.map(b => shortLabel(b, grain)) : [];

  const loadSeries = (s: ItemSeries) =>
    s.load ? { values: s.load, color: load, label: 'load (kg)' } : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Grain>
          value={grain}
          onChange={g => { setGrain(g); setCount(DEFAULT_BUCKETS[g]); }}
          options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
        <Segmented<number>
          value={count} onChange={setCount}
          options={BUCKET_OPTIONS[grain].map(n => [n, String(n)]) as [number, string][]} />
      </div>

      {/* Resolved range — the control states a count, this states the span */}
      {hasData && (
        <span className="text-[10px] text-stone-400 dark:text-zinc-500">
          {data!.buckets[0]} → {windowEnd(data!.buckets[data!.buckets.length - 1], grain)}
        </span>
      )}

      {!hasData ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
      ) : (
        <>
          {/* Frequency — hidden at day grain, where the timeline IS the answer */}
          {grain !== 'day' && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                Days exercised per {grain}
              </span>
              {/* Left-pad so the plot starts exactly where the timeline
                  cells start: the chart's own y-axis is 36px wide, the
                  timeline's label column is LABEL_W + 8px gap. Band mode
                  then centres each point over its cell. */}
              <div style={{ paddingLeft: LABEL_W + 8 - 36 }}>
                <CssTrendChart
                  series={[{ values: data!.frequency, color: accent }]}
                  labels={labels}
                  formatY={v => String(Math.round(v))}
                  isDark={isDark}
                  yAxis={{ min: 0 }}
                  xBand
                  maxXLabels={8}
                  showValues={labels.length <= 16}
                  compressXLabels={false}
                />
              </div>
            </div>
          )}

          {/* Item timeline */}
          <div className="flex flex-col gap-2">
            {data!.groups.map(g => (
              <div key={g.group} className="flex flex-col gap-1">
                <span className="text-[9px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                  {g.group}
                </span>
                {g.items.map(it => (
                  <TimelineRow
                    key={it.item}
                    it={it}
                    bucketDays={data!.bucketDays}
                    labels={labels}
                    isDark={isDark}
                    onOpen={() => setOpenItem(it.item)}
                  />
                ))}
              </div>
            ))}

            {/* X labels, aligned to the cell grid */}
            <div className="flex items-center gap-2">
              <span className="shrink-0" style={{ width: LABEL_W }} />
              <div className="flex-1 flex" style={{ gap: cellGap }}>
                {labels.map((lbl, i) => (
                  <span key={i}
                    className="flex-1 text-center text-[9px] leading-none text-stone-400 dark:text-zinc-500 whitespace-nowrap overflow-visible">
                    {showXLabel(i) ? lbl : ''}
                  </span>
                ))}
              </div>
            </div>

            {/* Zone legend — meaningless at day grain, where every cell is 100% */}
            {grain !== 'day' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] text-stone-400 dark:text-zinc-500">active days</span>
                {ZONES.map(z => (
                  <span key={z.label} className="flex items-center gap-1 text-[9px] text-stone-400 dark:text-zinc-500">
                    <span className="inline-block rounded-sm"
                      style={{ width: 10, height: 10, background: accent, opacity: z.opacity }} />
                    {z.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Per-item modal */}
      {openItem && (
        <ModalShell title={openItem} onClose={() => { setOpenItem(null); setItemData(null); }}>
          {itemLoading && (
            <p className="text-xs text-stone-400 dark:text-zinc-500">Loading…</p>
          )}

          {!itemLoading && itemData && itemData.buckets.length === 0 && (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data in this period.</p>
          )}

          {!itemLoading && itemData && itemData.buckets.length > 0 && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                  {itemData.collapsed
                    ? `Per active day (${itemData.unit})`
                    : `Day total — avg per active day (${itemData.unit})`}
                </span>
                <CssTrendChart
                  series={[{ values: itemData.dayTotal.value, color: accent }]}
                  labels={itemLabels}
                  formatY={fmt}
                  isDark={isDark}
                  yAxis={{ min: 0 }}
                  maxXLabels={8}
                  showValues={itemLabels.length <= 16}
                  compressXLabels={false}
                  rightSeries={loadSeries(itemData.dayTotal)}
                  formatYRight={fmt}
                />
              </div>

              {itemData.biggestSet && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                    Biggest set — avg per active day ({itemData.unit})
                  </span>
                  <CssTrendChart
                    series={[{ values: itemData.biggestSet.value, color: accent }]}
                    labels={itemLabels}
                    formatY={fmt}
                    isDark={isDark}
                    yAxis={{ min: 0 }}
                    maxXLabels={8}
                    showValues={itemLabels.length <= 16}
                    compressXLabels={false}
                    rightSeries={loadSeries(itemData.biggestSet)}
                    formatYRight={fmt}
                  />
                </div>
              )}

              <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">
                Each point averages the days with a record in that bucket — days
                off are absent, not zeros. Gaps are buckets with no activity.
                {itemData.biggestSet &&
                  ' Day totals include combined-total records; the biggest set counts straight sets only.'}
              </p>
            </>
          )}
        </ModalShell>
      )}
    </div>
  );
}
