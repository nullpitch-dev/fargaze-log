// src/app/insights/_components/WidgetGroup.tsx
'use client';

// A foldable group of widgets on the Insights page.
// A folded group does not mount its widgets, so they don't fetch anything.
// Unfolding mounts them again; they reload and start on their default tabs.

import React from 'react';

export function WidgetGroup({
  title, widgetNames, folded, onToggle, children,
}: {
  title: string;
  widgetNames: string[];     // shown in grey while folded
  folded: boolean;
  onToggle: () => void;
  children: React.ReactNode; // rendered only when unfolded
}) {
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        className="w-full flex items-baseline gap-2 py-2 text-left border-b border-stone-200 dark:border-zinc-700 group"
      >
        <span className="w-3 shrink-0 text-[11px] text-stone-400 dark:text-zinc-500 group-hover:text-stone-700 dark:group-hover:text-zinc-200">
          {folded ? '▸' : '▾'}
        </span>
        <span className="shrink-0 text-sm font-semibold text-stone-900 dark:text-zinc-50">{title}</span>
        <span className="text-xs text-stone-400 dark:text-zinc-500 truncate">
          {folded ? widgetNames.join(', ') : `${widgetNames.length}`}
        </span>
      </button>
      {!folded && <div className="pt-4">{children}</div>}
    </section>
  );
}

// A small label for a sub-group inside a group (e.g. Inputs / Outcomes).
export function WidgetSubgroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-zinc-500">
      {children}
    </p>
  );
}
