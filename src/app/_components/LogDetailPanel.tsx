'use client';
// src/app/_components/LogDetailPanel.tsx
//
// The record detail pane, shared by Search and Calendar (WBS #59). Moved out
// of search/page.tsx unchanged, except that it now renders through a portal
// one layer ABOVE ModalShell (z-60), so it can open from the Calendar's day
// pop-up. Search looks and behaves exactly as before.
// (5 Nov, #70 step 3) English labels — the app is meant to be global; the data stays
// as written — and an Edit button that opens the record's edit page (/records/<id>), plus Copy
// (13 Nov) that opens a new entry copied from it (/entry/new?copy=<id>).

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useBackToClose } from './useBackToClose';

export interface LogEntry {
  _id: string;
  score?: number;
  allDay?: boolean;
  activity?: { category?: string; name?: string; title?: string; additionalInfo?: string; crossActivity?: string; relationship?: string };
  start?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string; timezoneOffset?: number };
  end?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string };
  /** Plans (log_plan) and records still going: when it is planned to end (#71). */
  plannedEnd?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string };
  /** A plan, not a record: read-only here too; Edit opens the plan in the entry app (Hyoje, 11 Nov). */
  plan?: boolean;
  duration?: { totalSeconds?: number };
  location?: { activity?: string; online?: string; other?: string };
  cost?: { amountKRW?: number; amountForeign?: number; currency?: string; categoryDetail?: string; category?: string };
  purchase?: Array<{ item?: string; amount?: string; unit?: string }>;
  food?: {
    type?: string; carbs?: string; fat?: string; spiciness?: string;
		drinks?: Array<{ item?: string; amount?: string; unit?: string; note?: string; ingredients?: string[] }>;
    foods?: Array<{ item?: string; amount?: string; unit?: string; note?: string; ingredients?: string[] }>;
    alcohols?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
  };
  people?: Array<{ method?: string; category?: string; target?: string }>;
  transport?: { from?: string; to?: string; purpose?: string; method?: string; returnType?: string };
	bowel?: { amount?: string; quality?: string[]; characteristics?: string[] };
  body?: { weight?: number; muscleMass?: number; bodyFat?: number; bodyFatPercent?: number };
  sleep?: { quality?: string };
  exercise?: Array<{ item?: string; amount?: number; unit?: string; loadKg?: number; setStyle?: string }>;
  reading?: { title?: string };
  movie?: { title?: string };
  golf?: { score?: number; approach?: number; putts?: number };
  income?: { gross?: number; net?: number };
  travel?: { city?: string; theme?: string };
  notes?: string;
  createdAt?: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatDate(d?: { year?: number; month?: number; day?: number }): string {
  if (!d?.year) return '—';
  const yy = String(d.year).slice(2);
  const mm = String(d.month ?? 1).padStart(2, '0');
  const dd = String(d.day ?? 1).padStart(2, '0');
  return "'" + yy + '.' + mm + '.' + dd;
}

export function formatDatetime(entry: LogEntry): string {
  const date = formatDate(entry.start);
  if (entry.allDay) return date + ' all day';
  const hour = entry.start?.hour;
  if (!hour) return date;
  return date + ' ' + hour;
}

export function formatTime(entry: LogEntry): string {
  if (entry.allDay) return 'All day';
  const start = entry.start?.hour ?? '';
  const end = entry.end?.hour ?? '';
  if (!start) return '—';
  return end ? `${start} → ${end}` : start;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '—';
  if (seconds === 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  return parts.join(' ') || '0m';
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

/**
 * Amounts arrive as strings straight from the sheet, and the plus-split rule
 * DIVIDES them: "10" shared across three items is stored as
 * "3.3333333333333335". Two decimals covers every unit in use (0.25 cup stays
 * 0.25) and trailing zeros go, so "2.00" prints as "2".
 *
 * A value that is not a number at all is passed through untouched — some
 * amount fields carry text.
 */
export function formatAmount(v?: string | number | null): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return String(v);
  return String(Math.round(n * 100) / 100);
}

/** Body measurements follow the Weight widget: one decimal. */
export function formatKg(v?: number | null): string | undefined {
  return v === null || v === undefined ? undefined : `${v.toFixed(1)} kg`;
}

/**
 * bodyFatPercent is stored as a PERCENT — 21.265 means 21.3% — corrected in
 * design doc v4.1. This panel multiplied by 100 and printed 2126.5%. The
 * documented consumer rule is the guard below: a value under 1 is the old
 * decimal form and still needs scaling.
 */
export function formatBodyFatPercent(v?: number | null): string | undefined {
  if (v === null || v === undefined) return undefined;
  return `${(v < 1 ? v * 100 : v).toFixed(1)}%`;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-2 border-b border-stone-100 dark:border-zinc-800 last:border-0">
      <span className="text-xs text-stone-500 dark:text-zinc-300 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-stone-700 dark:text-zinc-200 flex-1 break-words">{String(value)}</span>
    </div>
  );
}

