'use client';
// src/app/calendar/_components/CalendarFilters.tsx
//
// The Calendar's filter panel: display time zone, the activity type drop-down, and Hide
// (Hyoje, 26 Nov 2026): the fixed switches (Reading & study, 평일 업무, 음료 @ …) and his own
// entries — "category – activity" or "category – All", for records, plans or both. In Hide a
// tick means hidden. Each entry keeps its tick (on / off for a while) and a × to remove it.
// The long category list went: categories hidden before are "<category> – All" entries now.
// Category colours and the hidden activity names moved to /admin/calendar-settings.
// A side column on wide screens, a fold-out panel under the toolbar on narrow ones (the page
// decides where it goes).

import React, { useMemo, useState } from 'react';
import { MultiSelectDropdown } from '@/app/insights/_components/MultiSelectDropdown';
import { colorFor } from '../_lib/calendar-colors';
import { QUIET_ROWS } from '@/lib/calendar/quietRows';
import { SCOPES, sameHide, scopeLabel, type HideEntry, type HideScope } from '@/lib/calendar/hides';

export interface FilterState {
  /** Replaced by `hides` (26 Nov); kept only so old settings carry over. */
  hiddenCategories: string[];
  hiddenCrossActivities: string[];
  colors: Record<string, string>;
  showReading: boolean;
  /** Quiet rows switched off (quietRows.ts; Hyoje, 17 Nov). */
  hiddenRows: string[];
  /** Exact activity names never shown — set on /admin/calendar-settings, not here. */
  hiddenNames: string[];
  /** The Hide list (hides.ts). */
  hides: HideEntry[];
}

const PINNED_ZONES = ['Europe/London', 'Asia/Seoul'];
const ALL = '';

export function CalendarFilters({
  tz, deviceTz, onTz, categories, activities, crossActivities, state, onChange,
}: {
  tz: string;
  deviceTz: string;
  onTz: (tz: string) => void;
  categories: { name: string; count: number }[];
  activities: { name: string; category: string }[];
  crossActivities: string[];
  state: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
}) {
  const allZones = useMemo<string[]>(() => {
    try { return (Intl as any).supportedValuesOf('timeZone'); } catch { return []; }
  }, []);
  const pinned = Array.from(new Set([deviceTz, ...PINNED_ZONES, tz]));
  const shownCross = crossActivities.filter(c => !state.hiddenCrossActivities.includes(c));

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

      <Section title="Hide">
        {/* The fixed switches: long or background records (Hyoje, 17 Nov). Ticked = hidden. */}
        <Tick checked={!state.showReading} onChange={v => onChange({ showReading: !v })}>Reading &amp; study</Tick>
        {QUIET_ROWS.map(r => (
          <Tick key={r.key} checked={state.hiddenRows.includes(r.key)}
            onChange={v => onChange({ hiddenRows: v ? [...state.hiddenRows, r.key] : state.hiddenRows.filter(k => k !== r.key) })}>
            {r.label}
          </Tick>
        ))}
        {state.hides.length > 0 && <div className="my-0.5 border-t border-stone-100 dark:border-zinc-800" />}
        {state.hides.map((h, i) => (
          <div key={`${h.category}|${h.name ?? ''}|${h.scope}`} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" className="accent-blue-500 shrink-0" checked={h.on} aria-label={`Hide ${h.category} – ${h.name ?? 'All'}`}
              onChange={e => onChange({ hides: state.hides.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)) })} />
            <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: colorFor(h.category, state.colors) }} aria-hidden />
            <span className={`min-w-0 flex-1 truncate ${h.on ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-400 dark:text-zinc-500'}`}
              title={`${h.category} – ${h.name ?? 'All'} · ${scopeLabel(h.scope)}`}>
              {h.category} – {h.name ?? 'All'}
              {h.scope !== 'both' && <span className="text-stone-400 dark:text-zinc-500"> · {scopeLabel(h.scope)}</span>}
            </span>
            <button onClick={() => onChange({ hides: state.hides.filter((_, k) => k !== i) })}
              aria-label={`Remove ${h.category} – ${h.name ?? 'All'}`} title="Remove"
              className="shrink-0 w-5 h-5 -my-0.5 rounded text-stone-400 hover:text-stone-800 hover:bg-stone-100 dark:text-zinc-500 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 leading-none">×</button>
          </div>
        ))}
        <AddHide categories={categories} activities={activities}
          onAdd={entry => {
            const at = state.hides.findIndex(x => sameHide(x, entry));
            onChange({ hides: at >= 0 ? state.hides.map((x, k) => (k === at ? { ...x, on: true } : x)) : [...state.hides, entry] });
          }} />
      </Section>
    </div>
  );
}

/** Category, then one of its activities or All, then records / plans / both. */
function AddHide({ categories, activities, onAdd }: {
  categories: { name: string; count: number }[];
  activities: { name: string; category: string }[];
  onAdd: (h: HideEntry) => void;
}) {
  const [category, setCategory] = useState('');
  const [name, setName] = useState(ALL);
  const [scope, setScope] = useState<HideScope>('both');
  // Categories with records, and any the Activities list adds (a category with only plans).
  const cats = useMemo(() => [...new Set([...categories.map(c => c.name), ...activities.map(a => a.category)])]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')), [categories, activities]);
  const names = useMemo(() => activities.filter(a => a.category === category).map(a => a.name), [activities, category]);
  const sel = 'w-full min-w-0 border border-stone-200 dark:border-zinc-700 rounded px-1.5 py-1 text-[11px] bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200';
  return (
    <div className="mt-1 flex flex-col gap-1">
      <select value={category} onChange={e => { setCategory(e.target.value); setName(ALL); }} className={sel} aria-label="Category to hide">
        <option value="">Category…</option>
        {cats.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {category && (
        <>
          <select value={name} onChange={e => setName(e.target.value)} className={sel} aria-label="Activity to hide">
            <option value={ALL}>All</option>
            {names.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="flex gap-1">
            <select value={scope} onChange={e => setScope(e.target.value as HideScope)} className={sel} aria-label="Records, plans or both">
              {SCOPES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => { onAdd({ category, name: name || null, scope, on: true }); setCategory(''); setName(ALL); setScope('both'); }}
              className="shrink-0 border border-stone-300 dark:border-zinc-600 rounded px-2 text-[11px] text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800">Hide</button>
          </div>
        </>
      )}
    </div>
  );
}

function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-stone-700 dark:text-zinc-200">
      <input type="checkbox" className="accent-blue-500" checked={checked} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
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
