// src/lib/migration/favoritePlace.ts
// Parses and validates the FavoritePlace sheet. Pure — no DB or Sheets access,
// so it can be tested on its own. Used by scripts/migrate-favorite-place.ts.
//
// Sheet columns (row 1 = header, data from row 2):
//   A label · B name · C from_timezone · D from_date · E from_time
//                    · F to_timezone   · G to_date   · H to_time

export interface Boundary {
  timezone: string;
  local: string;   // 'YYYY-MM-DD HH:mm'
  at: Date;        // true UTC instant
}

export interface FavoritePlaceDoc {
  userId: string;
  label: string;
  name: string;
  from: Boundary | null;
  to: Boundary | null;
}

const cell = (row: unknown[], i: number) => (row[i] ?? '').toString().trim();

function parseBoundary(
  tz: string, date: string, time: string,
  offsets: Map<string, number>, where: string, problems: string[],
): Boundary | null {
  if (!tz && !date && !time) return null;           // open end
  if (!tz || !date || !time) {
    problems.push(`${where}: timezone, date and time must be all filled or all empty`);
    return null;
  }
  const offset = offsets.get(tz);
  if (offset === undefined) {
    problems.push(`${where}: timezone "${tz}" is not in the TimeDiff sheet`);
    return null;
  }
  const d = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!d || !t) {
    problems.push(`${where}: expected YYYY-MM-DD and H:mm, got "${date}" "${time}"`);
    return null;
  }
  const [y, m, day, h, min] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  const naive = Date.UTC(y, m - 1, day, h, min);
  const check = new Date(naive);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== day || h > 23) {
    problems.push(`${where}: "${date} ${time}" is not a real date/time`);
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    timezone: tz,
    local: `${y}-${pad(m)}-${pad(day)} ${pad(h)}:${pad(min)}`,
    at: new Date(naive - offset * 3600 * 1000),
  };
}

/**
 * Turns sheet rows into documents. Returns every problem found rather than
 * stopping at the first, so the sheet can be fixed in one go.
 */
export function buildFavoritePlaces(
  rows: unknown[][],
  offsets: Map<string, number>,   // timezone code → UTC offset in hours
  userId: string,
): { docs: FavoritePlaceDoc[]; problems: string[] } {
  const docs: FavoritePlaceDoc[] = [];
  const problems: string[] = [];

  rows.forEach((row, i) => {
    const where = `Row ${i + 2}`;
    const label = cell(row, 0);
    const name = cell(row, 1);
    if (!row.some(v => (v ?? '').toString().trim() !== '')) return;  // blank row
    if (!label || !name) { problems.push(`${where}: label and name are required`); return; }

    const from = parseBoundary(cell(row, 2), cell(row, 3), cell(row, 4), offsets, `${where} from`, problems);
    const to   = parseBoundary(cell(row, 5), cell(row, 6), cell(row, 7), offsets, `${where} to`, problems);
    if (from && to && from.at >= to.at) {
      problems.push(`${where} (${label} ${name}): from is not before to`);
    }
    docs.push({ userId, label, name, from, to });
  });

  // Periods of the same label must not overlap — a record must resolve to one place.
  const byLabel = new Map<string, FavoritePlaceDoc[]>();
  for (const d of docs) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d]);
  for (const [label, list] of byLabel) {
    const sorted = [...list].sort((a, b) => (a.from?.at.getTime() ?? -Infinity) - (b.from?.at.getTime() ?? -Infinity));
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1], cur = sorted[k];
      const prevEnd = prev.to?.at.getTime() ?? Infinity;
      const curStart = cur.from?.at.getTime() ?? -Infinity;
      if (curStart <= prevEnd) {
        problems.push(`${label}: "${prev.name}" and "${cur.name}" overlap`);
      }
    }
  }

  return { docs, problems };
}

/** Finds the place a label meant at a given instant, or null (gap / unknown label). */
export function resolveFavoritePlace(
  places: Pick<FavoritePlaceDoc, 'label' | 'name' | 'from' | 'to'>[],
  label: string,
  at: Date,
): string | null {
  const t = at.getTime();
  const hit = places.find(p =>
    p.label === label &&
    (p.from === null || p.from.at.getTime() <= t) &&
    (p.to === null || t <= p.to.at.getTime()));
  return hit?.name ?? null;
}
