// src/lib/entry/lunar.ts — Korean lunar dates (음력), for repeats on a lunar date (Hyoje,
// 25 Nov 2026: parents' birthdays, 제사, 설, 추석). Server and browser alike.
//
// No table of our own: the Korean lunar calendar ('dangi') is built into Intl (ICU) in Node
// and in every current browser. Checked against 설 and 추석 2025–2027 and the leap months of
// 2020 (윤4월) and 2023 (윤2월).
//
// The rule for a repeat (as Korean calendars do it):
//   · a leap month (윤달) doesn't count — 음력 4월 15일 is in the ordinary 4월 only;
//   · day 30 in a year whose month has only 29 days falls on the 29th (그믐).

export interface LunarDate { year: number; month: number; day: number; leap: boolean }

const fmt = (() => {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-dangi', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    return f.resolvedOptions().calendar === 'dangi' ? f : null;
  } catch { return null; }
})();

/** Is the lunar calendar available here? (A browser without it shows no lunar choice.) */
export const lunarSupported = (): boolean => fmt !== null;

/** 'YYYY-MM-DD' (a plain date) → its lunar date, or null when unavailable. */
export function lunarOf(date: string): LunarDate | null {
  if (!fmt) return null;
  const parts = fmt.formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (t: string) => parts.find(p => p.type === t)?.value;
  const m = get('month'), d = get('day'), y = get('relatedYear') ?? get('year');
  if (!m || !d || !y) return null;
  const month = parseInt(m, 10), day = parseInt(d, 10), year = parseInt(y, 10);
  if (!month || !day || !year) return null;
  return { year, month, day, leap: /bis|leap/i.test(m) };
}

/** Does `date` hold the lunar month / day (ordinary month; day 30 → the 29th when there is no 30th)? */
export function isLunarDay(date: string, month: number, day: number, next: (d: string) => string): boolean {
  const l = lunarOf(date);
  if (!l || l.leap || l.month !== month) return false;
  if (l.day === day) return true;
  return day === 30 && l.day === 29 && lunarOf(next(date))?.day === 1;
}

/** '음력 3월 15일' */
export const lunarText = (month: number, day: number) => `음력 ${month}월 ${day}일`;
