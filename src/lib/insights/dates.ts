// src/lib/insights/dates.ts
// Shared date / period helpers for the insights API (extracted from route.ts).

export const SLEEP_THRESHOLD_HOUR = 6;

export function hourStringToMinutes(hourStr: string | null | undefined): number | null {
  if (!hourStr) return null;
  const [hPart, mPart] = hourStr.split(':');
  const h = parseInt(hPart);
  const m = parseInt(mPart ?? '0');
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function assignSleepDate(startDatetime: Date, startHour: string | null | undefined): Date {
  const mins = hourStringToMinutes(startHour);
  if (mins !== null && mins < SLEEP_THRESHOLD_HOUR * 60) {
    const d = new Date(startDatetime);
    d.setDate(d.getDate() - 1);
    return d;
  }
  return startDatetime;
}

export function buildDateRange(
  timeMode: string,
  timePeriod: string | null,
  dateFrom: string | null,
  dateTo: string | null,
): { start: Date; end: Date } {
  if (timeMode === 'period' && dateFrom && dateTo) {
    return {
      start: new Date(`${dateFrom}T00:00:00.000Z`),
      end:   new Date(`${dateTo}T23:59:59.999Z`),
    };
  }
  if (timeMode === 'month' && timePeriod) {
    const [y, m] = timePeriod.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end   = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { start, end };
  }
  if (timeMode === 'week' && timePeriod) {
    const [yearStr, weekStr] = timePeriod.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }
  if (timeMode === 'day' && timePeriod) {
    return {
      start: new Date(`${timePeriod}T00:00:00.000Z`),
      end:   new Date(`${timePeriod}T23:59:59.999Z`),
    };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export function stepBack(
  timeMode: string,
  timePeriod: string,
  steps: number,
): string {
  if (timeMode === 'month') {
    const [y, m] = timePeriod.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - steps, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (timeMode === 'week') {
    const [yearStr, weekStr] = timePeriod.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
    monday.setUTCDate(monday.getUTCDate() - steps * 7);
    // Recalculate ISO week number using jan4 of the result year
    const resultYear = monday.getUTCFullYear();
    const jan4Result = new Date(Date.UTC(resultYear, 0, 4));
    const dow4Result = jan4Result.getUTCDay() || 7;
    const week1Monday = new Date(jan4Result);
    week1Monday.setUTCDate(jan4Result.getUTCDate() - (dow4Result - 1));
    const diffDaysVal = Math.round((monday.getTime() - week1Monday.getTime()) / 86400000);
    const resultWeek = Math.floor(diffDaysVal / 7) + 1;
    return `${resultYear}-W${String(resultWeek).padStart(2, '0')}`;
  }
  if (timeMode === 'day') {
    const d = new Date(`${timePeriod}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - steps);
    return d.toISOString().slice(0, 10);
  }
  return timePeriod;
}

export function labelForPeriod(timeMode: string, period: string): string {
  if (timeMode === 'month') {
    const [y, m] = period.split('-');
    return `${y.slice(2)}/${m}`;
  }
  if (timeMode === 'week') return period.replace('-W', 'W');
  if (timeMode === 'day') return period.slice(5);
  return period;
}

export function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Difference in calendar days between two YYYY-MM-DD strings (a - b)
export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00.000Z`).getTime() -
      new Date(`${b}T00:00:00.000Z`).getTime()) /
      86400000,
  );
}

/**
 * Given a log document's start.datetime and start.hour,
 * returns the YYYY-MM-DD string this record belongs to.
 * Records between 00:00–05:59 are attributed to the previous calendar day.
 */
export function assignDrinkingDate(datetime: Date, hourStr: string | null | undefined): string {
  const mins = hourStringToMinutes(hourStr);
  const d = new Date(datetime);
  if (mins !== null && mins < SLEEP_THRESHOLD_HOUR * 60) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

export function currentPeriod(timeMode: string): string {
  const now = new Date();
  if (timeMode === 'month') {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (timeMode === 'week') {
    // ISO week: find Monday of W01 (Monday on or before Jan 4)
    const year    = now.getUTCFullYear();
    const jan4    = new Date(Date.UTC(year, 0, 4));
    const dow4    = jan4.getUTCDay() || 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - (dow4 - 1));
    // Find this week's Monday
    const dow     = now.getUTCDay() || 7;
    const thisMon = new Date(now);
    thisMon.setUTCDate(now.getUTCDate() - (dow - 1));
    thisMon.setUTCHours(0, 0, 0, 0);
    const diff    = Math.round((thisMon.getTime() - week1Mon.getTime()) / 86400000);
    const week    = Math.floor(diff / 7) + 1;
    const resultYear = thisMon.getUTCFullYear();
    // Handle year boundary — if week < 1, it belongs to previous year's last week
    if (week < 1) {
      return stepBack('week', `${resultYear + 1}-W01`, 1);
    }
    return `${resultYear}-W${String(week).padStart(2, '0')}`;
  }
  return now.toISOString().slice(0, 10);
}
