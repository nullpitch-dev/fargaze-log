// src/lib/insights/transport-journeys.ts
// Joins consecutive 이동 rows (legs) into journeys. Pure — no DB access.
//
// Two legs join when ALL hold:
//   • the gap between them is 0–30 min (true instants, so time zones are safe)
//   • the first leg's To equals the next leg's From
//   • both legs have the same purpose
//   • the first leg does not end at 집 (arriving home always ends a journey)
// ReturnType is logged only on the leg that arrives at 집, which is always a
// journey's last leg — so the journey takes the last leg's ReturnType.

export const JOIN_GAP_MIN = 30;
export const HOME = '집';

export interface Person {
  name: string;
  category: string;         // 가족 / 친목 / 업무 / …
}

export interface Leg {
  id: string;
  startAt: number;          // true UTC ms
  endAt: number;            // true UTC ms
  startLocal: Date;         // naive local wall clock (stored datetime)
  endLocal: Date;
  startTz: string;
  endTz: string;
  from: string;
  to: string;
  purpose: string;
  method: string;
  place: string;            // location.activity — extra detail only
  returnType: string;
  crossActivity: string;
  people: Person[];
}

export interface Journey {
  legs: Leg[];
  startAt: number;
  endAt: number;
  startLocal: Date;
  endLocal: Date;
  from: string;             // first leg's From
  to: string;               // final destination
  purpose: string;
  returnType: string;       // from the last leg
  crossActivity: string;    // from the last leg
  methods: string[];        // distinct, in travel order
  people: Person[];         // distinct by name, across all legs
  durationMin: number;      // first start → last end, transfer waits included
}

export function canJoin(a: Leg, b: Leg): boolean {
  const gapMin = (b.startAt - a.endAt) / 60000;
  return gapMin >= 0 && gapMin <= JOIN_GAP_MIN
    && a.to !== '' && a.to === b.from
    && a.purpose === b.purpose
    && a.to !== HOME;
}

/** Legs must be sorted by startAt. */
export function buildJourneys(legs: Leg[]): Journey[] {
  const groups: Leg[][] = [];
  for (const leg of legs) {
    const cur = groups[groups.length - 1];
    if (cur && canJoin(cur[cur.length - 1], leg)) cur.push(leg);
    else groups.push([leg]);
  }
  return groups.map(g => {
    const first = g[0], last = g[g.length - 1];
    const people = new Map<string, Person>();
    for (const p of g.flatMap(l => l.people)) if (!people.has(p.name)) people.set(p.name, p);
    return {
      legs: g,
      startAt: first.startAt,
      endAt: last.endAt,
      startLocal: first.startLocal,
      endLocal: last.endLocal,
      from: first.from,
      to: last.to,
      purpose: last.purpose,
      returnType: last.returnType,
      crossActivity: last.crossActivity,
      methods: [...new Set(g.map(l => l.method).filter(Boolean))],
      people: [...people.values()],
      durationMin: Math.round((last.endAt - first.startAt) / 60000),
    };
  });
}

// ── From raw log documents ────────────────────────────────────────────────────

const s = (v: unknown) => (v ?? '').toString().trim();

/** True instant: stored datetime is the naive local wall clock; offset is in hours. */
export function trueInstant(dt: Date | undefined, offsetHours: number | undefined): number {
  return dt ? new Date(dt).getTime() - (offsetHours ?? 0) * 3600_000 : NaN;
}

/** Raw 이동 documents → legs sorted by start. Rows without start or end are dropped. */
export function legsFromDocs(docs: any[]): Leg[] {
  return docs
    .filter(d => d.start?.datetime && d.end?.datetime)
    .map(d => ({
      id: String(d._id),
      startAt: trueInstant(d.start.datetime, d.start.timezoneOffset),
      endAt: trueInstant(d.end.datetime, d.end.timezoneOffset),
      startLocal: new Date(d.start.datetime),
      endLocal: new Date(d.end.datetime),
      startTz: s(d.start.timezone),
      endTz: s(d.end.timezone),
      from: s(d.transport?.from),
      to: s(d.transport?.to),
      purpose: s(d.transport?.purpose),
      method: s(d.transport?.method),
      place: s(d.location?.activity),
      returnType: s(d.transport?.returnType),
      crossActivity: s(d.activity?.crossActivity),
      people: (d.people ?? [])
        .map((p: any) => ({ name: s(p.target), category: s(p.category) || '기타' }))
        .filter((p: Person) => p.name && p.name !== '등'),
    }))
    .sort((a, b) => a.startAt - b.startAt);
}
