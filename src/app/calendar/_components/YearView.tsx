'use client';
// src/app/calendar/_components/YearView.tsx
//
// Year view (WBS #59): twelve Monday-first month grids. Colouring days by a
// measure is deferred (27 Sep), so a day only says whether anything is
// recorded: a dark number with records, a dim one without, a blue circle for
// today. Counts come from the API (shape=days) with the page's filters, and
// leave reading & study out — those run for months and would mark every day.
//
// Clicking a day opens the SAME day pop-up as the Month view (28 Sep); the
// page owns it. Clicking a month's name opens that month. The layout follows
// CalendarHeatmap's week grid; its fill colours are unused while colouring is
// deferred.

import React from 'react';
import { addDays } from '@/lib/calendar/calendar';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function YearView({ year, counts, today, selected, onDay, onOpenMonth }: {
  year: number;
  counts: Record<string, number>;
  today: string;
  selected: string | null;          // the day whose pop-up is open
  onDay: (date: string) => void;
  onOpenMonth: (firstOfMonth: string) => void;
}) {
  return (
    <div className="@container">
      <div className="grid gap-x-6 gap-y-5 grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4 select-none">
        {MONTHS.map((name, i) => {
          const month = i + 1;
          return (
            <div key={name} className="flex flex-col gap-1">
              <button onClick={() => onOpenMonth(`${year}-${String(month).padStart(2, '0')}-01`)}
                className="text-left text-sm font-semibold text-stone-800 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 w-fit">
                {name}
              </button>
              <div className="grid grid-cols-7 text-center">
                {DOW.map((d, k) => <div key={k} className="text-[9px] text-stone-400 dark:text-zinc-500 pb-0.5">{d}</div>)}
                {monthWeeks(year, month).flat().map((d, k) => {
                  if (!d) return <div key={k} />;
                  const has = (counts[d] ?? 0) > 0;
                  const isToday = d === today;
                  return (
                    <button key={k} onClick={() => onDay(d)}
                      title={has ? `${counts[d]} records` : undefined}
                      className="flex items-center justify-center py-0.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] tabular-nums ${
                        isToday ? 'bg-blue-600 text-white font-semibold'
                          : d === selected ? 'bg-stone-200 dark:bg-zinc-700 text-stone-900 dark:text-zinc-50'
                          : has ? 'text-stone-800 dark:text-zinc-100 font-medium hover:bg-stone-100 dark:hover:bg-zinc-800'
                          : 'text-stone-300 dark:text-zinc-600 hover:bg-stone-100 dark:hover:bg-zinc-800'}`}>
                        {Number(d.slice(8))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
