'use client';
// src/app/calendar/page.tsx
//
// Calendar (WBS #59). Google Calendar's model: every timed record is shown in
// ONE display time zone — this device's by default, switchable in the filter
// panel and not remembered. Filters, colours and the Reading & study switch
// are saved to the account (/api/calendar/settings) so every device agrees.
//
// Step 1: Month view. Week, Day, Year and Schedule follow; their buttons are
// shown disabled so the toolbar does not move when they arrive.
// Step 1b: month picker on the title, collapsible filter panel (remembered per
// device), and the shared record detail pane.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { zonedDate, addDays } from '@/lib/calendar/calendar';
import { useIsDark } from '@/app/insights/_lib/hooks';
import { ModalShell } from '@/app/insights/_components/ModalShell';
import {
  monthGrid, applyFilters, isReading, touches, readingProgress,
} from './_lib/month-layout';
import { MonthView, DayList } from './_components/MonthView';
import { CalendarFilters, type FilterState } from './_components/CalendarFilters';
import { MonthPicker } from './_components/MonthPicker';
import { DetailPanel, type LogEntry } from '@/app/_components/LogDetailPanel';

const COMPACT_BELOW = 640;   // px of page width
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIDEBAR_KEY = 'fargaze.calendar.sidebarOpen';   // per device, like the panel width itself

const DEFAULT_FILTERS: FilterState = {
  hiddenCategories: [], hiddenCrossActivities: [], colors: {}, showReading: true,
};

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}

function CalendarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const isDark = useIsDark();

  // ── Display zone: this device's, switchable, not remembered ──
  const [deviceTz, setDeviceTz] = useState('Europe/London');
  const [tz, setTz] = useState('Europe/London');
  useEffect(() => {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
    setDeviceTz(z); setTz(z);
  }, []);

  const today = zonedDate(Date.now(), tz);
  const urlDate = params.get('date');
  const cursor = urlDate && DATE_RE.test(urlDate) ? urlDate : today;
  const setCursor = useCallback((d: string) => {
    router.replace(`/calendar?date=${d}`, { scroll: false });
  }, [router]);

  // ── Width → compact layout ──
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Wide screens: the filter column folds away; remembered on this device ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(SIDEBAR_KEY) === '0') setSidebarOpen(false); } catch {}
  }, []);
  const toggleSidebar = () => setSidebarOpen(o => {
    try { localStorage.setItem(SIDEBAR_KEY, o ? '0' : '1'); } catch {}
    return !o;
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Options and saved settings ──
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [crossActivities, setCrossActivities] = useState<string[]>([]);
  const [firstYear, setFirstYear] = useState(2019);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Nothing is saved until the saved settings have arrived, so an early click
  // can never overwrite them with the defaults.
  const settingsLoaded = useRef(false);
  useEffect(() => {
    fetch('/api/calendar/options').then(r => r.json()).then(o => {
      setCategories(o.categories ?? []);
      setCrossActivities(o.crossActivities ?? []);
      if (o.firstYear) setFirstYear(o.firstYear);
    }).catch(() => {});
    fetch('/api/calendar/settings').then(r => r.json()).then(s => {
      if (s && !s.error) setFilters({ ...DEFAULT_FILTERS, ...s });
      settingsLoaded.current = !s?.error;
    }).catch(() => {});
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters(prev => {
      const next = { ...prev, ...patch };
      if (!settingsLoaded.current) return next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch('/api/calendar/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
        }).catch(() => {});
      }, 400);
      return next;
    });
  }, []);

  // ── Events for the visible grid ──
  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true); setError(null);
    const q = new URLSearchParams({ from: grid.from, to: grid.to, tz });
    fetch(`/api/calendar?${q}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setEvents(d.events ?? []);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(String(e)); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [grid.from, grid.to, tz]);

  // ── Layout ──
  const shown = useMemo(
    () => applyFilters(events, filters.hiddenCategories, filters.hiddenCrossActivities),
    [events, filters.hiddenCategories, filters.hiddenCrossActivities]);
  const reading = useMemo(() => shown.filter(isReading), [shown]);
  const others  = useMemo(() => shown.filter(e => !isReading(e)), [shown]);

  // ── Record detail (the Search pane) ──
  const [record, setRecord] = useState<LogEntry | null>(null);
  const openEvent = useCallback((e: CalendarEvent) => {
    fetch(`/api/calendar/record?id=${encodeURIComponent(e.id)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setRecord(d); })
      .catch(() => {});
  }, []);

  // ── Day pop-up ──
  const [openDay, setOpenDay] = useState<string | null>(null);
  const dayEvents  = openDay ? others.filter(e => touches(e, openDay)) : [];
  const dayReading = openDay && filters.showReading
    ? reading.filter(e => touches(e, openDay)).map(e => ({ e, ...readingProgress(e, openDay) }))
    : [];

  // ‹ › in the pop-up. A day outside the loaded grid moves the month with it.
  const stepDay = useCallback((n: number) => {
    if (!openDay) return;
    const next = addDays(openDay, n);
    setOpenDay(next);
    if (next < grid.from || next > grid.to) setCursor(next);
  }, [openDay, grid.from, grid.to, setCursor]);
  useEffect(() => {
    if (!openDay || record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') stepDay(-1);
      else if (e.key === 'ArrowRight') stepDay(1);
      else if (e.key === 'Escape') setOpenDay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDay, record, stepDay]);

  // ── Navigation ──
  const shiftMonth = (n: number) => {
    const [y, m] = cursor.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
    setCursor(d);
  };
  const title = new Date(`${grid.month}-01T00:00:00Z`)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const hiddenCount = filters.hiddenCategories.length + filters.hiddenCrossActivities.length;

  const filterPanel = (
    <CalendarFilters tz={tz} deviceTz={deviceTz} onTz={setTz}
      categories={categories} crossActivities={crossActivities}
      state={filters} onChange={updateFilters} />
  );

  return (
    <div ref={rootRef} className="flex flex-col flex-1 px-4 py-4 gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <button onClick={toggleSidebar} aria-label={sidebarOpen ? 'Hide filters' : 'Show filters'}
            title={sidebarOpen ? 'Hide filters' : 'Show filters'}
            className="w-7 h-7 rounded-full flex items-center justify-center text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
            </svg>
          </button>
        )}
        <button onClick={() => setCursor(today)}
          className="border border-stone-200 dark:border-zinc-700 rounded px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800">
          Today
        </button>
        <div className="flex">
          {[['‹', -1], ['›', 1]].map(([s, n]) => (
            <button key={s} onClick={() => shiftMonth(n as number)} aria-label={n === -1 ? 'Previous month' : 'Next month'}
              className="w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">
              {s}
            </button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-zinc-800">
            <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-50">{title}</h1>
            <span className="text-[9px] text-stone-400 dark:text-zinc-500">▼</span>
          </button>
          {pickerOpen && (
            <MonthPicker cursor={cursor} today={today} firstYear={firstYear}
              onPick={d => { setCursor(d); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)} />
          )}
        </div>
        {loading && <span className="text-[10px] text-stone-400 dark:text-zinc-500">Loading…</span>}
        {tz !== deviceTz && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Shown in {tz}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {compact && (
            <button onClick={() => setFiltersOpen(o => !o)}
              className={`border rounded px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 ${
                hiddenCount ? 'border-blue-400 text-blue-600 dark:text-blue-400' : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-200'}`}>
              Filters{hiddenCount ? ` (${hiddenCount})` : ''}
            </button>
          )}
          <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px]">
            {(['Day', 'Week', 'Month', 'Year', 'Schedule'] as const).map(v => (
              <button key={v} disabled={v !== 'Month'}
                title={v !== 'Month' ? 'Coming next' : undefined}
                className={`px-2.5 py-1 ${v === 'Month'
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                  : 'bg-white dark:bg-zinc-900 text-stone-300 dark:text-zinc-600 cursor-not-allowed'}`}>
                {compact ? v[0] : v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {compact ? (
        <>
          {filtersOpen && (
            <div className="border border-stone-200 dark:border-zinc-800 rounded-lg p-3 bg-white dark:bg-zinc-900">
              {filterPanel}
            </div>
          )}
          <MonthView weekDates={grid.weeks} events={others} reading={reading} showReading={filters.showReading}
            month={grid.month} today={today} tz={tz}
            colors={filters.colors} isDark={isDark} compact onOpenDay={setOpenDay} onOpenEvent={openEvent} />
        </>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: sidebarOpen ? '220px minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          {sidebarOpen && (
            <aside className="overflow-y-auto pr-1" style={{ maxHeight: 'calc(100dvh - 110px)' }}>{filterPanel}</aside>
          )}
          <MonthView weekDates={grid.weeks} events={others} reading={reading} showReading={filters.showReading}
            month={grid.month} today={today} tz={tz}
            colors={filters.colors} isDark={isDark} compact={false} onOpenDay={setOpenDay} onOpenEvent={openEvent} />
        </div>
      )}

      {openDay && (
        <ModalShell onClose={() => setOpenDay(null)}
          actions={
            <>
              {loading && <span className="text-[10px] text-stone-400 dark:text-zinc-500 mr-1">Loading…</span>}
              {([[-1, '‹', 'Previous day'], [1, '›', 'Next day']] as const).map(([n, s, label]) => (
                <button key={s} onClick={() => stepDay(n)} aria-label={label} title={`${label} (${n < 0 ? '←' : '→'})`}
                  className="w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">
                  {s}
                </button>
              ))}
            </>
          }
          title={new Date(`${openDay}T00:00:00Z`).toLocaleDateString('en-GB',
            { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}>
          <DayList date={openDay} events={dayEvents} reading={dayReading}
            tz={tz} colors={filters.colors} isDark={isDark} onOpenEvent={openEvent} />
        </ModalShell>
      )}

      {record && <DetailPanel entry={record} onClose={() => setRecord(null)} />}
    </div>
  );
}
