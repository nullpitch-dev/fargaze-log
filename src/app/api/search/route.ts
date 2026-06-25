import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

const SEARCH_LIMIT = 100;

const NUMERIC_FIELDS = [
  'cost.amountKRW',
  'cost.amountForeign',
  'duration.totalSeconds',
  'income.gross',
  'income.net',
  'body.weight',
  'golf.score',
  'golf.approach',
  'golf.putts',
];

const ALL_TEXT_PATHS = [
  'activity.category',
  'activity.name',
  'activity.title',
  'activity.additionalInfo',
  'location.activity',
  'location.online',
  'location.other',
  'cost.category',
  'cost.categoryDetail',
  'purchase.item',
  'purchase.unit',
  'food.drinks.item',
  'food.foods.item',
  'food.alcohols.item',
  'people.target',
  'transport.from',
  'transport.to',
  'travel.city',
  'travel.theme',
  'exercise.item',
  'reading.title',
  'movie.title',
  'notes',
];

const FIELD_PATH_MAP: Record<string, string> = {
  'activity.name':           'activity.name',
  'activity.title':          'activity.title',
  'activity.additionalInfo': 'activity.additionalInfo',
  'activity.category':       'activity.category',
  'location.activity':       'location.activity',
  'purchase.item':           'purchase.item',
  'people.target':           'people.target',
  'cost.category':           'cost.category',
  'transport.from':          'transport.from',
  'transport.to':            'transport.to',
  'travel.city':             'travel.city',
  'notes':                   'notes',
};

function computeAggregations(results: any[]) {
  const aggregations: Record<string, {
    count: number; sum: number; avg: number; min: number; max: number;
  }> = {};

  for (const field of NUMERIC_FIELDS) {
    const parts = field.split('.');
    const values: number[] = results
      .map((doc: any) => {
        let val = doc;
        for (const part of parts) val = val?.[part];
        return val;
      })
      .filter((v: any) => typeof v === 'number' && !isNaN(v));

    if (values.length > 0) {
      aggregations[field] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
  }
  return aggregations;
}

// ── Query parser ────────────────────────────────────────────────────────────
// Splits a raw query string into quoted phrases and remaining free text.
// e.g. 'Brita "작은 정수기" "필터 교체"'
//   → phrases: ['작은 정수기', '필터 교체']
//   → freeText: 'Brita'
function parseQuery(raw: string): { phrases: string[]; freeText: string } {
  const phrases: string[] = [];
  const freeText = raw
    .replace(/"([^"]+)"/g, (_, p) => { phrases.push(p.trim()); return ''; })
    .replace(/\s+/g, ' ')
    .trim();
  return { phrases, freeText };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';
  const dateFrom = searchParams.get('dateFrom')?.trim();
  const dateTo = searchParams.get('dateTo')?.trim();

  const conditionsRaw = searchParams.get('conditions')?.trim();
  const conditions: Array<{ field: string; value: string }> = [];
  if (conditionsRaw) {
    for (const part of conditionsRaw.split('|')) {
      const idx = part.indexOf(':');
      if (idx > 0) {
        const field = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (field && value && FIELD_PATH_MAP[field]) {
          conditions.push({ field, value });
        }
      }
    }
  }

  if (!query && conditions.length === 0 && !dateFrom && !dateTo) {
    return NextResponse.json({ error: 'Missing search parameters' }, { status: 400 });
  }

  await connectDB();
  const userId = (session.user as any)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // ── Atlas Search ────────────────────────────────────────────────────────────

  const mustClauses: any[] = [];
  const filterClauses: any[] = [
    { equals: { path: 'userId', value: userId } },
  ];

  if (query) {
    const { phrases, freeText } = parseQuery(query);
    // Each quoted phrase → exact phrase clause (must appear consecutively)
    for (const phrase of phrases) {
      mustClauses.push({
        phrase: { query: phrase, path: ALL_TEXT_PATHS },
      });
    }
    // Remaining free text → fuzzy bag-of-words (existing behaviour)
    if (freeText) {
      mustClauses.push({
        text: { query: freeText, path: ALL_TEXT_PATHS, fuzzy: { maxEdits: 1 } },
      });
    }
  }

	for (const cond of conditions) {
    const path = FIELD_PATH_MAP[cond.field];
    if (!path) continue;
    // Reuse the main-box parser: quoted parts → exact phrase on this field,
    // unquoted remainder → fuzzy autocomplete (existing per-field behaviour).
    const { phrases, freeText } = parseQuery(cond.value);
    for (const phrase of phrases) {
      mustClauses.push({ phrase: { query: phrase, path } });
    }
    if (freeText) {
      mustClauses.push({
        autocomplete: { query: freeText, path, fuzzy: { maxEdits: 1 } },
      });
    }
  }

  if (dateFrom || dateTo) {
    const rangeFilter: any = { path: 'start.datetime' };
    if (dateFrom) rangeFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      rangeFilter.lt = to;
    }
    filterClauses.push({ range: rangeFilter });
  }

  if (mustClauses.length === 0) {
    mustClauses.push({ exists: { path: 'activity.category' } });
  }

  const atlasPipeline: any[] = [
    {
      $search: {
        index: 'log_search',
        compound: {
          must: mustClauses,
          filter: filterClauses,
        },
      },
    },
    { $limit: SEARCH_LIMIT },
    {
      $project: {
        score: { $meta: 'searchScore' },
        userId: 0,
        'sync.eventId': 0,
        __v: 0,
      },
    },
  ];

  let results: any[] = [];
  let searchMode: 'atlas' | 'regex' = 'atlas';

  try {
    results = await Log.aggregate(atlasPipeline);
  } catch (err: any) {
    searchMode = 'regex';
  }


  // ── Regex fallback ──────────────────────────────────────────────────────────

  if (results.length === 0) {
    searchMode = 'regex';

    const regexFilter: any = { userId };

    // Date range
    if (dateFrom || dateTo) {
      regexFilter['start.datetime'] = {};
      if (dateFrom) regexFilter['start.datetime'].$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setDate(to.getDate() + 1);
        regexFilter['start.datetime'].$lt = to;
      }
    }

    // Main query — OR across all text fields
    if (query) {
      const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      regexFilter.$and = regexFilter.$and ?? [];
      regexFilter.$and.push({
        $or: ALL_TEXT_PATHS.map(path => ({ [path]: re })),
      });
    }

		// Field conditions — each is a separate AND clause on its specific field.
    // Quoted parts match as an exact (contiguous) phrase; mirrors the Atlas path.
    for (const cond of conditions) {
      const path = FIELD_PATH_MAP[cond.field];
      if (!path) continue;
      const { phrases, freeText } = parseQuery(cond.value);
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regexFilter.$and = regexFilter.$and ?? [];
      for (const phrase of phrases) {
        regexFilter.$and.push({ [path]: new RegExp(esc(phrase), 'i') });
      }
      if (freeText) {
        regexFilter.$and.push({ [path]: new RegExp(esc(freeText), 'i') });
      }
    }

    results = await Log.find(regexFilter)
      .limit(SEARCH_LIMIT)
      .sort({ 'start.datetime': -1 })
      .select('-userId -sync.eventId -__v')
      .lean();

    // Add a placeholder score for UI consistency
    results = results.map((doc: any) => ({ ...doc, score: null }));
  }

  const aggregations = computeAggregations(results);
  return NextResponse.json({ query, total: results.length, searchMode, results, aggregations });
}
