// src/lib/insights/time-use.ts
//
// Time use (Hyoje, 27–28 Nov 2026; Design §15.12) — how the period's hours were
// spent: how many were recorded, and what the recorded hours went on.
//
// Rules (agreed 28 Nov):
//   • Left out: every activity whose name ends in "(기간)"; 음료 done 혼자 at
//     집 / 회사 / 사이트 / 2단지 (the Calendar's quiet-row rule, always applied,
//     whatever the Calendar switch says); records whose Relationship is 타인
//     (someone else's doing, not Hyoje's — 28 Nov); records with no end;
//     zero-length ones.
//   • Sleep switch (28 Nov): with 수면 off, the time any 수면 record covers is
//     taken out of the period as well — the figures are then of waking hours.
//   • Recorded = time covered by at least one record (overlaps not counted twice).
//   • Overlaps split evenly, moment by moment: 저녁 준비 18:00–19:00 with
//     공부 봐주기 18:30–19:15 → 45 min and 30 min.
//   • 평일 업무 and 휴일 근무 are BACKGROUND: whenever anything else runs, the
//     others take that time in full (sharing evenly among themselves) and the
//     work record gets none. What is left of the work record is "일상 업무".
//   • 식사 / 음료 / 음주 are split by EVERY cross activity, no exceptions
//     ("식사 · 업무", "식사 · 평시", "식사 · 여행" … — Hyoje, 28 Nov).
//   • Times: each record is cut to the period by its own wall clock, then the
//     pieces are laid on real time (datetime − offset) so records logged in
//     different zones only overlap when they really did. The current period
//     stops at the viewer's "now" (sent by the page as local wall clock).

import Log from '@/models/Log';
import { placeOf } from '@/lib/calendar/quietRows';

export const BACKGROUND_NAMES = new Set(['평일 업무', '휴일 근무']);
export const ROUTINE_WORK = '일상 업무';
const MEAL_WORDS = new Set(['식사', '음료', '음주']);
const SLEEP_NAME = '수면';
const QUIET_DRINK_PLACES = new Set(['집', '회사', '사이트', '2단지']);

export interface TimeUseItem { name: string; seconds: number }
export interface TimeUseCategory { category: string; seconds: number; items: TimeUseItem[] }
export interface TimeUseSummary {
  from: string;            // YYYY-MM-DD
  to: string;              // last day counted (today when the period runs to now)
  totalSeconds: number;    // the period's length up to now
  recordedSeconds: number; // covered by at least one record
  sleepSeconds: number;    // 수면 time taken out (0 when 수면 is in)
  days: number;            // totalSeconds / 86 400 (for "per day")
  records: number;         // records that added time
  categories: TimeUseCategory[];
}

/** One record, already filtered, as the calculation needs it. */
export interface TimeUseRecord {
  category: string;
  name: string;
  background: boolean;
  sleep: boolean;
  /** naive wall clock, ms (datetime as stored) */
  startWall: number;
  endWall: number;
  /** hours east of UTC at start / end */
  startOffset: number;
  endOffset: number;
}

// ── Labels and exclusions ───────────────────────────────────────────────────

export function isExcluded(doc: any): boolean {
  const name = String(doc.activity?.name ?? '').trim();
  if (name.endsWith('(기간)')) return true;
  if (String(doc.activity?.relationship ?? '').trim() === '타인') return true;
  if (name === '음료'
    && String(doc.activity?.relationship ?? '').trim() === '혼자'
    && QUIET_DRINK_PLACES.has(placeOf(doc.location?.activity))) return true;
  return false;
}

export function categoryLabel(doc: any): string {
  const category = String(doc.activity?.category ?? '').trim() || '기타';
  const name = String(doc.activity?.name ?? '').trim();
  if (!MEAL_WORDS.has(category) && !MEAL_WORDS.has(name)) return category;
  const cross = String(doc.activity?.crossActivity ?? '').trim() || '평시';
  return `${category} · ${cross}`;
}

export function toRecord(doc: any): TimeUseRecord | null {
  const s = doc.start?.datetime, e = doc.end?.datetime;
  if (!s || !e) return null;
  const startWall = new Date(s).getTime(), endWall = new Date(e).getTime();
  if (!Number.isFinite(startWall) || !Number.isFinite(endWall) || endWall <= startWall) return null;
  const name = String(doc.activity?.name ?? '').trim() || '기타';
  return {
    category: categoryLabel(doc),
    name,
    background: BACKGROUND_NAMES.has(name),
    sleep: name === SLEEP_NAME || String(doc.activity?.category ?? '').trim() === SLEEP_NAME,
    startWall, endWall,
    startOffset: Number(doc.start?.timezoneOffset) || 0,
    endOffset: Number(doc.end?.timezoneOffset ?? doc.start?.timezoneOffset) || 0,
  };
}

// ── The calculation (pure) ──────────────────────────────────────────────────

const H = 3_600_000;

/**
 * `fromWall` / `toWall`: the period as naive wall clock (ms), `toWall`
 * exclusive and already cut at now.
 */
