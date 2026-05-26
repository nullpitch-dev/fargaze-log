'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { arrayMove } from '@dnd-kit/sortable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostRow {
  category: string;
  categoryDetail: string | null;
  months: Record<string, number>;
  total: number;
}

interface SummaryResponse {
  months: string[];
  rows: CostRow[];
  columnTotals: Record<string, number>;
}

interface Transaction {
  _id: string;
  activity?: { category?: string; name?: string; title?: string; additionalInfo?: string };
  start?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string; datetime?: string };
  end?: { year?: number; month?: number; day?: number; weekday?: string; hour?: string; timezone?: string };
  duration?: { totalSeconds?: number };
  location?: { activity?: string };
  cost?: { amountKRW?: number; amountForeign?: number; currency?: string; categoryDetail?: string; category?: string };
  purchase?: Array<{ item?: string; amount?: string; unit?: string }>;
  people?: Array<{ method?: string; category?: string; target?: string }>;
  food?: any;
  body?: any;
  exercise?: any[];
  golf?: any;
  income?: any;
  travel?: any;
  sleep?: any;
  bowel?: any;
  reading?: any;
  movie?: any;
  notes?: string;
  allDay?: boolean;
}

interface DrillDownState {
  category: string;
  categoryDetail: string | null;
  monthKey: string;
  monthLabel: string;
  hiddenDetails: string[];
  crossActivities: string[];
  dateFrom: string;
  dateTo: string;
}

interface Layout {
  categoryOrder: string[];
  detailOrder: Record<string, string[]>;
  collapsed: Record<string, boolean>;
  hiddenDetails: Record<string, string[]>;
}

const LAYOUT_KEY = 'fargaze-cost-layout';
const EXCLUDE_KEY = 'fargaze-exclude-categories';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return Math.round(amount / 1_000).toLocaleString('ko-KR');
}

