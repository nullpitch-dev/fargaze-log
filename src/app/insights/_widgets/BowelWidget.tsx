'use client';
// src/app/insights/_widgets/BowelWidget.tsx
//
// Bowel Movement widget (WBS #62) — Summary view.
//
// Header      movement days / period days, per week, last movement
// Day Score   daily line, dashed average, bad-day zone; hover lists every movement
// Row         Per day · Gap · Duration — three columns when the widget is wide
// Row         Quality pie (split ½ / ⅓ across mixed movements) · How it went pie ·
//             Other signs list (not mutually exclusive, so counted, never a pie)
// Time of day seven fixed groups
//
// All rules live in src/lib/insights/bowel.ts; this file only draws.

import { useEffect, useState } from 'react';
import { WidgetCard } from '../_components/WidgetCard';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps } from '../_lib/types';
import { CssDailyChart, type HoverRow } from '../_components/charts/css-chart-components';
import { Histogram, type HistogramBucket } from '../_components/charts/Histogram';
import { MetricPieBlock, HintLabel, type Seg } from './SleepWidget';

// ── Types (mirror src/lib/insights/bowel.ts) ─────────────────────────────────

interface Movement {
  hour: string | null;
  amount: string | null;
  quality: string[];
  characteristics: string[];
  minutes: number | null;
  score: number | null;
}
interface Day {
  date: string;
  score: number | null;
  movements: Movement[];
  penalty: number;
  emptyDay: number | null;
}
interface ShareRow { value: string; count: number; share: number }
interface Summary {
  dates: string[];
  periodDays: number;
  movementDays: number;
  movements: number;
  daysPerWeek: number;
  lastMovement: { date: string; daysAgo: number } | null;
  days: Day[];
  dayScore: { average: number | null; scoredDays: number; badDays: number };
  perDay: { average: number; histogram: HistogramBucket[] };
  gap: { average: number | null; histogram: HistogramBucket[]; currentGap: number };
  duration: { average: number | null; histogram: HistogramBucket[]; counted: number };
  quality: ShareRow[];
  howItWent: ShareRow[];
  otherSigns: { rows: { value: string; count: number; pctOfMovements: number }[]; movements: number };
  timeOfDay: {
    groups: { key: string; label: string; range: string; count: number }[];
    peak: string | null;
  };
}

// ── Rules shown to the reader (must match bowel.ts) ──────────────────────────

const BAD_DAY_BELOW = -3;
const DAY_SCORE_START_LABEL = '19 Sep 2019';

// ── Colours ───────────────────────────────────────────────────────────────────
//
// Quality is split into two families so the pie reads as a direction, not just
// a list: blues for normal, reds for loose, ambers for hard. Display order
// follows the same grouping.

const QUALITY_ORDER = ['좋음', '보통', '무름', '묽음', '설사', '가늠', '푸석함', '딱딱함', '토끼똥'];
const QUALITY_COLORS: Record<string, string> = {
  좋음: '#3b82f6', 보통: '#93c5fd',
  무름: '#fca5a5', 묽음: '#f87171', 설사: '#dc2626',
  가늠: '#fde68a', 푸석함: '#fbbf24', 딱딱함: '#d97706', 토끼똥: '#92400e',
};
const HOW_ORDER = ['편하게', '급하게', '힘들게', 'Not recorded'];
const HOW_COLORS: Record<string, string> = {
  편하게: '#3b82f6', 급하게: '#f87171', 힘들게: '#fbbf24', 'Not recorded': '#d6d3d1',
};
const FALLBACK = '#a8a29e';
const BAD_RED = '#ef4444';

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${date} ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

