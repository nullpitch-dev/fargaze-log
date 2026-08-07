'use client';
// src/app/insights/_widgets/ExerciseWidget.tsx
//
// Exercise widget (WBS #58 Summary + Trend view).
//
// Row 1  — whole period: exercise days counter + HeatStrip, tap for the
//          Mon–Sun calendar modal.
// Row 2+ — one block per item, sorted by days desc: header, all-time bests,
//          box plot, total. Tap a block for its daily chart.
//
// The daily chart lives in a modal rather than inline: five items in a month
// is normal, and five inline charts made the card roughly four times taller
// than every other widget on the page.

import { useEffect, useState } from 'react';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { ExerciseTrendView } from './ExerciseTrendView';
import { ModalShell } from '../_components/ModalShell';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import { CalendarHeatmap, HeatStrip } from '../_components/charts/CalendarHeatmap';
import {
  CssDailyChart, CssVerticalBoxPlotChart,
  type BoxPlotBucket,
} from '../_components/charts/css-chart-components';

// ── Types (mirror src/lib/insights/exercise.ts) ───────────────────────────────

interface Best { value: number; date: string }

interface ItemSummary {
  item: string;
  unit: string;
  days: number;
  daysPerWeek: number;
  total: number;
  restPauseCount: number;
	boxes: BoxPlotBucket[] | null;
  daily: (number | null)[];
  dailySetMax: (number | null)[] | null;
  bestSet: Best | null;
  bestSetRestPause: Best | null;
  bestDay: Best;
  bestLoadKg: Best | null;
}

