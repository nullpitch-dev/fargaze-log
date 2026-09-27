'use client';
// src/app/_components/LogDetailPanel.tsx
//
// The record detail pane, shared by Search and Calendar (WBS #59). Moved out
// of search/page.tsx unchanged, except that it now renders through a portal
// one layer ABOVE ModalShell (z-60), so it can open from the Calendar's day
// pop-up. Search looks and behaves exactly as before.

import React from 'react';
import { createPortal } from 'react-dom';

export interface LogEntry {
  _id: string;
  score?: number;
  allDay?: boolean;
  activity?: { category?: string; name?: string; title?: string; additionalInfo?: string; crossActivity?: string; relationship?: string };
  start?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string; timezoneOffset?: number };
  end?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string };
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
  exercise?: Array<{ item?: string; amount?: number; unit?: string }>;
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
  if (entry.allDay) return date + ' 하루종일';
  const hour = entry.start?.hour;
  if (!hour) return date;
  return date + ' ' + hour;
}

export function formatTime(entry: LogEntry): string {
  if (entry.allDay) return '하루 종일';
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

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-stone-200 dark:border-zinc-700 overflow-y-auto shadow-2xl"
        onClick={ev => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-700 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-stone-800 dark:text-zinc-100">
              {entry.activity?.name ?? '—'}
            </p>
            {entry.activity?.title && (
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">{entry.activity.title}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50 dark:text-zinc-200 transition-colors text-lg leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">

          <DetailSection title="활동">
            <DetailRow label="카테고리" value={entry.activity?.category} />
            <DetailRow label="활동명" value={entry.activity?.name} />
            <DetailRow label="제목" value={entry.activity?.title} />
            <DetailRow label="추가정보" value={entry.activity?.additionalInfo} />
            <DetailRow label="관계" value={entry.activity?.relationship} />
            <DetailRow label="교차활동" value={entry.activity?.crossActivity} />
          </DetailSection>

          <DetailSection title="시간">
            <DetailRow label="시작" value={s?.hour ? `${formatDate(s)}(${s.weekday ?? ''}) ${s.hour} (${s.timezone})` : formatDate(s)} />
            <DetailRow label="종료" value={e?.hour ? `${formatDate(e)}(${e.weekday ?? ''}) ${e.hour} (${e.timezone})` : undefined} />
            <DetailRow label="소요" value={formatDuration(entry.duration?.totalSeconds)} />
          </DetailSection>

          {entry.location && (entry.location.activity || entry.location.online || entry.location.other) && (
            <DetailSection title="장소">
              <DetailRow label="장소" value={entry.location.activity} />
              <DetailRow label="온라인" value={entry.location.online} />
              <DetailRow label="타인장소" value={entry.location.other} />
            </DetailSection>
          )}

          {entry.cost && (entry.cost.amountKRW || entry.cost.amountForeign) && (
            <DetailSection title="비용">
              <DetailRow label="금액(원)" value={entry.cost.amountKRW ? formatKRW(entry.cost.amountKRW) : undefined} />
              <DetailRow label="금액(외화)" value={entry.cost.amountForeign ? `${(Math.round(entry.cost.amountForeign * 100) / 100).toLocaleString()} ${entry.cost.currency ?? ''}` : undefined} />
              <DetailRow label="비용구분" value={entry.cost.categoryDetail} />
              <DetailRow label="비용카테고리" value={entry.cost.category} />
            </DetailSection>
          )}

          {(entry.purchase ?? []).length > 0 && (
            <DetailSection title="구매">
              {entry.purchase!.map((p, i) => (
                <DetailRow key={i} label={`항목 ${i + 1}`} value={[p.item, p.amount && p.unit ? `${formatAmount(p.amount)} ${p.unit}` : ''].filter(Boolean).join(' · ')} />
              ))}
            </DetailSection>
          )}

          {(entry.people ?? []).length > 0 && (
            <DetailSection title="사람">
              {entry.people!.map((p, i) => (
                <DetailRow key={i} label={p.category ?? `그룹 ${i + 1}`} value={`${p.target ?? ''}${p.method ? ` (${p.method})` : ''}`} />
              ))}
            </DetailSection>
          )}

          {entry.transport && (entry.transport.from || entry.transport.to) && (
            <DetailSection title="이동">
              <DetailRow label="출발" value={entry.transport.from} />
              <DetailRow label="도착" value={entry.transport.to} />
              <DetailRow label="목적" value={entry.transport.purpose} />
              <DetailRow label="수단" value={entry.transport.method} />
            </DetailSection>
          )}

          {entry.food && ((entry.food.drinks ?? []).length > 0 || (entry.food.foods ?? []).length > 0 || (entry.food.alcohols ?? []).length > 0) && (
            <DetailSection title="식음">
              <DetailRow label="유형" value={entry.food.type} />
              <DetailRow label="탄수" value={entry.food.carbs} />
              <DetailRow label="지방" value={entry.food.fat} />
              <DetailRow label="맵기" value={entry.food.spiciness} />
              {(entry.food.drinks ?? []).map((d, i) => <DetailRow key={`d${i}`} label="음료" value={[d.item, d.ingredients?.length ? `(${d.ingredients.join(', ')})` : '', formatAmount(d.amount), d.unit, d.note].filter(Boolean).join(' ')} />)}
              {(entry.food.foods ?? []).map((f, i) => <DetailRow key={`f${i}`} label="음식" value={[f.item, f.ingredients?.length ? `(${f.ingredients.join(', ')})` : '', formatAmount(f.amount), f.unit, f.note].filter(Boolean).join(' ')} />)}
              {(entry.food.alcohols ?? []).map((a, i) => <DetailRow key={`a${i}`} label="술" value={[a.item, formatAmount(a.amount), a.unit, a.note].filter(Boolean).join(' ')} />)}
            </DetailSection>
          )}

          {entry.body && (entry.body.weight || entry.body.muscleMass || entry.body.bodyFat) && (
            <DetailSection title="신체">
              <DetailRow label="체중" value={formatKg(entry.body.weight)} />
              <DetailRow label="골격근량" value={formatKg(entry.body.muscleMass)} />
              <DetailRow label="체지방량" value={formatKg(entry.body.bodyFat)} />
              <DetailRow label="체지방률" value={formatBodyFatPercent(entry.body.bodyFatPercent)} />
            </DetailSection>
          )}

          {(entry.exercise ?? []).length > 0 && (
            <DetailSection title="운동">
              {entry.exercise!.map((ex, i) => (
                <DetailRow key={i} label={ex.item ?? `운동 ${i + 1}`} value={ex.amount ? `${formatAmount(ex.amount)} ${ex.unit ?? ''}` : undefined} />
              ))}
            </DetailSection>
          )}

          {entry.golf && (entry.golf.score || entry.golf.approach || entry.golf.putts) && (
            <DetailSection title="골프">
              <DetailRow label="스코어" value={entry.golf.score} />
              <DetailRow label="어프로치" value={entry.golf.approach} />
              <DetailRow label="퍼팅" value={entry.golf.putts} />
            </DetailSection>
          )}

          {entry.income && (entry.income.gross || entry.income.net) && (
            <DetailSection title="수입">
              <DetailRow label="세전" value={entry.income.gross ? formatKRW(entry.income.gross) : undefined} />
              <DetailRow label="세후" value={entry.income.net ? formatKRW(entry.income.net) : undefined} />
            </DetailSection>
          )}

          {entry.sleep?.quality && (
            <DetailSection title="수면">
              <DetailRow label="수면 질" value={entry.sleep.quality} />
            </DetailSection>
          )}

          {entry.reading?.title && (
            <DetailSection title="독서">
              <DetailRow label="제목" value={entry.reading.title} />
            </DetailSection>
          )}

          {entry.movie?.title && (
            <DetailSection title="영화">
              <DetailRow label="제목" value={entry.movie.title} />
            </DetailSection>
          )}

          {entry.travel && (entry.travel.city || entry.travel.theme) && (
            <DetailSection title="여행">
              <DetailRow label="도시" value={entry.travel.city} />
              <DetailRow label="주제" value={entry.travel.theme} />
            </DetailSection>
          )}

          {entry.bowel && (entry.bowel.amount || entry.bowel.quality) && (
            <DetailSection title="대변">
              <DetailRow label="량" value={entry.bowel.amount} />
							<DetailRow label="질" value={entry.bowel.quality?.join(', ')} />
              <DetailRow label="특징" value={entry.bowel.characteristics?.join(', ')} />
            </DetailSection>
          )}

          {entry.notes && (
            <DetailSection title="메모">
              <DetailRow label="내용" value={entry.notes} />
            </DetailSection>
          )}

        </div>
      </div>
    </div>,
    document.body,
  );
}
