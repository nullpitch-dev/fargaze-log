'use client';
// src/app/calendar/_components/ScheduleView.tsx
//
// Schedule view (WBS #59): Google's agenda list, one month at a time. Only
// days with something on them appear; each lists its records with the Day
// pop-up's own list. Reading & study appears only on the days a book starts
// or finishes — a daily line for every ongoing book would bury the rest.
//
// Fills the window below its own top edge and scrolls inside. The chosen day
// and today always have a row, even with nothing recorded, so the list can
// scroll to them; it does on first show, when the date changes, and on every
// press of Today (`jump`).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { addDays } from '@/lib/calendar/calendar';
import { touches, readingProgress } from '../_lib/month-layout';
import { DayList } from './MonthView';

const BOTTOM_GAP = 16;

export function ScheduleView({ from, to, cursor, jump, today, events, reading, showReading, tz, colors, isDark, onOpenDate, onOpenEvent }: {
  from: string; to: string;          // the month shown
  cursor: string;
  jump: number;                      // bumped by Today, to scroll again
  today: string;
  events: CalendarEvent[];           // filtered, reading excluded
  reading: CalendarEvent[];
  showReading: boolean;
  tz: string;
  colors: Record<string, string>;
  isDark: boolean;
  onOpenDate: (date: string) => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => {
    const out: { date: string; evs: CalendarEvent[]; rd: { e: CalendarEvent; day: number; of: number }[] }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const evs = events.filter(e => touches(e, d));
      const rd = showReading
        ? reading.filter(e => e.startDate === d || e.endDate === d).map(e => ({ e, ...readingProgress(e, d) }))
        : [];
      if (evs.length || rd.length || d === cursor || d === today) out.push({ date: d, evs, rd });
    }
    return out;
  }, [from, to, cursor, today, events, reading, showReading]);

  // ── Full height ──
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setAvail(Math.floor(window.innerHeight - (r.top + window.scrollY) - BOTTOM_GAP));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // ── Scroll to the chosen day ──
  // Re-run when rows arrive too: the chosen day's row exists before the data does.
  useEffect(() => {
    if (!boxRef.current) return;
    const row = boxRef.current.querySelector<HTMLElement>(`[data-date="${cursor}"]`);
    boxRef.current.scrollTop = row ? row.offsetTop - 4 : 0;
  }, [cursor, jump, days.length]);

  return (
    <div ref={boxRef}
      className="relative overflow-y-auto border border-stone-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900"
      style={{ height: avail > 0 ? Math.max(avail, 320) : 640 }}>
      {days.length === 0 && (
        <p className="p-4 text-xs text-stone-400 dark:text-zinc-500">Nothing recorded this month.</p>
      )}
      {days.map(({ date, evs, rd }) => {
        const dt = new Date(`${date}T00:00:00Z`);
        const isToday = date === today;
        return (
          <div key={date} data-date={date}
            className="flex gap-3 px-3 py-2.5 border-b border-stone-100 dark:border-zinc-800 last:border-0">
            <button onClick={() => onOpenDate(date)} title="Open this day"
              className="shrink-0 w-14 flex flex-col items-center gap-0.5 pt-0.5 rounded hover:bg-stone-50 dark:hover:bg-zinc-800">
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-lg tabular-nums ${
                isToday ? 'bg-blue-600 text-white font-semibold' : 'text-stone-800 dark:text-zinc-100'}`}>
                {dt.getUTCDate()}
              </span>
              <span className={`text-[10px] uppercase tracking-wide ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 dark:text-zinc-500'}`}>
                {dt.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', timeZone: 'UTC' })}
              </span>
            </button>
            <div className="flex-1 min-w-0 pt-1">
              {evs.length || rd.length
                ? <DayList date={date} events={evs} reading={rd} tz={tz} colors={colors} isDark={isDark}
                    onOpenEvent={onOpenEvent} plain />
                : <p className="text-xs text-stone-400 dark:text-zinc-500 pt-1.5">Nothing recorded.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
