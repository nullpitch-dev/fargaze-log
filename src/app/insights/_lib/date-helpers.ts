// src/app/insights/_lib/date-helpers.ts

import { TimeMode, GlobalFilter } from './types';

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

export function defaultPeriodFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
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
