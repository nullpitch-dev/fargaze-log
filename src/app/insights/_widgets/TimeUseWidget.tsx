'use client';
// src/app/insights/_widgets/TimeUseWidget.tsx
//
// Time use (Hyoje, 28 Nov 2026; Design §15.12) — Summary only for now.
//
// Header   recorded hours of the period (to now), coverage %, per day
// Bar      one 100% stacked bar: categories in colour, unrecorded grey at the end
// Switches (28 Nov) Category | Activity — the list grouped, or every activity
//          on its own (a meal keeps its cross activity: "점심 · 업무"), each
//          row in its category's colour; 수면 on / off — off takes the sleep
//          time out of the period too, so the figures are of waking hours;
//          일상 업무 on / off — the same for the time only work was running.
// List     one row per category: hours, % of recorded, per day; tap a category
//          for its activities; the first 6 lines show, the arrow by the title
//          unfolds the rest (as Interactions' By activity)
//
// All rules (exclusions, the even split, 평일 업무 / 휴일 근무 as background →
// 일상 업무, meals by cross activity) live in src/lib/insights/time-use.ts.

import { useEffect, useState } from 'react';
import { WidgetCard } from '../_components/WidgetCard';
import { Title } from '../_components/charts/bars';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { autoColorMap } from '../_lib/chart-colors';
import { formatDuration } from '../_lib/format';
import { Segmented } from '../_components/Segmented';
import type { WidgetProps } from '../_lib/types';

interface Item { name: string; seconds: number }
interface Category { category: string; seconds: number; items: Item[] }
interface Summary {
  from: string;
  to: string;
  totalSeconds: number;
  recordedSeconds: number;
  sleepSeconds: number;
  workSeconds: number;
  days: number;
  records: number;
  categories: Category[];
}

const SHOWN_ROWS = 6;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** The viewer's local wall clock, as the API wants it. */
function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** What the switches took out of the period, e.g. " (without 수면, 일상 업무)". */
function outText(d: Summary): string {
  const out = [d.sleepSeconds > 0 && '수면', d.workSeconds > 0 && '일상 업무'].filter(Boolean);
  return out.length ? ` (without ${out.join(', ')})` : '';
}

const pctText = (v: number, t: number) => `${t > 0 ? Math.round((v / t) * 100) : 0}%`;

function Row({ label, seconds, recorded, days, frac, color, isDark, indent, onClick }: {
  label: string; seconds: number; recorded: number; days: number; frac: number; color: string;
  isDark: boolean; indent?: boolean; onClick?: () => void;
}) {
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      className={`flex items-center gap-2 text-[11px] min-w-0 rounded ${indent ? 'pl-3' : ''} ${onClick ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800' : ''}`}>
      <span className={`${indent ? 'w-[5.25rem] @[34rem]:w-[7.25rem]' : 'w-24 @[34rem]:w-32'} shrink-0 truncate text-stone-600 dark:text-zinc-300`}>{label}</span>
      <div className={`flex-1 min-w-0 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-stone-100'}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, frac * 100)}%`, background: color }} />
      </div>
      <span className="w-[4.5rem] @[34rem]:w-28 shrink-0 text-right tabular-nums whitespace-nowrap text-stone-500 dark:text-zinc-400">
        <span className="hidden @[34rem]:inline">{pctText(seconds, recorded)} (</span>{formatDuration(seconds)}<span className="hidden @[34rem]:inline">)</span>
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums whitespace-nowrap text-stone-400 dark:text-zinc-500">
        {days > 0 ? formatDuration(seconds / days) : '–'}
      </span>
    </div>
  );
}

type ListBy = 'category' | 'activity';

/** Every activity on its own; a split category ("식사 · 업무") passes its cross
 *  activity on to the name, and the row keeps the category's colour. */
function flatItems(cats: Category[]): { name: string; seconds: number; category: string }[] {
  const by = new Map<string, { name: string; seconds: number; category: string }>();
  for (const c of cats) {
    const cut = c.category.indexOf(' · ');
    const suffix = cut >= 0 ? c.category.slice(cut) : '';
    for (const i of c.items) {
      const name = `${i.name}${suffix}`;
      const row = by.get(name);
      if (row) row.seconds += i.seconds;
      else by.set(name, { name, seconds: i.seconds, category: c.category });
    }
  }
  return [...by.values()].sort((a, b) => b.seconds - a.seconds);
}

