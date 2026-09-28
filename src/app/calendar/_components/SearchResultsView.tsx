'use client';
// src/app/calendar/_components/SearchResultsView.tsx
//
// Search results (WBS #59, 28 Sep): the Schedule layout, newest day first,
// each day's records in time order. Shows how many matched; above the limit
// it says so and suggests a date range (Google's advice for its own 200 cap).
// Fills the window below its own top edge and scrolls inside.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { DayList } from './MonthView';

const BOTTOM_GAP = 16;

export function SearchResultsView({ events, total, totalIsMinimum, loading, error, today, tz, colors, isDark, onOpenDate, onOpenEvent }: {
  events: CalendarEvent[];         // newest first
  total: number;
  totalIsMinimum: boolean;
  loading: boolean;
  error: string | null;
  today: string;
  tz: string;
  colors: Record<string, string>;
  isDark: boolean;
  onOpenDate: (date: string) => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  // Group by start date, keeping newest-first day order.
  const days = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.startDate) ?? [];
      list.push(e);
      map.set(e.startDate, list);
    }
    return [...map.entries()];
  }, [events]);

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
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = 0; }, [events]);

  const summary = loading ? 'Searching…'
    : error ? null
    : total === 0 ? 'No matches.'
    : totalIsMinimum ? `More than 2,000 matches — showing the latest ${events.length}. Add a date range (▾) to reach older ones.`
    : total > events.length ? `${total.toLocaleString()} matches — showing the latest ${events.length}. Add a date range (▾) to reach older ones.`
    : `${total.toLocaleString()} ${total === 1 ? 'match' : 'matches'}`;

  return (
    <div ref={boxRef}
      className="relative overflow-y-auto border border-stone-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900"
      style={{ height: avail > 0 ? Math.max(avail, 320) : 640 }}>
      <div className="sticky top-0 z-10 px-3 py-2 text-[11px] border-b border-stone-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 text-stone-500 dark:text-zinc-400">
        {error ? <span className="text-red-500">{error}</span> : summary}
      </div>
      {days.map(([date, evs]) => {
        const dt = new Date(`${date}T00:00:00Z`);
        const isToday = date === today;
        return (
          <div key={date} className="flex gap-3 px-3 py-2.5 border-b border-stone-100 dark:border-zinc-800 last:border-0"
            style={{ opacity: loading ? 0.5 : 1 }}>
            <button onClick={() => onOpenDate(date)} title="Open this day"
              className="shrink-0 w-14 flex flex-col items-center gap-0.5 pt-0.5 rounded hover:bg-stone-50 dark:hover:bg-zinc-800">
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-lg tabular-nums ${
                isToday ? 'bg-blue-600 text-white font-semibold' : 'text-stone-800 dark:text-zinc-100'}`}>
                {dt.getUTCDate()}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500 text-center leading-tight">
                {dt.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', timeZone: 'UTC' })}
                <br />{dt.getUTCFullYear()}
              </span>
            </button>
            <div className="flex-1 min-w-0 pt-1">
              <DayList date={date} events={evs} reading={[]} tz={tz} colors={colors} isDark={isDark}
                onOpenEvent={onOpenEvent} plain />
            </div>
          </div>
        );
      })}
    </div>
  );
}
