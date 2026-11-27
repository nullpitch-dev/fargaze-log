'use client';
// src/app/insights/_widgets/InteractionsWidget.tsx

import { useEffect, useState, useRef } from 'react';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { Segmented } from '../_components/Segmented';
import { BUCKET_OPTIONS, DEFAULT_BUCKETS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useIsDark } from '../_lib/hooks';
import { chartColors, PERSON_COLORS_LIGHT, PERSON_COLORS_DARK, autoColorMap } from '../_lib/chart-colors';
import { Title } from '../_components/charts/bars';
import { MetricPieBlock, type Seg } from './SleepWidget';
import { formatDuration } from '../_lib/format';
import { CssTrendChart, CssStackedAreaChart } from '../_components/charts/css-chart-components';
import type { StackedAreaPoint, StackedAreaSegmentDef } from '../_components/charts/css-chart-components';
import { CssRankFlowChart } from '../_components/charts/CssRankFlowChart';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrendMetric = 'interactions' | 'people' | 'relationType' | 'method' | 'top7';

// Trend tabs that carry their own independent Method filter
const METHOD_FILTER_TABS: TrendMetric[] = ['interactions', 'people', 'relationType'];

interface TrendBucket {
  label: string;
  start: string;
  totalCount: number;
  uniquePeopleCount: number;
  byRelationType: Record<string, number>;
  byMethod: Record<string, number>;
  top7: { name: string; count: number }[];
  transitioning: string[];
  /** (27 Nov) the single methods / relation types seen — the bands are mixes */
  allMethods?: string[];
  allRelations?: string[];
}

// ── Metric definitions ────────────────────────────────────────────────────────

const TREND_METRICS: { key: TrendMetric; label: string; desc: string }[] = [
  { key: 'interactions', label: 'Interactions', desc: 'Total number of interaction events over time'      },
  { key: 'people',       label: 'Unique',       desc: 'Number of unique people interacted with over time' },
  { key: 'relationType', label: 'Relation',     desc: 'Mix of relation types over time (100%)'            },
  { key: 'method',       label: 'Method',       desc: 'Mix of interaction methods over time (100%)'       },
  { key: 'top7',         label: 'People',        desc: 'How your top 7 people change over time'            },
];

// ── Colours ───────────────────────────────────────────────────────────────────

// Single types first (each keeps its colour), then the mixes ("가족 + 친구").
function buildCategoryColorMap(
  buckets: TrendBucket[],
  key: 'byRelationType' | 'byMethod',
  isDark: boolean,
  singles: string[] = [],
): Record<string, string> {
  // The longer bar palette (as the Summary): five person colours repeated
  // once the mixes arrived.
  const cats = new Set<string>(singles);
  for (const b of buckets) Object.keys(b[key]).forEach(k => cats.add(k));
  return autoColorMap([...cats], isDark);
}

// ── Data adapters: TrendBucket → shared chart prop types ─────────────────────

// TrendBucket → stacked-area props. Band order is fixed across the whole
// window by total size, largest at the bottom — the same order the bars used.
// A band set that changed per bucket would make the stack jump; these two
// tabs have small stable vocabularies, so one pass over the window settles it.
function toArea(
  buckets: TrendBucket[],
  key: 'byRelationType' | 'byMethod',
  colorMap: Record<string, string>,
  isDark: boolean,
): { points: StackedAreaPoint[]; defs: StackedAreaSegmentDef[] } {
  const ng = isDark ? '#71717a' : '#a8a29e';
  const totals: Record<string, number> = {};
  for (const b of buckets) {
    for (const [k, v] of Object.entries(b[key])) if (k.trim()) totals[k] = (totals[k] ?? 0) + v;
  }
  const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const defs = cats.map(c => ({ key: c, label: c, color: colorMap[c] ?? ng }));

  const points = buckets.map(b => {
    const segments: Record<string, number> = {};
    let sum = 0;
    for (const c of cats) {
      const v = b[key][c] ?? 0;
      segments[c] = v;
      sum += v;
    }
    // sum 0 → no bar to normalise; the chart reads a null as a gap, which is
    // the honest picture for a bucket with nothing in it.
    return { label: b.label, total: sum > 0 ? sum : null, segments: sum > 0 ? segments : null };
  });

  return { points, defs };
}