interface ExerciseSummary {
  dates: string[];
  exerciseDays: number;
  periodDays: number;
  daysPerWeek: number;
  dayCounts: Record<string, number>;
  items: ItemSummary[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// One accent, presence only. The record count is a weak intensity signal —
// one 걷기 and eight 턱걸이 are not comparable — so shading by it would imply
// a ranking the data does not support. Pinned rather than taken from
// barColors, which exists for dynamic key sets. Same rationale as
// weight-colors.ts.
const ACCENT_LIGHT = '#1d4ed8';   // blue-700
const ACCENT_DARK  = '#2dd4bf';   // teal-400

// Amounts are 개/층/분 (integers) or km (decimals). toFixed would print
// "34.80" for a 34.8 km run, so trailing zeros are dropped instead.
function fmt(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : String(Math.round(v * 100) / 100);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// 'YYYY-MM-DD' → 'Dec 2020'. These records are often years old, so the year
// carries far more than the day of the month does, and the line is narrow.
function monthYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// When a day holds one record, "best in one set" and "best in one day" are the
// same number, and printing both reads as a bug. Collapse to one unlabelled
// line. 스쿼트 has one record per day but carries 총 records, which count
// towards the day figure and not the set figure, so its two numbers differ and
// it keeps both — no special case needed.
//
// bestSetRestPause is deliberately not shown. 총 marks a day total whose set
// split is unknown, so a "best 총" is just a day total under another name.
function bestLines(it: ItemSummary): string[] {
  const u = it.unit;
  const out: string[] = [];
  const line = (label: string, b: Best, unit: string) =>
    `${label} ${fmt(b.value)}${unit} (${monthYear(b.date)})`;

  if (it.bestSet && it.bestSet.value === it.bestDay.value) {
    out.push(line('best', it.bestDay, u));
  } else {
    if (it.bestSet) out.push(line('best set', it.bestSet, u));
    out.push(line('best day', it.bestDay, u));
  }

  if (it.bestLoadKg) out.push(line('load', it.bestLoadKg, 'kg'));

  return out;
}

// Under three days the server sends boxes: null — there is no distribution
// worth drawing, so the raw values are listed instead.
function plainValues(it: ItemSummary): string {
  return it.daily
    .filter((v): v is number => v !== null)
    .map(v => `${fmt(v)}${it.unit}`)
    .join(' · ');
}

// Average across the days that have a record. The dashed line is a "typical
// exercise day", so days off are absent rather than counted as zeros.
function mean(values: (number | null)[]): number | undefined {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((t, n) => t + n, 0) / v.length : undefined;
}

// ── Row 1 — whole period ──────────────────────────────────────────────────────

function PeriodRow({ data, isDark, onOpen }: {
  data: ExerciseSummary;
  isDark: boolean;
  onOpen: () => void;
}) {
  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  const fill = (date: string) => (data.dayCounts[date] ? accent : null);

  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      className="flex items-center gap-3 rounded-lg p-1 -mx-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
      <div className="shrink-0 flex flex-col">
        <span className="text-sm font-mono font-medium text-stone-900 dark:text-zinc-50 leading-tight">
          {data.exerciseDays}
          <span className="text-stone-400 dark:text-zinc-500">/{data.periodDays}</span>
        </span>
        <span className="text-[10px] text-stone-400 dark:text-zinc-500 leading-tight">
          {fmt(data.daysPerWeek)} / week
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <HeatStrip
          rangeStart={data.dates[0]}
          rangeEnd={data.dates[data.dates.length - 1]}
          isDark={isDark}
          fillFor={fill}
        />
      </div>
    </div>
  );
}

// ── One item block ────────────────────────────────────────────────────────────

function ItemBlock({ it, isDark, onOpen }: {
  it: ItemSummary;
  isDark: boolean;
  onOpen: () => void;
}) {
  // The caption only makes sense when there IS a set box to exclude from.
  const showCaption = it.restPauseCount > 0 && !!it.boxes && it.boxes.length > 1;

  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      className="flex flex-col gap-1 rounded-lg p-1 -mx-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">

			<div className="flex flex-col">
        <span className="text-[11px] font-medium text-stone-700 dark:text-zinc-200 truncate">
          {it.item}
        </span>
        <span className="text-[10px] text-stone-400 dark:text-zinc-500">
          {it.days} days · {fmt(it.daysPerWeek)}/wk
        </span>
      </div>

      <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-snug">
        {bestLines(it).join(' · ')}
      </p>

			{it.boxes ? (
        // One chart per box, so each gets its own scale and fills the height.
        // On a shared scale the day box is always ~3× the set box, because a
        // day holds ~3 sets — true, but it squashes both shapes flat.
        <div className="flex gap-2">
          {it.boxes.map((b, i) => (
            <div key={i} className="flex-1 min-w-0">
              <CssVerticalBoxPlotChart
                buckets={[b]}
                isDark={isDark}
                formatY={fmt}
                height={80}
                compact
                emphasizeLast={false}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">
          {plainValues(it)}
        </p>
      )}

      {showCaption && (
        <p className="text-[9px] text-stone-400 dark:text-zinc-500">
          Set box excludes {it.restPauseCount} rest-pause {it.restPauseCount === 1 ? 'set' : 'sets'}.
        </p>
      )}

      <span className="text-[10px] text-stone-500 dark:text-zinc-400">
        total {fmt(it.total)}{it.unit}
      </span>
    </div>
  );
}

// ── ExerciseWidget ────────────────────────────────────────────────────────────

type Modal = { kind: 'calendar' } | { kind: 'item'; item: string } | null;

export function ExerciseWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();

  const [data,    setData]    = useState<ExerciseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
	const [modal,   setModal]   = useState<Modal>(null);
  const [view,    setView]    = useState<WidgetViewMode>('summary');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'exercise.summary', mode: 'summary' },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  // Close any open modal when the filter changes — the item behind it may no
  // longer exist in the new period.
	useEffect(() => { setModal(null); }, [globalFilter, view]);

  const hasData = !!data && data.dates.length > 0 && data.items.length > 0;
  const openItem = modal?.kind === 'item'
    ? data?.items.find(i => i.item === modal.item) ?? null
    : null;

  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;

  return (
		<WidgetCard title="Exercise" floor={1}
      loading={view === 'summary' && loading}
      error={view === 'summary' ? error : null}
      action={<ViewToggle value={view} onChange={setView} />}>
      {view === 'trend' ? (
        <ExerciseTrendView globalFilter={globalFilter} isDark={isDark} />
      ) : !hasData ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>
      ) : (
        <div className="flex flex-col gap-3">
          <PeriodRow data={data!} isDark={isDark} onOpen={() => setModal({ kind: 'calendar' })} />

					<div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {data!.items.map(it => (
              <ItemBlock
                key={it.item}
                it={it}
                isDark={isDark}
                onOpen={() => setModal({ kind: 'item', item: it.item })}
              />
            ))}
          </div>
        </div>
      )}

      {hasData && modal?.kind === 'calendar' && (
        <ModalShell title="Exercise days" onClose={() => setModal(null)}>
          <CalendarHeatmap
            rangeStart={data!.dates[0]}
            rangeEnd={data!.dates[data!.dates.length - 1]}
            isDark={isDark}
            fillFor={(d: string) => (data!.dayCounts[d] ? accent : null)}
            legend={[{ color: accent, label: 'Exercised' }]}
          />
        </ModalShell>
      )}

      {hasData && openItem && (
        <ModalShell title={openItem.item} onClose={() => setModal(null)}>
					<div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
              Daily total ({openItem.unit})
            </span>
            <CssDailyChart
              values={openItem.daily}
              labels={data!.dates}
              formatY={fmt}
              avg={mean(openItem.daily)}
              baselineZero
              isDark={isDark}
            />
          </div>

          {openItem.dailySetMax && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                Biggest set ({openItem.unit})
              </span>
              <CssDailyChart
                values={openItem.dailySetMax}
                labels={data!.dates}
                formatY={fmt}
                avg={mean(openItem.dailySetMax)}
                baselineZero
                isDark={isDark}
              />
            </div>
          )}

          <p className="text-[10px] text-stone-400 dark:text-zinc-500">
            The dashed line is the average across the {openItem.days}{' '}
            {openItem.days === 1 ? 'day' : 'days'} with a record, not across the
            whole period.
            {openItem.restPauseCount > 0 && ' Rest-pause sets are excluded from the biggest set.'}
          </p>
        </ModalShell>
      )}
    </WidgetCard>
  );
}