function formatKRWFull(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

function formatMonthLabel(monthKey: string, prevMonthKey?: string): string {
  const [year, month] = monthKey.split('-');
  const yy = year.slice(2);
  const prevYear = prevMonthKey?.split('-')[0];
  const showYear = !prevMonthKey || prevYear !== year;
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const monthName = monthNames[parseInt(month) - 1];
  return showYear ? `'${yy} ${monthName}` : monthName;
}

function getFullMonthKeys(monthKeys: string[], dateFrom: string, dateTo: string): string[] {
  return monthKeys.filter(mk => {
    const [year, month] = mk.split('-').map(Number);
    const firstDay = `${mk}-01`;
    const lastDay = `${mk}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return dateFrom <= firstDay && dateTo >= lastDay;
  });
}

function formatDate(d?: { year?: number; month?: number; day?: number }): string {
  if (!d?.year) return '—';
  const yy = String(d.year).slice(2);
  const mm = String(d.month ?? 1).padStart(2, '0');
  const dd = String(d.day ?? 1).padStart(2, '0');
  return `'${yy}.${mm}.${dd}`;
}

function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '';
  if (seconds === 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '0m';
}

// ── Multi-select Dropdown ─────────────────────────────────────────────────────

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const allSelected = selected.length === options.length;
  const noneSelected = selected.length === 0;

  function toggleAll() {
    onChange(allSelected ? [] : [...options]);
  }

  function toggleOne(opt: string) {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  }

  const deselectedCount = options.length - selected.length;

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label className="text-xs text-stone-500 dark:text-zinc-400">{label}</label>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 bg-white dark:bg-zinc-900 border rounded px-3 py-2 text-xs focus:outline-none focus:border-stone-400 shadow-sm transition-colors ${
            deselectedCount > 0
              ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-stone-300 dark:border-zinc-600 text-stone-900 dark:text-zinc-50'
          }`}
        >
          <span>
            {allSelected ? '전체' : noneSelected ? '없음' : `${selected.length}개 선택`}
          </span>
          <span className="text-stone-400 dark:text-zinc-500">▾</span>
        </button>
        {open && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed z-[9999] bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[180px] py-1"
            style={(() => {
              if (!ref.current) return {};
              const rect = ref.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
                return { top: rect.bottom + 4, left: rect.left };
              } else {
                return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
              }
            })()}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Select all / Deselect all */}
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-stone-100 dark:border-zinc-700">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                onChange={toggleAll}
                className="accent-blue-500"
              />
              <span className="text-xs font-medium text-stone-700 dark:text-zinc-200">
                {allSelected ? '전체 해제' : '전체 선택'}
              </span>
            </label>
            {/* Individual options */}
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOne(opt)}
                  className="accent-blue-500"
                />
                <span className={`text-xs ${selected.includes(opt) ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-400 dark:text-zinc-500 line-through'}`}>
                  {opt}
                </span>
              </label>
            ))}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

// ── Category Exclusion Dropdown (in table header) ─────────────────────────────

function CategoryExclusionDropdown({
  allCategories,
  excludeCategories,
  onToggle,
}: {
  allCategories: string[];
  excludeCategories: string[];
  onToggle: (cat: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const hiddenCount = excludeCategories.length;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`text-xs px-1 py-0.5 rounded transition-colors ${
          hiddenCount > 0
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
            : 'text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300'
        }`}
        title="카테고리 표시/숨기기"
      >
        ▼{hiddenCount > 0 ? ` ${hiddenCount}` : ''}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[200px] py-1 max-h-72 overflow-y-auto"
          style={(() => {
            if (!ref.current) return {};
            const rect = ref.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
              return { top: rect.bottom + 4, left: rect.left };
            } else {
              return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
            }
          })()}
          onMouseDown={e => e.stopPropagation()}
        >
          <p className="text-xs text-stone-500 dark:text-zinc-400 px-3 py-1.5 border-b border-stone-100 dark:border-zinc-700">카테고리 표시/숨기기</p>
          {allCategories.map(cat => (
            <label key={cat} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!excludeCategories.includes(cat)}
                onChange={() => onToggle(cat)}
                className="accent-blue-500"
              />
              <span className={`text-xs ${excludeCategories.includes(cat) ? 'text-stone-400 dark:text-zinc-500 line-through' : 'text-stone-700 dark:text-zinc-200'}`}>
                {cat}
              </span>
            </label>
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => excludeCategories.forEach(c => onToggle(c))}
              className="w-full text-left text-xs text-blue-600 dark:text-blue-400 px-3 py-1.5 border-t border-stone-100 dark:border-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-700"
            >
              모두 표시
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-stone-100 dark:border-zinc-800 last:border-0">
      <span className="text-xs text-stone-500 dark:text-zinc-400 w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-stone-800 dark:text-zinc-200 flex-1 break-words">{String(value)}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-stone-500 dark:text-zinc-300 uppercase tracking-widest mb-1.5 bg-stone-100 dark:bg-zinc-800 px-2 py-1 rounded -mx-2">{title}</p>
      {children}
    </div>
  );
}

function RecordModal({ entry, onClose }: { entry: Transaction; onClose: () => void }) {
  const s = entry.start;
  const e = entry.end;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl overflow-y-auto shadow-2xl max-h-[85vh]"
        onClick={ev => ev.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-700 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mb-1">
              {s?.year && `${s.year}.${String(s.month).padStart(2,'0')}.${String(s.day).padStart(2,'0')}`}
              {!entry.allDay && s?.hour && ` · ${s.hour}${e?.hour ? ` → ${e.hour}` : ''}`}
              {entry.allDay && ' · 하루 종일'}
            </p>
            <p className="text-sm font-medium text-stone-900 dark:text-zinc-50">{entry.activity?.name ?? '—'}</p>
            {entry.activity?.title && <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">{entry.activity.title}</p>}
          </div>
          <button onClick={onClose} className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-200 transition-colors text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4">
          <DetailSection title="활동">
            <DetailRow label="카테고리" value={entry.activity?.category} />
            <DetailRow label="활동명" value={entry.activity?.name} />
            <DetailRow label="제목" value={entry.activity?.title} />
            <DetailRow label="추가정보" value={entry.activity?.additionalInfo} />
          </DetailSection>
          <DetailSection title="시간">
            <DetailRow label="시작" value={s?.hour ? `${formatDate(s)}(${s.weekday ?? ''}) ${s.hour} (${s.timezone})` : formatDate(s)} />
            <DetailRow label="종료" value={e?.hour ? `${formatDate(e)}(${e.weekday ?? ''}) ${e.hour} (${e.timezone})` : undefined} />
            <DetailRow label="소요" value={formatDuration(entry.duration?.totalSeconds)} />
          </DetailSection>
          {entry.cost && (entry.cost.amountKRW || entry.cost.amountForeign) && (
            <DetailSection title="비용">
              <DetailRow label="금액(원)" value={entry.cost.amountKRW ? formatKRWFull(entry.cost.amountKRW) : undefined} />
              <DetailRow label="금액(외화)" value={entry.cost.amountForeign ? `${entry.cost.amountForeign.toLocaleString()} ${entry.cost.currency ?? ''}` : undefined} />
              <DetailRow label="비용구분" value={entry.cost.categoryDetail} />
              <DetailRow label="비용카테고리" value={entry.cost.category} />
            </DetailSection>
          )}
          {(entry.purchase ?? []).length > 0 && (
            <DetailSection title="구매">
              {entry.purchase!.map((p, i) => (
                <DetailRow key={i} label={`항목 ${i + 1}`} value={[p.item, p.amount && p.unit ? `${p.amount} ${p.unit}` : ''].filter(Boolean).join(' · ')} />
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
          {entry.location?.activity && (
            <DetailSection title="장소">
              <DetailRow label="장소" value={entry.location.activity} />
            </DetailSection>
          )}
          {entry.notes && (
            <DetailSection title="메모">
              <DetailRow label="내용" value={entry.notes} />
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drill-Down Sidebar ────────────────────────────────────────────────────────

function DrillDownSidebar({ drill, onClose }: { drill: DrillDownState; onClose: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    // Fetch only the clicked month, clamped to the overall filter period at the boundaries.
    const [year, month] = drill.monthKey.split('-');
    const monthFirst = `${year}-${month}-01`;
    const monthLastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const monthLast = `${year}-${month}-${String(monthLastDay).padStart(2, '0')}`;
    const txDateFrom = drill.dateFrom > monthFirst ? drill.dateFrom : monthFirst;
    const txDateTo   = drill.dateTo   < monthLast  ? drill.dateTo   : monthLast;
    const params = new URLSearchParams({ category: drill.category, dateFrom: txDateFrom, dateTo: txDateTo });
    if (drill.categoryDetail) params.set('categoryDetail', drill.categoryDetail);
    if (drill.crossActivities.length > 0) params.set('crossActivities', drill.crossActivities.join(','));
    fetch(`/api/cost-transactions?${params}`)
      .then(r => r.json())
      .then(d => {
        const results = (d.results ?? []).filter((tx: Transaction) =>
          drill.hiddenDetails.length === 0 ||
          !drill.hiddenDetails.includes(tx.cost?.categoryDetail ?? '')
        );
        setTransactions(results);
        setLoading(false);
      });
  }, [drill]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white dark:bg-zinc-900 border-l border-stone-200 dark:border-zinc-700 flex flex-col shadow-2xl">
        <div className="border-b border-stone-200 dark:border-zinc-700 px-4 py-3 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400">{drill.monthLabel}</p>
            <p className="text-sm font-medium text-stone-900 dark:text-zinc-50">{drill.category}</p>
            {drill.categoryDetail && <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">{drill.categoryDetail}</p>}
          </div>
          <button onClick={onClose} className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-200 transition-colors text-xl leading-none mt-0.5">×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-stone-500 dark:text-zinc-300 p-4">불러오는 중…</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-zinc-300 p-4">내역이 없습니다.</p>
          ) : (
            <div>
              {transactions.map(tx => (
                <button
                  key={tx._id}
                  onClick={() => setSelectedTx(tx)}
                  className="w-full text-left px-4 py-3 border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono">{formatDate(tx.start)}</p>
                      <p className="text-xs text-stone-800 dark:text-zinc-200 font-medium mt-0.5 truncate">{tx.activity?.name ?? '—'}</p>
                      {tx.activity?.title && (
                        <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5 truncate">{tx.activity.title}</p>
                      )}
                      {(tx.purchase ?? []).length > 0 && (
                        <p className="text-xs text-stone-500 dark:text-zinc-300 mt-0.5 truncate">
                          {tx.purchase!.map(p => p.item).filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-stone-800 dark:text-zinc-200 font-mono shrink-0">
                      {tx.cost?.amountKRW ? formatKRWFull(tx.cost.amountKRW) : '—'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {!loading && transactions.length > 0 && (
          <div className="border-t border-stone-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between shrink-0">
            <p className="text-xs text-stone-500 dark:text-zinc-400">{transactions.length}건</p>
            <p className="text-xs font-mono text-stone-900 dark:text-zinc-50">
              {formatKRWFull(transactions.reduce((s, tx) => s + (tx.cost?.amountKRW ?? 0), 0))}
            </p>
          </div>
        )}
      </div>
      {selectedTx && <RecordModal entry={selectedTx} onClose={() => setSelectedTx(null)} />}
    </>
  );
}

// ── Category Row ──────────────────────────────────────────────────────────────

function CostCategoryRow({
  category, months, collapsed, onToggle, onCellClick, monthKeys,
  fullMonthKeys, fullMonthCount, allDetails, hiddenDetails,
  onToggleDetail, onMoveUp, onMoveDown,
}: {
  category: string; months: Record<string, number>; collapsed: boolean;
  onToggle: () => void; onCellClick: (monthKey: string) => void;
  monthKeys: string[]; fullMonthKeys: string[]; fullMonthCount: number;
  allDetails: string[]; hiddenDetails: string[];
  onToggleDetail: (detail: string) => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  const hiddenCount = hiddenDetails.length;
  const fullMonthTotal = fullMonthKeys.reduce((s, mk) => s + (months[mk] ?? 0), 0);

  return (
    <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800/50 hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors">
      <td className="px-2 py-1 sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <button onClick={onMoveUp} className="text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400 text-xs leading-none px-0.5">▲</button>
            <button onClick={onMoveDown} className="text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400 text-xs leading-none px-0.5">▼</button>
          </div>
          <button onClick={onToggle} className="text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100 text-xs w-4">{collapsed ? '▸' : '▾'}</button>
          <span className="text-xs font-medium text-stone-900 dark:text-zinc-50 flex-1">{category}</span>
          <div className="relative" ref={filterRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setFilterOpen(v => !v); }}
              className={`text-xs px-1 py-0.5 rounded transition-colors ${
                hiddenCount > 0
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                  : 'text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300'
              }`}
              title="세부항목 필터"
            >
              ▼{hiddenCount > 0 ? ` ${hiddenCount}` : ''}
            </button>
            {filterOpen && typeof document !== 'undefined' && createPortal(
              <div
                className="fixed z-[9999] bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[180px] py-1 max-h-64 overflow-y-auto"
                onMouseDown={e => e.stopPropagation()}
                style={(() => {
                  if (!filterRef.current) return {};
                  const rect = filterRef.current.getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const spaceAbove = rect.top;
                  if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
                    return { top: rect.bottom + 4, left: rect.left };
                  } else {
                    return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
                  }
                })()}
              >
                <p className="text-xs text-stone-500 dark:text-zinc-400 px-3 py-1.5 border-b border-stone-100 dark:border-zinc-700">세부항목 표시/숨기기</p>
                {allDetails.map(det => (
                  <label key={det} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hiddenDetails.includes(det)}
                      onChange={() => onToggleDetail(det)}
                      className="accent-blue-500"
                    />
                    <span className={`text-xs ${hiddenDetails.includes(det) ? 'text-stone-400 dark:text-zinc-500 line-through' : 'text-stone-700 dark:text-zinc-200'}`}>
                      {det}
                    </span>
                  </label>
                ))}
                {hiddenCount > 0 && (
                  <button
                    onClick={() => allDetails.forEach(d => { if (hiddenDetails.includes(d)) onToggleDetail(d); })}
                    className="w-full text-left text-xs text-blue-600 dark:text-blue-400 px-3 py-1.5 border-t border-stone-100 dark:border-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-700"
                  >
                    모두 표시
                  </button>
                )}
              </div>,
              document.body
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-1 text-right border-r-2 border-stone-300 dark:border-zinc-600">
        <span className="text-xs font-mono text-stone-600 dark:text-zinc-300">
          {formatKRW(Math.round(fullMonthTotal / fullMonthCount))}
        </span>
      </td>
      {monthKeys.map(mk => (
        <td key={mk} className="px-2 py-1 text-right">
          {months[mk] ? (
            <button
              onClick={() => onCellClick(mk)}
              className="text-xs font-mono text-stone-700 dark:text-zinc-200 hover:text-stone-900 dark:hover:text-zinc-50 hover:underline transition-colors"
            >
              {formatKRW(months[mk])}
            </button>
          ) : (
            <span className="text-xs text-stone-300 dark:text-zinc-600">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}

// ── Detail Row ────────────────────────────────────────────────────────────────

function CostDetailRow({
  category, detail, months, onCellClick, monthKeys,
  fullMonthKeys, fullMonthCount, onMoveUp, onMoveDown,
}: {
  category: string; detail: string; months: Record<string, number>;
  onCellClick: (monthKey: string) => void; monthKeys: string[];
  fullMonthKeys: string[]; fullMonthCount: number;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const fullMonthTotal = fullMonthKeys.reduce((s, mk) => s + (months[mk] ?? 0), 0);

  return (
    <tr className="border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 dark:bg-zinc-800/80 transition-colors">
      <td className="px-2 py-1 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-2 pl-6">
          <div className="flex flex-col">
            <button onClick={onMoveUp} className="text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400 text-xs leading-none px-0.5">▲</button>
            <button onClick={onMoveDown} className="text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400 text-xs leading-none px-0.5">▼</button>
          </div>
          <span className="text-xs text-stone-500 dark:text-zinc-400">{detail}</span>
        </div>
      </td>
      <td className="px-2 py-1 text-right border-r-2 border-stone-300 dark:border-zinc-600">
        <span className="text-xs font-mono text-stone-500 dark:text-zinc-300">
          {formatKRW(Math.round(fullMonthTotal / fullMonthCount))}
        </span>
      </td>
      {monthKeys.map(mk => (
        <td key={mk} className="px-2 py-1 text-right">
          {months[mk] ? (
            <button
              onClick={() => onCellClick(mk)}
              className="text-xs font-mono text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-50 hover:underline transition-colors"
            >
              {formatKRW(months[mk])}
            </button>
          ) : (
            <span className="text-xs text-stone-300 dark:text-zinc-600">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CostPage() {
  // Date defaults
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10);
  const defaultTo = yesterday.toISOString().slice(0, 10);

  // Filter state
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [crossActivityOptions, setCrossActivityOptions] = useState<string[]>([]);
  const [selectedCrossActivities, setSelectedCrossActivities] = useState<string[]>([]);
  const [excludePurchaseInput, setExcludePurchaseInput] = useState('');

  // Client-side category exclusion (no server round-trip)
  const [excludeCategories, setExcludeCategories] = useState<string[]>([]);

  // Data & layout
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [layout, setLayout] = useState<Layout>({ categoryOrder: [], detailOrder: {}, collapsed: {}, hiddenDetails: {} });
  const layoutLoaded = useRef(false);

  // Drill-down
  const [drill, setDrill] = useState<DrillDownState | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // ── On mount: load localStorage + fetch cross-activity options ──────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) setLayout(JSON.parse(saved));
      const savedExclude = localStorage.getItem(EXCLUDE_KEY);
      if (savedExclude) setExcludeCategories(JSON.parse(savedExclude));
    } catch {}
    layoutLoaded.current = true;

    // Fetch cross-activity options, then trigger initial data fetch
    fetch('/api/cross-activities')
      .then(r => r.json())
      .then((values: string[]) => {
        setCrossActivityOptions(values);
        setSelectedCrossActivities(values); // default: all selected
        // Initial data fetch — pass values directly to avoid stale closure
        fetchData({
          dateFrom: defaultFrom,
          dateTo: defaultTo,
          crossActivities: values,
          excludePurchaseInput: '',
        });
      })
      .catch(() => {
        // If cross-activities fails, still fetch data with no cross-activity filter
        fetchData({
          dateFrom: defaultFrom,
          dateTo: defaultTo,
          crossActivities: [],
          excludePurchaseInput: '',
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fetchData: accepts all filter values directly (no stale closure) ────────
  async function fetchData({
    dateFrom: df,
    dateTo: dt,
    crossActivities: ca,
    excludePurchaseInput: epi,
  }: {
    dateFrom: string;
    dateTo: string;
    crossActivities: string[];
    excludePurchaseInput: string;
  }) {
    setLoading(true);
    const params = new URLSearchParams({ dateFrom: df, dateTo: dt });
    const excludePurchaseItems = epi.split(',').map(s => s.trim()).filter(Boolean);
    if (excludePurchaseItems.length > 0) params.set('excludePurchaseItems', excludePurchaseItems.join(','));
    if (ca.length > 0) {
      params.set('crossActivities', ca.join(','));
    }

    const res = await fetch(`/api/cost-summary?${params}`);
    const json: SummaryResponse = await res.json();

    // Update layout before data so both setState calls are batched by React
    // into a single render — the table never sees data and layout out of sync.
    setLayout(prev => {
      const cats = [...new Set(json.rows.filter(r => r.categoryDetail === null).map(r => r.category))];
      const existingCats = prev.categoryOrder.filter(c => cats.includes(c));
      const newCats = cats.filter(c => !prev.categoryOrder.includes(c));
      const categoryOrder = [...existingCats, ...newCats];
      const detailOrder: Record<string, string[]> = { ...prev.detailOrder };
      for (const cat of cats) {
        const details = json.rows.filter(r => r.category === cat && r.categoryDetail !== null).map(r => r.categoryDetail as string);
        const existing = (prev.detailOrder[cat] ?? []).filter(d => details.includes(d));
        const newDetails = details.filter(d => !existing.includes(d));
        detailOrder[cat] = [...existing, ...newDetails];
      }
      const next = { ...prev, categoryOrder, detailOrder, hiddenDetails: prev.hiddenDetails ?? {} };
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setData(json);
    setLoading(false);
  }

  // ── 조회 button handler ────────────────────────────────────────────────────
  function handleFetch() {
    fetchData({ dateFrom, dateTo, crossActivities: selectedCrossActivities, excludePurchaseInput });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const saveLayout = useCallback((l: Layout) => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch {}
  }, []);

  const allCategories = data
    ? [...new Set(data.rows.filter(r => r.categoryDetail === null).map(r => r.category))]
    : [];

  const allDetails = (cat: string) => data
    ? data.rows.filter(r => r.category === cat && r.categoryDetail !== null).map(r => r.categoryDetail as string)
    : [];

  function getRowData(category: string, detail: string | null) {
    return data?.rows.find(r => r.category === category && r.categoryDetail === detail);
  }

  const monthKeys = data?.months ?? [];
  const fullMonthKeys = getFullMonthKeys(monthKeys, dateFrom, dateTo);
  // If no full months exist (e.g. range is entirely within one partial month),
  // fall back to all monthKeys so totals and averages are never zeroed out.
  const totalMonthKeys = fullMonthKeys.length > 0 ? fullMonthKeys : monthKeys;
  const fullMonthCount = totalMonthKeys.length || 1;

  function toggleCollapsed(cat: string) {
    saveLayout({ ...layout, collapsed: { ...layout.collapsed, [cat]: !layout.collapsed[cat] } });
  }

  function toggleHiddenDetail(cat: string, detail: string) {
    const current = layout.hiddenDetails[cat] ?? [];
    const updated = current.includes(detail)
      ? current.filter(d => d !== detail)
      : [...current, detail];
    saveLayout({ ...layout, hiddenDetails: { ...layout.hiddenDetails, [cat]: updated } });
  }

  function toggleExcludeCategory(cat: string) {
    setExcludeCategories(prev => {
      const updated = prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat];
      try { localStorage.setItem(EXCLUDE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function moveCategoryUp(cat: string) {
    const idx = layout.categoryOrder.indexOf(cat);
    if (idx <= 0) return;
    saveLayout({ ...layout, categoryOrder: arrayMove(layout.categoryOrder, idx, idx - 1) });
  }

  function moveCategoryDown(cat: string) {
    const idx = layout.categoryOrder.indexOf(cat);
    if (idx >= layout.categoryOrder.length - 1) return;
    saveLayout({ ...layout, categoryOrder: arrayMove(layout.categoryOrder, idx, idx + 1) });
  }

  function moveDetailUp(cat: string, det: string) {
    const order = layout.detailOrder[cat] ?? [];
    const idx = order.indexOf(det);
    if (idx <= 0) return;
    saveLayout({ ...layout, detailOrder: { ...layout.detailOrder, [cat]: arrayMove(order, idx, idx - 1) } });
  }

  function moveDetailDown(cat: string, det: string) {
    const order = layout.detailOrder[cat] ?? [];
    const idx = order.indexOf(det);
    if (idx >= order.length - 1) return;
    saveLayout({ ...layout, detailOrder: { ...layout.detailOrder, [cat]: arrayMove(order, idx, idx + 1) } });
  }

  function handleSortClick(key: string) {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortKey(null); setSortDir('desc'); }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIndicator({ colKey }: { colKey: string }) {
    if (sortKey !== colKey) return <span className="text-stone-300 dark:text-zinc-600 ml-1">⇅</span>;
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  function getSortValue(category: string, detail: string | null, key: string): number {
    if (key === 'avg') {
      const visibleDetails = (layout.detailOrder[category] ?? allDetails(category))
        .filter(d => !(layout.hiddenDetails[category] ?? []).includes(d));
      const total = detail === null
        ? visibleDetails.reduce((s, det) => s + totalMonthKeys.reduce((ms, mk) => ms + (getRowData(category, det)?.months[mk] ?? 0), 0), 0)
        : totalMonthKeys.reduce((ms, mk) => ms + (getRowData(category, detail)?.months[mk] ?? 0), 0);
      return total / fullMonthCount;
    }
    if (detail === null) {
      const visibleDetails = (layout.detailOrder[category] ?? allDetails(category))
        .filter(d => !(layout.hiddenDetails[category] ?? []).includes(d));
      return visibleDetails.reduce((s, det) => s + (getRowData(category, det)?.months[key] ?? 0), 0);
    }
    return getRowData(category, detail)?.months[key] ?? 0;
  }

  // Visible categories: in layout order, not excluded, has at least one non-zero value across visible details
  const visibleCategories = layout.categoryOrder.filter(cat => {
    if (excludeCategories.includes(cat)) return false;
    if (!allCategories.includes(cat)) return false;
    const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
      .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
    // Has data in at least one cell
    return visibleDetails.some(det => {
      const row = getRowData(cat, det);
      return row && Object.values(row.months).some(v => v > 0);
    });
  });

  const sortedCategories = sortKey === null
    ? visibleCategories
    : [...visibleCategories].sort((a, b) => {
        const diff = getSortValue(a, null, sortKey) - getSortValue(b, null, sortKey);
        return sortDir === 'desc' ? -diff : diff;
      });

  return (
    <div className="flex flex-col flex-1 px-4 py-6">

      {/* ── Filter area ───────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-4 items-end">

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-stone-500 dark:text-zinc-400">기간</label>
          <div className="flex gap-2 items-center">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-900 dark:text-zinc-50 text-xs focus:outline-none focus:border-stone-400 shadow-sm" />
            <span className="text-stone-500 dark:text-zinc-300 text-xs">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-900 dark:text-zinc-50 text-xs focus:outline-none focus:border-stone-400 shadow-sm" />
          </div>
        </div>

        {/* Cross-activity filter */}
        {crossActivityOptions.length > 0 && (
          <MultiSelectDropdown
            label="활동구분"
            options={crossActivityOptions}
            selected={selectedCrossActivities}
            onChange={setSelectedCrossActivities}
          />
        )}

        {/* Exclude purchase items */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-stone-500 dark:text-zinc-400">특정 구매항목 제외 (쉼표 구분)</label>
          <input
            type="text"
            value={excludePurchaseInput}
            onChange={e => setExcludePurchaseInput(e.target.value)}
            placeholder="예: E350, Sofa"
            className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-900 dark:text-zinc-50 placeholder-stone-400 text-xs focus:outline-none focus:border-stone-400 w-56 shadow-sm"
          />
        </div>

        {/* 조회 button */}
        <button
          onClick={handleFetch}
          disabled={loading}
          className="px-4 py-2 bg-stone-800 dark:bg-zinc-700 text-white rounded text-xs font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 transition-colors disabled:opacity-40"
        >
          {loading ? '로딩 중…' : '조회'}
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {data && !loading && (
        <div className="w-fit">
          <div className="text-xs text-stone-500 dark:text-zinc-400 text-right mb-1">단위: 천원</div>
          <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-zinc-700 shadow-sm inline-block">
            <table className="text-sm border-collapse" style={{ minWidth: `${200 + monthKeys.length * 80 + 80}px` }}>
              <thead>
                <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800">
                  <th className="text-left px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700 w-48">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">카테고리 / 세부항목</span>
                      {allCategories.length > 0 && (
                        <CategoryExclusionDropdown
                          allCategories={allCategories}
                          excludeCategories={excludeCategories}
                          onToggle={toggleExcludeCategory}
                        />
                      )}
                    </div>
                  </th>
                  <th
                    className="text-right px-2 py-1 text-xs text-stone-500 dark:text-zinc-400 font-medium border-r-2 border-stone-300 dark:border-zinc-600 w-20 cursor-pointer hover:text-stone-800 dark:hover:text-zinc-100 select-none"
                    onClick={() => handleSortClick('avg')}
                  >
                    월평균<SortIndicator colKey="avg" />
                  </th>
                  {monthKeys.map((mk, i) => {
                    const isPartial = !fullMonthKeys.includes(mk);
                    return (
                      <th
                        key={mk}
                        className="text-right px-2 py-1 text-xs text-stone-500 dark:text-zinc-400 font-medium whitespace-nowrap w-20 cursor-pointer hover:text-stone-800 dark:hover:text-zinc-100 select-none"
                        onClick={() => handleSortClick(mk)}
                      >
                        {formatMonthLabel(mk, monthKeys[i - 1])}{isPartial ? '*' : ''}<SortIndicator colKey={mk} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* 월 합계 row */}
                <tr className="border-b-2 border-stone-300 dark:border-zinc-600 bg-stone-50 dark:bg-zinc-800">
                  <td className="px-3 py-2 sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700">
                    <span className="text-xs font-medium text-stone-500 dark:text-zinc-400">월 합계</span>
                  </td>
                  <td className="px-2 py-1 text-right border-r-2 border-stone-300 dark:border-zinc-600">
                    <span className="text-xs font-mono text-stone-900 dark:text-zinc-50">
                      {formatKRW(
                        Math.round(sortedCategories.reduce((s, cat) => {
                          const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                            .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
                          return s + visibleDetails.reduce((ds, det) => {
                            const detRow = getRowData(cat, det);
                            return ds + totalMonthKeys.reduce((ms, mk) => ms + (detRow?.months[mk] ?? 0), 0);
                          }, 0);
                        }, 0) / fullMonthCount)
                      )}
                    </span>
                  </td>
                  {monthKeys.map(mk => {
                    let colTotal = 0;
                    for (const cat of sortedCategories) {
                      const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                        .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
                      for (const det of visibleDetails) {
                        colTotal += getRowData(cat, det)?.months[mk] ?? 0;
                      }
                    }
                    return (
                      <td key={mk} className="px-2 py-1 text-right">
                        <span className="text-xs font-mono text-stone-600 dark:text-zinc-300">
                          {colTotal > 0 ? formatKRW(colTotal) : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Category + detail rows */}
                {sortedCategories.map(cat => {
                  const isCollapsed = layout.collapsed[cat] ?? false;
                  const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                    .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d))
                    .filter(d => {
                      // Hide detail rows with no data
                      const row = getRowData(cat, d);
                      return row && Object.values(row.months).some(v => v > 0);
                    });

                  const sortedVisibleDetails = sortKey === null
                    ? visibleDetails
                    : [...visibleDetails].sort((a, b) => {
                        const diff = getSortValue(cat, a, sortKey) - getSortValue(cat, b, sortKey);
                        return sortDir === 'desc' ? -diff : diff;
                      });

                  // Recalculate category totals from visible details only
                  const catMonths: Record<string, number> = {};
                  for (const det of visibleDetails) {
                    const detRow = getRowData(cat, det);
                    if (!detRow) continue;
                    for (const [mk, v] of Object.entries(detRow.months)) {
                      catMonths[mk] = (catMonths[mk] ?? 0) + v;
                    }
                  }

                  return (
                    <React.Fragment key={cat}>
                      <CostCategoryRow
                        category={cat}
                        months={catMonths}
                        collapsed={isCollapsed}
                        onToggle={() => toggleCollapsed(cat)}
                        onCellClick={mk => setDrill({
                          category: cat,
                          categoryDetail: null,
                          monthKey: mk,
                          monthLabel: formatMonthLabel(mk),
                          hiddenDetails: layout.hiddenDetails[cat] ?? [],
                          crossActivities: selectedCrossActivities,
                          dateFrom,
                          dateTo,
                        })}
                        monthKeys={monthKeys}
                        fullMonthKeys={totalMonthKeys}
                        fullMonthCount={fullMonthCount}
                        allDetails={layout.detailOrder[cat] ?? allDetails(cat)}
                        hiddenDetails={layout.hiddenDetails[cat] ?? []}
                        onToggleDetail={det => toggleHiddenDetail(cat, det)}
                        onMoveUp={() => moveCategoryUp(cat)}
                        onMoveDown={() => moveCategoryDown(cat)}
                      />
                      {!isCollapsed && sortedVisibleDetails.map(det => {
                        const detRow = getRowData(cat, det);
                        if (!detRow) return null;
                        return (
                          <CostDetailRow
                            key={`${cat}:${det}`}
                            category={cat}
                            detail={det}
                            months={detRow.months}
                            fullMonthKeys={totalMonthKeys}
                            fullMonthCount={fullMonthCount}
                            onCellClick={mk => setDrill({
                              category: cat,
                              categoryDetail: det,
                              monthKey: mk,
                              monthLabel: formatMonthLabel(mk),
                              hiddenDetails: [],
                              crossActivities: selectedCrossActivities,
                              dateFrom,
                              dateTo,
                            })}
                            monthKeys={monthKeys}
                            onMoveUp={() => moveDetailUp(cat, det)}
                            onMoveDown={() => moveDetailDown(cat, det)}
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {fullMonthKeys.length < monthKeys.length && (
            <p className="text-xs text-stone-400 dark:text-zinc-500 mt-1">* 부분 월 (월평균 계산 제외)</p>
          )}
        </div>
      )}

      {loading && (
        <p className="text-xs text-stone-500 dark:text-zinc-300 mt-8">데이터를 불러오는 중…</p>
      )}

      {drill && (
        <DrillDownSidebar drill={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
