'use client';

// src/app/insights/page.tsx
// Master page — owns the global filter state and widget grid.
// To add a new widget: import it and add one line to WIDGETS.

import React, { useState, useEffect } from 'react';
import { GlobalFilter, WidgetProps, WidgetSize } from './_lib/types';
import { currentMonthStr, defaultPeriodFrom, todayStr } from './_lib/date-helpers';
import { GlobalFilterBar } from './_components/GlobalFilterBar';
import { SleepWidget } from './_widgets/SleepWidget';
import { InteractionsWidget } from './_widgets/InteractionsWidget';

// ── Widget registry ───────────────────────────────────────────────────────────
// Add new widgets here — one line per widget.

interface WidgetConfig {
  id: string;
  size: WidgetSize;
  component: React.ComponentType<WidgetProps>;
}

const WIDGETS: WidgetConfig[] = [
  { id: 'sleep',        size: 'md', component: SleepWidget },
  { id: 'interactions', size: 'md', component: InteractionsWidget },
];

const SIZE_COLS: Record<WidgetSize, string> = {
  sm: 'col-span-1',
  md: 'col-span-1',
  lg: 'col-span-1 md:col-span-2 lg:col-span-3',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [crossActivityOptions, setCrossActivityOptions] = useState<string[]>([]);
  const [appliedFilter, setAppliedFilter] = useState<GlobalFilter>({
    timeMode: 'month',
    timePeriod: currentMonthStr(),
    dateFrom: defaultPeriodFrom(),
    dateTo: todayStr(),
    crossActivities: [],
  });

  useEffect(() => {
    fetch('/api/cross-activities')
      .then(r => r.json())
      .then((values: string[]) => {
        setCrossActivityOptions(values);
        setAppliedFilter(prev => ({ ...prev, crossActivities: values }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col flex-1 px-4 py-6">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-50">Insights</h1>
        <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Data-driven life analytics</p>
      </div>

      <GlobalFilterBar
        filter={appliedFilter}
        onApply={setAppliedFilter}
        crossActivityOptions={crossActivityOptions}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {WIDGETS.map(({ id, size, component: Widget }) => (
          <div key={id} className={SIZE_COLS[size]}>
            <Widget globalFilter={appliedFilter} />
          </div>
        ))}
      </div>
    </div>
  );
}
