// src/lib/insights/interactions.ts

import {
  TrendGrain,
  buildBucketStarts,
  bucketStartFor,
  bucketLabel,
  fromYMD,
  ymd,
} from './trend-window';


// ── Summary (rewritten 27 Nov, Design §15.11) ───────────────────────────────
// The unit is the RECORD (Hyoje's rule, 27 Nov). A dinner with 윤지, 윤희 (가족)
// and three 친구 for 2 hours is ONE interaction of 2 hours:
//   • Relation type / Method: each record lands in ONE slice — its own mix,
//     e.g. "가족 + 친구" — so the pie adds up to the record total.
//   • People: each person counts once per record and gets the record's time.
//   • Unique people: each person once, under their most frequent relation type
//     / method (as before).
//   • By activity: records (count / time) and unique people per activity
//     category and per activity.
// Filters (Method, Relation) work on the people groups: a group passes when its
// method and its relation type are both selected; a record counts when at
// least one of its groups passes, and only passing groups shape its slices.
// Empty filter = everything.

export interface InteractionsMeasure { count: number; seconds: number }

export interface InteractionsSummary {
  options: { methods: string[]; relations: string[] };
  interactions: {
    total: InteractionsMeasure;
    byCategory: Record<string, InteractionsMeasure>;   // key = sorted mix, "가족 + 친구"
    byMethod:   Record<string, InteractionsMeasure>;
  };
  people: {
    total: number;
    byCategory: Record<string, number>;
    byMethod:   Record<string, number>;
  };
  activities: {
    category: string;
    interactions: InteractionsMeasure;
    people: number;
    items: { name: string; interactions: InteractionsMeasure; people: number }[];
  }[];
  topPeople: { name: string; dominantCategory: string; count: number; seconds: number }[];
}

export const MIX_SEPARATOR = ' + ';

const groupTargets = (group: any): string[] =>
  (Array.isArray(group.targets) ? group.targets
    : typeof group.target === 'string' ? [group.target] : [])
    .map((n: unknown) => (typeof n === 'string' ? n.trim() : ''))
    .filter((n: string) => n && n !== '등');

