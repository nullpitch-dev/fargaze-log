// src/app/insights/_widgets/InteractionsWidget.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WidgetProps, WidgetViewMode } from '../_lib/types';
import { buildParams } from '../_lib/date-helpers';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';

// ── Colour maps ───────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  '대면': '#1d4ed8',  // blue-700
  '영상': '#7c3aed',  // violet-700
  '통화': '#047857',  // emerald-700
  '문자': '#b45309',  // amber-700
  '웹콜': '#0e7490',  // cyan-700
  '메일': '#be123c',  // rose-700
};

const CATEGORY_COLORS: Record<string, string> = {
  '가족':    '#1d4ed8',
  '업무':    '#7c3aed',
  '친목':    '#047857',
  '업무친목': '#b45309',
  '생활':    '#0e7490',
  '경조사':  '#be123c',
  '친척':    '#92400e',
  '지인':    '#065f46',
  '기타':    '#78716c',
};

function colorFor(map: Record<string, string>, key: string): string {
  return map[key] ?? '#a8a29e';
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────
// Each row: Label | ████████ 97% (100)

function HorizontalBars({ data, colorMap, title }: {
  data: Record<string, number>;
  colorMap: Record<string, string>;
  title: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  const max = entries[0][1];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">
        {title}
      </span>
      {entries.map(([key, value]) => {
        const pct = Math.round((value / total) * 100);
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-600 dark:text-zinc-300 w-12 shrink-0 text-right truncate">
              {key}
            </span>
            <div className="flex-1 bg-stone-100 dark:bg-zinc-800 rounded-sm h-2 overflow-hidden">
              <div className="h-full rounded-sm transition-all" style={{
                width: `${(value / max) * 100}%`,
                background: colorFor(colorMap, key),
                opacity: 0.85,
              }} />
            </div>
            <span className="text-[10px] font-mono text-stone-500 dark:text-zinc-400 shrink-0 w-16">
              {pct}% ({value})
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Big stat number ───────────────────────────────────────────────────────────

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-semibold font-mono text-stone-900 dark:text-zinc-50">
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-stone-400 dark:text-zinc-500">{label}</span>
    </div>
  );
}

// ── Top 10 table ──────────────────────────────────────────────────────────────
// Columns: Name | Relation Type | # | Method breakdown (대면 6, 문자 3, 웹콜 2)

interface TopPerson {
  name: string;
  dominantCategory: string;
  total: number;
  rows: { method: string; count: number }[];
}

interface OthersSummary {
  total: number;
  dominantMethod: string;
  dominantCategory: string;
}

function TopPeopleTable({ topPeople, others }: {
  topPeople: TopPerson[];
  others: OthersSummary;
}) {
  if (topPeople.length === 0) return null;

  return (
    <div className="mt-1">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-stone-100 dark:border-zinc-800">
            <th className="text-left py-1 pr-2 text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide w-[22%]">Name</th>
            <th className="text-left py-1 pr-2 text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide w-[22%]">Relation</th>
            <th className="text-right py-1 pr-2 text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide w-[8%]">#</th>
            <th className="text-left py-1 text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide w-[48%]">Method</th>
          </tr>
        </thead>
        <tbody>
          {topPeople.map((person, pi) => {
            // Collapse all method rows into a single comma-separated string
            const methodBreakdown = person.rows
              .sort((a, b) => b.count - a.count)
              .map(r => `${r.method} ${r.count}`)
              .join(', ');

            return (
              <tr key={pi} className="border-b border-stone-50 dark:border-zinc-800/50">
                <td className="py-1 pr-2 font-medium text-stone-800 dark:text-zinc-100 truncate max-w-0">
                  {person.name}
                </td>
                <td className="py-1 pr-2 text-stone-500 dark:text-zinc-400 truncate max-w-0">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: colorFor(CATEGORY_COLORS, person.dominantCategory) }} />
                    {person.dominantCategory}
                  </span>
                </td>
                <td className="py-1 pr-2 text-right font-mono text-stone-700 dark:text-zinc-200">
                  {person.total}
                </td>
                <td className="py-1 text-stone-500 dark:text-zinc-400 text-[10px]">
                  {methodBreakdown}
                </td>
              </tr>
            );
          })}

          {/* Others row */}
          {others.total > 0 && (
            <tr className="border-t border-stone-100 dark:border-zinc-800 text-stone-400 dark:text-zinc-500">
              <td className="py-1 pr-2 italic">Others</td>
              <td className="py-1 pr-2 truncate max-w-0">
                {others.dominantCategory ? `${others.dominantCategory} 등` : '—'}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{others.total}</td>
              <td className="py-1">
                {others.dominantMethod ? `${others.dominantMethod} 등` : '—'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── InteractionsWidget ────────────────────────────────────────────────────────

type InteractionsTab = 'stats' | 'top10';

export function InteractionsWidget({ globalFilter }: WidgetProps) {
  const [viewMode, setViewMode] = useState<WidgetViewMode>('summary'); // placeholder for future Trend
  const [tab, setTab] = useState<InteractionsTab>('stats');
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPeriodMode = globalFilter.timeMode === 'period';

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/insights/stats?${buildParams({ metric: 'interactions.summary', mode: 'summary' }, globalFilter)}`)
      .then(r => r.json())
      .then(d => { setSummary(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  // Stats / Top 10 inner tab switcher
  const innerTabs = (
    <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px]">
      {(['stats', 'top10'] as InteractionsTab[]).map(t => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-2.5 py-1 transition-colors ${
            tab === t
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
          }`}>
          {t === 'stats' ? 'Stats' : 'Top 10'}
        </button>
      ))}
    </div>
  );

  return (
    // Summary/Trend toggle sits in the action slot — Trend is disabled until implemented
    <WidgetCard title="Interactions" floor={1} loading={loading} error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} disabled={isPeriodMode} />}>

      {/* Inner Stats / Top 10 tabs — always visible below the header */}
      <div className="flex items-center justify-between mb-3 -mt-1">
        {innerTabs}
      </div>

      {!summary ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
      ) : tab === 'stats' ? (

        // ── Stats tab ─────────────────────────────────────────────────────────
        <div className="grid grid-cols-2 gap-x-4 divide-x divide-stone-100 dark:divide-zinc-800">
          <div className="flex flex-col gap-3">
            <BigStat value={summary.interactions.total} label="interactions" />
            {/* #2: Relation Type first, then Method */}
            <HorizontalBars data={summary.interactions.byCategory} colorMap={CATEGORY_COLORS} title="Relation Type" />
            <HorizontalBars data={summary.interactions.byMethod}   colorMap={METHOD_COLORS}   title="Method" />
          </div>
          <div className="flex flex-col gap-3 pl-4">
            <BigStat value={summary.people.total} label="unique people" />
            <HorizontalBars data={summary.people.byCategory} colorMap={CATEGORY_COLORS} title="Relation Type" />
            <HorizontalBars data={summary.people.byMethod}   colorMap={METHOD_COLORS}   title="Method" />
          </div>
        </div>

      ) : (

        // ── Top 10 tab ────────────────────────────────────────────────────────
        <TopPeopleTable
          topPeople={summary.topPeople ?? []}
          others={summary.others ?? { total: 0, dominantMethod: '', dominantCategory: '' }}
        />

      )}
    </WidgetCard>
  );
}
