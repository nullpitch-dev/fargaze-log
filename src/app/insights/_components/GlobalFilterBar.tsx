// src/app/insights/_components/GlobalFilterBar.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GlobalFilter, TimeMode } from '../_lib/types';
import {
  todayStr, defaultPeriodFrom, defaultTimePeriod,
} from '../_lib/date-helpers';

const TIME_MODE_LABELS: Record<TimeMode, string> = {
  month: 'Month', week: 'Week', day: 'Day', period: 'Period',
};

export function GlobalFilterBar({ filter, onApply, crossActivityOptions }: {
  filter: GlobalFilter;
  onApply: (f: GlobalFilter) => void;
  crossActivityOptions: string[];
}) {
  const [local, setLocal] = useState<GlobalFilter>(filter);
  const [caOpen, setCaOpen] = useState(false);
  const caRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocal(filter); }, [filter]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (caRef.current && !caRef.current.contains(e.target as Node)) setCaOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function setTimeMode(mode: TimeMode) {
    setLocal(prev => ({
      ...prev,
      timeMode: mode,
      timePeriod: defaultTimePeriod(mode),
      dateFrom: prev.dateFrom || defaultPeriodFrom(),
      dateTo: prev.dateTo || todayStr(),
    }));
  }

  const allSelected = local.crossActivities.length === crossActivityOptions.length;
  const noneSelected = local.crossActivities.length === 0;

  function toggleCA(v: string) {
    setLocal(prev => ({
      ...prev,
      crossActivities: prev.crossActivities.includes(v)
        ? prev.crossActivities.filter(x => x !== v)
        : [...prev.crossActivities, v],
    }));
  }

  const inputType = local.timeMode === 'month' ? 'month'
    : local.timeMode === 'week' ? 'week'
    : 'date';

  return (
    <div className="mb-6 p-4 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-sm">
      <div className="flex flex-wrap gap-4 items-end">

        {/* Time mode */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">View by</label>
          <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700">
            {(Object.keys(TIME_MODE_LABELS) as TimeMode[]).map(mode => (
              <button key={mode} onClick={() => setTimeMode(mode)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  local.timeMode === mode
                    ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                    : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
                }`}>
                {TIME_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        {/* Time picker */}
        {local.timeMode === 'period' ? (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Date range</label>
            <div className="flex gap-2 items-center">
              <input type="date" value={local.dateFrom}
                onChange={e => setLocal(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
              <span className="text-stone-400 text-xs">—</span>
              <input type="date" value={local.dateTo}
                onChange={e => setLocal(prev => ({ ...prev, dateTo: e.target.value }))}
                className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              {TIME_MODE_LABELS[local.timeMode]}
            </label>
            <input type={inputType} value={local.timePeriod}
              onChange={e => setLocal(prev => ({ ...prev, timePeriod: e.target.value }))}
              className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
          </div>
        )}

        {/* Cross-activity */}
        {crossActivityOptions.length > 0 && (
          <div className="flex flex-col gap-1 relative" ref={caRef}>
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Activity type</label>
            <button onClick={() => setCaOpen(v => !v)}
              className={`flex items-center gap-2 bg-white dark:bg-zinc-900 border rounded px-3 py-1.5 text-xs shadow-sm focus:outline-none transition-colors ${
                !allSelected
                  ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-stone-300 dark:border-zinc-600 text-stone-900 dark:text-zinc-50'
              }`}>
              {allSelected ? 'All' : noneSelected ? 'None' : `${local.crossActivities.length} selected`}
              <span className="text-stone-400 dark:text-zinc-500">▾</span>
            </button>
            {caOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[180px] py-1">
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-stone-100 dark:border-zinc-700">
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                    onChange={() => setLocal(prev => ({
                      ...prev,
                      crossActivities: allSelected ? [] : [...crossActivityOptions],
                    }))}
                    className="accent-blue-500" />
                  <span className="text-xs font-medium text-stone-700 dark:text-zinc-200">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
                {crossActivityOptions.map(opt => (
                  <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer">
                    <input type="checkbox" checked={local.crossActivities.includes(opt)}
                      onChange={() => toggleCA(opt)} className="accent-blue-500" />
                    <span className={`text-xs ${local.crossActivities.includes(opt) ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-400 dark:text-zinc-500 line-through'}`}>
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Apply */}
        <button onClick={() => onApply(local)}
          className="px-4 py-1.5 bg-stone-800 dark:bg-zinc-700 text-white rounded text-xs font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 transition-colors">
          Apply
        </button>
      </div>
    </div>
  );
}
