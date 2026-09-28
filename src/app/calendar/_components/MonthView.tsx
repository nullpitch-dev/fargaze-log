'use client';
// src/app/calendar/_components/MonthView.tsx
//
// Month view (WBS #59). Lane placement comes from month-layout.ts; this file
// sizes and draws it. Each week row is a 7-column grid of day cells with
// absolutely positioned lanes on top: bars (all-day / 24 h+), chips (timed),
// "+N more", and the optional Reading & study row under the date numbers.
//
// FULL HEIGHT: the view fills the window below its own top edge. The week
// rows share that height equally, and each row gets as many lanes as fit
// (at least MIN_LANES; the page scrolls rather than go below that).
//
// Clicking a bar or chip opens that record; clicking a day's empty space, its
// date, the reading row or "+N more" opens the day's list. A chip shows its
// time only when a day cell is at least TIME_MIN_CELL wide (Google hides it
// on a phone for the same reason).

import React, { useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { type Placed, type ReadingCell, labelOf, layoutWeek } from '../_lib/month-layout';
import {
  colorFor, textOn,
  READING_TINT_LIGHT, READING_TINT_DARK, READING_INK_LIGHT, READING_INK_DARK,
} from '../_lib/calendar-colors';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface MonthMetrics { headerH: number; readingH: number; laneH: number; maxLanes: number }
export const METRICS_WIDE:    MonthMetrics = { headerH: 24, readingH: 18, laneH: 18, maxLanes: 6 };
export const METRICS_COMPACT: MonthMetrics = { headerH: 20, readingH: 15, laneH: 15, maxLanes: 4 };
const TIME_MIN_CELL = 110;   // px
const MIN_LANES = 2;
const DOW_H = 23;            // the Mon…Sun header strip, border included
const FRAME = 3;             // outer border (2 px) + rounding slack, so no stray scrollbar
const BOTTOM_GAP = 16;       // px left free under the grid

export function MonthView({
  weekDates, events, reading, showReading, month, today, tz, colors, isDark, compact, onOpenDay, onOpenEvent, onOpenDate,
}: {
  weekDates: string[][];       // the grid, Monday-first
  events: CalendarEvent[];     // filtered, reading records excluded
  reading: CalendarEvent[];    // filtered reading & study records
  showReading: boolean;
  month: string;               // YYYY-MM being shown
  today: string;               // YYYY-MM-DD in the display zone
  tz: string;
  colors: Record<string, string>;
  isDark: boolean;
  compact: boolean;
  onOpenDay: (date: string) => void;
  onOpenEvent: (e: CalendarEvent) => void;
  /** Clicking a date number opens that Day view (Google's behaviour). */
  onOpenDate?: (date: string) => void;
}) {
  const m = compact ? METRICS_COMPACT : METRICS_WIDE;
  const boxRef = useRef<HTMLDivElement>(null);
  const [cellW, setCellW] = useState(0);
  const [avail, setAvail] = useState(0);   // px from the grid's top to the window's foot
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCellW(r.width / 7);
      setAvail(Math.floor(window.innerHeight - (r.top + window.scrollY) - BOTTOM_GAP));
    };
    measure();
    // The body observer catches the toolbar wrapping or the phone filter panel opening.
    const ro = new ResizeObserver(measure);
    ro.observe(el); ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const showTime = !compact && cellW >= TIME_MIN_CELL;

  // Equal rows; each week's lanes are whatever fits under its date and reading row.
  const hasReading = weekDates.map(w => showReading
    && reading.some(e => e.startDate <= w[6] && e.endDate >= w[0]));
  const minRow = m.headerH + m.readingH + MIN_LANES * m.laneH + 4;
  const rowH = avail > 0
    ? Math.max(minRow, Math.floor((avail - DOW_H - FRAME) / weekDates.length))
    : m.headerH + m.readingH + m.maxLanes * m.laneH + 4;          // before the first measure
  const weeks = weekDates.map((w, i) => {
    const lanes = Math.max(MIN_LANES, Math.floor((rowH - m.headerH - (hasReading[i] ? m.readingH : 0) - 4) / m.laneH));
    return layoutWeek(w, events, reading, lanes, showReading);
  });
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return (
    <div ref={boxRef} className="select-none border border-stone-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-zinc-800">
        {DOW.map(d => (
          <div key={d} className="text-[10px] uppercase tracking-wide text-center py-1 text-stone-400 dark:text-zinc-500">{d}</div>
        ))}
      </div>

      {weeks.map((w, wi) => {
        const readingH = w.reading ? m.readingH : 0;
        const height = rowH;
        const laneTop = (lane: number) => m.headerH + readingH + lane * m.laneH;
        return (
          <div key={w.dates[0]} className={`relative ${wi < weeks.length - 1 ? 'border-b border-stone-200 dark:border-zinc-800' : ''}`}
            style={{ height }}>
            {/* Day cells: background, date number, click target */}
            <div className="absolute inset-0 grid grid-cols-7">
              {w.dates.map((d, i) => {
                const inMonth = d.startsWith(month);
                const isToday = d === today;
                return (
                  <div key={d} onClick={() => onOpenDay(d)}
                    className={`cursor-pointer ${i < 6 ? 'border-r border-stone-100 dark:border-zinc-800' : ''} ${
                      inMonth ? '' : 'bg-stone-50/70 dark:bg-zinc-950/40'} hover:bg-stone-50 dark:hover:bg-zinc-800/40`}>
                    <div className="flex justify-center" style={{ height: m.headerH, paddingTop: 3 }}>
                      <span onClick={onOpenDate ? ev => { ev.stopPropagation(); onOpenDate(d); } : undefined}
                        className={`inline-flex items-center justify-center rounded-full leading-none hover:ring-1 hover:ring-stone-300 dark:hover:ring-zinc-600 ${
                        compact ? 'text-[10px] w-4 h-4' : 'text-[11px] w-5 h-5'} ${
                        isToday ? 'bg-blue-600 text-white font-semibold'
                          : inMonth ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-300 dark:text-zinc-600'}`}>
                        {Number(d.slice(8))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {w.reading && (
              <ReadingRow cells={w.reading} dates={w.dates} top={m.headerH} height={m.readingH}
                isDark={isDark} compact={compact} onOpenDay={onOpenDay} />
            )}

            {w.bars.map(p => (
              <Bar key={`b-${p.event.id}`} p={p} top={laneTop(p.lane)} height={m.laneH}
                color={colorFor(p.event.category, colors)} compact={compact}
                onClick={() => onOpenEvent(p.event)} />
            ))}

            {w.chips.map(p => (
              <Chip key={`c-${p.event.id}`} p={p} top={laneTop(p.lane)} height={m.laneH}
                color={colorFor(p.event.category, colors)} compact={compact}
                time={p.event.start ? time.format(new Date(p.event.start)) : ''} showTime={showTime}
                onClick={() => onOpenEvent(p.event)} />
            ))}

            {w.more.map((n, c) => n > 0 && (
              <button key={`m-${c}`} onClick={() => onOpenDay(w.dates[c])}
                className={`absolute text-left truncate font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 ${
                  compact ? 'text-[9px] px-0.5' : 'text-[11px] px-1.5'}`}
                style={{ left: `${(c / 7) * 100}%`, width: `${100 / 7}%`, top: laneTop(w.moreLane), height: m.laneH, lineHeight: `${m.laneH}px` }}>
                +{n}{compact ? '' : ' more'}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A bar across `span` of `cols` columns. Shared with the Week / Day strip. */
export function Bar({ p, top, height, color, compact, onClick, cols = 7 }: {
  p: Placed; top: number; height: number; color: string; compact: boolean; onClick: () => void; cols?: number;
}) {
  const span = p.endCol - p.startCol + 1;
  return (
    <div onClick={e => { e.stopPropagation(); onClick(); }}
      title={labelOf(p.event)}
      className={`absolute cursor-pointer truncate ${compact ? 'text-[9px] px-0.5' : 'text-[11px] px-1.5'}`}
      style={{
        left: `calc(${(p.startCol / cols) * 100}% + ${p.continuesBefore ? 0 : 2}px)`,
        width: `calc(${(span / cols) * 100}% - ${(p.continuesBefore ? 0 : 2) + (p.continuesAfter ? 0 : 3)}px)`,
        top: top + 1, height: height - 2, lineHeight: `${height - 2}px`,
        background: color, color: textOn(color), opacity: p.event.future ? 0.55 : 1,
        borderRadius: `${p.continuesBefore ? 0 : 3}px ${p.continuesAfter ? 0 : 3}px ${p.continuesAfter ? 0 : 3}px ${p.continuesBefore ? 0 : 3}px`,
      }}>
      {p.continuesBefore ? '‹ ' : ''}{labelOf(p.event)}
    </div>
  );
}

function Chip({ p, top, height, color, compact, time, showTime, onClick }: {
  p: Placed; top: number; height: number; color: string; compact: boolean; time: string; showTime: boolean;
  onClick: () => void;
}) {
  return (
    <div onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${time} ${labelOf(p.event)}`}
      className={`absolute cursor-pointer flex items-center gap-1 rounded-sm hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-200 ${
        compact ? 'text-[9px] px-0.5' : 'text-[11px] px-1.5'}`}
      style={{
        left: `${(p.startCol / 7) * 100}%`, width: `${100 / 7}%`, top, height,
        opacity: p.event.future ? 0.55 : 1,
      }}>
      {compact
        ? <span className="shrink-0 self-stretch my-[3px] rounded-full" style={{ width: 2, background: color }} />
        : <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: color }} />}
      {showTime && <span className="shrink-0 tabular-nums text-stone-400 dark:text-zinc-500">{time}</span>}
      <span className="truncate">{labelOf(p.event)}</span>
    </div>
  );
}

/** The Reading & study row. Shared with the Week / Day strip. */
export function ReadingRow({ cells, dates, top, height, isDark, compact, onOpenDay }: {
  cells: ReadingCell[]; dates: string[]; top: number; height: number;
  isDark: boolean; compact: boolean; onOpenDay: (d: string) => void;
}) {
  const cols = dates.length;
  const tint = isDark ? READING_TINT_DARK : READING_TINT_LIGHT;
  const ink  = isDark ? READING_INK_DARK : READING_INK_LIGHT;
  return (
    <>
      {cells.map((c, i) => {
        if (!c.ongoing.length) return null;
        const prevOn = i > 0 && cells[i - 1].ongoing.length > 0;
        const nextOn = i < cols - 1 && cells[i + 1].ongoing.length > 0;
        const marks = [
          ...c.starts.map(e => `▶ ${labelOf(e)}`),
          ...c.finishes.map(e => `✓ ${labelOf(e)}`),
        ];
        return (
          <div key={dates[i]} onClick={e => { e.stopPropagation(); onOpenDay(dates[i]); }}
            title={c.ongoing.map(labelOf).join('\n')}
            className={`absolute cursor-pointer truncate flex items-center gap-1 ${compact ? 'text-[9px] px-0.5' : 'text-[10px] px-1.5'}`}
            style={{
              left: `${(i / cols) * 100}%`, width: `${100 / cols}%`, top, height: height - 1,
              background: tint, color: ink,
              borderTopLeftRadius: prevOn ? 0 : 3, borderBottomLeftRadius: prevOn ? 0 : 3,
              borderTopRightRadius: nextOn ? 0 : 3, borderBottomRightRadius: nextOn ? 0 : 3,
            }}>
            {marks.length
              ? <span className="truncate font-medium">{marks[0]}{marks.length > 1 ? ` +${marks.length - 1}` : ''}</span>
              : <><BookIcon /><span className="tabular-nums">{c.ongoing.length}</span></>}
          </div>
        );
      })}
    </>
  );
}

function BookIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M8 3.5C6.5 2.5 4.5 2 2 2v11c2.5 0 4.5.5 6 1.5 1.5-1 3.5-1.5 6-1.5V2c-2.5 0-4.5.5-6 1.5zM8 3.5v11" />
    </svg>
  );
}

// ── Day list (the pop-up for a date) ────────────────────────────────────────

export function DayList({ date, events, reading, tz, colors, isDark, onOpenEvent }: {
  date: string; events: CalendarEvent[]; reading: { e: CalendarEvent; day: number; of: number }[];
  tz: string; colors: Record<string, string>; isDark: boolean;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const barsFirst = [...events].sort((a, b) => {
    const ab = a.kind === 'allDay' || (a.startDate < date) ? 0 : 1;
    const bb = b.kind === 'allDay' || (b.startDate < date) ? 0 : 1;
    return ab - bb || (a.start ?? '').localeCompare(b.start ?? '');
  });

  const whenOf = (e: CalendarEvent) => {
    if (e.kind === 'allDay') return e.startDate === e.endDate ? 'All day' : `${short(e.startDate)} – ${short(e.endDate)}`;
    if (!e.start) return '';
    const s = e.startDate < date ? `${short(e.startDate)} ${time.format(new Date(e.start))}` : time.format(new Date(e.start));
    if (!e.end || e.end === e.start) return s;
    const t = e.endDate > date ? `${short(e.endDate)} ${time.format(new Date(e.end))}` : time.format(new Date(e.end));
    return `${s} – ${t}`;
  };

  const ink = isDark ? READING_INK_DARK : READING_INK_LIGHT;
  return (
    <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto -mx-1 px-1">
      {reading.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-zinc-500">Reading &amp; study</p>
          {reading.map(({ e, day, of }) => (
            <button key={e.id} onClick={() => onOpenEvent(e)}
              className="flex items-baseline gap-2 text-xs text-left rounded px-1 -mx-1 py-0.5 hover:bg-stone-100 dark:hover:bg-zinc-800">
              <span className="shrink-0 w-4 text-center" style={{ color: ink }}>
                {e.startDate === date ? '▶' : e.endDate === date ? '✓' : '·'}
              </span>
              <span className="truncate text-stone-800 dark:text-zinc-100">{labelOf(e)}</span>
              <span className="ml-auto shrink-0 tabular-nums text-[11px] text-stone-400 dark:text-zinc-500">day {day} of {of}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {barsFirst.length === 0 && <p className="text-xs text-stone-400 dark:text-zinc-500">Nothing recorded.</p>}
        {barsFirst.map(e => (
          <button key={e.id} onClick={() => onOpenEvent(e)}
            className="flex items-baseline gap-2 text-xs text-left rounded px-1 -mx-1 py-0.5 hover:bg-stone-100 dark:hover:bg-zinc-800"
            style={{ opacity: e.future ? 0.55 : 1 }}>
            <span className="shrink-0 rounded-full translate-y-[-1px]" style={{ width: 8, height: 8, background: colorFor(e.category, colors) }} />
            <span className="shrink-0 w-[136px] tabular-nums text-[11px] text-stone-500 dark:text-zinc-400">{whenOf(e)}</span>
            <span className="truncate text-stone-800 dark:text-zinc-100">{labelOf(e)}</span>
            {e.title && e.name && (
              <span className="ml-auto shrink-0 text-[10px] text-stone-400 dark:text-zinc-500">{e.name}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
