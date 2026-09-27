'use client';
// src/app/calendar/_components/CalendarFilters.tsx
//
// The Calendar's filter panel: display time zone, cross-activity drop-down,
// the Reading & study switch, and the category list. A side column on wide
// screens, a fold-out panel under the toolbar on narrow ones (the page decides
// where it goes). Colour dots are display-only until the palette picker lands.

import React, { useMemo } from 'react';
import { MultiSelectDropdown } from '@/app/insights/_components/MultiSelectDropdown';
import { colorFor } from '../_lib/calendar-colors';

export interface FilterState {
  hiddenCategories: string[];
  hiddenCrossActivities: string[];
  colors: Record<string, string>;
  showReading: boolean;
}

const PINNED_ZONES = ['Europe/London', 'Asia/Seoul'];

export function CalendarFilters({
  tz, deviceTz, onTz, categories, crossActivities, state, onChange,
}: {
  tz: string;
  deviceTz: string;
  onTz: (tz: string) => void;
  categories: { name: string; count: number }[];
  crossActivities: string[];
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
}) {
  const allZones = useMemo<string[]>(() => {
    try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; }
  }, []);
  const pinned = Array.from(new Set([deviceTz, ...PINNED_ZONES, tz]));

  const hidden = new Set(state.hiddenCategories);
  const shownCross = crossActivities.filter(c => !state.hiddenCrossActivities.includes(c));

  function toggleCategory(name: string) {
    onChange({ hiddenCategories: hidden.has(name)
      ? state.hiddenCategories.filter(c => c !== name)
      : [...state.hiddenCategories, name] });
  }

  return (
    <div className="flex flex-col gap-4 text-xs">
      <Section title="Time zone">
        <select value={tz} onChange={e => onTz(e.target.value)}
          className="w-full border border-stone-200 dark:border-zinc-700 rounded px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200">
          <optgroup label="Quick">
            {pinned.map(z => <option key={`p-${z}`} value={z}>{z}{z === deviceTz ? ' (this device)' : ''}</option>)}
          </optgroup>
          {allZones.length > 0 && (
            <optgroup label="All zones">
              {allZones.map(z => <option key={z} value={z}>{z}</option>)}
            </optgroup>
          )}
        </select>
      </Section>

      {crossActivities.length > 0 && (
        <Section title="Activity type">
          <MultiSelectDropdown
            label={shownCross.length === crossActivities.length ? 'All'
              : shownCross.length === 0 ? 'None' : `${shownCross.length} selected`}
            options={crossActivities}
            selected={shownCross}
            onChange={next => onChange({ hiddenCrossActivities: crossActivities.filter(c => !next.includes(c)) })}
          />
        </Section>
      )}

      <Section title="Rows">
        <label className="flex items-center gap-2 cursor-pointer text-stone-700 dark:text-zinc-200">
          <input type="checkbox" className="accent-blue-500" checked={state.showReading}
            onChange={e => onChange({ showReading: e.target.checked })} />
          Reading &amp; study
        </label>
      </Section>

      <Section title="Categories" action={
        <button onClick={() => onChange({ hiddenCategories: hidden.size ? [] : categories.map(c => c.name) })}
          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
          {hidden.size ? 'Show all' : 'Hide all'}
        </button>
      }>
        <div className="flex flex-col">
          {categories.map(c => {
            const on = !hidden.has(c.name);
            const color = colorFor(c.name, state.colors);
            return (
              <label key={c.name} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <span onClick={e => { e.preventDefault(); toggleCategory(c.name); }}
                  className="shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center"
                  style={{ background: on ? color : 'transparent', borderColor: color }}>
                  {on && <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.8" fill="none" /></svg>}
                </span>
                <span onClick={e => { e.preventDefault(); toggleCategory(c.name); }}
                  className={`truncate ${on ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-400 dark:text-zinc-500'}`}>
                  {c.name}
                </span>
                <span className="ml-auto tabular-nums text-[10px] text-stone-300 dark:text-zinc-600">{c.count.toLocaleString()}</span>
              </label>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
