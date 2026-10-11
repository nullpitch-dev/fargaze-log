'use client';

// src/app/insights/page.tsx
// Master page — owns the global filter state and the grouped widget grid.
// To add a new widget: import it and add one entry to a sub-group in GROUPS.
// A group with no widgets yet is left out of GROUPS (planned groups are listed below).

import React, { useState, useEffect } from 'react';
import { GlobalFilter, WidgetProps, WidgetSize } from './_lib/types';
import { defaultPeriodFrom, defaultPeriodTo } from './_lib/date-helpers';
import { GlobalFilterBar } from './_components/GlobalFilterBar';
import { WidgetGroup, WidgetSubgroupLabel } from './_components/WidgetGroup';
import { SleepWidget } from './_widgets/SleepWidget';
import { InteractionsWidget } from './_widgets/InteractionsWidget';
import { DrinkingWidget } from './_widgets/DrinkingWidget';
import { DietWidget } from './_widgets/DietWidget';
import { WeightWidget } from './_widgets/WeightWidget';
import { ExerciseWidget } from './_widgets/ExerciseWidget';
import { BowelWidget } from './_widgets/BowelWidget';
import { JourneysWidget } from './_widgets/JourneysWidget';

// ── Widget registry ───────────────────────────────────────────────────────────

interface WidgetConfig {
  id: string;
  label: string;   // shown in the folded group header; keep it the same as the card title
  size: WidgetSize;
  component: React.ComponentType<WidgetProps>;
}

interface SubgroupConfig {
  label?: string;  // omit for a group without sub-groups
  widgets: WidgetConfig[];
}

interface GroupConfig {
  id: string;      // stored in localStorage; don't rename casually
  title: string;
  subgroups: SubgroupConfig[];
}

// Planned groups, added when their first widget exists:
//   Hobbies & Interests (Reading, Study, Movies, Golf)
//   Finances (Interest, Real-estate tax, Income, Income tax)
//   Everyday Life (Bath, Haircut, Nail trim, Fuel, Purchases)
//   Time Use (logged vs unlogged time, what logged time goes on)
const GROUPS: GroupConfig[] = [
  {
    id: 'health',
    title: 'Health',
    subgroups: [
      {
        label: 'Inputs',
        widgets: [
          { id: 'diet',     label: 'Diet',     size: 'md', component: DietWidget },
          { id: 'drinking', label: 'Drinking', size: 'md', component: DrinkingWidget },
          { id: 'exercise', label: 'Exercise', size: 'md', component: ExerciseWidget },
        ],
      },
      {
        label: 'Outcomes',
        widgets: [
          { id: 'sleep',  label: 'Sleep',          size: 'md', component: SleepWidget },
          { id: 'weight', label: 'Weight',         size: 'md', component: WeightWidget },
          { id: 'bowel',  label: 'Bowel Movement', size: 'md', component: BowelWidget },
        ],
      },
    ],
  },
  {
    id: 'work-social',
    title: 'Work & Social',
    subgroups: [
      {
        widgets: [
          { id: 'interactions', label: 'Interactions', size: 'md', component: InteractionsWidget },
        ],
      },
    ],
  },
  {
    id: 'places-travel',
    title: 'Places & Travel',
    subgroups: [
      {
        widgets: [
          { id: 'journeys', label: 'Journeys', size: 'md', component: JourneysWidget },
        ],
      },
    ],
  },
];

const SIZE_BREAK: Record<WidgetSize, string> = {
  sm: 'break-inside-avoid',
  md: 'break-inside-avoid',
  lg: 'break-inside-avoid',
};

// Fold state is remembered per device: a JSON array of folded group ids.
const FOLDED_KEY = 'fargaze.insights.foldedGroups';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [crossActivityOptions, setCrossActivityOptions] = useState<string[]>([]);
  const [appliedFilter, setAppliedFilter] = useState<GlobalFilter>({
    timeMode: 'period',
    timePeriod: '',
    dateFrom: defaultPeriodFrom(),
    dateTo: defaultPeriodTo(),
    crossActivities: [],
  });

  // null until localStorage has been read, so folded groups never mount
  // their widgets (and never fetch) on the first render.
  const [folded, setFolded] = useState<Set<string> | null>(null);

  useEffect(() => {
    let ids: string[] = [];
    try {
      const raw = localStorage.getItem(FOLDED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === 'string');
    } catch {}
    setFolded(new Set(ids));
  }, []);

  const saveFolded = (next: Set<string>) => {
    setFolded(next);
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch {}
  };

  const toggleGroup = (id: string) => {
    const next = new Set(folded ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveFolded(next);
  };

  const foldAll = () => saveFolded(new Set(GROUPS.map(g => g.id)));
  const unfoldAll = () => saveFolded(new Set());

  useEffect(() => {
    fetch('/api/cross-activities')
      .then(r => r.json())
      .then((values: string[]) => {
        setCrossActivityOptions(values);
        setAppliedFilter(prev => ({ ...prev, crossActivities: values }));
      })
      .catch(() => {});
  }, []);

  const linkClass =
    'text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="flex flex-col flex-1 px-4 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-50">Insights</h1>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Data-driven life analytics</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={foldAll} disabled={folded === null} className={linkClass}>
            Fold all
          </button>
          <span className="text-xs text-stone-300 dark:text-zinc-600">·</span>
          <button type="button" onClick={unfoldAll} disabled={folded === null} className={linkClass}>
            Unfold all
          </button>
        </div>
      </div>

      <GlobalFilterBar
        filter={appliedFilter}
        onApply={setAppliedFilter}
        crossActivityOptions={crossActivityOptions}
      />

      {GROUPS.map(group => (
        <WidgetGroup
          key={group.id}
          title={group.title}
          widgetNames={group.subgroups.flatMap(s => s.widgets.map(w => w.label))}
          folded={folded?.has(group.id) ?? false}
          onToggle={() => toggleGroup(group.id)}
        >
          {folded !== null && group.subgroups.map((sub, i) => (
            <div key={sub.label ?? i} className={i > 0 ? 'mt-6' : ''}>
              {sub.label && <WidgetSubgroupLabel>{sub.label}</WidgetSubgroupLabel>}
              <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
                {sub.widgets.map(({ id, size, component: Widget }) => (
                  <div key={id} className={`${SIZE_BREAK[size]} mb-4`}>
                    <Widget globalFilter={appliedFilter} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </WidgetGroup>
      ))}
    </div>
  );
}
