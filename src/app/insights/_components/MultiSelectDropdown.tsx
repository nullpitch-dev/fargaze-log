// src/app/insights/_components/MultiSelectDropdown.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── MultiSelectDropdown ───────────────────────────────────────────────────────
// Generic multi-select dropdown with Select all / Deselect all.
//
// Caller decides commit timing:
//   - GlobalFilterBar: ignores onClose, commits on Apply button press
//   - Widget-local filters: commits on onClose (when dropdown closes)
//
// The panel renders in a portal with fixed positioning, so it escapes any
// ancestor overflow:hidden (e.g. the widget card) and is clamped to the
// viewport: flips up when there's no room below, clamps horizontally, caps its
// height with a scroll, and re-measures on selection change, scroll, and resize.

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
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number; maxH: number; minW: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the portal'd, fixed panel relative to the trigger, clamped to view.
  const reposition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const M = 8;
    const minW = Math.max(140, r.width);
    const estH = Math.min(0.6 * window.innerHeight, (options.length + 1) * 32 + 12);
    const spaceBelow = window.innerHeight - r.bottom - M;
    const spaceAbove = r.top - M;
    const up = spaceBelow < estH && spaceAbove > spaceBelow;
    const maxH = Math.max(80, up ? spaceAbove : spaceBelow);
    let left = r.right - minW;                       // right-align to the trigger
    left = Math.min(left, window.innerWidth - M - minW);
    left = Math.max(M, left);
    setBox(up
      ? { left, bottom: window.innerHeight - r.top + 4, maxH, minW }
      : { left, top: r.bottom + 4, maxH, minW });
  }, [options.length]);

  // Close on outside click (panel is portal'd, so test it explicitly).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      onClose?.();
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  // Keep positioned while open — (de)selecting resizes the widget; scroll/resize move it.
  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, selected, reposition]);

  const allSelected     = selected.length === options.length;
  const noneSelected    = selected.length === 0;
  const deselectedCount = options.length - selected.length;

  function toggleAll() { onChange(allSelected ? [] : [...options]); }
  function toggleOne(opt: string) {
    onChange(selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt]);
  }

  const panel = open && box && typeof document !== 'undefined'
    ? createPortal(
        <div ref={panelRef}
          style={{ position: 'fixed', left: box.left, top: box.top, bottom: box.bottom,
            maxHeight: box.maxH, minWidth: box.minW }}
          className="z-50 overflow-y-auto bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded shadow-lg">
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        onClick={() => {
          if (open) { onClose?.(); setOpen(false); }
          else { reposition(); setOpen(true); }
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
      {panel}
    </div>
  );
}