// Stored weekdays are Korean ('일'–'토'); the pane shows them in English.
const WEEKDAY_EN: Record<string, string> = { '일': 'Sun', '월': 'Mon', '화': 'Tue', '수': 'Wed', '목': 'Thu', '금': 'Fri', '토': 'Sat' };
const weekdayEn = (w?: string) => (w ? WEEKDAY_EN[w] ?? w : '');
const pointText = (p: LogEntry['start']) => `${formatDate(p)}${p?.weekday ? ` (${weekdayEn(p.weekday)})` : ''}${p?.hour ? ` ${p.hour}` : ''}${p?.timezone ? ` ${p.timezone}` : ''}`;

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs text-stone-500 dark:text-zinc-300 uppercase tracking-widest mb-2 bg-stone-100 dark:bg-zinc-800 px-2 py-1 rounded -mx-2">{title}</p>
      {children}
    </div>
  );
}

export function DetailPanel({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const s = entry.start;
  const e = entry.end;
  // Back closes the pane (Hyoje, 12 Nov); Edit opens its page once that Back has landed.
  const router = useRouter();
  const dismiss = useBackToClose(onClose);
  const editHref = entry.plan ? `/entry/plan/${entry._id}` : `/records/${entry._id}`;
  // Copy (13 Nov): a new entry with the same fields, today at the source's time (as Copy recent).
  const copyHref = `/entry/new?copy=${entry._id}${entry.plan ? '&from=plan' : ''}`;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={() => dismiss()}>
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-stone-200 dark:border-zinc-700 overflow-y-auto shadow-2xl"
        onClick={ev => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-700 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-stone-800 dark:text-zinc-100">
              {entry.activity?.name ?? '—'}
              {entry.plan && <span className="ml-2 align-middle text-[10px] font-normal px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400">Plan</span>}
            </p>
            {entry.activity?.title && (
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">{entry.activity.title}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
          <Link
            href={copyHref}
            onClick={ev => { ev.preventDefault(); dismiss(() => router.push(copyHref)); }}
            className="text-xs px-2 py-1 rounded border border-stone-300 dark:border-zinc-600 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800"
          >
            Copy
          </Link>
          <Link
            href={editHref}
            onClick={ev => { ev.preventDefault(); dismiss(() => router.push(editHref)); }}
            className="text-xs px-2 py-1 rounded border border-stone-300 dark:border-zinc-600 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800"
          >
            Edit
          </Link>
          <button
            onClick={() => dismiss()}
            aria-label="Close"
            className="text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50 dark:text-zinc-200 transition-colors text-lg leading-none mt-0.5"
          >
            ×
          </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">

          <DetailSection title="Activity">
            <DetailRow label="Category" value={entry.activity?.category} />
            <DetailRow label="Activity" value={entry.activity?.name} />
            <DetailRow label="Title" value={entry.activity?.title} />
            <DetailRow label="Additional info" value={entry.activity?.additionalInfo} />
            <DetailRow label="Relationship" value={entry.activity?.relationship} />
            <DetailRow label="Cross activity" value={entry.activity?.crossActivity} />
          </DetailSection>

          <DetailSection title="Time">
            <DetailRow label="Start" value={s?.year ? pointText(s) : '—'} />
            <DetailRow label="End" value={e?.year ? pointText(e) : undefined} />
            <DetailRow label="Planned end" value={!e?.year && entry.plannedEnd?.year ? pointText(entry.plannedEnd) : undefined} />
            <DetailRow label="Duration" value={formatDuration(entry.duration?.totalSeconds)} />
          </DetailSection>

          {entry.location && (entry.location.activity || entry.location.online || entry.location.other) && (
            <DetailSection title="Place">
              <DetailRow label="Place" value={entry.location.activity} />
              <DetailRow label="Online" value={entry.location.online} />
              <DetailRow label="Someone else’s place" value={entry.location.other} />
            </DetailSection>
          )}

          {entry.cost && (entry.cost.amountKRW || entry.cost.amountForeign) && (
            <DetailSection title="Cost">
              <DetailRow label="Amount (KRW)" value={entry.cost.amountKRW ? formatKRW(entry.cost.amountKRW) : undefined} />
              <DetailRow label="Foreign amount" value={entry.cost.amountForeign ? `${(Math.round(entry.cost.amountForeign * 100) / 100).toLocaleString()} ${entry.cost.currency ?? ''}` : undefined} />
              <DetailRow label="Category" value={[entry.cost.category, entry.cost.categoryDetail].filter(Boolean).join(' › ')} />
            </DetailSection>
          )}

          {(entry.purchase ?? []).length > 0 && (
            <DetailSection title="Purchases">
              {entry.purchase!.map((p, i) => (
                <DetailRow key={i} label={`Item ${i + 1}`} value={[p.item, p.amount && p.unit ? `${formatAmount(p.amount)} ${p.unit}` : ''].filter(Boolean).join(' · ')} />
              ))}
            </DetailSection>
          )}

          {(entry.people ?? []).length > 0 && (
            <DetailSection title="People">
              {entry.people!.map((p, i) => (
                <DetailRow key={i} label={p.category ?? `Group ${i + 1}`} value={`${p.target ?? ''}${p.method ? ` (${p.method})` : ''}`} />
              ))}
            </DetailSection>
          )}

          {entry.transport && (entry.transport.from || entry.transport.to) && (
            <DetailSection title="Journey">
              <DetailRow label="From" value={entry.transport.from} />
              <DetailRow label="To" value={entry.transport.to} />
              <DetailRow label="Purpose" value={entry.transport.purpose} />
              <DetailRow label="Method" value={entry.transport.method} />
              <DetailRow label="Return type" value={entry.transport.returnType} />
            </DetailSection>
          )}

          {entry.food && ((entry.food.drinks ?? []).length > 0 || (entry.food.foods ?? []).length > 0 || (entry.food.alcohols ?? []).length > 0) && (
            <DetailSection title="Food & drink">
              <DetailRow label="Type" value={entry.food.type} />
              <DetailRow label="Carbs" value={entry.food.carbs} />
              <DetailRow label="Fat" value={entry.food.fat} />
              <DetailRow label="Spiciness" value={entry.food.spiciness} />
              {(entry.food.drinks ?? []).map((d, i) => <DetailRow key={`d${i}`} label="Drink" value={[d.item, d.ingredients?.length ? `(${d.ingredients.join(', ')})` : '', formatAmount(d.amount), d.unit, d.note].filter(Boolean).join(' ')} />)}
              {(entry.food.foods ?? []).map((f, i) => <DetailRow key={`f${i}`} label="Food" value={[f.item, f.ingredients?.length ? `(${f.ingredients.join(', ')})` : '', formatAmount(f.amount), f.unit, f.note].filter(Boolean).join(' ')} />)}
              {(entry.food.alcohols ?? []).map((a, i) => <DetailRow key={`a${i}`} label="Alcohol" value={[a.item, formatAmount(a.amount), a.unit, a.note].filter(Boolean).join(' ')} />)}
            </DetailSection>
          )}

          {entry.body && (entry.body.weight || entry.body.muscleMass || entry.body.bodyFat) && (
            <DetailSection title="Body">
              <DetailRow label="Weight" value={formatKg(entry.body.weight)} />
              <DetailRow label="Muscle mass" value={formatKg(entry.body.muscleMass)} />
              <DetailRow label="Body fat" value={formatKg(entry.body.bodyFat)} />
              <DetailRow label="Body fat %" value={formatBodyFatPercent(entry.body.bodyFatPercent)} />
            </DetailSection>
          )}

          {(entry.exercise ?? []).length > 0 && (
            <DetailSection title="Exercise">
              {entry.exercise!.map((ex, i) => (
                <DetailRow key={i} label={ex.item ?? `Exercise ${i + 1}`} value={[ex.amount ? `${formatAmount(ex.amount)} ${ex.unit ?? ''}`.trim() : '', ex.loadKg ? `${formatAmount(ex.loadKg)} kg` : '', ex.setStyle ?? ''].filter(Boolean).join(' · ') || undefined} />
              ))}
            </DetailSection>
          )}

          {entry.golf && (entry.golf.score || entry.golf.approach || entry.golf.putts) && (
            <DetailSection title="Golf">
              <DetailRow label="Score" value={entry.golf.score} />
              <DetailRow label="Approach" value={entry.golf.approach} />
              <DetailRow label="Putts" value={entry.golf.putts} />
            </DetailSection>
          )}

          {entry.income && (entry.income.gross || entry.income.net) && (
            <DetailSection title="Income">
              <DetailRow label="Before tax" value={entry.income.gross ? formatKRW(entry.income.gross) : undefined} />
              <DetailRow label="After tax" value={entry.income.net ? formatKRW(entry.income.net) : undefined} />
            </DetailSection>
          )}

          {entry.sleep?.quality && (
            <DetailSection title="Sleep">
              <DetailRow label="Quality" value={entry.sleep.quality} />
            </DetailSection>
          )}

          {entry.reading?.title && (
            <DetailSection title="Reading">
              <DetailRow label="Title" value={entry.reading.title} />
            </DetailSection>
          )}

          {entry.movie?.title && (
            <DetailSection title="Movie">
              <DetailRow label="Title" value={entry.movie.title} />
            </DetailSection>
          )}

          {entry.travel && (entry.travel.city || entry.travel.theme) && (
            <DetailSection title="Travel">
              <DetailRow label="City" value={entry.travel.city} />
              <DetailRow label="Theme" value={entry.travel.theme} />
            </DetailSection>
          )}

          {entry.bowel && (entry.bowel.amount || entry.bowel.quality) && (
            <DetailSection title="Bowel">
              <DetailRow label="Amount" value={entry.bowel.amount} />
							<DetailRow label="Quality" value={entry.bowel.quality?.join(', ')} />
              <DetailRow label="Characteristics" value={entry.bowel.characteristics?.join(', ')} />
            </DetailSection>
          )}

          {entry.notes && (
            <DetailSection title="Notes">
              <DetailRow label="Notes" value={entry.notes} />
            </DetailSection>
          )}

        </div>
      </div>
    </div>,
    document.body,
  );
}