export function computeInteractionsSummary(
  docs: any[],
  methodFilter: string[] = [],
  relationFilter: string[] = [],
  topN = 15,
): InteractionsSummary {
  const records = docs.filter(d => d.activity?.relationship === '함께');
  const okMethod   = (m: string) => methodFilter.length === 0   || methodFilter.includes(m);
  const okRelation = (c: string) => relationFilter.length === 0 || relationFilter.includes(c);

  const allMethods = new Set<string>(), allRelations = new Set<string>();
  const add = (map: Record<string, InteractionsMeasure>, key: string, sec: number) => {
    const m = map[key] ?? (map[key] = { count: 0, seconds: 0 });
    m.count += 1; m.seconds += sec;
  };

  const total: InteractionsMeasure = { count: 0, seconds: 0 };
  const byCategory: Record<string, InteractionsMeasure> = {};
  const byMethod:   Record<string, InteractionsMeasure> = {};
  const persons = new Map<string, { count: number; seconds: number; methods: Record<string, number>; categories: Record<string, number> }>();
  interface ActAcc { m: InteractionsMeasure; people: Set<string> }
  const cats = new Map<string, { acc: ActAcc; items: Map<string, ActAcc> }>();
  const newAcc = (): ActAcc => ({ m: { count: 0, seconds: 0 }, people: new Set() });

  for (const doc of records) {
    const groups = (doc.people ?? []) as any[];
    for (const g of groups) {
      allMethods.add(g.method ?? '기타');
      allRelations.add(g.category ?? '기타');
    }
    const passing = groups.filter(g => okMethod(g.method ?? '기타') && okRelation(g.category ?? '기타'));
    if (!passing.length) continue;

    const sec = Math.max(0, Number(doc.duration?.totalSeconds) || 0);
    total.count += 1; total.seconds += sec;

    const mix = (vals: string[]) => [...new Set(vals)].sort((a, b) => a.localeCompare(b)).join(MIX_SEPARATOR);
    add(byCategory, mix(passing.map(g => g.category ?? '기타')), sec);
    add(byMethod,   mix(passing.map(g => g.method ?? '기타')), sec);

    // People: once per record, with the record's time; the person's method /
    // relation tallies count groups (for their dominant values).
    const seen = new Set<string>();
    for (const g of passing) {
      for (const name of groupTargets(g)) {
        let p = persons.get(name);
        if (!p) { p = { count: 0, seconds: 0, methods: {}, categories: {} }; persons.set(name, p); }
        const m = g.method ?? '기타', c = g.category ?? '기타';
        p.methods[m] = (p.methods[m] ?? 0) + 1;
        p.categories[c] = (p.categories[c] ?? 0) + 1;
        if (!seen.has(name)) { seen.add(name); p.count += 1; p.seconds += sec; }
      }
    }

    // By activity
    const catName = (doc.activity?.category ?? '').trim() || '기타';
    const actName = (doc.activity?.name ?? '').trim() || '기타';
    let c = cats.get(catName);
    if (!c) { c = { acc: newAcc(), items: new Map() }; cats.set(catName, c); }
    let a = c.items.get(actName);
    if (!a) { a = newAcc(); c.items.set(actName, a); }
    for (const acc of [c.acc, a]) {
      acc.m.count += 1; acc.m.seconds += sec;
      seen.forEach(n => acc.people.add(n));
    }
  }

  const dominantKey = (counts: Record<string, number>): string =>
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '기타';

  const peopleByCategory: Record<string, number> = {};
  const peopleByMethod:   Record<string, number> = {};
  for (const p of persons.values()) {
    const dc = dominantKey(p.categories), dm = dominantKey(p.methods);
    peopleByCategory[dc] = (peopleByCategory[dc] ?? 0) + 1;
    peopleByMethod[dm]   = (peopleByMethod[dm] ?? 0) + 1;
  }

  // Top people: both orders can be asked for (Count / Time), so send the union
  // of the top N by count and the top N by time; the client sorts and cuts.
  const list = [...persons.entries()].map(([name, p]) => ({
    name, dominantCategory: dominantKey(p.categories), count: p.count, seconds: p.seconds,
  }));
  const byCount = [...list].sort((a, b) => b.count - a.count || b.seconds - a.seconds).slice(0, topN);
  const byTime  = [...list].sort((a, b) => b.seconds - a.seconds || b.count - a.count).slice(0, topN);
  const topPeople = [...new Map([...byCount, ...byTime].map(p => [p.name, p])).values()];

  const activities = [...cats.entries()].map(([category, c]) => ({
    category,
    interactions: c.acc.m,
    people: c.acc.people.size,
    items: [...c.items.entries()].map(([name, a]) => ({ name, interactions: a.m, people: a.people.size })),
  }));

  const sorted = (set: Set<string>) => [...set].filter(s => s.trim()).sort((a, b) => a.localeCompare(b));
  return {
    options: { methods: sorted(allMethods), relations: sorted(allRelations) },
    interactions: { total, byCategory, byMethod },
    people: { total: persons.size, byCategory: peopleByCategory, byMethod: peopleByMethod },
    activities,
    topPeople,
  };
}

