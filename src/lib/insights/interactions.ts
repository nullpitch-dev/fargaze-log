// src/lib/insights/interactions.ts


export function computeInteractionsSummary(docs: any[], methodFilter: string[] = []) {
  const interactions = docs.filter(d => d.activity?.relationship === '함께');
  const methodOK = (m: string) => methodFilter.length === 0 || methodFilter.includes(m);

  const intByMethod:   Record<string, number> = {};   // FULL method mix — drives the filter list, unaffected by the filter
  const intByCategory: Record<string, number> = {};   // reflects selected methods

  // Per-person tracking: name → { methods, categories, total } — selected methods only
  const personMap: Record<string, { methods: Record<string, number>; categories: Record<string, number>; total: number }> = {};

  const eventHit = new Set<number>();   // events with ≥1 selected-method group

  interactions.forEach((doc, evIdx) => {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';

      // Full method breakdown — always counted, so the filter list stays stable
      intByMethod[method] = (intByMethod[method] ?? 0) + 1;

      if (!methodOK(method)) continue;   // everything below reflects the selected methods
      intByCategory[category] = (intByCategory[category] ?? 0) + 1;
      eventHit.add(evIdx);

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      for (const name of targets) {
        if (!name || name === '등') continue;
        if (!personMap[name]) personMap[name] = { methods: {}, categories: {}, total: 0 };
        personMap[name].methods[method]      = (personMap[name].methods[method] ?? 0) + 1;
        personMap[name].categories[category] = (personMap[name].categories[category] ?? 0) + 1;
        personMap[name].total++;
      }
    }
  });

  const dominantKey = (counts: Record<string, number>): string =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타';

  const peopleByMethod:   Record<string, number> = {};
  const peopleByCategory: Record<string, number> = {};
  for (const p of Object.values(personMap)) {
    const dm = dominantKey(p.methods);
    const dc = dominantKey(p.categories);
    peopleByMethod[dm]   = (peopleByMethod[dm] ?? 0) + 1;
    peopleByCategory[dc] = (peopleByCategory[dc] ?? 0) + 1;
  }

  // Top 10 ranked by total interactions
  const sorted = Object.entries(personMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const top10 = sorted.map(([name, data]) => ({
    name,
    dominantCategory: dominantKey(data.categories),
    total: data.total,
    rows: Object.entries(data.methods)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count })),
  }));

  const top10Total = top10.reduce((s, p) => s + p.total, 0);
  const allPeopleTotal = Object.values(personMap).reduce((s, p) => s + p.total, 0);
  const othersTotal = allPeopleTotal - top10Total;

  const othersMethodCounts:   Record<string, number> = {};
  const othersCategoryCounts: Record<string, number> = {};
  const top10Names = new Set(top10.map(p => p.name));
  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      if (!methodOK(method)) continue;
      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];
      for (const name of targets) {
        if (!name || name === '등' || top10Names.has(name)) continue;
        othersMethodCounts[method]     = (othersMethodCounts[method] ?? 0) + 1;
        othersCategoryCounts[category] = (othersCategoryCounts[category] ?? 0) + 1;
      }
    }
  }

  return {
    interactions: {
      total:      methodFilter.length === 0 ? interactions.length : eventHit.size,
      byMethod:   intByMethod,
      byCategory: intByCategory,
    },
    people: {
      total:      Object.keys(personMap).length,
      byMethod:   peopleByMethod,
      byCategory: peopleByCategory,
    },
    topPeople: top10,
    others: {
      total:            othersTotal,
      dominantMethod:   dominantKey(othersMethodCounts),
      dominantCategory: dominantKey(othersCategoryCounts),
    },
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
