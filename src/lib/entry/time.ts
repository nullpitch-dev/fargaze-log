// Time for the entry app (#71). Pure: runs on the server and on the phone.
//
// A record point keeps the local wall clock as a naive Date (start.datetime) plus the
// offset of its zone code; the true moment is datetime − offset hours. All-day points
// have no datetime: their moment is the start of the local day.

export interface ZoneRow { code: string; offsetUTC: number; ianaTimezone: string }

const pad = (x: number) => String(x).padStart(2, '0');

/** The moment a stored point stands for, in ms; null when it has no date. */
export function instantOf(p: any): number | null {
  if (!p) return null;
  const offset = typeof p.timezoneOffset === 'number' ? p.timezoneOffset : 0;
  if (p.datetime) return new Date(p.datetime).getTime() - offset * 3_600_000;
  if (p.year && p.month && p.day) return Date.UTC(p.year, p.month - 1, p.day) - offset * 3_600_000;
  return null;
}

/** The offset (hours) of an IANA zone at a moment. */
export function offsetAt(iana: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: iana, timeZoneName: 'longOffset' }).formatToParts(new Date(ms));
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tz);
  if (!m) return 0;
  const h = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
  return m[1] === '-' ? -h : h;
}

/** The offset of an IANA zone at a local wall-clock time. */
export function offsetAtLocal(iana: string, date: string, hour: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (hour || '0:00').split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  const first = offsetAt(iana, naive);
  return offsetAt(iana, naive - first * 3_600_000);
}

/** The zone code for an IANA zone on a day: the list row with that zone and that day's offset. */
export function zoneCodeFor(iana: string, date: string, hour: string, zones: ZoneRow[]): string | null {
  const off = offsetAtLocal(iana, date, hour);
  const same = zones.filter(z => z.ianaTimezone === iana);
  return (same.find(z => z.offsetUTC === off) ?? zones.find(z => z.offsetUTC === off && same.length === 0))?.code ?? null;
}

/** The local date and time now in an IANA zone: { date 'YYYY-MM-DD', hour 'H:mm' }. */
export function localNow(iana: string, ms = Date.now()): { date: string; hour: string } {
  const local = new Date(ms + offsetAt(iana, ms) * 3_600_000);
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    hour: `${local.getUTCHours()}:${pad(local.getUTCMinutes())}`,
  };
}

/** A local date and time moved by some minutes (wall clock). */
export function addMinutes(date: string, hour: string, minutes: number): { date: string; hour: string } {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (hour || '0:00').split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h || 0, (mi || 0) + minutes));
  return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, hour: `${t.getUTCHours()}:${pad(t.getUTCMinutes())}` };
}

/** Days between two 'YYYY-MM-DD' dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
