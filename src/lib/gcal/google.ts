// Google Calendar sync (Design §15.9): the Calendar API calls. Server only.
//
// The app writes as the service account the export uses (no Google sign-in): each calendar
// is shared with it ("Make changes to events"). Settings:
//   GCAL_FAMILY_ID                the Family calendar's ID (Google Calendar → its settings →
//                                 Integrate calendar → Calendar ID)
//   GOOGLE_SERVICE_ACCOUNT_JSON   the whole key file (Vercel), or
//   GOOGLE_SERVICE_ACCOUNT_FILE   its name in myfiles/ (scripts, local)
// A calendar with no ID set is simply not synced (test.log).

import path from 'path';
// The Calendar part of googleapis only (26 Nov): importing the whole library added ~340 MB to
// the type check, and `next build` ran out of memory on the WSL machine.
import { calendar as calendarApi, auth as gauth, type calendar_v3 } from 'googleapis/build/src/apis/calendar';
import type { GEvent } from './event';

export { calendarIdOf, syncConfigured } from './config';

function credentials(): { credentials?: any; keyFile?: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try { return { credentials: JSON.parse(json) }; } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  }
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  return file ? { keyFile: path.join(process.cwd(), 'myfiles', file) } : null;
}


let api: calendar_v3.Calendar | null = null;
async function client(): Promise<calendar_v3.Calendar> {
  if (api) return api;
  const c = credentials();
  if (!c) throw new Error('No service account key (GOOGLE_SERVICE_ACCOUNT_JSON)');
  const auth = new gauth.GoogleAuth({ ...c, scopes: ['https://www.googleapis.com/auth/calendar.events'] });
  api = calendarApi({ version: 'v3', auth: (await auth.getClient()) as any });
  return api;
}

const codeOf = (e: any): number => Number(e?.code ?? e?.response?.status ?? 0);
export const isGone = (e: any) => [404, 410].includes(codeOf(e));

/** One call; busy answers (429, 5xx, rate limits) are tried twice more after a short wait. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e: any) {
      const code = codeOf(e);
      const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason ?? '';
      const busy = code === 429 || code >= 500 || (code === 403 && /rateLimit/i.test(reason));
      if (busy && attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); continue; }
      throw e;
    }
  }
}

export const errorText = (e: any) => {
  const code = codeOf(e);
  const msg = e?.response?.data?.error?.message ?? e?.errors?.[0]?.message ?? e?.message ?? String(e);
  return `${code || ''} ${msg}`.trim().slice(0, 300);
};

const body = (ev: GEvent, docId: string): calendar_v3.Schema$Event => ({
  summary: ev.summary,
  location: ev.location,
  description: ev.description,
  // Both forms named, the unused one null: a patch from timed to all-day (or back) clears the other.
  start: { dateTime: ev.start.dateTime ?? null, date: ev.start.date ?? null, timeZone: ev.start.timeZone ?? null },
  end: { dateTime: ev.end.dateTime ?? null, date: ev.end.date ?? null, timeZone: ev.end.timeZone ?? null },
  status: 'confirmed',
  extendedProperties: { private: { fargazeId: docId } },
});

export async function insertEvent(calendarId: string, ev: GEvent, docId: string): Promise<string> {
  const c = await client();
  const res = await call(() => c.events.insert({ calendarId, requestBody: body(ev, docId), sendUpdates: 'none' }));
  if (!res.data.id) throw new Error('Google gave no event id');
  return res.data.id;
}

/** Updates an event in place (an old Apps Script event too). 404 / 410 → throws; see isGone. */
export async function patchEvent(calendarId: string, eventId: string, ev: GEvent, docId: string): Promise<void> {
  const c = await client();
  await call(() => c.events.patch({ calendarId, eventId, requestBody: body(ev, docId), sendUpdates: 'none' }));
}

/** Removes an event; one already gone is fine. */
export async function removeEvent(calendarId: string, eventId: string): Promise<void> {
  const c = await client();
  try { await call(() => c.events.delete({ calendarId, eventId, sendUpdates: 'none' })); }
  catch (e) { if (!isGone(e)) throw e; }
}

/** For the check script: can the service account see the calendar? */
export async function canReach(calendarId: string): Promise<string> {
  const c = await client();
  const res = await call(() => c.events.list({ calendarId, maxResults: 1, singleEvents: true }));
  return `ok (${res.data.summary ?? 'calendar'}, time zone ${res.data.timeZone ?? '?'})`;
}
