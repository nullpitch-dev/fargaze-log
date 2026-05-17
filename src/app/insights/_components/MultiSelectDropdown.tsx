// src/app/insights/_components/MultiSelectDropdown.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';

// ── MultiSelectDropdown ───────────────────────────────────────────────────────
// Generic multi-select dropdown with Select all / Deselect all.
//
// Caller decides commit timing:
//   - GlobalFilterBar: ignores onClose, commits on Apply button press
//   - Widget-local filters: commits on onClose (when dropdown closes)

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  onClose,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        onClose?.();
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  const allSelected     = selected.length === options.length;
  const noneSelected    = selected.length === 0;
  const deselectedCount = options.length - selected.length;

  function toggleAll() { onChange(allSelected ? [] : [...options]); }
  function toggleOne(opt: string) {
    onChange(selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          if (open) onClose?.();
          setOpen(v => !v);
        }}
        className={`flex items-center gap-1.5 border rounded px-2.5 py-1 text-[11px] focus:outline-none transition-colors bg-white dark:bg-zinc-900 shadow-sm ${
          deselectedCount > 0
            ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-200'
        }`}
      >
        <span>{label}{deselectedCount > 0 ? ` (${selected.length})` : ''}</span>
        <span className="text-[9px] opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded shadow-lg min-w-[140px]">
          <label className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
              onChange={toggleAll}
              className="accent-blue-500"
            />
            <span className="text-[11px] text-stone-500 dark:text-zinc-400">
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </label>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggleOne(opt)}
                className="accent-blue-500"
              />
              <span className={`text-[11px] ${
                selected.includes(opt)
                  ? 'text-stone-700 dark:text-zinc-200'
                  : 'text-stone-400 dark:text-zinc-500 line-through'
              }`}>
                {opt}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