function TimeUseSummaryView({ data, isDark, listBy }: { data: Summary; isDark: boolean; listBy: ListBy }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [allRows, setAllRows] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const colors = autoColorMap(data.categories.map(c => c.category), isDark);
  const unrecorded = Math.max(0, data.totalSeconds - data.recordedSeconds);
  const grey = isDark ? '#3f3f46' : '#e7e5e4';
  const neutral = isDark ? '#52525b' : '#a8a29e';
  const max = Math.max(1, ...data.categories.map(c => c.seconds));
  const toggle = (c: string) => setOpen(prev => {
    const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n;
  });

  if (!data.totalSeconds) return <p className="text-xs text-stone-400 dark:text-zinc-500">This period hasn’t started yet.</p>;

  // The bar: share of the WHOLE period, so the grey end is the unrecorded time.
  const segs = [
    ...data.categories.map(c => ({ key: c.category, seconds: c.seconds, color: colors[c.category] })),
    ...(unrecorded > 0 ? [{ key: 'Unrecorded', seconds: unrecorded, color: grey }] : []),
  ];
  const hovered = segs.find(s => s.key === hover);

  const flat = listBy === 'activity' ? flatItems(data.categories) : [];
  const flatMax = Math.max(1, ...flat.map(f => f.seconds));
  const lines = listBy === 'activity'
    ? flat.map(f => (
        <Row key={f.name} label={f.name} seconds={f.seconds} recorded={data.recordedSeconds}
          days={data.days} frac={f.seconds / flatMax} color={colors[f.category]} isDark={isDark} />
      ))
    : data.categories.flatMap(c => {
    const isOpen = open.has(c.category);
    return [
      <Row key={c.category} label={`${isOpen ? '▾' : '▸'} ${c.category}`} seconds={c.seconds}
        recorded={data.recordedSeconds} days={data.days} frac={c.seconds / max}
        color={colors[c.category]} isDark={isDark} onClick={() => toggle(c.category)} />,
      ...(isOpen ? c.items.map(i => (
        <Row key={`${c.category}/${i.name}`} label={i.name} seconds={i.seconds}
          recorded={data.recordedSeconds} days={data.days} frac={i.seconds / max}
          color={neutral} isDark={isDark} indent />
      )) : []),
    ];
  });

  return (
    <div className="@container flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col">
          <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
            {formatDuration(data.recordedSeconds)}
          </span>
          <span className="text-xs text-stone-400 dark:text-zinc-500 mt-0.5">
            recorded of {formatDuration(data.totalSeconds)}{outText(data)} · {pctText(data.recordedSeconds, data.totalSeconds)}
          </span>
        </div>
        <div className="flex flex-col items-start @[34rem]:items-end">
          <span className="text-sm font-medium text-stone-700 dark:text-zinc-200 tabular-nums">
            {data.days > 0 ? formatDuration(data.recordedSeconds / data.days) : '–'} / day
          </span>
          <span className="text-[11px] text-stone-400 dark:text-zinc-500">
            {data.from === data.to ? data.from : `${data.from} → ${data.to}`}
          </span>
        </div>
      </div>

      {/* 100% stacked bar of the whole period */}
      <div className="flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
        <div className="flex h-4 w-full rounded overflow-hidden">
          {segs.map(s => (
            <div key={s.key} className="h-full" onMouseEnter={() => setHover(s.key)} onClick={() => setHover(s.key)}
              style={{ width: `${(s.seconds / data.totalSeconds) * 100}%`, background: s.color,
                opacity: hover && hover !== s.key ? 0.45 : 1 }} />
          ))}
        </div>
        <div className="h-4 text-[11px] text-stone-500 dark:text-zinc-400 tabular-nums">
          {hovered
            ? `${hovered.key} · ${formatDuration(hovered.seconds)} · ${pctText(hovered.seconds, data.totalSeconds)} of the period`
            : `Unrecorded ${formatDuration(unrecorded)} · ${pctText(unrecorded, data.totalSeconds)}`}
        </div>
      </div>

      {/* Categories */}
      {data.categories.length > 0 && (
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 pb-0.5">
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <Title>Recorded time</Title>
              {lines.length > SHOWN_ROWS && (
                <button type="button" onClick={() => setAllRows(v => !v)}
                  aria-label={allRows ? 'Show fewer' : 'Show all'}
                  className="text-[10px] leading-none px-1 rounded text-stone-400 dark:text-zinc-500 hover:bg-stone-100 dark:hover:bg-zinc-800">
                  {allRows ? '▴' : '▾'}
                </button>
              )}
            </div>
            <span className="w-14 shrink-0 text-right text-[10px] text-stone-400 dark:text-zinc-500">per day</span>
          </div>
          {lines.slice(0, allRows ? undefined : SHOWN_ROWS)}
        </div>
      )}
      {data.categories.length === 0 && (
        <p className="text-xs text-stone-400 dark:text-zinc-500">No records in this period.</p>
      )}
    </div>
  );
}

// The two switches are remembered on this device.
const KEEP = 'fg-time-use-view';
function kept(): { listBy: ListBy; sleep: boolean; work: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(KEEP) ?? '{}');
    return { listBy: v.listBy === 'activity' ? 'activity' : 'category', sleep: v.sleep !== false, work: v.work !== false };
  } catch { return { listBy: 'category', sleep: true, work: true }; }
}

export function TimeUseWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [listBy, setListBy] = useState<ListBy>('category');
  const [withSleep, setWithSleep] = useState(true);
  const [withWork, setWithWork] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => { const k = kept(); setListBy(k.listBy); setWithSleep(k.sleep); setWithWork(k.work); setReady(true); }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEEP, JSON.stringify({ listBy, sleep: withSleep, work: withWork })); } catch { /* private mode */ }
  }, [listBy, withSleep, withWork, ready]);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    fetch(`/api/insights/stats?${buildParams({ metric: 'timeUse.summary', now: nowLocal(), ...(!withSleep && { sleep: '0' }), ...(!withWork && { work: '0' }) }, globalFilter)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d.summary ?? null);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, [globalFilter, withSleep, withWork, ready]);

  return (
    <WidgetCard title="Time Use" floor={1} loading={loading} error={error}>
      {data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap -mt-1">
            <Segmented<ListBy> value={listBy} onChange={setListBy}
              options={[['category', 'Category'], ['activity', 'Activity']]} />
            <div className="flex items-center gap-3">
              {([['수면', withSleep, setWithSleep], ['일상 업무', withWork, setWithWork]] as const).map(([label, on, set]) => (
                <label key={label} className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-zinc-300 cursor-pointer select-none">
                  <input type="checkbox" checked={on} onChange={e => set(e.target.checked)}
                    className="accent-stone-700 dark:accent-zinc-300" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <TimeUseSummaryView data={data} isDark={isDark} listBy={listBy} />
        </div>
      )}
    </WidgetCard>
  );
}