// ── Summary (rewritten 27 Nov, Design §15.11) ──────────────────────────────────
// Two columns whose rows line up across: the figures, Relation type, Method and
// By activity. The Interactions column counts RECORDS (Count) or their time
// (Time); a record with 가족 and 친구 sits in one "가족 + 친구" slice, so each
// pie adds up to the total. Unique people counts each person once, under their
// most frequent relation type / method. People below: 15 names, no track.

type Measure = 'count' | 'time';
interface M { count: number; seconds: number }
interface Summary {
  options: { methods: string[]; relations: string[] };
  interactions: { total: M; byCategory: Record<string, M>; byMethod: Record<string, M> };
  people: { total: number; byCategory: Record<string, number>; byMethod: Record<string, number> };
  activities: { category: string; interactions: M; people: number; items: { name: string; interactions: M; people: number }[] }[];
  topPeople: { name: string; dominantCategory: string; count: number; seconds: number }[];
}

// The right-hand cell of each row carries the dividing line, so the two
// grids below read as one pair of columns.
const SPLIT = '[&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-stone-100 dark:[&>*:nth-child(even)]:border-zinc-800';
const valueOf = (m: M, by: Measure) => (by === 'count' ? m.count : m.seconds);
const showValue = (v: number, by: Measure) => (by === 'count' ? v.toLocaleString() : formatDuration(v));

// Colours: single relation types / methods first (so a type keeps its colour in
// both pies and in People), then the mixes.
function mixColors(singles: string[], mixes: string[], isDark: boolean): Record<string, string> {
  const extra = mixes.filter(k => !singles.includes(k));
  return autoColorMap([...singles, ...extra], isDark);
}

function segsOf(data: Record<string, number>, colors: Record<string, string>): Seg[] {
  return Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: k, value: v, color: colors[k] ?? '#a8a29e' }));
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">{value}</span>
      <span className="text-xs text-stone-400 dark:text-zinc-500 mt-0.5">{label}</span>
    </div>
  );
}

// Bar row with the grey track. Values keep a fixed-width column, so they line
// up down the list. With `trackW` the track has a fixed width and the NAME
// takes the rest (People, 27 Nov: the short bars of columns 2–3 left most of
// the row as grey, so the track is narrower and names get the room); without
// it the label is fixed and the track stretches. `pct`, when given, shows
// before the value only where the card is wide enough.
function TrackBar({ label, value, pct, frac, color, isDark, labelW = 'w-14', valueW = 'w-14', trackW }: {
  label: string; value: string; pct?: string; frac: number; color: string; isDark: boolean;
  labelW?: string; valueW?: string; trackW?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] min-w-0">
      <span className={`${trackW ? 'flex-1 min-w-0' : `${labelW} shrink-0`} truncate text-stone-600 dark:text-zinc-300`}>{label}</span>
      <div className={`${trackW ? `${trackW} shrink-0` : 'flex-1 min-w-0'} h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-stone-100'}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, frac * 100)}%`, background: color }} />
      </div>
      <span className={`${valueW} shrink-0 text-right tabular-nums whitespace-nowrap text-stone-500 dark:text-zinc-400`}>
        {pct !== undefined ? <><span className="hidden @[34rem]:inline">{pct} (</span>{value}<span className="hidden @[34rem]:inline">)</span></> : value}
      </span>
    </div>
  );
}

