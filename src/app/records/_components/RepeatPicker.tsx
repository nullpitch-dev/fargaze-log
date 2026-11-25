'use client';
// src/app/records/_components/RepeatPicker.tsx
//
// Repeats as Google Calendar does them (Hyoje, 24 Nov): "Does not repeat ▾" under Start /
// End on the New form and a plan's form. The choices follow the start date —
//   Daily · Weekly on Tuesday · Monthly on day 24 · Monthly on the fourth Tuesday (or the
//   last) · Annually on 24 November · Every weekday (Mon–Fri) · Custom…
// Custom…: Repeat every N day / week / month / year; weekday chips (week); day N or the
// Nth weekday (month); Ends never / on a date / after N times.
// Things Google doesn't have: "Count as done" — its plans become records by themselves
// once their end has passed (the rule's mode 'auto'); yearly on a lunar date — 음력 (25 Nov:
// birthdays, 제사, 설, 추석); monthly on day N moved off a weekend — the Friday before or
// the Monday after (25 Nov: salary, phone bill).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '@/app/_components/useBackToClose';
import { inputCls } from './fields';
import { lunarOf, lunarText } from '@/lib/entry/lunar';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Schedule {
  freq: Freq;
  interval: number;
  weekdays: number[] | null;        // weekly: 0 = Sunday … 6
  monthDay: number | null;          // monthly by day
  monthWeek: number | null;         // monthly by weekday: 1–4, -1 = last
  monthWeekday: number | null;
  monthShift: 'before' | 'after' | null;   // monthly by day: off a weekend
  lunar: boolean;                   // yearly on a lunar date
  lunarMonth: number | null;
  lunarDay: number | null;
  until: string | null;             // last date
  count: number | null;             // or after N times
  mode: 'ask' | 'auto';
}

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NTH = ['', 'first', 'second', 'third', 'fourth'];

const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d, wd, nth: Math.ceil(d / 7), isLast: d + 7 > last };
};

const base = (freq: Freq): Schedule => ({ freq, interval: 1, weekdays: null, monthDay: null, monthWeek: null, monthWeekday: null, monthShift: null, lunar: false, lunarMonth: null, lunarDay: null, until: null, count: null, mode: 'ask' });
const SHIFT_TEXT = { before: 'or the Friday before at a weekend', after: 'or the Monday after at a weekend' } as const;

/** Google's list for this start date. */
export function presets(date: string): { label: string; s: Schedule }[] {
  if (!date) return [];
  const p = parts(date);
  const out: { label: string; s: Schedule }[] = [
    { label: 'Daily', s: base('daily') },
    { label: `Weekly on ${DAY[p.wd]}`, s: { ...base('weekly'), weekdays: [p.wd] } },
    { label: `Monthly on day ${p.d}`, s: { ...base('monthly'), monthDay: p.d } },
  ];
  if (p.nth <= 4) out.push({ label: `Monthly on the ${NTH[p.nth]} ${DAY[p.wd]}`, s: { ...base('monthly'), monthWeek: p.nth, monthWeekday: p.wd } });
  if (p.isLast) out.push({ label: `Monthly on the last ${DAY[p.wd]}`, s: { ...base('monthly'), monthWeek: -1, monthWeekday: p.wd } });
  out.push({ label: `Annually on ${p.d} ${MONTH[p.m - 1]}`, s: base('yearly') });
  const l = lunarOf(date);
  if (l && !l.leap) out.push({ label: `Annually on ${lunarText(l.month, l.day)}`, s: { ...base('yearly'), lunar: true, lunarMonth: l.month, lunarDay: l.day } });
  out.push({ label: 'Every weekday (Monday to Friday)', s: { ...base('weekly'), weekdays: [1, 2, 3, 4, 5] } });
  return out;
}

const plural = (n: number, w: string) => (n === 1 ? w : `${n} ${w}s`);
const dateText = (d: string) => { const p = parts(d); return `${p.d} ${MONTH[p.m - 1].slice(0, 3)} ${p.y}`; };

