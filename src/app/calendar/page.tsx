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
// Step 2: Week and Day views. The view and date live in the address
// (?view=week&date=2021-07-09) so the back button and bookmarks work; with no
// view in the address the page opens on Month.
// Step 3: Year (per-day counts from the API, a card per day) and Schedule
// (one month as a list); the category colour palette lives in the filters.
// 28 Sep: the Year view uses the Month view's day pop-up (fetching that one
// day itself), every day pop-up has "Open day", and Today in Schedule
// scrolls to today even when today has no records.
// Search (28 Sep, Google's model with 상세 검색): the box sits in the toolbar;
// a search is a view of its own in the address (?view=search&q=…&prev=month),
// and ← returns to the view it came from.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { zonedDate, addDays } from '@/lib/calendar/calendar';
import { useIsDark } from '@/app/insights/_lib/hooks';
import { ModalShell } from '@/app/insights/_components/ModalShell';
import {
  monthGrid, applyFilters, isReading, touches, readingProgress, READING_NAMES,
} from './_lib/month-layout';
import { MonthView, DayList } from './_components/MonthView';
import { CalendarFilters, type FilterState } from './_components/CalendarFilters';
import { MonthPicker } from './_components/MonthPicker';
import { TimeGridView } from './_components/TimeGridView';
import { YearView } from './_components/YearView';
import { ScheduleView } from './_components/ScheduleView';
import { weekOf } from './_lib/time-layout';
import { DetailPanel, type LogEntry } from '@/app/_components/LogDetailPanel';
import { SearchBox, type SearchSpec, EMPTY_SEARCH, isEmptySearch } from './_components/SearchBox';
import { SearchResultsView } from './_components/SearchResultsView';

const COMPACT_BELOW = 640;   // px of page width
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type View = 'day' | 'week' | 'month' | 'year' | 'schedule' | 'search';
const VIEWS: [Exclude<View, 'search'>, string][] = [
  ['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['schedule', 'Schedule'],
];
const isView = (v: string | null): v is View => v === 'search' || VIEWS.some(([k]) => k === v);

/** The search in the address: q, cond (field:value|…), not, sfrom, sto. */
function searchFromParams(p: URLSearchParams): SearchSpec {
  const conditions = (p.get('cond') ?? '').split('|').map(part => {
    const i = part.indexOf(':');
    return i > 0 ? { field: part.slice(0, i), value: part.slice(i + 1) } : null;
  }).filter((c): c is { field: string; value: string } => !!c && !!c.value);
  return { q: p.get('q') ?? '', conditions, not: p.get('not') ?? '', from: p.get('sfrom') ?? '', to: p.get('sto') ?? '' };
}
function searchToParams(s: SearchSpec): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.q.trim()) out.q = s.q.trim();
  if (s.conditions.length) out.cond = s.conditions.map(c => `${c.field}:${c.value.trim()}`).join('|');
  if (s.not.trim()) out.not = s.not.trim();
  if (s.from) out.sfrom = s.from;
  if (s.to) out.sto = s.to;
  return out;
}

const fmtDate = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

