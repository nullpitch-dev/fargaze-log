// src/app/insights/_components/GlobalFilterBar.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { GlobalFilter, TimeMode } from '../_lib/types';
import { todayStr, defaultPeriodFrom, defaultTimePeriod } from '../_lib/date-helpers';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const TIME_MODE_LABELS: Record<TimeMode, string> = {
  month: 'Month', week: 'Week', day: 'Day', period: 'Period',
};

export function GlobalFilterBar({ filter, onApply, crossActivityOptions }: {
  filter: GlobalFilter;
  onApply: (f: GlobalFilter) => void;
  crossActivityOptions: string[];
}) {
  const [local, setLocal] = useState<GlobalFilter>(filter);

  useEffect(() => { setLocal(filter); }, [filter]);

  function setTimeMode(mode: TimeMode) {
    setLocal(prev => ({
      ...prev,
      timeMode: mode,
      timePeriod: defaultTimePeriod(mode),
      dateFrom: prev.dateFrom || defaultPeriodFrom(),
      dateTo: prev.dateTo || todayStr(),
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

        {/* Activity type — uses shared MultiSelectDropdown.
            GlobalFilterBar commits on Apply, so onClose is omitted intentionally. */}
        {crossActivityOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Activity type</label>
            <MultiSelectDropdown
              label={
                local.crossActivities.length === crossActivityOptions.length ? 'All'
                : local.crossActivities.length === 0 ? 'None'
                : `${local.crossActivities.length} selected`
              }
              options={crossActivityOptions}
              selected={local.crossActivities}
              onChange={next => setLocal(prev => ({ ...prev, crossActivities: next }))}
              // onClose intentionally omitted — GlobalFilterBar commits on Apply button
            />
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