export function computeTimeUse(
  records: TimeUseRecord[], fromWall: number, toWall: number, withSleep = true,
): Omit<TimeUseSummary, 'from' | 'to'> {
  const periodSeconds = Math.max(0, (toWall - fromWall) / 1000);
  let slept = 0;

  // Cut each record to the period by its own wall clock, then place it on
  // real time. The offset used at each cut edge is the one of the nearer end.
  interface Piece { r: number; s: number; e: number }
  const pieces: Piece[] = [];
  records.forEach((rec, r) => {
    const sw = Math.max(rec.startWall, fromWall), ew = Math.min(rec.endWall, toWall);
    if (ew <= sw) return;
    const s = sw - (sw === rec.startWall ? rec.startOffset : rec.endOffset) * H;
    const e = ew - (ew === rec.endWall ? rec.endOffset : rec.startOffset) * H;
    if (e > s) pieces.push({ r, s, e });
  });

  // Sweep: at every boundary the set of running records changes.
  const events: { t: number; r: number; d: 1 | -1 }[] = [];
  for (const p of pieces) { events.push({ t: p.s, r: p.r, d: 1 }, { t: p.e, r: p.r, d: -1 }); }
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  const share = new Map<string, Map<string, number>>();   // category → name → ms
  const give = (cat: string, name: string, ms: number) => {
    let m = share.get(cat); if (!m) { m = new Map(); share.set(cat, m); }
    m.set(name, (m.get(name) ?? 0) + ms);
  };
  const running = new Map<number, number>();   // record → how many of its pieces run (1)
  let covered = 0;
  const used = new Set<number>();
  let prev = events.length ? events[0].t : 0;

  for (const ev of events) {
    const len = ev.t - prev;
    if (len > 0 && running.size) {
      const active = [...running.keys()];
      // 수면 off: the time is taken out of the period, whatever else ran then.
      if (!withSleep && active.some(i => records[i].sleep)) {
        slept += len;
        prev = ev.t;
        const n0 = (running.get(ev.r) ?? 0) + ev.d;
        if (n0 > 0) running.set(ev.r, n0); else running.delete(ev.r);
        continue;
      }
      covered += len;
      const front = active.filter(i => !records[i].background);
      const takers = front.length ? front : active;
      const each = len / takers.length;
      for (const i of takers) {
        const rec = records[i];
        give(rec.category, rec.background ? ROUTINE_WORK : rec.name, each);
        used.add(i);
      }
    }
    prev = ev.t;
    const n = (running.get(ev.r) ?? 0) + ev.d;
    if (n > 0) running.set(ev.r, n); else running.delete(ev.r);
  }

  const categories: TimeUseCategory[] = [...share.entries()].map(([category, m]) => {
    const items = [...m.entries()].map(([name, ms]) => ({ name, seconds: ms / 1000 }))
      .filter(i => i.seconds > 0).sort((a, b) => b.seconds - a.seconds);
    return { category, seconds: items.reduce((t, i) => t + i.seconds, 0), items };
  }).filter(c => c.seconds > 0).sort((a, b) => b.seconds - a.seconds);

  return {
    totalSeconds: Math.max(0, periodSeconds - slept / 1000),
    recordedSeconds: covered / 1000,
    sleepSeconds: slept / 1000,
    // Per day stays per CALENDAR day, so a day's figures add up to the day's
    // hours without sleep.
    days: periodSeconds / 86_400,
    records: used.size,
    categories,
  };
}

// ── Fetch + period ──────────────────────────────────────────────────────────

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * `start` / `end`: the period from buildDateRange (naive, `end` = 23:59:59.999
 * of the last day). `nowWall`: the viewer's local wall clock as naive ms.
 */
export async function computeTimeUseSummary(
  userId: string, start: Date, end: Date, nowWall: number, crossActivities: string[],
  withSleep = true,
): Promise<TimeUseSummary> {
  const fromWall = start.getTime();
  const toWall = Math.min(end.getTime() + 1, nowWall);
  if (toWall <= fromWall) {
    return { from: ymd(fromWall), to: ymd(fromWall), totalSeconds: 0, recordedSeconds: 0, sleepSeconds: 0, days: 0, records: 0, categories: [] };
  }

  // Records that touch the period by wall clock (a day either side for zones).
  const filter: Record<string, unknown> = {
    userId,
    'start.datetime': { $lt: new Date(toWall + 86_400_000) },
    'end.datetime':   { $gt: new Date(fromWall - 86_400_000) },
  };
  if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
  const docs = await Log.find(filter, {
    'activity.category': 1, 'activity.name': 1, 'activity.relationship': 1, 'activity.crossActivity': 1,
    'location.activity': 1,
    'start.datetime': 1, 'start.timezoneOffset': 1, 'end.datetime': 1, 'end.timezoneOffset': 1,
  }).lean();

  const records = (docs as any[]).filter(d => !isExcluded(d)).map(toRecord)
    .filter((r): r is TimeUseRecord => r !== null);
  const result = computeTimeUse(records, fromWall, toWall, withSleep);
  return { from: ymd(fromWall), to: ymd(toWall - 1), ...result };
}