/** "5 – 11 Jul 2021", "28 Jun – 4 Jul 2021", "29 Dec 2025 – 4 Jan 2026" */
function weekTitle(a: string, b: string): string {
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${fmtDate(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (a.slice(0, 7) !== b.slice(0, 7)) return `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${Number(a.slice(8))} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
const SIDEBAR_KEY = 'fargaze.calendar.sidebarOpen';   // per device, like the panel width itself

const DEFAULT_FILTERS: FilterState = {
  hiddenCategories: [], hiddenCrossActivities: [], colors: {}, showReading: true,
  hiddenNames: ['정식 운동', '약식 운동'],   // same starting list as the API, so nothing flashes before settings load
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
  const urlView = params.get('view');
  const view: View = isView(urlView) ? urlView : 'month';
  const go = useCallback((d: string, v: View) => {
    router.replace(`/calendar?view=${v}&date=${d}`, { scroll: false });
  }, [router]);
  const setCursor = useCallback((d: string) => go(d, view), [go, view]);

  // ── Search in the address ──
  const paramsKey = params.toString();
  const search = useMemo(() => (view === 'search' ? searchFromParams(new URLSearchParams(paramsKey)) : EMPTY_SEARCH),
    [view, paramsKey]);
  const prevParam = params.get('prev');
  const prevView: View = isView(prevParam) && prevParam !== 'search' ? prevParam : 'month';
  const runSearch = useCallback((s: SearchSpec) => {
    const q = new URLSearchParams({ view: 'search', date: cursor, prev: view === 'search' ? prevView : view, ...searchToParams(s) });
    // Entering search adds a history step (Back leaves it); refining a search replaces it.
    if (view === 'search') router.replace(`/calendar?${q}`, { scroll: false });
    else router.push(`/calendar?${q}`, { scroll: false });
  }, [router, cursor, view, prevView]);
  const [searchOpen, setSearchOpen] = useState(false);   // phone: the box folds under the toolbar

  // Escape leaves the results (unless a pop-up or the detail pane is open — they close first).
  const overlayOpen = useRef(false);
  useEffect(() => {
    if (view !== 'search') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || overlayOpen.current || t?.closest('form')) return;
      go(cursor, prevView);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, go, cursor, prevView]);

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

  // ── Events for the visible range ──
  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const week = useMemo(() => weekOf(cursor), [cursor]);
  const year = Number(cursor.slice(0, 4));
  const monthFirst = `${cursor.slice(0, 7)}-01`;
  const monthLast = new Date(Date.UTC(year, Number(cursor.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const range = view === 'month' ? { from: grid.from, to: grid.to }
    : view === 'week' ? { from: week[0], to: week[6] }
    : view === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` }
    : view === 'schedule' ? { from: monthFirst, to: monthLast }
    : { from: cursor, to: cursor };
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (view === 'year' || view === 'search') return;   // Year loads counts; Search its own results
    const ctl = new AbortController();
    setLoading(true); setError(null);
    const q = new URLSearchParams({ from: range.from, to: range.to, tz });
    fetch(`/api/calendar?${q}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setEvents(d.events ?? []);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(String(e)); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [view, range.from, range.to, tz]);

  // ── Year view: per-day counts, filtered on the server the page's way ──
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (view !== 'year') return;
    const ctl = new AbortController();
    setLoading(true); setError(null);
    const q = new URLSearchParams({
      from: range.from, to: range.to, tz, shape: 'days',
      excludeCategories: filters.hiddenCategories.join(','),
      excludeCrossActivities: filters.hiddenCrossActivities.join(','),
      excludeNames: [...filters.hiddenNames, ...READING_NAMES].join(','),
    });
    fetch(`/api/calendar?${q}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setDayCounts(d.days ?? {}); })
      .catch(e => { if (e.name !== 'AbortError') setError(String(e)); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [view, range.from, range.to, tz, filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames]);


  // ── Layout ──
  const shown = useMemo(
    () => applyFilters(events, filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames),
    [events, filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames]);
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
  useEffect(() => { setOpenDay(null); }, [view]);

  // The Year view loads counts only, so its pop-up fetches the one day itself.
  const [yearDay, setYearDay] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    if (view !== 'year' || !openDay) return;
    setYearDay(null);
    const ctl = new AbortController();
    fetch(`/api/calendar?${new URLSearchParams({ from: openDay, to: openDay, tz })}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => setYearDay(d.events ?? []))
      .catch(e => { if (e.name !== 'AbortError') setYearDay([]); });
    return () => ctl.abort();
  }, [view, openDay, tz]);
  const dayPool = view === 'year'
    ? applyFilters(yearDay ?? [], filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames)
    : shown;
  const dayLoading = loading || (view === 'year' && openDay !== null && yearDay === null);
  const dayEvents  = openDay ? dayPool.filter(e => !isReading(e) && touches(e, openDay)) : [];
  const dayReading = openDay && filters.showReading
    ? dayPool.filter(e => isReading(e) && touches(e, openDay)).map(e => ({ e, ...readingProgress(e, openDay) }))
    : [];

  // Schedule: Today must scroll even when the date is already today.
  const [jump, setJump] = useState(0);

  // ‹ › in the pop-up. A day outside the loaded grid moves the month with it.
  const stepDay = useCallback((n: number) => {
    if (!openDay) return;
    const next = addDays(openDay, n);
    setOpenDay(next);
    if (next < range.from || next > range.to) setCursor(next);
  }, [openDay, range.from, range.to, setCursor]);
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
  const shift = (n: number) => {
    if (view === 'day') return setCursor(addDays(cursor, n));
    if (view === 'week') return setCursor(addDays(cursor, 7 * n));
    if (view === 'year') return setCursor(`${year + n}-01-01`);
    const [y, m] = cursor.split('-').map(Number);
    setCursor(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10));
  };
  overlayOpen.current = !!openDay || !!record;

  // ── Search results ──
  const [results, setResults] = useState<{ events: CalendarEvent[]; total: number; totalIsMinimum: boolean }>(
    { events: [], total: 0, totalIsMinimum: false });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  useEffect(() => {
    if (view !== 'search' || isEmptySearch(search)) return;
    const ctl = new AbortController();
    setSearching(true); setSearchError(null);
    const q = new URLSearchParams({
      tz,
      ...(search.q.trim() ? { q: search.q.trim() } : {}),
      ...(search.conditions.length ? { conditions: search.conditions.map(c => `${c.field}:${c.value}`).join('|') } : {}),
      ...(search.not.trim() ? { not: search.not.trim() } : {}),
      ...(search.from ? { dateFrom: search.from } : {}),
      ...(search.to ? { dateTo: search.to } : {}),
      excludeCategories: filters.hiddenCategories.join(','),
      excludeCrossActivities: filters.hiddenCrossActivities.join(','),
      excludeNames: filters.hiddenNames.join(','),
    });
    fetch(`/api/calendar/search?${q}`, { signal: ctl.signal })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setSearchError(d.error); return; }
        setResults({ events: d.events ?? [], total: d.total ?? 0, totalIsMinimum: !!d.totalIsMinimum });
      })
      .catch(e => { if (e.name !== 'AbortError') setSearchError(String(e)); })
      .finally(() => { if (!ctl.signal.aborted) setSearching(false); });
    return () => ctl.abort();
  }, [view, search, tz, filters.hiddenCategories, filters.hiddenCrossActivities, filters.hiddenNames]);

  const unit = view === 'day' ? 'day' : view === 'week' ? 'week' : view === 'year' ? 'year' : 'month';
  const title = view === 'search' ? 'Search' : view === 'year' ? String(year)
    : view === 'month' || view === 'schedule'
    ? fmtDate(`${grid.month}-01`, { month: 'long', year: 'numeric' })
    : view === 'week' ? weekTitle(week[0], week[6])
    : fmtDate(cursor, compact
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const openDate = useCallback((d: string) => go(d, 'day'), [go]);
  const hiddenCount = filters.hiddenCategories.length + filters.hiddenCrossActivities.length;

  const mainView = (isCompact: boolean) => view === 'search'
    ? <SearchResultsView events={results.events} total={results.total} totalIsMinimum={results.totalIsMinimum}
        loading={searching} error={searchError} today={today} tz={tz} colors={filters.colors} isDark={isDark}
        onOpenDate={openDate} onOpenEvent={openEvent} />
    : view === 'year'
    ? <YearView year={year} counts={dayCounts} today={today} selected={openDay}
        onDay={setOpenDay} onOpenMonth={d => go(d, 'month')} />
    : view === 'schedule'
    ? <ScheduleView from={monthFirst} to={monthLast} cursor={cursor} jump={jump} today={today} events={others} reading={reading}
        showReading={filters.showReading} tz={tz} colors={filters.colors} isDark={isDark}
        onOpenDate={openDate} onOpenEvent={openEvent} />
    : view === 'month'
    ? <MonthView weekDates={grid.weeks} events={others} reading={reading} showReading={filters.showReading}
        month={grid.month} today={today} tz={tz} colors={filters.colors} isDark={isDark} compact={isCompact}
        onOpenDay={setOpenDay} onOpenDate={openDate} onOpenEvent={openEvent} />
    : <TimeGridView key={view} dates={view === 'week' ? week : [cursor]} events={others} reading={reading}
        showReading={filters.showReading} today={today} tz={tz} colors={filters.colors} isDark={isDark}
        compact={isCompact} onOpenDay={setOpenDay} onOpenDate={openDate} onOpenEvent={openEvent} />;

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
        {view === 'search' ? (
          <>
            <button onClick={() => go(cursor, prevView)} aria-label="Back to the calendar" title="Back (Esc)"
              className="w-7 h-7 rounded-full text-lg leading-none text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">←</button>
            <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-50 px-1">Search</h1>
          </>
        ) : (<>
        <button onClick={() => { setCursor(today); setJump(j => j + 1); }}
          className="border border-stone-200 dark:border-zinc-700 rounded px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800">
          Today
        </button>
        <div className="flex">
          {[['‹', -1], ['›', 1]].map(([s, n]) => (
            <button key={s} onClick={() => shift(n as number)} aria-label={`${n === -1 ? 'Previous' : 'Next'} ${unit}`}
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
              onPick={d => { go(d, view === 'year' ? 'month' : view); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)} />
          )}
        </div>
        </>)}
        {loading && view !== 'search' && <span className="text-[10px] text-stone-400 dark:text-zinc-500">Loading…</span>}
        {tz !== deviceTz && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Shown in {tz}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!compact && <SearchBox value={search} onSubmit={runSearch} />}
          {compact && view !== 'search' && (
            <button onClick={() => setSearchOpen(o => !o)} aria-label="Search"
              className="w-7 h-7 rounded-full flex items-center justify-center text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
              </svg>
            </button>
          )}
          {compact && (
            <button onClick={() => setFiltersOpen(o => !o)}
              className={`border rounded px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 ${
                hiddenCount ? 'border-blue-400 text-blue-600 dark:text-blue-400' : 'border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-200'}`}>
              Filters{hiddenCount ? ` (${hiddenCount})` : ''}
            </button>
          )}
          <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px]">
            {VIEWS.map(([v, label]) => (
              <button key={v} onClick={() => go(cursor, v)}
                className={`px-2.5 py-1 ${v === view
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                  : 'bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'}`}>
                {compact ? label[0] : label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {compact && (searchOpen || view === 'search') && (
        <SearchBox value={search} onSubmit={s => { setSearchOpen(false); runSearch(s); }}
          autoFocus={view !== 'search'} wide={false} />
      )}

      {error && view !== 'search' && <p className="text-xs text-red-500">{error}</p>}

      {compact ? (
        <>
          {filtersOpen && (
            <div className="border border-stone-200 dark:border-zinc-800 rounded-lg p-3 bg-white dark:bg-zinc-900">
              {filterPanel}
            </div>
          )}
          {mainView(true)}
        </>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: sidebarOpen ? '220px minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          {sidebarOpen && (
            <aside className="overflow-y-auto pr-1" style={{ maxHeight: 'calc(100dvh - 110px)' }}>{filterPanel}</aside>
          )}
          {mainView(false)}
        </div>
      )}

      {openDay && (
        <ModalShell onClose={() => setOpenDay(null)}
          actions={
            <>
              {dayLoading && <span className="text-[10px] text-stone-400 dark:text-zinc-500 mr-1">Loading…</span>}
              {view !== 'day' && (
                <button onClick={() => { const d = openDay; setOpenDay(null); openDate(d); }}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mr-1">
                  Open day ›
                </button>
              )}
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