/** "Weekly on Tue, Thu, until 31 Dec 2026" — what the button shows. */
export function describe(s: Schedule | null, date: string): string {
  if (!s) return 'Does not repeat';
  const p = date ? parts(date) : null;
  const n = s.interval || 1;
  let t: string;
  if (s.freq === 'daily') t = n === 1 ? 'Daily' : `Every ${n} days`;
  else if (s.freq === 'weekly') {
    const days = [...(s.weekdays?.length ? s.weekdays : p ? [p.wd] : [])].sort();
    if (n === 1 && days.join() === '1,2,3,4,5') t = 'Every weekday (Mon–Fri)';
    else t = `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${days.length === 1 ? DAY[days[0]] : days.map(d => DAY3[d]).join(', ')}`;
  } else if (s.freq === 'monthly') {
    const on = s.monthWeek != null && s.monthWeekday != null
      ? `the ${s.monthWeek === -1 ? 'last' : NTH[s.monthWeek]} ${DAY[s.monthWeekday]}`
      : `day ${s.monthDay ?? p?.d ?? ''}${s.monthShift ? `, ${SHIFT_TEXT[s.monthShift]}` : ''}`;
    t = `${n === 1 ? 'Monthly' : `Every ${n} months`} on ${on}`;
  } else if (s.lunar && s.lunarMonth && s.lunarDay) t = `${n === 1 ? 'Annually' : `Every ${n} years`} on ${lunarText(s.lunarMonth, s.lunarDay)}`;
  else t = `${n === 1 ? 'Annually' : `Every ${n} years`}${p ? ` on ${p.d} ${MONTH[p.m - 1]}` : ''}`;
  if (s.until) t += `, until ${dateText(s.until)}`;
  else if (s.count) t += `, ${plural(s.count, 'time')}`;
  return t;
}

/** The same schedule? (decides whether "This event" can be offered: Google only offers
 *  "This and following" / "All events" once the repeat itself changed). */
export function sameSchedule(a: Schedule | null, b: Schedule | null): boolean {
  const k = (s: Schedule | null) => s ? JSON.stringify([s.freq, s.interval, [...(s.weekdays ?? [])].sort(), s.monthDay, s.monthWeek, s.monthWeekday, s.monthShift ?? null, !!s.lunar, s.lunar ? s.lunarMonth : null, s.lunar ? s.lunarDay : null, s.until, s.count]) : '';
  return k(a) === k(b);
}

/** A stored rule → the form's schedule. */
export function scheduleOf(rule: any): Schedule | null {
  if (!rule) return null;
  return {
    freq: rule.freq, interval: rule.interval ?? 1, weekdays: rule.weekdays ?? null, monthDay: rule.monthDay ?? null,
    monthWeek: rule.monthWeek ?? null, monthWeekday: rule.monthWeekday ?? null, monthShift: rule.monthShift ?? null,
    lunar: !!rule.lunar, lunarMonth: rule.lunarMonth ?? null, lunarDay: rule.lunarDay ?? null, until: rule.until ?? null, count: rule.count ?? null,
    mode: rule.mode === 'auto' ? 'auto' : 'ask',
  };
}

// ── The field ────────────────────────────────────────────────────────────────

