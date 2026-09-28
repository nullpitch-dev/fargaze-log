'use client';
// src/app/calendar/_components/SearchBox.tsx
//
// The Calendar's search box (WBS #59, 28 Sep): Google's box in the toolbar,
// with the Search page's 상세 검색 behind ▾ — 기간, 필드 조건 (AND) rows with
// the same twelve fields and labels, plus Google's "Doesn't have" (제외 단어).
// Enter or 검색 submits; the page puts the search in the address. As on the
// Search page, 초기화 beside the dates clears only the dates (it shows once a
// date is set); 초기화 at the foot clears every condition but keeps the box.

import React, { useEffect, useRef, useState } from 'react';
import { FIELD_OPTIONS } from '@/lib/calendar/search';

export interface SearchSpec {
  q: string;
  conditions: { field: string; value: string }[];
  not: string;
  from: string;
  to: string;
}

export const EMPTY_SEARCH: SearchSpec = { q: '', conditions: [], not: '', from: '', to: '' };

export const isEmptySearch = (s: SearchSpec) =>
  !s.q.trim() && !s.not.trim() && !s.from && !s.to && !s.conditions.some(c => c.value.trim());

const input = 'bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-2.5 py-1.5 text-xs text-stone-800 dark:text-zinc-100 placeholder-stone-400 focus:outline-none focus:border-stone-400';

export function SearchBox({ value, onSubmit, autoFocus = false, wide = true }: {
  value: SearchSpec;
  onSubmit: (s: SearchSpec) => void;
  autoFocus?: boolean;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState<SearchSpec>(value);
  const [open, setOpen] = useState(false);
  // Follow the address (back button, a new search) — keyed by content, not identity.
  const valueKey = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(value); }, [valueKey]);

  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const active = draft.conditions.some(c => c.value.trim()) || !!draft.not.trim() || !!draft.from || !!draft.to;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = { ...draft, conditions: draft.conditions.filter(c => c.value.trim()) };
    if (isEmptySearch(clean)) return;
    setOpen(false);
    onSubmit(clean);
  };
  const setCond = (i: number, patch: Partial<{ field: string; value: string }>) =>
    setDraft(d => ({ ...d, conditions: d.conditions.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));

  return (
    <form ref={ref} onSubmit={submit} className={`relative ${wide ? 'w-60' : 'w-full'}`}>
      <div className="flex items-center rounded border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:border-stone-400">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
          className="ml-2 shrink-0 text-stone-400 dark:text-zinc-500">
          <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
        </svg>
        <input value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))}
          autoFocus={autoFocus} placeholder="Search"
          className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[12px] text-stone-800 dark:text-zinc-100 placeholder-stone-400 focus:outline-none" />
        <button type="button" onClick={() => setOpen(o => !o)} aria-label="상세 검색" title="상세 검색"
          className={`px-2 py-1 text-[10px] ${active ? 'text-blue-600 dark:text-blue-400' : 'text-stone-400 dark:text-zinc-500'} hover:text-stone-700 dark:hover:text-zinc-200`}>
          {active ? '●' : ''}▾
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-[420px] max-w-[calc(100vw-2rem)] p-4 space-y-4 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mb-2">기간</p>
            <div className="flex gap-2 items-center">
              <input type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} className={input} />
              <span className="text-stone-400 dark:text-zinc-500 text-xs">—</span>
              <input type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} className={input} />
              {(draft.from || draft.to) && (
                <button type="button" onClick={() => setDraft(d => ({ ...d, from: '', to: '' }))}
                  className="text-xs text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50 whitespace-nowrap">초기화</button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mb-2">필드 조건 (AND)</p>
            <div className="space-y-2">
              {draft.conditions.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={c.field} onChange={e => setCond(i, { field: e.target.value })} className={input}>
                    {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input value={c.value} onChange={e => setCond(i, { value: e.target.value })}
                    placeholder="값 입력…" className={`${input} flex-1 min-w-0`} />
                  <button type="button" aria-label="조건 삭제"
                    onClick={() => setDraft(d => ({ ...d, conditions: d.conditions.filter((_, k) => k !== i) }))}
                    className="px-1 text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50">×</button>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setDraft(d => ({ ...d, conditions: [...d.conditions, { field: FIELD_OPTIONS[0].value, value: '' }] }))}
              className="mt-2 text-xs text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50">
              + 조건 추가
            </button>
          </div>

          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mb-2">제외 단어 <span className="text-stone-400 dark:text-zinc-500">(Doesn&rsquo;t have)</span></p>
            <input value={draft.not} onChange={e => setDraft(d => ({ ...d, not: e.target.value }))}
              placeholder="이 단어가 있는 기록은 빼기" className={`${input} w-full`} />
          </div>

          <p className="text-[11px] text-stone-400 dark:text-zinc-500 leading-relaxed">
            Words must all appear, in any field searched; &ldquo;quotes&rdquo; keep a phrase together.
            Matching is exact text, not fuzzy. Your filter panel applies.
          </p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(d => ({ ...EMPTY_SEARCH, q: d.q }))}
              className="px-3 py-1.5 text-xs text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50">초기화</button>
            <button type="submit"
              className="px-3 py-1.5 rounded text-xs bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium disabled:opacity-40"
              disabled={isEmptySearch(draft)}>검색</button>
          </div>
        </div>
      )}
    </form>
  );
}
