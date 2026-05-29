'use client';

import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  _id: string;
  score: number;
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
    drinks?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
    foods?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
    alcohols?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
  };
  people?: Array<{ method?: string; category?: string; target?: string }>;
  transport?: { from?: string; to?: string; purpose?: string; method?: string; returnType?: string };
  bowel?: { amount?: string; quality?: string; characteristics?: string };
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

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(d?: { year?: number; month?: number; day?: number }): string {
  if (!d?.year) return '—';
  const yy = String(d.year).slice(2);
  const mm = String(d.month ?? 1).padStart(2, '0');
  const dd = String(d.day ?? 1).padStart(2, '0');
  return "'" + yy + '.' + mm + '.' + dd;
}

function formatDatetime(entry: LogEntry): string {
  const date = formatDate(entry.start);
  if (entry.allDay) return date + ' 하루종일';
  const hour = entry.start?.hour;
  if (!hour) return date;
  return date + ' ' + hour;
}

function formatTime(entry: LogEntry): string {
  if (entry.allDay) return '하루 종일';
  const start = entry.start?.hour ?? '';
  const end = entry.end?.hour ?? '';
  if (!start) return '—';
  return end ? `${start} → ${end}` : start;
}

function formatDuration(seconds?: number | null): string {
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

function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

function formatAggValue(field: string, value: number): string {
  if (field === 'duration.totalSeconds') return formatDuration(value);
  if (field.includes('KRW') || field.includes('gross') || field.includes('net')) return formatKRW(value);
  if (field === 'body.weight') return `${value.toFixed(1)} kg`;
  return value.toLocaleString('ko-KR');
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

function DetailPanel({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const s = entry.start;
  const e = entry.end;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
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
              {(entry.food.drinks ?? []).map((d, i) => <DetailRow key={`d${i}`} label="음료" value={[d.item, d.amount, d.unit, d.note].filter(Boolean).join(' ')} />)}
              {(entry.food.foods ?? []).map((f, i) => <DetailRow key={`f${i}`} label="음식" value={[f.item, f.amount, f.unit, f.note].filter(Boolean).join(' ')} />)}
              {(entry.food.alcohols ?? []).map((a, i) => <DetailRow key={`a${i}`} label="술" value={[a.item, a.amount, a.unit, a.note].filter(Boolean).join(' ')} />)}
            </DetailSection>
          )}

          {entry.body && (entry.body.weight || entry.body.muscleMass || entry.body.bodyFat) && (
            <DetailSection title="신체">
              <DetailRow label="체중" value={entry.body.weight ? `${entry.body.weight} kg` : undefined} />
              <DetailRow label="골격근량" value={entry.body.muscleMass ? `${entry.body.muscleMass} kg` : undefined} />
              <DetailRow label="체지방량" value={entry.body.bodyFat ? `${entry.body.bodyFat} kg` : undefined} />
              <DetailRow label="체지방률" value={entry.body.bodyFatPercent ? `${(entry.body.bodyFatPercent * 100).toFixed(1)}%` : undefined} />
            </DetailSection>
          )}

          {(entry.exercise ?? []).length > 0 && (
            <DetailSection title="운동">
              {entry.exercise!.map((ex, i) => (
                <DetailRow key={i} label={ex.item ?? `운동 ${i + 1}`} value={ex.amount ? `${ex.amount} ${ex.unit ?? ''}` : undefined} />
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
              <DetailRow label="질" value={entry.bowel.quality} />
              <DetailRow label="특징" value={entry.bowel.characteristics} />
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
            placeholder="검색어 입력…"
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
            "{query}" + 아래 조건 적용 중ldquo;{query}"{query}" + 아래 조건 적용 중rdquo; + 아래 조건 적용 중
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
                    <th className="text-right px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium w-24">날짜 / 시간</th>
                    <th className="text-left px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium">활동 / 내용</th>
                    <th className="text-left px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium w-24">장소</th>
                    <th className="text-left px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium w-24">구매</th>
                    <th className="text-right px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium w-24">비용</th>
                    <th className="text-right px-3 py-2 text-xs text-stone-500 dark:text-zinc-400 font-medium w-20">소요</th>
                  </tr>
                </thead>
                <tbody>
                  {response.results.map((entry, i) => (
                    <tr
                      key={entry._id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`border-b border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800 dark:bg-zinc-800 cursor-pointer transition-colors ${
                        i === response.results.length - 1 ? 'border-b-0' : ''
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
