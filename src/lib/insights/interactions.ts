// src/lib/insights/interactions.ts


export function computeInteractionsSummary(docs: any[]) {
  const interactions = docs.filter(d => d.activity?.relationship === '함께');

  const intByMethod:   Record<string, number> = {};
  const intByCategory: Record<string, number> = {};

  // Per-person tracking: name → { methods: {m: count}, categories: {c: count} }
  const personMap: Record<string, { methods: Record<string, number>; categories: Record<string, number>; total: number }> = {};

  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      intByMethod[method]     = (intByMethod[method] ?? 0) + 1;
      intByCategory[category] = (intByCategory[category] ?? 0) + 1;

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      for (const name of targets) {
        if (!name || name === '등') continue;
        if (!personMap[name]) personMap[name] = { methods: {}, categories: {}, total: 0 };
        personMap[name].methods[method]     = (personMap[name].methods[method] ?? 0) + 1;
        personMap[name].categories[category] = (personMap[name].categories[category] ?? 0) + 1;
        personMap[name].total++;
      }
    }
  }

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
  const othersTotal = interactions.length - top10Total;

  const othersMethodCounts:   Record<string, number> = {};
  const othersCategoryCounts: Record<string, number> = {};
  const top10Names = new Set(top10.map(p => p.name));
  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];
      for (const name of targets) {
        if (!name || name === '등' || top10Names.has(name)) continue;
        const m = group.method ?? '기타';
        const c = group.category ?? '기타';
        othersMethodCounts[m]   = (othersMethodCounts[m] ?? 0) + 1;
        othersCategoryCounts[c] = (othersCategoryCounts[c] ?? 0) + 1;
      }
    }
  }

  return {
    interactions: {
      total:      interactions.length,
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
      total:           othersTotal,
      dominantMethod:  dominantKey(othersMethodCounts),
      dominantCategory: dominantKey(othersCategoryCounts),
    },
  };
}

// Compute per-bucket data for trend mode
export function computeInteractionsTrendBucket(docs: any[], relTypeFilter: string[] = [], methodFilter: string[] = []) {
  const interactions = docs.filter(d => d.activity?.relationship === '함께');
  const byRelationType: Record<string, number> = {};
  const byMethod:       Record<string, number> = {};
  const personCounts:   Record<string, number> = {};

  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      byMethod[method]       = (byMethod[method] ?? 0) + 1;
      byRelationType[category] = (byRelationType[category] ?? 0) + 1;

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      // Apply top7 filters (AND logic) — only affects person ranking
      if (relTypeFilter.length && !relTypeFilter.includes(category)) continue;
      if (methodFilter.length  && !methodFilter.includes(method))    continue;

      for (const name of targets) {
        if (!name || name === '등') continue;
        personCounts[name] = (personCounts[name] ?? 0) + 1;
      }
    }
  }

  const sorted = Object.entries(personCounts)
    .sort((a, b) => b[1] - a[1]);

  const top7 = sorted.slice(0, 7).map(([name, count]) => ({ name, count }));
  const uniquePeopleCount = Object.keys(personCounts).length;

  return {
    totalCount:        interactions.length,
    uniquePeopleCount,
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