// Compute per-bucket data for trend mode.
// Each tab carries its own independent Method filter, so we apply a separate
// method filter per metric. byMethod stays full (Method tab = reference);
// People keeps its relation + method filters unchanged.
export function computeInteractionsTrendBucket(
  docs: any[],
  opts: {
    relTypeFilter?: string[];
    peopleMethod?: string[];
    interactionsMethod?: string[];
    uniqueMethod?: string[];
    relationMethod?: string[];
  } = {},
) {
  const {
    relTypeFilter = [],
    peopleMethod = [],
    interactionsMethod = [],
    uniqueMethod = [],
    relationMethod = [],
  } = opts;

  const interactions = docs.filter(d => d.activity?.relationship === '함께');
  const ok = (filter: string[], v: string) => filter.length === 0 || filter.includes(v);

  const byRelationType: Record<string, number> = {};   // relationMethod → Relation tab
  const byMethod:       Record<string, number> = {};   // FULL → Method tab (reference)
  const uniqueNames  = new Set<string>();              // uniqueMethod → Unique tab
  const personCounts: Record<string, number> = {};     // relType + peopleMethod → People tab (unchanged)
  const eventHit     = new Set<number>();              // interactionsMethod → Interactions tab

  interactions.forEach((doc, evIdx) => {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      byMethod[method] = (byMethod[method] ?? 0) + 1;   // full, always

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      // Interactions tab (events with ≥1 matching group)
      if (ok(interactionsMethod, method)) eventHit.add(evIdx);

      // Relation tab
      if (ok(relationMethod, method)) {
        byRelationType[category] = (byRelationType[category] ?? 0) + 1;
      }

      // Unique tab
      if (ok(uniqueMethod, method)) {
        for (const name of targets) {
          if (!name || name === '등') continue;
          uniqueNames.add(name);
        }
      }

      // People tab (unchanged) → relType AND peopleMethod
      if (ok(relTypeFilter, category) && ok(peopleMethod, method)) {
        for (const name of targets) {
          if (!name || name === '등') continue;
          personCounts[name] = (personCounts[name] ?? 0) + 1;
        }
      }
    }
  });

  const top7 = Object.entries(personCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, count]) => ({ name, count }));

  return {
    totalCount:        interactionsMethod.length === 0 ? interactions.length : eventHit.size,
    uniquePeopleCount: uniqueNames.size,
    byRelationType,
    byMethod,
    top7,
  };
}
// Build transitioning arrays from ordered bucket data
export function addTransitioning(
  buckets: { label: string; top7: { name: string; count: number }[] }[],
): { label: string; top7: { name: string; count: number }[]; transitioning: string[] }[] {
  return buckets.map((bucket, i) => {
    const prev = i > 0 ? buckets[i - 1] : null;
    const next = i < buckets.length - 1 ? buckets[i + 1] : null;

    const currentNames = new Set(bucket.top7.map(p => p.name));
    const prevNames    = new Set(prev?.top7.map(p => p.name) ?? []);
    const nextNames    = new Set(next?.top7.map(p => p.name) ?? []);

    const transitioning: string[] = [];
    // Dropped from previous top5 but not in current
    for (const name of prevNames) {
      if (!currentNames.has(name)) transitioning.push(name);
    }
    // Will appear in next top5 but not in current
    for (const name of nextNames) {
      if (!currentNames.has(name) && !transitioning.includes(name)) {
        transitioning.push(name);
      }
    }

    return { ...bucket, transitioning };
  });
}


// ── Grain × count trend (the Weight-style window) ────────────────────────────
// One fetch for the whole window arrives here; bucketing happens in memory,
// so 120 buckets never means 120 database round trips. The route fetches
// with a one-day pad against timezone edge shift; the local-date test here
// drops anything outside the window. Per-bucket numbers come from the same
// computeInteractionsTrendBucket the old path uses, so the two paths cannot
// disagree while both exist.
export function computeInteractionsTrend(
  docs: any[],
  grain: TrendGrain,
  windowStart: Date,
  windowEnd: Date,
  opts: {
    relTypeFilter?: string[];
    peopleMethod?: string[];
    interactionsMethod?: string[];
    uniqueMethod?: string[];
    relationMethod?: string[];
  } = {},
) {
  const starts = buildBucketStarts(grain, windowStart, windowEnd);
  const byBucket = new Map<string, any[]>();
  for (const s of starts) byBucket.set(ymd(s), []);

  const startKey = ymd(windowStart);
  const endKey = ymd(windowEnd);

  for (const doc of docs) {
    const y = doc.start?.year;
    const m = doc.start?.month;
    const d = doc.start?.day;
    if (!y || !m || !d) continue;
    const dayKey = ymd(fromYMD(y, m, d));
    if (dayKey < startKey || dayKey > endKey) continue;
    const key = ymd(bucketStartFor(grain, y, m, d));
    byBucket.get(key)?.push(doc);
  }

	// Leading empty buckets are trimmed; interior ones are kept. A window longer
  // than the log itself would otherwise open with a run of blank buckets that
  // says nothing except that logging had not started yet. An empty bucket in
  // the MIDDLE is real information — a stretch with no contact — so it stays.
  //
  // Emptiness is measured on the RECORDS in the bucket, not on any one tab's
  // numbers. A bucket holding records that are all solo activity is not empty:
  // it says you logged those days and met nobody, which is the honest reading.
  // Trimming here rather than after the map also keeps addTransitioning from
  // reaching back into a bucket the view will never draw.
  let first = 0;
  while (first < starts.length && !byBucket.get(ymd(starts[first]))?.length) first++;
  const visible = starts.slice(first);

  const buckets = visible.map(s => {
    const bucket = computeInteractionsTrendBucket(byBucket.get(ymd(s)) ?? [], opts);
    return { label: bucketLabel(grain, s), start: ymd(s), ...bucket };
  });

  return { grain, data: addTransitioning(buckets) };
}
