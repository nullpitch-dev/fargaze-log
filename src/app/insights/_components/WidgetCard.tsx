// src/app/insights/_components/WidgetCard.tsx
'use client';

import React from 'react';
import { WidgetFloor, WidgetViewMode } from '../_lib/types';

// ── Floor badge ───────────────────────────────────────────────────────────────

const FLOOR_META: Record<WidgetFloor, { label: string; color: string }> = {
  0: { label: 'Facts',        color: 'text-stone-400 dark:text-zinc-500' },
  1: { label: 'Descriptive',  color: 'text-blue-500 dark:text-blue-400' },
  2: { label: 'Diagnostic',   color: 'text-violet-500 dark:text-violet-400' },
  3: { label: 'Predictive',   color: 'text-amber-500 dark:text-amber-400' },
  4: { label: 'Prescriptive', color: 'text-rose-500 dark:text-rose-400' },
};

export function FloorBadge({ floor }: { floor: WidgetFloor }) {
  const { label, color } = FLOOR_META[floor];
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider ${color}`}>{label}</span>
  );
}

// ── Widget shell ──────────────────────────────────────────────────────────────

export function WidgetCard({
  title, floor, loading, error, children, action,
}: {
  title: string;
  floor: WidgetFloor;
  loading: boolean;
  error?: string | null;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex flex-col gap-0.5">
          <FloorBadge floor={floor} />
          <p className="text-sm font-medium text-stone-900 dark:text-zinc-50">{title}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex-1 px-4 py-4 min-h-[200px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-stone-400 dark:text-zinc-500">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Summary / Trend toggle ────────────────────────────────────────────────────

export function ViewToggle({ value, onChange, disabled }: {
  value: WidgetViewMode;
  onChange: (v: WidgetViewMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {(['summary', 'trend'] as WidgetViewMode[]).map(v => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 capitalize transition-colors ${
            value === v
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
          }`}>
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Bucket selector (3 / 6 / 12) ─────────────────────────────────────────────

export function BucketSelector({ value, onChange }: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[3, 6, 12].map(n => (
        <button key={n} onClick={() => onChange(n)}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            value === n
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
          }`}>
          {n}
        </button>
      ))}
    </div>
  );
}
