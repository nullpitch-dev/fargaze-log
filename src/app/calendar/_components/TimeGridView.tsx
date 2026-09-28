'use client';
// src/app/calendar/_components/TimeGridView.tsx
//
// Week (7 columns) and Day (1 column) views (WBS #59), Google Calendar's
// layout:
//   header  weekday + date; clicking a date opens that Day view
//   strip   the Reading & study row, then bars (all-day and 24 h+ records),
//           at most STRIP_LANES lanes, then "+N more" (opens the day's list)
//   grid    24 hours in the display zone, scrolling; pieces from
//           time-layout.ts, overlapping ones side by side; a red line at the
//           current time in today's column
//
// Like the Month view it fills the window below its own top edge; only the
// hours scroll. On first show the grid scrolls to an hour before now when
// today is in view, otherwise to 07:00. Header and strip reserve the
// scrollbar's width (scrollbar-gutter) so their columns line up with the grid.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/calendar';
import { layoutWeek, labelOf, isBar } from '../_lib/month-layout';
import { layoutDay, nowMinutes, type Piece } from '../_lib/time-layout';
import { colorFor, textOn } from '../_lib/calendar-colors';
import { Bar, ReadingRow } from './MonthView';

const STRIP_LANES = 3;
const BOTTOM_GAP = 16;
const MIN_GRID = 240;          // px of hours always visible; the page scrolls below this
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Metrics { hourH: number; gutter: number; laneH: number; readingH: number }
const WIDE:    Metrics = { hourH: 48, gutter: 52, laneH: 18, readingH: 18 };
const COMPACT: Metrics = { hourH: 40, gutter: 30, laneH: 15, readingH: 15 };