function SummaryView({ data, by, isDark }: { data: Summary; by: Measure; isDark: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const neutral = isDark ? '#52525b' : '#a8a29e';
  const accent  = isDark ? '#2dd4bf' : '#1d4ed8';

  const relSingles = [...data.options.relations].sort((a, b) =>
    (data.people.byCategory[b] ?? 0) - (data.people.byCategory[a] ?? 0));
  const metSingles = [...data.options.methods].sort((a, b) =>
    (data.people.byMethod[b] ?? 0) - (data.people.byMethod[a] ?? 0));
  const relColors = mixColors(relSingles, Object.keys(data.interactions.byCategory), isDark);
  const metColors = mixColors(metSingles, Object.keys(data.interactions.byMethod), isDark);

  const measured = (rec: Record<string, M>) =>
    Object.fromEntries(Object.entries(rec).map(([k, m]) => [k, by === 'count' ? m.count : Math.round(m.seconds / 60)]));
  const detailOf = (rec: Record<string, M>) => (seg: Seg) => (rec[seg.key] ? showValue(valueOf(rec[seg.key], by), by) : '');
  const unit = by === 'count' ? 'interaction' : 'min';

  const pieRow = (title: string, left: Record<string, M>, right: Record<string, number>, colors: Record<string, string>) => (
    <>
      <div className="flex flex-col gap-1.5 min-w-0">
        <Title>{title}</Title>
        <MetricPieBlock title={title} isDark={isDark} unit={unit}
          segments={segsOf(measured(left), colors)} legendDetail={detailOf(left)} />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0 pl-4">
        <Title>{title}</Title>
        <MetricPieBlock title={title} isDark={isDark} unit="person" flip
          segments={segsOf(right, colors)} legendDetail={seg => String(seg.value)} />
      </div>
    </>
  );

  // By activity: categories by the chosen measure, activities inside likewise.
  const totalV = valueOf(data.interactions.total, by) || 1;
  const cats = [...data.activities].sort((a, b) => valueOf(b.interactions, by) - valueOf(a.interactions, by));
  const maxV = Math.max(1, ...cats.map(c => valueOf(c.interactions, by)));
  const maxP = Math.max(1, ...cats.map(c => c.people));
  const pct = (v: number, t: number) => `${Math.round((v / (t || 1)) * 100)}%`;
  const toggle = (c: string) => setOpen(prev => {
    const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n;
  });

  // People: 15 by the chosen measure.
  const people = [...data.topPeople]
    .sort((a, b) => (by === 'count' ? b.count - a.count || b.seconds - a.seconds : b.seconds - a.seconds || b.count - a.count))
    .slice(0, 15);
  const pMax = people.length ? (by === 'count' ? people[0].count : people[0].seconds) || 1 : 1;

  return (
    <div className="@container flex flex-col gap-4">
      {/* Rows line up across the two columns */}
      <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-4 ${SPLIT}`}>
        <BigStat value={data.interactions.total.count.toLocaleString()}
          label={`interactions · ${formatDuration(data.interactions.total.seconds)}`} />
        <div className="pl-4"><BigStat value={data.people.total.toLocaleString()} label="unique people" /></div>

        {pieRow('Relation Type', data.interactions.byCategory, data.people.byCategory, relColors)}
        {pieRow('Method', data.interactions.byMethod, data.people.byMethod, metColors)}
      </div>

      {/* By activity — same two columns; tap a category for its activities */}
      {cats.length > 0 && (
      <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1 -mt-1 ${SPLIT}`}>
        <div className="min-w-0 pb-0.5"><Title>By activity</Title></div>
        <div className="min-w-0 pb-0.5 pl-4"><Title>By activity</Title></div>
        {cats.map(c => {
          const isOpen = open.has(c.category);
          const items = [...c.items].sort((a, b) => valueOf(b.interactions, by) - valueOf(a.interactions, by));
          return [
            <div key={`${c.category}-l`} role="button" tabIndex={0} onClick={() => toggle(c.category)}
              className="min-w-0 cursor-pointer rounded hover:bg-stone-50 dark:hover:bg-zinc-800">
              <TrackBar isDark={isDark} label={`${isOpen ? '▾' : '▸'} ${c.category}`} labelW="w-14 @[34rem]:w-20" valueW="w-14 @[34rem]:w-24"
                pct={pct(valueOf(c.interactions, by), totalV)} value={showValue(valueOf(c.interactions, by), by)}
                frac={valueOf(c.interactions, by) / maxV} color={accent} />
            </div>,
            <div key={`${c.category}-r`} role="button" tabIndex={0} onClick={() => toggle(c.category)}
              className="min-w-0 pl-4 cursor-pointer rounded hover:bg-stone-50 dark:hover:bg-zinc-800">
              <TrackBar isDark={isDark} label={c.category} labelW="w-14 @[34rem]:w-20" valueW="w-6 @[34rem]:w-16"
                pct={pct(c.people, data.people.total)} value={String(c.people)}
                frac={c.people / maxP} color={accent} />
            </div>,
            ...(isOpen ? items.flatMap(a => [
              <div key={`${c.category}/${a.name}-l`} className="min-w-0 pl-3">
                <TrackBar isDark={isDark} label={a.name} labelW="w-11 @[34rem]:w-[4.25rem]" valueW="w-14 @[34rem]:w-24"
                  pct={pct(valueOf(a.interactions, by), totalV)} value={showValue(valueOf(a.interactions, by), by)}
                  frac={valueOf(a.interactions, by) / maxV} color={neutral} />
              </div>,
              <div key={`${c.category}/${a.name}-r`} className="min-w-0 pl-7">
                <TrackBar isDark={isDark} label={a.name} labelW="w-11 @[34rem]:w-[4.25rem]" valueW="w-6 @[34rem]:w-16"
                  pct={pct(a.people, data.people.total)} value={String(a.people)}
                  frac={a.people / maxP} color={neutral} />
              </div>,
            ]) : []),
          ];
        })}
      </div>
      )}

      {/* People — 15 names: 3 columns of 5 when wide, 2 columns (8 + 7) when narrow */}
      {people.length > 0 && (
        <div className="flex flex-col gap-1.5 min-w-0">
          <Title>People</Title>
          <div className="grid grid-flow-col grid-rows-8 @[34rem]:grid-rows-5 gap-x-4 gap-y-1">
            {people.map(p => {
              const v = by === 'count' ? p.count : p.seconds;
              return (
                <TrackBar isDark={isDark} key={p.name} label={p.name} value={showValue(v, by)} frac={v / pMax}
                  color={relColors[p.dominantCategory] ?? neutral} valueW={by === 'count' ? 'w-8' : 'w-14'}
                  trackW="w-10 @[34rem]:w-20" />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function InteractionsWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode, setViewMode]       = useState<WidgetViewMode>('summary');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('interactions');
	// Weight-style window: grain × count, count resetting to the grain's
  // default on a grain switch. The People tab keeps its own short count
  // (3/6/12) so flipping there and back never destroys a longer window.
  const [grain, setGrain] = useState<TrendGrain>('month');
  const [count, setCount] = useState<number>(DEFAULT_BUCKETS.month);
  const [peopleCount, setPeopleCount] = useState<number>(12);

  // People-tab filters (unchanged): Relation + Method, draft → commit on close
  const [top7RelType, setTop7RelType]           = useState<string[]>([]);
  const [top7Method, setTop7Method]             = useState<string[]>([]);
  const [committedRelType, setCommittedRelType] = useState<string[]>([]);
  const [committedMethod, setCommittedMethod]   = useState<string[]>([]);
  const top7RelTypeRef = useRef<string[]>([]);
  const top7MethodRef  = useRef<string[]>([]);

  // Per-tab Method filters (independent) for Interactions / Unique / Relation,
  // keyed by metric. Draft → commit on close, same pattern as People.
  const [tabMethodDraft, setTabMethodDraft]         = useState<Record<string, string[]>>({});
  const [tabMethodCommitted, setTabMethodCommitted] = useState<Record<string, string[]>>({});
  const tabMethodRef = useRef<Record<string, string[]>>({});

  // Summary Method filter — independent from every Trend tab
  const [summaryMethodDraft, setSummaryMethodDraft]         = useState<string[]>([]);
  const [summaryMethodCommitted, setSummaryMethodCommitted] = useState<string[]>([]);
  const summaryMethodRef = useRef<string[]>([]);
  // Summary Relation filter (27 Nov) — same pattern; applies to the whole Summary
  const [summaryRelDraft, setSummaryRelDraft]         = useState<string[]>([]);
  const [summaryRelCommitted, setSummaryRelCommitted] = useState<string[]>([]);
  const summaryRelRef = useRef<string[]>([]);
  const [measure, setMeasure] = useState<Measure>('count');

  const [summaryData, setSummaryData] = useState<Summary | null>(null);
	const [trendData, setTrendData]     = useState<TrendBucket[]>([]);
  const [dataGrain, setDataGrain]     = useState<TrendGrain>('month');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Full method universe (byMethod stays full in both modes), used both for the
  // dropdown options and to detect "all selected" so we can omit the param —
  // keeping the default view byte-identical to today.
  // (27 Nov) The option lists come from every people group in the period,
  // whatever is filtered — the Method pie now follows the filter.
  const summaryAllMethods   = summaryData?.options.methods   ?? [];
  const summaryAllRelations = summaryData?.options.relations ?? [];
  const trendAllMethods   = [...new Set(trendData.flatMap(b => b.allMethods ?? []))].filter(s => s.trim()).sort();
  const trendAllRelations = [...new Set(trendData.flatMap(b => b.allRelations ?? []))].filter(s => s.trim()).sort();

  const subsetParam = (sel: string[] | undefined, universe: string[]) =>
    sel && sel.length > 0 && sel.length < universe.length ? sel.join(',') : '';

  const summaryMethodParam = subsetParam(summaryMethodCommitted, summaryAllMethods);
  const summaryRelParam    = subsetParam(summaryRelCommitted, summaryAllRelations);
  const pInteractions = subsetParam(tabMethodCommitted['interactions'], trendAllMethods);
  const pUnique       = subsetParam(tabMethodCommitted['people'],       trendAllMethods);
  const pRelation     = subsetParam(tabMethodCommitted['relationType'], trendAllMethods);

	// The People tab fetches its own shorter window; the other tabs share one.
  const effectiveBuckets = trendMetric === 'top7' ? peopleCount : count;

  useEffect(() => {
    setLoading(true); setError(null);
    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({
          metric: 'interactions.summary',
          mode: 'summary',
          ...(summaryMethodParam && { method: summaryMethodParam }),
          ...(summaryRelParam    && { relation: summaryRelParam }),
        }, globalFilter)}`
      : `/api/insights/stats?${buildParams({
          metric: 'interactions.trend',
          grain,
          buckets: String(effectiveBuckets),
          ...(committedRelType.length && { top7RelType: committedRelType.join(',') }),
          ...(committedMethod.length  && { top7Method:  committedMethod.join(',')  }),
          ...(pInteractions && { mInteractions: pInteractions }),
          ...(pUnique       && { mUnique:       pUnique }),
          ...(pRelation     && { mRelation:     pRelation }),
        }, globalFilter)}`;
    fetch(url)
      .then(r => r.json())
			.then(d => {
				if (viewMode === 'summary') setSummaryData(d.summary ?? null);
				else {
					setTrendData(d.data ?? []);
					if (d.grain) setDataGrain(d.grain);   // range line formats from the payload's grain
				}
				setLoading(false);
			})
			.catch(() => { setError('Failed to load data.'); setLoading(false); });
	}, [globalFilter, viewMode, grain, effectiveBuckets, committedRelType, committedMethod, pInteractions, pUnique, pRelation, summaryMethodParam, summaryRelParam]);

  // Keep refs in sync with draft state
  useEffect(() => { top7RelTypeRef.current = top7RelType; }, [top7RelType]);
  useEffect(() => { top7MethodRef.current  = top7Method;  }, [top7Method]);
  useEffect(() => { tabMethodRef.current   = tabMethodDraft; }, [tabMethodDraft]);
  useEffect(() => { summaryMethodRef.current = summaryMethodDraft; }, [summaryMethodDraft]);
  useEffect(() => { summaryRelRef.current = summaryRelDraft; }, [summaryRelDraft]);

  // Initialise all Trend selections to all-selected when trend data first loads
  useEffect(() => {
    if (trendData.length === 0) return;
    const allRelTypes = [...new Set(trendData.flatMap(b => b.allRelations ?? []))].filter(s => s.trim());
    const allMethods  = [...new Set(trendData.flatMap(b => b.allMethods ?? []))].filter(s => s.trim());
    setTop7RelType(prev      => prev.length === 0 ? allRelTypes : prev);
    setTop7Method(prev       => prev.length === 0 ? allMethods  : prev);
    setCommittedRelType(prev => prev.length === 0 ? allRelTypes : prev);
    setCommittedMethod(prev  => prev.length === 0 ? allMethods  : prev);
    const initTab = (rec: Record<string, string[]>) => {
      const next = { ...rec };
      for (const k of METHOD_FILTER_TABS) {
        if (!next[k] || next[k].length === 0) next[k] = allMethods;
      }
      return next;
    };
    setTabMethodDraft(initTab);
    setTabMethodCommitted(initTab);
  }, [trendData]);

  // Initialise the Summary Method filter to all-selected when summary data loads
  useEffect(() => {
    if (!summaryData) return;
    const all = summaryData.options.methods;
    setSummaryMethodDraft(prev     => prev.length === 0 ? all : prev);
    setSummaryMethodCommitted(prev => prev.length === 0 ? all : prev);
    const rel = summaryData.options.relations;
    setSummaryRelDraft(prev     => prev.length === 0 ? rel : prev);
    setSummaryRelCommitted(prev => prev.length === 0 ? rel : prev);
  }, [summaryData]);

	// Resolved range — the control states a count, this line states the span.
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toISO = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  const bucketEndISO = (startISO: string, g: TrendGrain): string => {
    const [y, m, d] = startISO.split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (g === 'week') dt.setDate(dt.getDate() + 6);
    else if (g === 'month') { dt.setMonth(dt.getMonth() + 1); dt.setDate(dt.getDate() - 1); }
    return toISO(dt);
  };
  const todayISO = toISO(new Date());
  const lastEnd = trendData.length ? bucketEndISO(trendData[trendData.length - 1].start, dataGrain) : '';
  const rangeText = trendData.length
    ? `${trendData[0].start} → ${lastEnd > todayISO ? todayISO : lastEnd}`
    : '';

  // Derived values
  const relTypeColorMap = buildCategoryColorMap(trendData, 'byRelationType', isDark, trendAllRelations);
  const methodColorMap  = buildCategoryColorMap(trendData, 'byMethod', isDark, trendAllMethods);
	const relTypeArea     = toArea(trendData, 'byRelationType', relTypeColorMap, isDark);
  const methodArea      = toArea(trendData, 'byMethod',       methodColorMap,  isDark);

  const lineValues      = trendData.map(b =>
    trendMetric === 'interactions' ? b.totalCount : b.uniquePeopleCount,
  );
  const validLineValues = lineValues.filter((v): v is number => v !== null);
  const activeDesc      = TREND_METRICS.find(m => m.key === trendMetric)?.desc;

  const relTypeOptions  = trendAllRelations;
  const methodOptions   = trendAllMethods;

  // Summary Method filter row — between the header line and the contents
  // (27 Nov) Count / Time on the left; Relation and Method on the right.
  const summaryMethodRow = summaryAllMethods.length === 0 ? null : (
    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 -mt-1">
      <Segmented<Measure> value={measure} onChange={setMeasure}
        options={[['count', 'Count'], ['time', 'Time']]} />
      <div className="flex items-center gap-2">
      <MultiSelectDropdown
        label="Relation"
        options={summaryAllRelations}
        selected={summaryRelDraft}
        onChange={setSummaryRelDraft}
        onClose={() => setSummaryRelCommitted([...summaryRelRef.current])}
      />
      <MultiSelectDropdown
        label="Method"
        options={summaryAllMethods}
        selected={summaryMethodDraft}
        onChange={setSummaryMethodDraft}
        onClose={() => setSummaryMethodCommitted([...summaryMethodRef.current])}
      />
      </div>
    </div>
  );

  // Per-tab Method control (Interactions / Unique / Relation), shown by the chart
  const tabMethodControl = (METHOD_FILTER_TABS.includes(trendMetric) && methodOptions.length > 0) ? (
    <div className="flex justify-end -mt-1">
      <MultiSelectDropdown
        label="Method"
        options={methodOptions}
        selected={tabMethodDraft[trendMetric] ?? []}
        onChange={vals => setTabMethodDraft(prev => ({ ...prev, [trendMetric]: vals }))}
        onClose={() => setTabMethodCommitted(prev => ({ ...prev, [trendMetric]: tabMethodRef.current[trendMetric] ?? [] }))}
      />
    </div>
  ) : null;

  return (
    <WidgetCard
      title="Interactions"
      floor={1}
      loading={loading}
      error={error}
			action={<ViewToggle value={viewMode} onChange={setViewMode} />}
    >
      {viewMode === 'summary' ? (
        <>
          {summaryMethodRow}
          {!summaryData ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (
            <SummaryView data={summaryData} by={measure} isDark={isDark} />
          )}
        </>
      ) : (
        // ── Trend view ────────────────────────────────────────────────────────
        <div className="flex flex-col gap-3">

          {/* Row 1: metric pills (left) + BucketSelector (right) */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {TREND_METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTrendMetric(key)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    trendMetric === key
                      ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
						<div className="flex items-center gap-2">
              <Segmented<TrendGrain>
                value={grain}
                onChange={g => { setGrain(g); setCount(DEFAULT_BUCKETS[g]); }}
                options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
              {trendMetric === 'top7' ? (
                <Segmented<number>
                  value={peopleCount} onChange={setPeopleCount}
                  options={[[3, '3'], [6, '6'], [12, '12']]} />
              ) : (
                <Segmented<number>
                  value={count} onChange={setCount}
                  options={BUCKET_OPTIONS[grain].map(n => [n, String(n)]) as [number, string][]} />
              )}
            </div>
          </div>

          {/* Row 2: description of active metric */}
          {activeDesc && (
            <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1">{activeDesc}</p>
          )}

					{/* Resolved range — what you picked is a count, what you see is a span */}
          {rangeText && (
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</span>
          )}

          {/* Row 3: per-tab Method control (Interactions / Unique / Relation) */}
          {tabMethodControl}

          {/* Row 4: chart */}
          {trendData.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (trendMetric === 'interactions' || trendMetric === 'people') ? (
            validLineValues.length > 0 ? (
							<CssTrendChart
                series={[{
                  values: lineValues,
                  color: isDark ? '#2dd4bf' : '#1d4ed8',
                  label: trendMetric === 'interactions' ? 'Interactions' : 'People',
                }]}
                labels={trendData.map(b => b.label)}
                formatY={v => String(v)}
                isDark={isDark}
                maxXLabels={12}
                showValues={trendData.length <= 16}
                compressXLabels={false}
              />
            ) : (
              <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
            )
					) : trendMetric === 'relationType' ? (
            <CssStackedAreaChart
              points={relTypeArea.points} segmentDefs={relTypeArea.defs}
              isDark={isDark} mode="percent" highlightable
              maxXLabels={12} formatY={v => String(v)} height={190} />
          ) : trendMetric === 'method' ? (
            <CssStackedAreaChart
              points={methodArea.points} segmentDefs={methodArea.defs}
              isDark={isDark} mode="percent" highlightable
              maxXLabels={12} formatY={v => String(v)} height={190} />
          ) : (
            <CssRankFlowChart
              buckets={trendData.map(b => ({ label: b.label, ranked: b.top7 }))}
              topN={7}
              isDark={isDark}
              controls={
                <>
                  <MultiSelectDropdown
                    label="Relation"
                    options={relTypeOptions}
                    selected={top7RelType}
                    onChange={setTop7RelType}
                    onClose={() => setCommittedRelType([...top7RelTypeRef.current])}
                  />
                  <MultiSelectDropdown
                    label="Method"
                    options={methodOptions}
                    selected={top7Method}
                    onChange={setTop7Method}
                    onClose={() => setCommittedMethod([...top7MethodRef.current])}
                  />
                </>
              }
            />
          )}
        </div>
      )}
    </WidgetCard>
  );
}
