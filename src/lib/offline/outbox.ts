'use client';
// The outbox (#71 step 3, slice 2): what was saved on the phone with no signal, sent in order
// once there is one. Each entry carries the ID made on the phone, and the server returns what
// it already has for an ID it has seen, so sending twice never saves twice.
//
//   waiting   not sent yet (or the last try met no signal / a server hiccup)
//   refused   the server said no (its check failed): stays until opened and fixed, or discarded
//
// Kept in localStorage: small, survives closing the app, readable at once on load.
import { offlineAllowed } from './config';

export type OutboxKind = 'entry' | 'stamp' | 'action';   // action: slice 3, a button on Today
export interface OutboxItem {
  id: string;               // the phone's ID for the record / plan / stamp
  kind: OutboxKind;
  url: string;
  method: 'POST';
  body: any;
  label: string;            // what Home shows
  when: string;             // its start, "2026-11-11 9:30"
  at: number;               // when it was saved on the phone
  state: 'waiting' | 'refused';
  error?: string;
  problems?: string[];
  /** An action (slice 3): what it does, for Today to show it before it is sent.
   *  op start / onTime / nowDone on a plan (target), giving recordId; end on a record. */
  meta?: { op: 'start' | 'onTime' | 'nowDone' | 'end'; target: string; recordId?: string; at: any; item: any };
}

const KEY = 'fg-outbox-v1';
const EVENT = 'fg-outbox';

/** Saving to the outbox is on where offline is (the test site first); elsewhere a save
 *  with no signal fails as before. */
export const outboxOn = () => typeof window !== 'undefined' && offlineAllowed(location.hostname);

export function listOutbox(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}
/** Add, or replace the entry with the same ID (a refused one fixed, a stamp's note …). */
export function putOutbox(item: Omit<OutboxItem, 'at' | 'state'> & Partial<Pick<OutboxItem, 'at' | 'state'>>) {
  const items = listOutbox();
  const i = items.findIndex(x => x.id === item.id);
  const next: OutboxItem = { at: Date.now(), ...item, state: 'waiting', error: undefined, problems: undefined };
  if (i >= 0) items[i] = { ...next, at: items[i].at }; else items.push(next);
  write(items);
  void flushOutbox();
}
export function getOutbox(id: string) { return listOutbox().find(x => x.id === id) ?? null; }
export function updateOutbox(id: string, change: (x: OutboxItem) => OutboxItem) {
  write(listOutbox().map(x => (x.id === id ? change(x) : x)));
}
export function dropOutbox(id: string) { write(listOutbox().filter(x => x.id !== id)); }
export function onOutbox(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', fn); };
}

/** A failure that means "no signal" (or a very slow one): queue it, don't show an error. */
export const isNoSignal = (e: unknown) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError || (e as any)?.name === 'AbortError' || (e as any)?.name === 'TimeoutError';

/** fetch that gives up after `ms` (a weak signal: better queued than waiting forever). */
export async function fetchWithin(url: string, init: RequestInit, ms = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

let flushing = false;
export interface FlushResult { sent: number; refused: number; stopped: boolean }

/** Send what is waiting, oldest first. Stops at the first no-signal, server error or lost
 *  sign-in (the rest keep their order); a refusal is marked and the next one goes on. */
export async function flushOutbox(): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, refused: 0, stopped: false };
  if (flushing || typeof window === 'undefined' || navigator.onLine === false) return { ...out, stopped: true };
  flushing = true;
  try {
    for (const item of listOutbox()) {
      if (item.state !== 'waiting') continue;
      let r: Response;
      try {
        r = await fetchWithin(item.url, { method: item.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
      } catch {
        out.stopped = true; break;                 // no signal: try again later
      }
      // Signed out: the request was sent to the sign-in page. Keep everything.
      if (r.redirected || !(r.headers.get('content-type') ?? '').includes('application/json')) { out.stopped = true; break; }
      const b = await r.json().catch(() => ({}));
      if (r.ok) { dropOutbox(item.id); out.sent++; continue; }
      if (r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 429) { out.stopped = true; break; }
      updateOutbox(item.id, x => ({ ...x, state: 'refused', error: b.error ?? `HTTP ${r.status}`, problems: b.problems ?? [] }));
      out.refused++;
    }
  } finally {
    flushing = false;
  }
  if (out.sent || out.refused) window.dispatchEvent(new CustomEvent('fg-outbox-sent', { detail: out }));
  return out;
}
