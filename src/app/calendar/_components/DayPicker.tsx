'use client';
// src/app/calendar/_components/DayPicker.tsx
//
// Jump to any day (Hyoje, 22 Nov): for the Day / 3 days / Week views, and the side
// calendar on Today. A month of days, Monday first:
//   ‹ ›          a month back / on
//   the title    the year and its months (as MonthPicker); a month → its days
//   a day        goes there; the days shown now are shaded (a whole week row in Week)
// Today is blue. Esc or a click outside closes it.

import React, { useEffect, useRef, useState } from 'react';
import { monthGrid } from '../_lib/month-layout';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

export function DayPicker({ cursor, today, shown, firstYear, onPick, onClose, className = 'absolute left-0 top-full mt-1' }: {
  cursor: string;          // YYYY-MM-DD the view starts at
  today: string;
  /** The dates on screen now (shaded). */
  shown: string[];
  firstYear: number;
  onPick: (date: string) => void;
  onClose: () => void;
  /** Where it sits; the side calendar puts it under its own title. */
  className?: string;
}) {
  const [month, setMonth] = useState(cursor.slice(0, 7));          // the month whose days are shown
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const [year, setYear] = useState(Number(cursor.slice(0, 4)));    // in months mode

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const [y, m] = month.split('-').map(Number);
  const step = (n: number) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(ym(t.getUTCFullYear(), t.getUTCMonth() + 1)); };
  const thisYear = Number(today.slice(0, 4));
  const lo = Math.min(firstYear, y), hi = Math.max(thisYear + 1, y);
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  const on = new Set(shown);
  const arrow = 'w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-30';

  return (
    <div ref={ref} className={`${className} z-40 w-64 max-w-[calc(100vw-2rem)] p-3 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg`}>
      {mode === 'days' ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <button className={arrow} onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <button onClick={() => { setYear(y); setMode('months'); }} title="Pick a month"
              className="text-sm font-semibold text-stone-900 dark:text-zinc-50 rounded px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-zinc-800">
              {MONTHS_LONG[m - 1]} {y} <span className="text-[9px] text-stone-400 dark:text-zinc-500">▼</span>
            </button>
            <button className={arrow} onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map((d, i) => <span key={i} className="text-[10px] text-stone-400 dark:text-zinc-500 py-1">{d}</span>)}
            {monthGrid(`${month}-01`).weeks.flat().map(d => {
              const inMonth = d.slice(0, 7) === month;
              const isShown = on.has(d), isToday = d === today;
              return (
                <button key={d} onClick={() => onPick(d)} aria-label={d} aria-current={isShown ? 'date' : undefined}
                  className={`h-8 text-xs ${isShown ? 'bg-stone-200 dark:bg-zinc-700' : 'hover:bg-stone-100 dark:hover:bg-zinc-800'}
                    ${isShown && !on.has(prevDay(d)) ? 'rounded-l-full' : ''} ${isShown && !on.has(nextDay(d)) ? 'rounded-r-full' : ''} ${!isShown ? 'rounded-full' : ''}`}>
                  <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full ${isToday
                    ? 'bg-blue-600 text-white font-semibold'
                    : inMonth ? 'text-stone-800 dark:text-zinc-100' : 'text-stone-300 dark:text-zinc-600'}`}>
                    {Number(d.slice(8))}
                  </span>
                </button>
              );
            })}
          </div>
          {!on.has(today) && (
            <button onClick={() => onPick(today)} className="mt-1 w-full text-xs text-blue-600 dark:text-blue-400 hover:underline">Today</button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <button className={arrow} disabled={year <= lo} onClick={() => setYear(v => v - 1)} aria-label="Previous year">‹</button>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="text-sm font-semibold bg-transparent text-stone-900 dark:text-zinc-50 focus:outline-none cursor-pointer">
              {years.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className={arrow} disabled={year >= hi} onClick={() => setYear(v => v + 1)} aria-label="Next year">›</button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((label, i) => {
              const key = ym(year, i + 1);
              return (
                <button key={label} onClick={() => { setMonth(key); setMode('days'); }}
                  className={`py-1.5 rounded text-xs ${key === month
                    ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                    : key === today.slice(0, 7)
                      ? 'text-blue-600 dark:text-blue-400 font-medium hover:bg-stone-100 dark:hover:bg-zinc-800'
                      : 'text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const shiftDay = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
const prevDay = (d: string) => shiftDay(d, -1);
const nextDay = (d: string) => shiftDay(d, 1);
