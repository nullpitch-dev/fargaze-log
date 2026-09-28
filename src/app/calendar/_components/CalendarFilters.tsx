'use client';
// src/app/calendar/_components/CalendarFilters.tsx
//
// The Calendar's filter panel: display time zone, cross-activity drop-down,
// the Reading & study switch, the category list, and — folded away at the
// very bottom — the hidden activity names. That last section starts folded on
// every visit on purpose: hidden things should stay out of sight. A side column on wide
// screens, a fold-out panel under the toolbar on narrow ones (the page decides
// where it goes). Each category's "⋯" opens the palette; the choice is saved
// as a palette key, and "Default colour" removes it again.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MultiSelectDropdown } from '@/app/insights/_components/MultiSelectDropdown';
import { colorFor, colorKeyFor, PALETTE } from '../_lib/calendar-colors';

export interface FilterState {
  hiddenCategories: string[];
  hiddenCrossActivities: string[];
  colors: Record<string, string>;
  showReading: boolean;
  hiddenNames: string[];
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
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  function setColor(category: string, key: string | null) {
    const next = { ...state.colors };
    if (key) next[category] = key; else delete next[category];
    onChange({ colors: next });
    setPaletteFor(null);
  }
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
              <div key={c.name} className="group relative flex items-center gap-2 py-0.5 cursor-pointer">
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
                <button onClick={() => setPaletteFor(p => p === c.name ? null : c.name)}
                  aria-label={`Colour for ${c.name}`} title="Colour"
                  className={`shrink-0 w-5 h-5 -my-0.5 rounded text-stone-400 dark:text-zinc-500 hover:bg-stone-100 dark:hover:bg-zinc-800 leading-none ${
                    paletteFor === c.name ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
                  ⋯
                </button>
                {paletteFor === c.name && (
                  <Palette current={colorKeyFor(c.name, state.colors)} custom={c.name in state.colors}
                    onPick={k => setColor(c.name, k)} onReset={() => setColor(c.name, null)}
                    onClose={() => setPaletteFor(null)} />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <HiddenSection names={state.hiddenNames} onChange={hiddenNames => onChange({ hiddenNames })} />
    </div>
  );
}

/** Folded by default, and not remembered: opening it is a deliberate act. */
function HiddenSection({ names, onChange }: { names: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 pt-2 border-t border-stone-100 dark:border-zinc-800">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex items-center gap-1 text-left text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300">
        <span className="inline-block w-2 transition-transform" style={{ transform: open ? 'rotate(90deg)' : undefined }}>›</span>
        Hidden activities{names.length ? ` (${names.length})` : ''}
      </button>
      {open && <HiddenNames names={names} onChange={onChange} />}
    </div>
  );
}

/** The colour swatches for one category, under its row. */
function Palette({ current, custom, onPick, onReset, onClose }: {
  current: string; custom: boolean;
  onPick: (key: string) => void; onReset: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return (
    <div ref={ref}
      className="absolute right-0 top-full z-30 mt-0.5 w-[172px] p-2 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
      <div className="grid grid-cols-7 gap-1.5">
        {PALETTE.map(p => (
          <button key={p.key} onClick={() => onPick(p.key)} title={p.label} aria-label={p.label}
            className="w-5 h-5 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
            style={{ background: p.hex }}>
            {p.key === current && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.8" fill="none" /></svg>}
          </button>
        ))}
      </div>
      <button onClick={onReset} disabled={!custom}
        className="mt-2 w-full text-left text-[10px] text-blue-600 dark:text-blue-400 hover:underline disabled:text-stone-300 dark:disabled:text-zinc-600 disabled:no-underline">
        Default colour
      </button>
    </div>
  );
}

/** Activity names (activity.name) that never show, e.g. 정식 운동. Exact match. */
function HiddenNames({ names, onChange }: { names: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !names.includes(v)) onChange([...names, v]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {names.map(nm => (
            <span key={nm} className="inline-flex items-center gap-1 rounded bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] text-stone-600 dark:text-zinc-300">
              {nm}
              <button onClick={() => onChange(names.filter(x => x !== nm))} aria-label={`Show ${nm} again`}
                className="text-stone-400 hover:text-stone-800 dark:hover:text-zinc-100 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Activity name"
          className="flex-1 min-w-0 border border-stone-200 dark:border-zinc-700 rounded px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200" />
        <button onClick={add} disabled={!draft.trim()}
          className="border border-stone-200 dark:border-zinc-700 rounded px-2 text-[11px] text-stone-600 dark:text-zinc-300 disabled:opacity-40">Hide</button>
      </div>
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
