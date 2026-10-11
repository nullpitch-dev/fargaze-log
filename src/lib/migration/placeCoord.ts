// src/lib/migration/placeCoord.ts
// Parses and validates the PlaceCoord sheet. Pure — no DB or Sheets access,
// so it can be tested on its own. Used by scripts/migrate-place-coord.ts and
// scripts/geocode-places.ts.
//
// Sheet columns (row 1 = header, data from row 2):
//   A Name · B Coords ("37.245, 127.057", as Google Maps copies it) · C Source · D Note
//   Columns E onwards (Uses, Status, Map …) are for you only and are ignored.

export interface PlaceCoordDoc {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  source: string;
  note: string;
}

const cell = (row: unknown[], i: number) => (row[i] ?? '').toString().trim();

/** "37.245, 127.057" (also "37.245 127.057") → { lat, lng }, or null if it isn't a point. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function buildPlaceCoords(rows: unknown[][], userId: string): {
  docs: PlaceCoordDoc[];
  blank: string[];        // names listed without a point yet
  problems: string[];
} {
  const docs: PlaceCoordDoc[] = [];
  const blank: string[] = [];
  const problems: string[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const name = cell(row, 0), coords = cell(row, 1);
    if (!name && !coords) return;                          // empty row
    if (!name) { problems.push(`row ${rowNo}: Coords without a Name`); return; }
    if (seen.has(name)) { problems.push(`row ${rowNo}: "${name}" is already on row ${seen.get(name)}`); return; }
    seen.set(name, rowNo);
    if (!coords) { blank.push(name); return; }
    const p = parseCoords(coords);
    if (!p) { problems.push(`row ${rowNo}: "${name}" — Coords "${coords}" is not "lat, lng"`); return; }
    docs.push({ userId, name, lat: p.lat, lng: p.lng, source: cell(row, 2) || 'manual', note: cell(row, 3) });
  });

  return { docs, blank, problems };
}

/** Every name in the sheet, with or without a point — the geocoding script skips these. */
export function sheetNames(rows: unknown[][]): Set<string> {
  return new Set(rows.map(r => cell(r, 0)).filter(Boolean));
}
