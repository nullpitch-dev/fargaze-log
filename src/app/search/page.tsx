'use client';

import { useState, useCallback, useMemo } from 'react';
import { DetailPanel, type LogEntry, formatDate, formatDuration, formatKRW } from '@/app/_components/LogDetailPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Aggregation {
  count: number; sum: number; avg: number; min: number; max: number;
}

interface SearchResponse {
  query: string; total: number; results: LogEntry[];
  aggregations: Record<string, Aggregation>;
  searchMode: 'atlas' | 'regex';
}

interface FieldCondition {
  id: number; field: string; value: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: 'activity.name',           label: '활동명' },
  { value: 'activity.title',          label: '제목' },
  { value: 'activity.additionalInfo', label: '추가정보' },
  { value: 'activity.category',       label: '카테고리' },
  { value: 'location.activity',       label: '장소' },
  { value: 'purchase.item',           label: '구매항목' },
  { value: 'people.target',           label: '사람' },
  { value: 'cost.category',           label: '비용카테고리' },
  { value: 'transport.from',          label: '출발지' },
  { value: 'transport.to',            label: '도착지' },
  { value: 'travel.city',             label: '여행도시' },
  { value: 'notes',                   label: '메모' },
];

const AGG_LABELS: Record<string, string> = {
  'cost.amountKRW':       '비용 (원)',
  'cost.amountForeign':   '비용 (외화)',
  'duration.totalSeconds':'소요 시간',
  'income.gross':         '수입 (세전)',
  'income.net':           '수입 (세후)',
  'body.weight':          '체중',
  'golf.score':           '골프 스코어',
  'golf.approach':        '어프로치',
  'golf.putts':           '퍼팅',
};

function formatAggValue(field: string, value: number): string {
  if (field === 'duration.totalSeconds') return formatDuration(value);
  if (field.includes('KRW') || field.includes('gross') || field.includes('net')) return formatKRW(value);
  if (field === 'body.weight') return `${value.toFixed(1)} kg`;
  return value.toLocaleString('ko-KR');
}

// ── Result sorting ────────────────────────────────────────────────────────────

type SortKey = 'date' | 'activity' | 'location' | 'purchase' | 'cost' | 'duration';
type SortDir = 'asc' | 'desc';

const RESULT_COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; width?: string }[] = [
  { key: 'date',     label: '날짜 / 시간', align: 'right', width: 'w-24' },
  { key: 'activity', label: '활동 / 내용', align: 'left'                 },
  { key: 'location', label: '장소',        align: 'left',  width: 'w-24' },
  { key: 'purchase', label: '구매',        align: 'left',  width: 'w-24' },
  { key: 'cost',     label: '비용',        align: 'right', width: 'w-24' },
  { key: 'duration', label: '소요',        align: 'right', width: 'w-20' },
];

// Numeric columns default to descending on first click (newest / biggest first);
// text columns default to ascending. getVal returns null/'' for missing values,
// which always sort to the bottom regardless of direction.
const SORT_COLS: Record<SortKey, { numeric: boolean; getVal: (e: LogEntry) => number | string | null }> = {
  date: {
    numeric: true,
    getVal: e => {
      const s = e.start;
      if (!s?.year) return null;
      const ymd = s.year * 10000 + (s.month ?? 1) * 100 + (s.day ?? 1);
      let mins = 0;
      if (!e.allDay && s.hour) {
        const m = s.hour.match(/(\d{1,2}):(\d{2})/);
        if (m) mins = Number(m[1]) * 60 + Number(m[2]);
      }
      return ymd * 10000 + mins;
    },
  },
	activity: { numeric: false, getVal: e => e.activity?.title || e.activity?.name || '' },
  location: { numeric: false, getVal: e => e.location?.activity ?? '' },
  purchase: {
    numeric: false,
    getVal: e => {
      const items = (e.purchase ?? []).map(p => p.item).filter(Boolean) as string[];
      return items.length ? items.slice().sort((a, b) => a.localeCompare(b, 'ko'))[0] : '';
    },
  },
  cost:     { numeric: true, getVal: e => e.cost?.amountKRW ?? null },
  duration: { numeric: true, getVal: e => e.duration?.totalSeconds ?? null },
};

const defaultDir = (key: SortKey): SortDir => (SORT_COLS[key].numeric ? 'desc' : 'asc');

// ── Main Page ─────────────────────────────────────────────────────────────────

