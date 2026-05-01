'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  start?: { year?: number; month?: number; day?: number; hour?: string; timezone?: string; datetime?: string };
  end?: { hour?: string };
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
}

interface Layout {
  categoryOrder: string[];
  detailOrder: Record<string, string[]>;
  collapsed: Record<string, boolean>;
  hiddenDetails: Record<string, string[]>;
}

const LAYOUT_KEY = 'fargaze-cost-layout';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M';
  if (amount >= 1_000) return (amount / 1_000).toFixed(0) + 'K';
  return amount.toLocaleString('ko-KR');
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

function formatDate(tx: Transaction): string {
  const s = tx.start;
  if (!s?.year) return '—';
  const yy = String(s.year).slice(2);
  const mm = String(s.month ?? 1).padStart(2, '0');
  const dd = String(s.day ?? 1).padStart(2, '0');
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

// ── Detail Panel (reused from search) ─────────────────────────────────────────

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
      <p className="text-xs text-stone-500 dark:text-zinc-300 uppercase tracking-widest mb-1.5">{title}</p>
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
          <button onClick={onClose} className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-200 dark:text-zinc-200 transition-colors text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4">
          <DetailSection title="활동">
            <DetailRow label="카테고리" value={entry.activity?.category} />
            <DetailRow label="활동명" value={entry.activity?.name} />
            <DetailRow label="제목" value={entry.activity?.title} />
            <DetailRow label="추가정보" value={entry.activity?.additionalInfo} />
          </DetailSection>
          <DetailSection title="시간">
            <DetailRow label="시작" value={s?.hour ? `${formatDate(entry)} ${s.hour} (${s.timezone})` : formatDate(entry)} />
            <DetailRow label="종료" value={e?.hour ? `${e.hour}` : undefined} />
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

// ── Drill-Down Sidebar ─────────────────────────────────────────────────────────

function DrillDownSidebar({
  drill,
  onClose,
}: {
  drill: DrillDownState;
  onClose: () => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    const [year, month] = drill.monthKey.split('-');
    const dateFrom = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    const params = new URLSearchParams({ category: drill.category, dateFrom, dateTo });
    if (drill.categoryDetail) params.set('categoryDetail', drill.categoryDetail);
    fetch(`/api/cost-transactions?${params}`)
      .then(r => r.json())
      .then(d => { setTransactions(d.results ?? []); setLoading(false); });
  }, [drill]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white dark:bg-zinc-900 border-l border-stone-200 dark:border-zinc-700 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="border-b border-stone-200 dark:border-zinc-700 px-4 py-3 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-xs text-stone-500 dark:text-zinc-400">{drill.monthLabel}</p>
            <p className="text-sm font-medium text-stone-900 dark:text-zinc-50">{drill.category}</p>
            {drill.categoryDetail && <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">{drill.categoryDetail}</p>}
          </div>
          <button onClick={onClose} className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-200 dark:text-zinc-200 transition-colors text-xl leading-none mt-0.5">×</button>
        </div>
        {/* Transaction list */}
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
                  className="w-full text-left px-4 py-3 border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono">{formatDate(tx)}</p>
                      <p className="text-xs text-stone-800 dark:text-zinc-200 font-medium mt-0.5 truncate">
                        {tx.activity?.name ?? '—'}
                      </p>
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
        {/* Total */}
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

// ── Sortable Category Row ──────────────────────────────────────────────────────

function SortableCategoryRow({
  category,
  months,
  total,
  collapsed,
  onToggle,
  onCellClick,
  monthKeys,
  allDetails,
  hiddenDetails,
  onToggleDetail,
}: {
  category: string;
  months: Record<string, number>;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  onCellClick: (monthKey: string) => void;
  monthKeys: string[];
  allDetails: string[];
  hiddenDetails: string[];
  onToggleDetail: (detail: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `cat:${category}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  const hiddenCount = hiddenDetails.length;

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800/50 hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors">
      <td className="px-3 py-2 sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing text-xs leading-none px-0.5">⠿</button>
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
              <div className="fixed z-[9999] bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[180px] py-1 max-h-64 overflow-y-auto"
                onMouseDown={e => e.stopPropagation()} style={(() => {
                  if (!filterRef.current) return {};
                  const rect = filterRef.current.getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const spaceAbove = rect.top;
                  if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
                    return { top: rect.bottom + 4, left: rect.left };
                  } else {
                    return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
                  }
                })()}>
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
      {monthKeys.map(mk => (
        <td key={mk} className="px-3 py-2 text-right">
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
      <td className="px-3 py-2 text-right border-l border-stone-200 dark:border-zinc-700">
        <span className="text-xs font-mono text-stone-600 dark:text-zinc-300">{formatKRW(total)}</span>
      </td>
    </tr>
  );
}






// ── Sortable Detail Row ────────────────────────────────────────────────────────

function SortableDetailRow({
  category,
  detail,
  months,
  total,
  onCellClick,
  monthKeys,
}: {
  category: string;
  detail: string;
  months: Record<string, number>;
  total: number;
  onCellClick: (monthKey: string) => void;
  monthKeys: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `det:${category}:${detail}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 dark:bg-zinc-800/80 transition-colors">
      <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-stone-200 dark:border-zinc-700">
        <div className="flex items-center gap-2 pl-6">
          <button {...attributes} {...listeners} className="text-zinc-800 hover:text-stone-500 dark:text-zinc-300 cursor-grab active:cursor-grabbing text-xs leading-none px-0.5">⠿</button>
          <span className="text-xs text-stone-500 dark:text-zinc-400">{detail}</span>
        </div>
      </td>
      {monthKeys.map(mk => (
        <td key={mk} className="px-3 py-1.5 text-right">
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
      <td className="px-3 py-1.5 text-right border-l border-zinc-800">
        <span className="text-xs font-mono text-stone-500 dark:text-zinc-300">{formatKRW(total)}</span>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CostPage() {
  // Filters
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [excludeCategories, setExcludeCategories] = useState<string[]>([]);

  const [excludePurchaseInput, setExcludePurchaseInput] = useState('');

  // Data
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Layout
  const [layout, setLayout] = useState<Layout>({ categoryOrder: [], detailOrder: {}, collapsed: {}, hiddenDetails: {} });
  const layoutLoaded = useRef(false);

  // Drill-down
  const [drill, setDrill] = useState<DrillDownState | null>(null);

  // All categories and details from data
  const allCategories = data ? [...new Set(data.rows.filter(r => r.categoryDetail === null).map(r => r.category))] : [];
  const allDetails = (cat: string) => data
    ? data.rows.filter(r => r.category === cat && r.categoryDetail !== null).map(r => r.categoryDetail as string)
    : [];

  // Load layout from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) setLayout(JSON.parse(saved));
    } catch {}
    layoutLoaded.current = true;
  }, []);

  // Save layout to localStorage
  const saveLayout = useCallback((l: Layout) => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch {}
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ dateFrom, dateTo });
    const excludePurchaseItems = excludePurchaseInput.split(',').map(s => s.trim()).filter(Boolean);
    if (excludePurchaseItems.length > 0) params.set('excludePurchaseItems', excludePurchaseItems.join(','));
    const res = await fetch(`/api/cost-summary?${params}`);
    const json: SummaryResponse = await res.json();
    setData(json);
    setLoading(false);

    // Initialise layout for new categories
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
  }, [dateFrom, dateTo, excludePurchaseInput]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('cat:') && overId.startsWith('cat:')) {
      const from = activeId.slice(4);
      const to = overId.slice(4);
      const oldIndex = layout.categoryOrder.indexOf(from);
      const newIndex = layout.categoryOrder.indexOf(to);
      saveLayout({ ...layout, categoryOrder: arrayMove(layout.categoryOrder, oldIndex, newIndex) });
    } else if (activeId.startsWith('det:') && overId.startsWith('det:')) {
      const [, cat, fromDet] = activeId.split(':');
      const [, , toDet] = overId.split(':');
      const order = layout.detailOrder[cat] ?? [];
      const oldIndex = order.indexOf(fromDet);
      const newIndex = order.indexOf(toDet);
      saveLayout({ ...layout, detailOrder: { ...layout.detailOrder, [cat]: arrayMove(order, oldIndex, newIndex) } });
    }
  }

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
    setExcludeCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  }



  // Build visible rows
  const monthKeys = data?.months ?? [];

  function getRowData(category: string, detail: string | null) {
    return data?.rows.find(r => r.category === category && r.categoryDetail === detail);
  }

  const sortedCategories = layout.categoryOrder.filter(cat =>
    !excludeCategories.includes(cat) && allCategories.includes(cat)
  );

  const catItems = sortedCategories.map(cat => `cat:${cat}`);

  return (
    <div className="flex flex-col flex-1 px-4 py-6 max-w-full">

      {/* Filters */}
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

        {/* Exclude purchase items */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-stone-500 dark:text-zinc-400">구매항목 제외 (쉼표 구분)</label>
          <input
            type="text"
            value={excludePurchaseInput}
            onChange={e => setExcludePurchaseInput(e.target.value)}
            placeholder="예: 에르메스, 구매/할부"
            className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-900 dark:text-zinc-50 placeholder-stone-400 text-xs focus:outline-none focus:border-stone-400 w-56 shadow-sm"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 bg-stone-800 dark:bg-zinc-700 text-white rounded text-xs font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40"
        >
          {loading ? '로딩 중…' : '조회'}
        </button>
      </div>

      {/* Category exclusion chips */}
      {allCategories.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-stone-500 dark:text-zinc-300 mb-2">카테고리 제외 (클릭하여 숨기기)</p>
          <div className="flex flex-wrap gap-2">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => toggleExcludeCategory(cat)}
                className={`px-2 py-1 rounded text-xs transition-colors border ${
                  excludeCategories.includes(cat)
                    ? 'bg-stone-100 dark:bg-zinc-800 border-stone-300 dark:border-zinc-600 text-stone-500 dark:text-zinc-300 line-through'
                    : 'bg-white dark:bg-zinc-900 border-stone-300 dark:border-zinc-600 text-stone-600 dark:text-zinc-300 hover:border-stone-500'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {data && !loading && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-zinc-700 shadow-sm">
          <table className="text-sm border-collapse" style={{ minWidth: `${200 + monthKeys.length * 100 + 80}px` }}>
            <thead>
              <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800">
                <th className="text-left px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700 w-48">
                  카테고리 / 세부항목
                </th>
                {monthKeys.map((mk, i) => (
                  <th key={mk} className="text-right px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium whitespace-nowrap w-24">
                    {formatMonthLabel(mk, monthKeys[i - 1])}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium border-l border-stone-200 dark:border-zinc-700 w-20">
                  합계
                </th>
              </tr>
            </thead>
              <tbody>
                <SortableContext items={catItems} strategy={verticalListSortingStrategy}>
                  {sortedCategories.map(cat => {
                    const catRow = getRowData(cat, null);
                    if (!catRow) return null;
                    const isCollapsed = layout.collapsed[cat] ?? false;
                    const detailIds = (layout.detailOrder[cat] ?? allDetails(cat))
                      .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d))
                      .map(d => `det:${cat}:${d}`);

                    // Recalculate category row excluding hidden details
                    const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                      .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
                    const catMonths: Record<string, number> = {};
                    let catTotal = 0;
                    for (const det of visibleDetails) {
                      const detRow = getRowData(cat, det);
                      if (!detRow) continue;
                      for (const [mk, v] of Object.entries(detRow.months)) {
                        catMonths[mk] = (catMonths[mk] ?? 0) + v;
                        catTotal += v;
                      }
                    }

                    return (
                      <SortableContext key={cat} items={detailIds} strategy={verticalListSortingStrategy}>
                        <SortableCategoryRow
                          category={cat}
                          months={catMonths}
                          total={catTotal}
                          collapsed={isCollapsed}
                          onToggle={() => toggleCollapsed(cat)}
                          onCellClick={mk => setDrill({ category: cat, categoryDetail: null, monthKey: mk, monthLabel: formatMonthLabel(mk) })}
                          monthKeys={monthKeys}
                          allDetails={layout.detailOrder[cat] ?? allDetails(cat)}
                          hiddenDetails={layout.hiddenDetails[cat] ?? []}
                          onToggleDetail={det => toggleHiddenDetail(cat, det)}
                        />
                        {!isCollapsed && visibleDetails.map(det => {
                          const detRow = getRowData(cat, det);
                          if (!detRow) return null;
                          return (
                            <SortableDetailRow
                              key={`${cat}:${det}`}
                              category={cat}
                              detail={det}
                              months={detRow.months}
                              total={detRow.total}
                              onCellClick={mk => setDrill({ category: cat, categoryDetail: det, monthKey: mk, monthLabel: formatMonthLabel(mk) })}
                              monthKeys={monthKeys}
                            />
                          );
                        })}
                      </SortableContext>
                    );
                  })}
                </SortableContext>

                {/* Column totals */}
                <tr className="border-t-2 border-stone-300 dark:border-zinc-600 bg-stone-50 dark:bg-zinc-800">
                  <td className="px-3 py-2 sticky left-0 bg-stone-50 dark:bg-zinc-800 z-10 border-r border-stone-200 dark:border-zinc-700">
                    <span className="text-xs font-medium text-stone-500 dark:text-zinc-400">월 합계</span>
                  </td>
                  {monthKeys.map(mk => {
                    // Recalculate column total based on visible rows
                    let colTotal = 0;
                    for (const cat of sortedCategories) {
                      const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                        .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
                      for (const det of visibleDetails) {
                        const detRow = getRowData(cat, det);
                        colTotal += detRow?.months[mk] ?? 0;
                      }
                    }
                    return (
                      <td key={mk} className="px-3 py-2 text-right">
                        <span className="text-xs font-mono text-stone-600 dark:text-zinc-300">
                          {colTotal > 0 ? formatKRW(colTotal) : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right border-l border-stone-200 dark:border-zinc-700">
                    <span className="text-xs font-mono text-stone-900 dark:text-zinc-50">
                      {formatKRW(
                        sortedCategories.reduce((s, cat) => {
                          const visibleDetails = (layout.detailOrder[cat] ?? allDetails(cat))
                            .filter(d => !(layout.hiddenDetails[cat] ?? []).includes(d));
                          return s + visibleDetails.reduce((ds, det) => ds + (getRowData(cat, det)?.total ?? 0), 0);
                        }, 0)
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
          </table>
        </div>
        </DndContext>
      )}

      {loading && (
        <p className="text-xs text-stone-500 dark:text-zinc-300 mt-8">데이터를 불러오는 중…</p>
      )}

      {/* Drill-down sidebar */}
      {drill && (
        <DrillDownSidebar
          drill={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
