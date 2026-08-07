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
import { DrinkingWidget } from './_widgets/DrinkingWidget';
import { DietWidget } from './_widgets/DietWidget';
import { WeightWidget } from './_widgets/WeightWidget';
import { ExerciseWidget } from './_widgets/ExerciseWidget';

// ── Widget registry ───────────────────────────────────────────────────────────
// Add new widgets here — one line per widget.

interface WidgetConfig {
  id: string;
  size: WidgetSize;
  component: React.ComponentType<WidgetProps>;
}

const WIDGETS: WidgetConfig[] = [
  { id: 'interactions', size: 'md', component: InteractionsWidget },
  { id: 'drinking',     size: 'md', component: DrinkingWidget },
	{ id: 'diet',         size: 'md', component: DietWidget },
  { id: 'sleep',        size: 'md', component: SleepWidget },
	{ id: 'weight',       size: 'md', component: WeightWidget },
  { id: 'exercise',     size: 'md', component: ExerciseWidget },
];

const SIZE_BREAK: Record<WidgetSize, string> = {
  sm: 'break-inside-avoid',
  md: 'break-inside-avoid',
  lg: 'break-inside-avoid',
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

      <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
        {WIDGETS.map(({ id, size, component: Widget }) => (
          <div key={id} className={`${SIZE_BREAK[size]} mb-4`}>
            <Widget globalFilter={appliedFilter} />
          </div>
        ))}
      </div>
    </div>
  );
}