let conditionIdCounter = 1;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [conditions, setConditions] = useState<FieldCondition[]>([]);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
	const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  function addCondition() {
    setConditions(prev => [...prev, { id: conditionIdCounter++, field: 'activity.title', value: '' }]);
  }

  function removeCondition(id: number) {
    setConditions(prev => prev.filter(c => c.id !== id));
  }

  function updateCondition(id: number, key: 'field' | 'value', val: string) {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  }

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    const activeConditions = conditions.filter(c => c.value.trim());

    if (!q && activeConditions.length === 0 && !dateFrom && !dateTo) return;

    setLoading(true);
    setError(null);
		setResponse(null);
    setSelectedEntry(null);
    setSort(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (activeConditions.length > 0) {
        params.set('conditions', activeConditions.map(c => `${c.field}:${c.value.trim()}`).join('|'));
      }

      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Search failed');
      }
      setResponse(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, conditions, dateFrom, dateTo]);

	function cycleSort(key: SortKey) {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: defaultDir(key) };
      if (prev.dir === defaultDir(key)) return { key, dir: defaultDir(key) === 'asc' ? 'desc' : 'asc' };
      return null; // third click → back to original (relevance / newest-first) order
    });
  }

  // Client-side sort over the (≤100) results already in hand. Stable, with
  // missing values pinned to the bottom in either direction. null sort = API order.
  const sortedResults = useMemo(() => {
    if (!response) return [] as LogEntry[];
    if (!sort) return response.results;
    const { getVal } = SORT_COLS[sort.key];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return response.results
      .map((entry, i) => ({ entry, i, val: getVal(entry) }))
      .sort((a, b) => {
        const aE = a.val === null || a.val === undefined || a.val === '';
        const bE = b.val === null || b.val === undefined || b.val === '';
        if (aE && bE) return a.i - b.i;
        if (aE) return 1;
        if (bE) return -1;
        let cmp: number;
        if (typeof a.val === 'number' && typeof b.val === 'number') cmp = a.val - b.val;
        else cmp = String(a.val).localeCompare(String(b.val), 'ko');
        return cmp !== 0 ? cmp * dir : a.i - b.i;
      })
      .map(d => d.entry);
  }, [response, sort]);

  const hasAggregations = response && Object.keys(response.aggregations).length > 0;
  const hasActiveFilters = conditions.some(c => c.value.trim()) || dateFrom || dateTo;

  return (
    <div className="flex flex-col flex-1 px-4 py-8 max-w-6xl mx-auto w-full">

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-3 mb-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='검색어 입력… (예: Brita "정수기 필터")'
            className="flex-1 bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded-lg px-4 py-3 text-stone-900 dark:text-zinc-50 placeholder-stone-400 focus:outline-none focus:border-stone-400 text-sm shadow-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-stone-800 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {loading ? '검색 중…' : '검색'}
          </button>
        </div>

        {/* Active filters hint */}
        {query && hasActiveFilters && (
          <p className="text-xs text-stone-500 dark:text-zinc-300 mb-2 pl-1">
            &ldquo;{query}&rdquo; + 아래 조건 적용 중
          </p>
        )}

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="text-xs text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-100 dark:text-zinc-300 transition-colors flex items-center gap-1 pl-1"
        >
          <span>{showAdvanced ? '▾' : '▸'}</span>
          <span>상세 검색</span>
          {hasActiveFilters && <span className="ml-1 text-stone-500 dark:text-zinc-400">●</span>}
        </button>

        {/* Advanced panel */}
        {showAdvanced && (
          <div className="mt-4 p-4 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg space-y-4 shadow-sm">

            {/* Date range */}
            <div>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mb-2">기간</p>
              <div className="flex gap-3 items-center">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-800 dark:text-zinc-100 text-xs focus:outline-none focus:border-stone-400"
                />
                <span className="text-stone-400 dark:text-zinc-500 text-xs">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-800 dark:text-zinc-100 text-xs focus:outline-none focus:border-stone-400"
                />
                {(dateFrom || dateTo) && (
                  <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-100 dark:text-zinc-300 text-xs">초기화</button>
                )}
              </div>
            </div>

            {/* Field conditions */}
            <div>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mb-2">필드 조건 (AND)</p>
              <div className="space-y-2">
                {conditions.map(cond => (
                  <div key={cond.id} className="flex gap-2 items-center">
                    <select
                      value={cond.field}
                      onChange={e => updateCondition(cond.id, 'field', e.target.value)}
                      className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-800 dark:text-zinc-100 text-xs focus:outline-none focus:border-stone-400"
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={cond.value}
                      onChange={e => updateCondition(cond.id, 'value', e.target.value)}
                      placeholder="값 입력…"
                      className="flex-1 bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-stone-800 dark:text-zinc-100 placeholder-stone-400 text-xs focus:outline-none focus:border-stone-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeCondition(cond.id)}
                      className="text-stone-500 dark:text-zinc-300 hover:text-stone-800 dark:hover:text-zinc-100 dark:text-zinc-300 transition-colors px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCondition}
                className="mt-2 text-xs text-stone-500 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-zinc-50 dark:text-zinc-200 transition-colors flex items-center gap-1"
              >
                <span>+</span> 조건 추가
              </button>
            </div>

          </div>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Aggregations */}
      {hasAggregations && (
        <div className="mb-6">
          <p className="text-xs text-stone-500 dark:text-zinc-400 uppercase tracking-widest mb-3">집계</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(response!.aggregations).map(([field, agg]) => (
              <div key={field} className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-xs text-stone-500 dark:text-zinc-300 mb-1.5">{AGG_LABELS[field] ?? field}</p>
                <p className="text-sm font-medium text-stone-800 dark:text-zinc-100">합계 {formatAggValue(field, agg.sum)}</p>
                <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">평균 {formatAggValue(field, agg.avg)} · {agg.count}건</p>
                <p className="text-xs text-stone-500 dark:text-zinc-300 mt-0.5">최소 {formatAggValue(field, agg.min)} · 최대 {formatAggValue(field, agg.max)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {response && (
        <>
          <p className="text-xs text-stone-500 dark:text-zinc-400 uppercase tracking-widest mb-3">
            {response.total}건의 결과
            {response.searchMode === 'regex' && (
              <span className="ml-2 normal-case text-stone-500 dark:text-zinc-300">· 포함 검색</span>
            )}
          </p>
          {response.total === 0 ? (
            <p className="text-stone-500 dark:text-zinc-300 text-sm">검색 결과가 없습니다.</p>
          ) : (
            <div className="border border-stone-200 dark:border-zinc-700 rounded-lg overflow-x-auto shadow-sm">
              <table className="w-full text-sm min-w-[640px]">
								<thead>
                  <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800">
                    {RESULT_COLUMNS.map(col => {
                      const active = sort?.key === col.key;
                      const arrow = active ? (sort!.dir === 'asc' ? '▲' : '▼') : '';
                      return (
                        <th
                          key={col.key}
                          onClick={() => cycleSort(col.key)}
                          className={`${col.align === 'right' ? 'text-right' : 'text-left'} px-3 py-2 text-xs font-medium ${col.width ?? ''} cursor-pointer select-none transition-colors ${
                            active
                              ? 'text-stone-700 dark:text-zinc-200'
                              : 'text-stone-500 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-200'
                          }`}
                        >
                          <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                            {col.label}
                            <span className="text-[8px] w-2 inline-block leading-none">{arrow}</span>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
									{sortedResults.map((entry, i) => (
                    <tr
                      key={entry._id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 dark:bg-zinc-800 cursor-pointer transition-colors ${
                        i === sortedResults.length - 1 ? 'border-b-0' : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-right">
                        <p className="text-stone-600
                        dark:text-zinc-300">{formatDate(entry.start)}</p>
                        {!entry.allDay && entry.start?.hour && (
                          <p className="text-stone-500 dark:text-zinc-300 mt-0.5">{entry.start.hour}</p>
                        )}
                        {entry.allDay && <p className="text-stone-500 dark:text-zinc-300 mt-0.5">하루종일</p>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-stone-500 dark:text-zinc-300 text-xs">{entry.activity?.category ?? ''} · {entry.activity?.name ?? '—'}</p>
                        {entry.activity?.title && <p className="text-stone-800 dark:text-zinc-100 text-xs font-medium mt-0.5">{entry.activity.title}</p>}
                        {!entry.activity?.title && <p className="text-stone-800 dark:text-zinc-100 text-xs font-medium">{entry.activity?.name ?? '—'}</p>}
                        {entry.activity?.additionalInfo && (
                          <p className="text-stone-500 dark:text-zinc-300 text-xs mt-0.5">{entry.activity.additionalInfo}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-stone-500 dark:text-zinc-300 text-xs">{entry.location?.activity ?? '—'}</td>
                      <td className="px-3 py-2 text-stone-500 dark:text-zinc-300 text-xs">
                        {(entry.purchase ?? []).length > 0
                          ? entry.purchase!.map(p => p.item).filter(Boolean).join(', ')
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {entry.cost?.amountKRW ? (
                          <span className="text-stone-600 dark:text-zinc-300">{formatKRW(entry.cost.amountKRW)}</span>
                        ) : entry.cost?.amountForeign ? (
                          <span className="text-stone-500 dark:text-zinc-400">{entry.cost.amountForeign.toLocaleString()} {entry.cost.currency}</span>
                        ) : (
                          <span className="text-stone-300 dark:text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-stone-500 dark:text-zinc-300">
                        {formatDuration(entry.duration?.totalSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Detail panel */}
      {selectedEntry && (
        <DetailPanel entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

    </div>
  );
}
