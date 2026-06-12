'use client';
// src/app/insights/_components/charts/CalendarHeatmap.tsx
//
// CalendarHeatmap: full Mon–Sun grid (used in the modal / WBS #59).
// HeatStrip:       single-row strip, one cell per day, no headers or dates —
//                  one wide box for a single day, many thin lines for long ranges.
// Both colour in-range days via fillFor(date); null = in-range day with no data.

import React from 'react';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toStr(dt: Date): string { return dt.toISOString().slice(0, 10); }
function mondayIndex(dt: Date): number { return (dt.getUTCDay() + 6) % 7; } // Mon=0 … Sun=6

function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1c1917' : '#ffffff';
}

type FillFor = (date: string) => string | null;

// ── HeatStrip — one compact row ────────────────────────────────────────────────

export function HeatStrip({ rangeStart, rangeEnd, isDark, fillFor, height = 18 }: {
  rangeStart: string; rangeEnd: string; isDark: boolean; fillFor: FillFor; height?: number;
}) {
  const start = parseDate(rangeStart);
  const end   = parseDate(rangeEnd);
  const days: { date: string; fill: string | null }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ds = toStr(cur);
    days.push({ date: ds, fill: fillFor(ds) });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const emptyBg = isDark ? '#27272a' : '#e7e5e4';  // zinc-800 / stone-200

  return (
    <div className="flex w-full overflow-hidden rounded" style={{ height, gap: 1 }}>
      {days.map(d => (
        <div key={d.date} title={d.date} className="flex-1" style={{ background: d.fill ?? emptyBg, minWidth: 0 }} />
      ))}
    </div>
  );
}

// ── CalendarHeatmap — full Mon–Sun grid ────────────────────────────────────────

export interface CalendarHeatmapProps {
  rangeStart:  string;
  rangeEnd:    string;
  isDark:      boolean;
  fillFor:     FillFor;
  legend?:     { color: string; label: string }[];
  cellHeight?: number;
}

export function CalendarHeatmap({ rangeStart, rangeEnd, isDark, fillFor, legend, cellHeight = 24 }: CalendarHeatmapProps) {
  const start = parseDate(rangeStart);
  const end   = parseDate(rangeEnd);

  const gridStart = new Date(start); gridStart.setUTCDate(gridStart.getUTCDate() - mondayIndex(start));
  const gridEnd   = new Date(end);   gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - mondayIndex(end)));

  const weeks: { date: string; day: number; inRange: boolean; fill: string | null }[][] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const inRange = cur >= start && cur <= end;
      const ds = toStr(cur);
      week.push({ date: ds, day: cur.getUTCDate(), inRange, fill: inRange ? fillFor(ds) : null });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  const emptyBg  = isDark ? '#27272a' : '#f5f5f4';
  const emptyBdr = isDark ? '#3f3f46' : '#e7e5e4';
  const numText  = isDark ? '#a1a1aa' : '#78716c';
  const dimText  = isDark ? '#3f3f46' : '#d6d3d1';

  return (
    <div className="flex flex-col gap-1 select-none">
      <div className="grid grid-cols-7 gap-1">
        {DOW.map(d => <div key={d} className="text-[9px] text-center text-stone-400 dark:text-zinc-500">{d}</div>)}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map(cell => {
            const hasFill = cell.inRange && cell.fill;
            const bg      = !cell.inRange ? 'transparent' : (cell.fill ?? emptyBg);
            const tcol    = hasFill ? textOn(cell.fill as string) : (cell.inRange ? numText : dimText);
            return (
              <div key={cell.date} title={cell.date}
                className="relative rounded-sm flex items-start justify-end"
                style={{
                  height: cellHeight, background: bg, opacity: cell.inRange ? 1 : 0.45,
                  border: cell.inRange && !cell.fill ? `1px solid ${emptyBdr}` : 'none',
                }}>
                <span className="text-[8px] leading-none p-0.5" style={{ color: tcol }}>{cell.day}</span>
              </div>
            );
          })}
        </div>
      ))}

      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-stone-400 dark:text-zinc-500">
          {legend.map(l => (
            <span key={l.label} className="inline-flex items-center gap-1">
              <i style={{ background: l.color, width: 9, height: 9, borderRadius: 2, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