function localYesterday(): string {
  const n = new Date();
  n.setDate(n.getDate() - 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const fmtScore = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function sortBy(rows: ShareRow[], order: string[]): ShareRow[] {
  const rank = (v: string) => { const i = order.indexOf(v); return i === -1 ? order.length : i; };
  return [...rows].sort((a, b) => rank(a.value) - rank(b.value) || b.count - a.count);
}

function movementLine(m: Movement): string {
  const parts = [
    m.quality.join('+') || '—',
    m.characteristics.join('+') || null,
    m.amount,
    m.minutes !== null ? `${m.minutes}m` : null,
  ].filter(Boolean);
  return parts.join(' · ') + (m.score !== null ? `  (${signed(m.score)})` : '');
}

function dayHover(d: Day): { title: string; rows: HoverRow[]; note?: string } {
  const bad = d.score !== null && d.score < BAD_DAY_BELOW;
  const rows: HoverRow[] = [];
  if (d.score !== null) {
    rows.push({ label: 'Day score', value: fmtScore(d.score), color: bad ? BAD_RED : '#3b82f6' });
  }
  if (!d.movements.length) {
    rows.push({
      value: d.emptyDay ? `No movement — ${ordinal(d.emptyDay)} day in a row` : 'No movement',
      dim: true,
    });
  }
  d.movements.forEach((m, i) => {
    rows.push({ label: `${i + 1}. ${m.hour ?? '—'}`, value: movementLine(m) });
  });
  if (d.penalty) {
    rows.push({ value: `${d.movements.length} movements: ${d.penalty} for frequency`, dim: true });
  }
  const note = d.score === null && d.movements.length
    ? `No score before ${DAY_SCORE_START_LABEL} — characteristics were not recorded yet`
    : bad ? `Bad day — score below ${BAD_DAY_BELOW}` : undefined;
  return { title: dayTitle(d.date), rows, note };
}

// ── Small building blocks ─────────────────────────────────────────────────────

const HEAD = 'text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide';
const FIG  = 'text-sm font-mono font-medium text-stone-800 dark:text-zinc-100';
const SUB  = 'text-[10px] text-stone-400 dark:text-zinc-500 leading-tight';

/** Heading and figure on one line, histogram underneath. */
function HistBlock({ title, hint, figure, sub, buckets, isDark, placement, flip = false }: {
  title: string;
  hint: HoverRow[];
  figure: string;
  sub?: string;
  buckets: HistogramBucket[];
  isDark: boolean;
  placement?: 'above' | 'below';
  flip?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <HintLabel text={title} rows={hint} isDark={isDark} className={HEAD} flip={flip} />
        <span className={FIG}>{figure}</span>
        {sub && <span className={SUB}>{sub}</span>}
      </div>
      <Histogram buckets={buckets} isDark={isDark} hoverPlacement={placement} height={48} />
    </div>
  );
}

function pctOf(count: number, total: number): string {
  return total ? `${Math.round((count / total) * 100)}%` : '0%';
}

function withHover(buckets: HistogramBucket[], total: number, unit: string, names?: string[]): HistogramBucket[] {
  return buckets.map((b, i) => ({
    ...b,
    hover: {
      title: names?.[i] ?? b.label,
      rows: [{ value: `${b.count} ${unit}${b.count === 1 ? '' : 's'} · ${pctOf(b.count, total)}` }],
    },
  }));
}

// ── Summary view ──────────────────────────────────────────────────────────────

function BowelSummaryView({ data, isDark }: { data: Summary | null; isDark: boolean }) {
  if (!data || !data.periodDays) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>;
  }

  const byIndex = data.days;
  const showLast = data.dates[data.dates.length - 1] === localYesterday() && data.lastMovement;
  const lastText = !data.lastMovement ? '' :
    data.lastMovement.daysAgo === 0 ? 'today' :
    data.lastMovement.daysAgo === 1 ? 'yesterday' :
    `${data.lastMovement.daysAgo} days ago`;

  const perDayNames = ['No movement', 'Once', 'Twice', '3 times', '4 times', '5 times', '6 times or more'];
  const gapNames = ['Moved the day before', '1 day without before', '2 days without before',
    '3 days without before', '4 days without before', '5 or more days without before'];
  const durNames = ['0–1 min', '2–3 min', '4–5 min', '6–10 min', '11–20 min', '21 min or more'];

  const movementDaysForGap = data.gap.histogram.reduce((s, b) => s + b.count, 0);

  const qSegs: Seg[] = sortBy(data.quality, QUALITY_ORDER).map(r => ({
    key: r.value, label: r.value, value: r.count, color: QUALITY_COLORS[r.value] ?? FALLBACK,
  }));
  const hSegs: Seg[] = sortBy(data.howItWent, HOW_ORDER).map(r => ({
    key: r.value, label: r.value, value: r.count, color: HOW_COLORS[r.value] ?? FALLBACK,
  }));

  const peak = data.timeOfDay.groups.find(g => g.key === data.timeOfDay.peak);
  const todTotal = data.timeOfDay.groups.reduce((s, g) => s + g.count, 0);
  const todBuckets: HistogramBucket[] = data.timeOfDay.groups.map(g => ({
    label: g.range.slice(0, 5).replace(/^0/, ''),
    count: g.count,
    hover: {
      title: `${g.label} · ${g.range}`,
      rows: [{ value: `${g.count} movement${g.count === 1 ? '' : 's'} · ${pctOf(g.count, todTotal)}` }],
    },
  }));

  // The layout follows the WIDGET's width, not the screen's: @container on the
  // root, @lg: (32rem) for the three-column rows. In a narrow three-column page
  // the rows stack again, so histogram labels are never squeezed.
  return (
    <div className="@container flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-sm font-mono font-medium text-stone-900 dark:text-zinc-50">
          {data.movementDays}
          <span className="text-stone-400 dark:text-zinc-500">/{data.periodDays}</span>
          <span className="text-[10px] font-sans font-normal text-stone-400 dark:text-zinc-500"> days</span>
        </span>
        <span className="text-[11px] text-stone-500 dark:text-zinc-400">{data.daysPerWeek} / week</span>
        <span className="text-[11px] text-stone-500 dark:text-zinc-400">{data.movements} movements</span>
        {showLast && (
          <span className="text-[11px] text-stone-500 dark:text-zinc-400">Last: {lastText}</span>
        )}
      </div>

      {/* Day Score */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <HintLabel
            text="Day score"
            isDark={isDark}
            className={HEAD}
            rows={[
              { value: 'Average of the day’s movement scores' },
              { value: '3rd movement −2, each one after −3', dim: true },
              { value: 'No movement: −1, −3, −5, −7, then −10 a day', dim: true },
              { value: `Bad day: below ${BAD_DAY_BELOW}`, dim: true },
              { value: 'Until yesterday — today is not finished', dim: true },
            ]}
          />
          <span className="text-[11px] text-stone-500 dark:text-zinc-400">
            Avg <span className={FIG}>{data.dayScore.average ?? '—'}</span>
            {' · '}
            <span style={{ color: data.dayScore.badDays ? BAD_RED : undefined }}>
              {data.dayScore.badDays} bad {data.dayScore.badDays === 1 ? 'day' : 'days'}
            </span>
          </span>
        </div>
        {data.dayScore.scoredDays ? (
          <CssDailyChart
            values={byIndex.map(d => d.score)}
            labels={data.dates}
            formatY={fmtScore}
            avg={data.dayScore.average}
            zones={[{ from: -1000, to: BAD_DAY_BELOW, color: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.07)' }]}
            hoverFor={i => dayHover(byIndex[i])}
            isDark={isDark}
          />
        ) : (
          <p className={SUB}>No day score before {DAY_SCORE_START_LABEL}.</p>
        )}
      </div>

      {/* Frequency · gap · duration */}
      <div className="grid grid-cols-1 @lg:grid-cols-3 gap-x-4 gap-y-3">
        <HistBlock
          title="Per day"
					hint={[
            { value: 'Movements per day, counting every day of the period' },
            { value: 'Second figure: on days with at least one movement', dim: true },
          ]}
          figure={`${data.perDay.average}`}
          sub={data.movementDays ? `· ${(data.movements / data.movementDays).toFixed(2)} on movement days` : undefined}
          // hint={[{ value: 'Movements on each day of the period' }]}
          // figure={`${data.perDay.average}`}
          buckets={withHover(data.perDay.histogram, data.periodDays, 'day', perDayNames)}
          isDark={isDark}
        />
        <HistBlock
          title="Gap"
          hint={[
            { value: 'Days without a movement just before each movement day' },
            { value: '0d = moved the day before too', dim: true },
          ]}
          figure={data.gap.average !== null ? `${data.gap.average}d` : '—'}
          buckets={withHover(data.gap.histogram, movementDaysForGap, 'movement day', gapNames)}
          isDark={isDark}
        />
        <HistBlock
          title="Duration"
          hint={[{ value: 'Minutes per movement' }]}
          figure={data.duration.average !== null ? `${data.duration.average}m` : '—'}
          buckets={withHover(data.duration.histogram, data.duration.counted, 'movement', durNames)}
          isDark={isDark}
          flip
        />
      </div>

      {/* Quality · How it went · Other signs */}
			<div className="grid grid-cols-3 gap-x-3">
        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <HintLabel text="Quality" isDark={isDark} className={HEAD}
            rows={[{ value: 'A movement with two or three values counts ½ or ⅓ to each' }]} />
					<MetricPieBlock segments={qSegs} title="Quality" isDark={isDark} unit="movement" legendCols={2} />
        </div>
        <div className="flex flex-col items-center gap-1.5 min-w-0">
          <HintLabel text="How it went" isDark={isDark} className={HEAD}
            rows={[{ value: `Counted from ${DAY_SCORE_START_LABEL}` }]} />
					<MetricPieBlock segments={hSegs} title="How it went" isDark={isDark} unit="movement" legendCols={2} />
        </div>
				<div className="flex flex-col gap-1.5 min-w-0">
          <HintLabel text="Other signs" isDark={isDark} className={HEAD} flip
            rows={[
              { value: 'One movement can have several signs,' },
              { value: 'so the percentages do not add up to 100%', dim: true },
            ]} />
          {data.otherSigns.rows.length ? (
            <div className="flex flex-col gap-0.5">
              {data.otherSigns.rows.map(r => (
                <div key={r.value} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="text-stone-600 dark:text-zinc-300 truncate">{r.value}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-mono text-stone-800 dark:text-zinc-100">{r.count}</span>
                    <span className="text-stone-400 dark:text-zinc-500">
                      {' · '}{r.pctOfMovements === 0 ? '<0.1' : r.pctOfMovements}%
                    </span>
                  </span>
                </div>
              ))}
              <span className={SUB}>of {data.otherSigns.movements} movements</span>
            </div>
          ) : (
            <p className={SUB}>None in this period</p>
          )}
        </div>
      </div>

      {/* Time of day */}
      <HistBlock
        title="Time of day"
        hint={[{ value: 'When movements start, in seven fixed groups' }]}
        figure={peak ? peak.label : '—'}
        sub={peak ? peak.range : undefined}
        buckets={todBuckets}
        isDark={isDark}
        placement="above"
      />
    </div>
  );
}

// ── BowelWidget ───────────────────────────────────────────────────────────────

export function BowelWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/insights/stats?${buildParams({ metric: 'bowel.summary' }, globalFilter)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(String(d.error));
        setData(d.summary ?? null);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  return (
    <WidgetCard title="Bowel Movement" floor={1} loading={loading} error={error}>
      <BowelSummaryView data={data} isDark={isDark} />
    </WidgetCard>
  );
}
