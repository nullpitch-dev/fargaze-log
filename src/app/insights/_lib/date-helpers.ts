// src/app/insights/_lib/date-helpers.ts

import { TimeMode, GlobalFilter } from './types';

// Local calendar date (YYYY-MM-DD). toISOString() would give the UTC date,
// which is still yesterday between midnight and 1 am in British Summer Time.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

export function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentWeekStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const wNum =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wNum).padStart(2, '0')}`;
}

// Default Period: the month ending yesterday.
// On 6 Oct → 6 Sep – 5 Oct; on 1 Oct → 1 Sep – 30 Sep.
// The start is today's day number in the previous month, clamped to that
// month's last day (31 Mar → 28 Feb).
export function defaultPeriodFrom(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(now.getDate(), lastDay));
  return localDateStr(d);
}

export function defaultPeriodTo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

export function defaultTimePeriod(mode: TimeMode): string {
  if (mode === 'month') return currentMonthStr();
  if (mode === 'week') return currentWeekStr();
  if (mode === 'day') return todayStr();
  return '';
}

export function periodLabel(mode: TimeMode, period: string): string {
  if (mode === 'month') {
    const [y, m] = period.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[parseInt(m) - 1]} ${y}`;
  }
  if (mode === 'week') return period.replace('-W', ' W');
  if (mode === 'day') return period;
  return '';
}

export function buildParams(base: Record<string, string>, gf: GlobalFilter): string {
  const p = new URLSearchParams(base);
  p.set('timeMode', gf.timeMode);
  if (gf.timeMode === 'period') {
    p.set('dateFrom', gf.dateFrom);
    p.set('dateTo', gf.dateTo);
  } else {
    p.set('timePeriod', gf.timePeriod);
  }
  if (gf.crossActivities.length > 0) p.set('crossActivities', gf.crossActivities.join(','));
  return p.toString();
}