export function RepeatField({ value, onChange, date, disabled }: {
  value: Schedule | null; onChange: (s: Schedule | null) => void; date: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" disabled={disabled || !date} onClick={() => setOpen(true)}
        className="self-start flex items-center gap-1.5 rounded border border-stone-300 dark:border-zinc-600 px-2 py-1 text-sm text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800 disabled:opacity-50">
        <span aria-hidden>↻</span>{describe(value, date)}<span className="text-[9px] text-stone-400 dark:text-zinc-500">▼</span>
      </button>
      {value && (
        <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-zinc-300">
          <input type="checkbox" checked={value.mode === 'auto'} onChange={e => onChange({ ...value, mode: e.target.checked ? 'auto' : 'ask' })} />
          Count as done — each one becomes a record once its end has passed
        </label>
      )}
      {open && <RepeatSheet value={value} date={date} onPick={s => onChange(s && value ? { ...s, mode: value.mode } : s)} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RepeatSheet({ value, date, onPick, onClose }: { value: Schedule | null; date: string; onPick: (s: Schedule | null) => void; onClose: () => void }) {
  const dismiss = useBackToClose(onClose);
  const list = presets(date);
  const [custom, setCustom] = useState<Schedule | null>(null);
  const [ends, setEnds] = useState<'never' | 'on' | 'after'>(value?.until ? 'on' : value?.count ? 'after' : 'never');
  const p = parts(date);
  const lun = lunarOf(date);
  const pick = (s: Schedule | null) => dismiss(() => onPick(s));
  const row = (on: boolean) => `w-full text-left rounded-lg px-3 py-2.5 text-sm ${on ? 'bg-stone-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800'}`;
  const chip = (on: boolean) => `w-8 h-8 rounded-full text-xs font-medium ${on ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-300'}`;
  const c = custom;
  const setC = (x: Partial<Schedule>) => setCustom(s => s ? { ...s, ...x } : s);
  const startCustom = () => {
    const from = value ?? { ...base('weekly'), weekdays: [p.wd] };
    setCustom({
      ...from, monthDay: from.freq === 'monthly' && from.monthWeek == null ? (from.monthDay ?? p.d) : from.monthDay,
      lunarMonth: from.lunarMonth ?? (lun && !lun.leap ? lun.month : null), lunarDay: from.lunarDay ?? (lun && !lun.leap ? lun.day : null),
    });
  };
  const done = () => {
    if (!c) return;
    const s: Schedule = { ...c, until: ends === 'on' ? (c.until || null) : null, count: ends === 'after' ? (c.count || 1) : null };
    if (s.freq === 'weekly' && !s.weekdays?.length) s.weekdays = [p.wd];
    if (s.freq === 'monthly' && s.monthWeek == null && !s.monthDay) s.monthDay = p.d;
    if (s.freq !== 'weekly') s.weekdays = null;
    if (s.freq !== 'monthly') { s.monthDay = null; s.monthWeek = null; s.monthWeekday = null; }
    if (s.freq !== 'monthly' || s.monthWeek != null) s.monthShift = null;
    if (s.freq !== 'yearly' || !s.lunar || !s.lunarMonth || !s.lunarDay) { s.lunar = false; s.lunarMonth = null; s.lunarDay = null; }
    pick(s);
  };
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => dismiss()}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 shadow-xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stone-300 dark:bg-zinc-600 sm:hidden" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {!c ? (
            <div className="flex flex-col">
              <button type="button" className={row(!value)} onClick={() => pick(null)}>Does not repeat</button>
              {list.map(o => (
                <button type="button" key={o.label} className={row(sameSchedule(value, o.s))} onClick={() => pick(o.s)}>{o.label}</button>
              ))}
              <button type="button" className={row(!!value && !list.some(o => sameSchedule(value, o.s)))} onClick={startCustom}>Custom…</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-1 text-sm text-stone-700 dark:text-zinc-200">
              <h3 className="font-semibold">Custom recurrence</h3>
              <div className="flex items-center gap-2">
                <span>Repeat every</span>
                <input type="number" min={1} max={52} value={c.interval} onChange={e => setC({ interval: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })}
                  className={`${inputCls} !w-16`} />
                <select value={c.freq} onChange={e => setC({ freq: e.target.value as Freq })} className={`${inputCls} !w-auto`}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as Freq[]).map(f => (
                    <option key={f} value={f}>{({ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const)[f]}{c.interval > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              {c.freq === 'weekly' && (
                <div className="flex flex-col gap-1.5">
                  <span>Repeat on</span>
                  <div className="flex gap-1.5">
                    {DAY1.map((l, d) => {
                      const on = (c.weekdays?.length ? c.weekdays : [p.wd]).includes(d);
                      return <button type="button" key={d} aria-label={DAY[d]} aria-pressed={on} className={chip(on)}
                        onClick={() => { const cur = c.weekdays?.length ? c.weekdays : [p.wd]; const next = on ? cur.filter(x => x !== d) : [...cur, d]; setC({ weekdays: next.length ? next : cur }); }}>{l}</button>;
                    })}
                  </div>
                </div>
              )}
              {c.freq === 'monthly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2"><input type="radio" checked={c.monthWeek == null} onChange={() => setC({ monthWeek: null, monthWeekday: null, monthDay: c.monthDay ?? p.d })} />Monthly on day
                    <input type="number" min={1} max={31} value={c.monthDay ?? p.d} aria-label="Day of the month"
                      onChange={e => setC({ monthWeek: null, monthWeekday: null, monthDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                      className={`${inputCls} !w-16`} /></label>
                  {c.monthWeek == null && (
                    <label className="flex items-center gap-2 pl-6">At a weekend
                      <select value={c.monthShift ?? ''} onChange={e => setC({ monthShift: (e.target.value || null) as Schedule['monthShift'] })} className={`${inputCls} !w-auto`}>
                        <option value="">keep the day</option>
                        <option value="before">the Friday before</option>
                        <option value="after">the Monday after</option>
                      </select></label>
                  )}
                  {p.nth <= 4 && <label className="flex items-center gap-2"><input type="radio" checked={c.monthWeek === p.nth} onChange={() => setC({ monthWeek: p.nth, monthWeekday: p.wd, monthDay: null })} />Monthly on the {NTH[p.nth]} {DAY[p.wd]}</label>}
                  {p.isLast && <label className="flex items-center gap-2"><input type="radio" checked={c.monthWeek === -1} onChange={() => setC({ monthWeek: -1, monthWeekday: p.wd, monthDay: null })} />Monthly on the last {DAY[p.wd]}</label>}
                </div>
              )}
              {c.freq === 'yearly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2"><input type="radio" checked={!c.lunar} onChange={() => setC({ lunar: false })} />On {p.d} {MONTH[p.m - 1]}</label>
                  {lun && (
                    <label className="flex items-center gap-2 flex-wrap"><input type="radio" checked={c.lunar} onChange={() => setC({ lunar: true })} />On 음력
                      <input type="number" min={1} max={12} value={c.lunarMonth ?? ''} aria-label="Lunar month"
                        onChange={e => setC({ lunar: true, lunarMonth: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} className={`${inputCls} !w-14`} />월
                      <input type="number" min={1} max={30} value={c.lunarDay ?? ''} aria-label="Lunar day"
                        onChange={e => setC({ lunar: true, lunarDay: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} className={`${inputCls} !w-14`} />일</label>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <span>Ends</span>
                <label className="flex items-center gap-2"><input type="radio" checked={ends === 'never'} onChange={() => setEnds('never')} />Never</label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={ends === 'on'} onChange={() => setEnds('on')} />On
                  <input type="date" value={c.until ?? ''} min={date} disabled={ends !== 'on'} onChange={e => setC({ until: e.target.value || null })} className={`${inputCls} !w-auto`} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={ends === 'after'} onChange={() => setEnds('after')} />After
                  <input type="number" min={1} value={c.count ?? 10} disabled={ends !== 'after'} onChange={e => setC({ count: Math.max(1, Number(e.target.value) || 1) })} className={`${inputCls} !w-16`} />
                  times
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-stone-200 dark:border-zinc-700 flex">
          <button type="button" onClick={() => (c ? setCustom(null) : dismiss())} className="flex-1 py-3 text-sm font-medium text-stone-600 dark:text-zinc-300">{c ? 'Back' : 'Cancel'}</button>
          {c && <button type="button" onClick={done} disabled={ends === 'on' && !c.until} className="flex-1 py-3 text-sm font-semibold text-blue-600 dark:text-blue-400 border-l border-stone-200 dark:border-zinc-700 disabled:opacity-40">Done</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Google's "Edit / Delete recurring event" question. */
export function ScopeDialog({ title, withOne, onPick, onClose }: {
  title: string; withOne: boolean; onPick: (scope: 'one' | 'following' | 'all') => void; onClose: () => void;
}) {
  const dismiss = useBackToClose(onClose);
  const [scope, setScope] = useState<'one' | 'following' | 'all'>(withOne ? 'one' : 'following');
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => dismiss()}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title}
        className="w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 shadow-xl p-5 flex flex-col gap-3 text-sm text-stone-700 dark:text-zinc-200">
        <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-50">{title}</h3>
        {withOne && <label className="flex items-center gap-2"><input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />This event</label>}
        <label className="flex items-center gap-2"><input type="radio" checked={scope === 'following'} onChange={() => setScope('following')} />This and following events</label>
        <label className="flex items-center gap-2"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />All events</label>
        <div className="flex justify-end gap-4 pt-1">
          <button type="button" onClick={() => dismiss()} className="text-stone-500 dark:text-zinc-400">Cancel</button>
          <button type="button" onClick={() => dismiss(() => onPick(scope))} className="font-semibold text-blue-600 dark:text-blue-400">OK</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
