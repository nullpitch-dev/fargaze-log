'use client';
// src/app/calendar/_components/MonthPicker.tsx
//
// Jump to any month in two clicks: pick the year (arrows or the drop-down),
// then the month. Opens from the month title in the Calendar toolbar.

import React, { useEffect, useRef, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthPicker({ cursor, today, firstYear, onPick, onClose }: {
  cursor: string;          // YYYY-MM-DD being shown
  today: string;
  firstYear: number;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const shownYear = Number(cursor.slice(0, 4));
  const shownMonth = Number(cursor.slice(5, 7));
  const thisYear = Number(today.slice(0, 4));
  const lastYear = thisYear + 1;                     // room for Future entries
  const lo = Math.min(firstYear, shownYear), hi = Math.max(lastYear, shownYear);
  const [year, setYear] = useState(shownYear);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const years = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  const arrow = 'w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-30';

  return (
    <div ref={ref}
      className="absolute left-0 top-full mt-1 z-40 w-64 max-w-[calc(100vw-2rem)] p-3 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <button className={arrow} disabled={year <= lo} onClick={() => setYear(y => y - 1)} aria-label="Previous year">‹</button>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="text-sm font-semibold bg-transparent text-stone-900 dark:text-zinc-50 focus:outline-none cursor-pointer">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className={arrow} disabled={year >= hi} onClick={() => setYear(y => y + 1)} aria-label="Next year">›</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((label, i) => {
          const m = i + 1;
          const isShown = year === shownYear && m === shownMonth;
          const isNow = `${year}-${String(m).padStart(2, '0')}` === today.slice(0, 7);
          return (
            <button key={label}
              onClick={() => onPick(`${year}-${String(m).padStart(2, '0')}-01`)}
              className={`py-1.5 rounded text-xs ${isShown
                ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                : isNow
                  ? 'text-blue-600 dark:text-blue-400 font-medium hover:bg-stone-100 dark:hover:bg-zinc-800'
                  : 'text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800'}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