export function TimeGridView({
  dates, events, reading, showReading, today, tz, colors, isDark, compact,
  onOpenDay, onOpenDate, onOpenEvent,
}: {
  dates: string[];
  events: CalendarEvent[];     // filtered, reading excluded
  reading: CalendarEvent[];
  showReading: boolean;
  today: string;
  tz: string;
  colors: Record<string, string>;
  isDark: boolean;
  compact: boolean;
  onOpenDay: (date: string) => void;     // the day's list
  onOpenDate: (date: string) => void;    // the Day view
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const m = compact ? COMPACT : WIDE;
  const n = dates.length;
  const time = useMemo(() => new Intl.DateTimeFormat('en-GB',
    { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), [tz]);

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

  // ── Now, refreshed every minute ──
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Layout ──
  const strip = useMemo(
    () => layoutWeek(dates, events.filter(isBar), reading, STRIP_LANES, showReading),
    [dates, events, reading, showReading]);
  const days = useMemo(() => dates.map(d => layoutDay(events, d, tz)), [dates, events, tz]);

  const readingH = strip.reading ? m.readingH : 0;
  const stripH = readingH + strip.lanesUsed * m.laneH + (strip.lanesUsed || readingH ? 4 : 6);

  // ── First scroll ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolled.current) return;
    const nowCol = dates.indexOf(today);
    const mins = nowCol >= 0 ? (nowMinutes(Date.now(), today, tz) ?? 7 * 60) - 60 : 7 * 60;
    el.scrollTop = Math.max(0, (mins / 60) * m.hourH);
    scrolled.current = true;
  }, [dates, today, tz, m.hourH]);

  const gutterStyle = { width: m.gutter, flex: `0 0 ${m.gutter}px` };
  const reserve: React.CSSProperties = { scrollbarGutter: 'stable', overflowY: 'hidden' };

  return (
    <div ref={boxRef}
      className="select-none border border-stone-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 flex flex-col"
      style={avail > 0 ? { height: Math.max(avail, MIN_GRID + 80) } : { height: 640 }}>

      {/* Header */}
      <div className="flex border-b border-stone-200 dark:border-zinc-800" style={reserve}>
        <div style={gutterStyle} />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {dates.map(d => {
            const dow = DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
            const isToday = d === today;
            return (
              <button key={d} onClick={() => onOpenDate(d)}
                className="flex flex-col items-center py-1 hover:bg-stone-50 dark:hover:bg-zinc-800/40">
                <span className={`text-[10px] uppercase tracking-wide ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 dark:text-zinc-500'}`}>{dow}</span>
                <span className={`inline-flex items-center justify-center rounded-full ${compact ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-lg'} ${
                  isToday ? 'bg-blue-600 text-white font-semibold' : 'text-stone-700 dark:text-zinc-200'}`}>
                  {Number(d.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strip: reading + bars */}
      <div className="flex border-b border-stone-200 dark:border-zinc-800" style={reserve}>
        <div style={gutterStyle} />
        <div className="flex-1 relative" style={{ height: stripH }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {dates.map((d, i) => (
              <div key={d} onClick={() => onOpenDay(d)}
                className={`cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800/40 ${i < n - 1 ? 'border-r border-stone-100 dark:border-zinc-800' : ''} border-l-0`} />
            ))}
          </div>
          {strip.reading && (
            <ReadingRow cells={strip.reading} dates={dates} top={1} height={m.readingH}
              isDark={isDark} compact={compact} onOpenDay={onOpenDay} />
          )}
          {strip.bars.map(p => (
            <Bar key={p.event.id} p={p} cols={n} top={1 + readingH + p.lane * m.laneH} height={m.laneH}
              color={colorFor(p.event.category, colors)} compact={compact} onClick={() => onOpenEvent(p.event)} />
          ))}
          {strip.more.map((k, c) => k > 0 && (
            <button key={c} onClick={() => onOpenDay(dates[c])}
              className={`absolute text-left truncate font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 ${compact ? 'text-[9px] px-0.5' : 'text-[11px] px-1.5'}`}
              style={{ left: `${(c / n) * 100}%`, width: `${100 / n}%`, top: 1 + readingH + strip.moreLane * m.laneH, height: m.laneH, lineHeight: `${m.laneH}px` }}>
              +{k}{compact ? '' : ' more'}
            </button>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        <div className="flex relative" style={{ height: 24 * m.hourH }}>
          <div className="relative" style={gutterStyle}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map(h => (
              <span key={h} className={`absolute right-1.5 -translate-y-1/2 tabular-nums text-stone-400 dark:text-zinc-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}
                style={{ top: h * m.hourH }}>
                {compact ? String(h).padStart(2, '0') : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          <div className="flex-1 relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {/* hour lines */}
            <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: 23 }, (_, i) => i + 1).map(h => (
                <div key={h} className="absolute left-0 right-0 border-t border-stone-100 dark:border-zinc-800" style={{ top: h * m.hourH }} />
              ))}
            </div>
            {dates.map((d, i) => (
              <DayColumn key={d} pieces={days[i]} m={m} colors={colors} isDark={isDark} compact={compact}
                narrow={n > 1} time={time} last={i === n - 1} onOpenEvent={onOpenEvent}
                nowMin={d === today ? nowMinutes(nowMs, d, tz) : null} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({ pieces, m, colors, isDark, compact, narrow, time, last, nowMin, onOpenEvent }: {
  pieces: Piece[]; m: Metrics; colors: Record<string, string>; isDark: boolean; compact: boolean;
  narrow: boolean; time: Intl.DateTimeFormat; last: boolean; nowMin: number | null;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const px = (min: number) => (min / 60) * m.hourH;
  const edge = isDark ? '#18181b' : '#ffffff';
  return (
    <div className={`relative ${last ? '' : 'border-r border-stone-100 dark:border-zinc-800'}`}>
      {pieces.map(p => {
        const color = colorFor(p.event.category, colors);
        const h = px(p.bottom - p.top);
        const e = p.event;
        const range = e.start
          ? (e.end && e.end !== e.start ? `${time.format(new Date(e.start))} – ${time.format(new Date(e.end))}` : time.format(new Date(e.start)))
          : '';
        const twoLines = !compact && h >= 30;
        return (
          <div key={e.id} onClick={() => onOpenEvent(e)}
            title={`${range} ${labelOf(e)}`}
            className={`absolute cursor-pointer overflow-hidden rounded-[3px] leading-tight ${compact ? 'text-[9px] px-0.5' : narrow ? 'text-[10px] px-1' : 'text-[11px] px-1.5'}`}
            style={{
              top: px(p.top) + 0.5, height: Math.max(h - 1, 8),
              left: `calc(${(p.col / p.cols) * 100}% + 1px)`, width: `calc(${(p.span / p.cols) * 100}% - 3px)`,
              background: color, color: textOn(color), opacity: e.future ? 0.55 : 1,
              boxShadow: `0 0 0 1px ${edge}`,
              borderTopLeftRadius: p.continuesBefore ? 0 : undefined, borderTopRightRadius: p.continuesBefore ? 0 : undefined,
              borderBottomLeftRadius: p.continuesAfter ? 0 : undefined, borderBottomRightRadius: p.continuesAfter ? 0 : undefined,
            }}>
            {twoLines ? (
              <>
                <div className="truncate font-medium pt-0.5">{labelOf(e)}</div>
                <div className="truncate opacity-80 tabular-nums">{range}</div>
              </>
            ) : (
              <div className="truncate" style={{ lineHeight: `${Math.max(h - 1, 8)}px` }}>
                {!compact && !narrow && <span className="opacity-80 tabular-nums mr-1">{e.start ? time.format(new Date(e.start)) : ''}</span>}
                {labelOf(e)}
              </div>
            )}
          </div>
        );
      })}
      {nowMin !== null && (
        <div className="absolute left-0 right-0 pointer-events-none z-10" style={{ top: px(nowMin) }}>
          <div className="relative border-t-2 border-red-500">
            <span className="absolute -left-1 -top-[5px] w-2 h-2 rounded-full bg-red-500" />
          </div>
        </div>
      )}
    </div>
  );
}
