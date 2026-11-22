'use client';
// src/app/entry/_components/SideCalendar.tsx
//
// The Calendar's Day view beside Today (Hyoje, 22 Nov: he went back and forth between Today
// and the Calendar). On the Fold's inner screen and a computer it sits on the right and
// pushes Today aside; on a narrow screen (the outer screen) it covers Today, with ×.
//   ‹ ›, the date title   another day; the title opens the day picker (DayPicker)
//   a record              the record pane (Today's)
// Uses the Calendar's saved filters (hidden categories, Rows …) and colours. Loads again
// whenever Today does (after Start / End). Needs a signal: the Calendar isn't kept offline.

import React, { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { addDays, zonedDate } from '@/lib/calendar/calendar';
import { useIsDark } from '@/app/insights/_lib/hooks';
import { TimeGridView } from '@/app/calendar/_components/TimeGridView';
import { DayPicker } from '@/app/calendar/_components/DayPicker';
import { applyFilters, isReading } from '@/app/calendar/_lib/month-layout';
import type { FilterState } from '@/app/calendar/_components/CalendarFilters';

/** The picker's first year (the history starts in 2010). */
const FIRST_YEAR = 2010;

export function SideCalendar({ reloadKey, onOpen, onClose, overlay }: {
  /** Changes whenever Today has loaded again: the day is fetched again too. */
  reloadKey: unknown;
  onOpen: (e: CalendarEvent) => void;
  onClose: () => void;
  /** Narrow screen: covers Today. */
  overlay: boolean;
}) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London', []);
  const today = zonedDate(Date.now(), tz);
  const [date, setDate] = useState(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDark = useIsDark();

  const [filters, setFilters] = useState<FilterState | null>(null);
  useEffect(() => {
    fetch('/api/calendar/settings').then(r => r.json()).then(s => { if (s && !s.error) setFilters(s); }).catch(() => {});
  }, []);

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    setError('');
    fetch(`/api/calendar?${new URLSearchParams({ from: date, to: date, tz })}`, { signal: ctl.signal, cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setEvents(d.events ?? []); })
      .catch(e => { if (e.name !== 'AbortError') setError('The calendar needs a signal.'); });
    return () => ctl.abort();
  }, [date, tz, reloadKey]);

  const shown = useMemo(() => !events ? [] : filters
    ? applyFilters(events, filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames, filters.hiddenRows)
    : events, [events, filters]);
  const reading = shown.filter(isReading), others = shown.filter(e => !isReading(e));

  const title = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const arrow = 'w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800';

  return (
    <aside className={overlay
      ? 'fixed inset-0 z-50 flex flex-col bg-stone-50 dark:bg-zinc-950 px-3 pt-3'
      : 'sticky top-0 self-start w-[360px] shrink-0 flex flex-col border-l border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-3 pt-3'}
      aria-label="Calendar">
      <div className="relative flex items-center gap-1 mb-2">
        <button className={arrow} onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day">‹</button>
        <button className={arrow} onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day">›</button>
        <button onClick={() => setPickerOpen(o => !o)} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-zinc-800">
          <span className="text-sm font-semibold text-stone-900 dark:text-zinc-50">{title}</span>
          <span className="text-[9px] text-stone-400 dark:text-zinc-500">▼</span>
        </button>
        {date !== today && <button onClick={() => setDate(today)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Today</button>}
        <button onClick={onClose} aria-label="Close the calendar" title="Close"
          className="ml-auto w-7 h-7 rounded-full text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">×</button>
        {pickerOpen && (
          <DayPicker cursor={date} today={today} shown={[date]} firstYear={FIRST_YEAR}
            onPick={d => { setDate(d); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />
        )}
      </div>
      {error ? <p className="text-xs text-stone-500 dark:text-zinc-400">{error}</p>
        : events === null ? <p className="text-xs text-stone-400 dark:text-zinc-500">Loading…</p>
        : (
          <div className="flex-1 min-h-0 flex flex-col">
            <TimeGridView key={date} dates={[date]} events={others} reading={reading} showReading={filters?.showReading ?? true}
              today={today} tz={tz} colors={filters?.colors ?? {}} isDark={isDark} compact
              onOpenDay={() => {}} onOpenDate={setDate} onOpenEvent={onOpen} />
          </div>
        )}
    </aside>
  );
}
