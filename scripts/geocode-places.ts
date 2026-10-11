// scripts/geocode-places.ts
// Finds points for From / To names that are not in the PlaceCoord sheet yet, using
// OpenStreetMap (Nominatim). Read-only on the database and the sheet. Writes:
//   place-coords-new.csv         — rows ready to paste under the PlaceCoord sheet
//                                  (A Name · B Coords · C Source · D Note · E Uses · F Status · G Map)
//   myfiles/geocode-cache.json   — every answer from OpenStreetMap, so nothing is asked twice
//
// Needs in .env.local: NOMINATIM_EMAIL (plus the usual MONGODB_URI, SPREADSHEET_ID_ACTIVE,
// GOOGLE_SERVICE_ACCOUNT_FILE).
//
// Run from the project root (about 1 second per new question; safe to stop and re-run):
//   npx tsx --tsconfig tsconfig.json scripts/geocode-places.ts > geocode-places.txt
// Optional: a different minimum number of uses, e.g. … geocode-places.ts 2
//
// How a name is searched:
//   1. The name is tidied for searching only: "(T2)" and "8번출구" are dropped; outside Korea
//      "X 역" → "X station" and "공항" → "Airport". The name in the log never changes.
//   2. If the home you had when you mostly used the name has a point in the sheet, the search
//      looks within about 40 km of it first and takes the match nearest home (this is what
//      puts "Morrisons" in Weybridge rather than Edinburgh). Then it tries the whole country.
//   3. If nothing is found: without the branch name ("… 강남점"), then without the last word.

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import { legsFromDocs, HOME } from '../src/lib/insights/transport-journeys';
import { resolveFavoritePlace } from '../src/lib/migration/favoritePlace';
import { buildPlaceCoords, sheetNames } from '../src/lib/migration/placeCoord';

const USER = 'hyoje';
const MIN_USES = Number(process.argv[2] ?? 3);
const EMAIL = process.env.NOMINATIM_EMAIL;
const CACHE_FILE = path.join(process.cwd(), 'myfiles', 'geocode-cache.json');
const CSV_FILE = path.join(process.cwd(), 'place-coords-new.csv');
const PAUSE_MS = 1100;           // OpenStreetMap's limit is one request per second
const NEAR_DEG = { lat: 0.36, lng: 0.45 }; // ≈ 40 km each way around home
const FAR_FROM_HOME_KM = 50;
const AMBIGUOUS_KM = 5;

// Places no map service can know: listed for entry by hand.
const SITE_CODES = new Set(['MR1', '2단지', 'KCC', 'ACS', 'SR1', 'R4', 'R5', 'MCS 2단지', '정문 주차타워']);
const isPersonal = (name: string, favNames: Set<string>) =>
  favNames.has(name) || SITE_CODES.has(name) || /^[A-Z0-9]{2,4}$/.test(name)
  || /집$/.test(name) || /댁$/.test(name) || name.includes('본가')
  || /사무실|본사/.test(name) || /^SEA /.test(name);

// A match of these kinds is a district, town or area, not the place itself.
const BROAD_CLASSES = new Set(['boundary', 'place', 'landuse']);
const isBroad = (h: Hit) => BROAD_CLASSES.has(h.cls) || (h.cls === 'highway' && h.type !== 'bus_stop');

type Pt = { lat: number; lng: number };
type Hit = Pt & { name: string; cls: string; type: string };
type Cache = Record<string, Hit[]>;

function countryOf(tz: string): string {
  if (tz === 'KST') return 'kr';
  if (tz === 'BST' || tz === 'GMT') return 'gb';
  return '';
}

function tidy(name: string, country: string): string {
  let s = name.replace(/\([^)]*\)/g, ' ').replace(/\d+번\s*출구/g, ' ');
  if (country !== 'kr') s = s.replace(/\s*역$/, ' station').replace(/\s*공항/g, ' Airport');
  return s.replace(/\s+/g, ' ').trim();
}

/** Queries to try, in order. The first is the tidied name; any later hit is a "check". */
function queries(name: string, country: string): string[] {
  const q = tidy(name, country);
  const out = [q];
  const words = q.split(' ');
  if (words.length >= 2 && /점$/.test(words[words.length - 1])) out.push(words.slice(0, -1).join(' '));
  const air = q.indexOf('Airport');
  if (air > 0 && air + 7 < q.length) out.push(q.slice(0, air + 7));
  if (words.length >= 2) out.push(words.slice(0, -1).join(' '));
  return [...new Set(out)].filter(Boolean);
}

function km(a: Pt, b: Pt): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let asked = 0;

async function search(q: string, country: string, near: Pt | null, cache: Cache): Promise<Hit[]> {
  const box = near
    ? [near.lng - NEAR_DEG.lng, near.lat + NEAR_DEG.lat, near.lng + NEAR_DEG.lng, near.lat - NEAR_DEG.lat]
        .map(v => v.toFixed(2)).join(',')
    : '';
  const key = box ? `${country}|box:${box}|${q}` : `${country}|${q}`;
  if (cache[key]) return cache[key];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', box ? '5' : '3');
  url.searchParams.set('accept-language', 'ko,en');
  url.searchParams.set('email', EMAIL!);
  if (country) url.searchParams.set('countrycodes', country);
  if (box) { url.searchParams.set('viewbox', box); url.searchParams.set('bounded', '1'); }

  await sleep(PAUSE_MS);
  const res = await fetch(url, { headers: { 'User-Agent': `FarGaze-Log-geocode (${EMAIL})` } });
  if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status} for "${q}" — stopping; re-run later to continue`);
  const body = (await res.json()) as any[];
  const hits = body.map(r => ({
    lat: Number(r.lat), lng: Number(r.lon), name: String(r.display_name ?? ''),
    cls: String(r.category ?? r.class ?? ''), type: String(r.type ?? ''),
  }));
  cache[key] = hits;
  asked++;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));   // saved after every answer
  return hits;
}

async function getSheetRows(): Promise<unknown[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID_ACTIVE!, range: 'PlaceCoord!A2:D' });
    return r.data.values || [];
  } catch (e: any) {
    if (String(e?.message ?? '').includes('Unable to parse range')) {
      console.error('No PlaceCoord tab yet — create it (header: Name, Coords, Source, Note) and run again.');
      process.exit(1);
    }
    throw e;
  }
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  if (!EMAIL) { console.error('Add NOMINATIM_EMAIL=… to .env.local first.'); process.exit(1); }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const cache: Cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

  // ── The sheet: names already listed, and points (homes give the search its centre) ──
  const sheetRows = await getSheetRows();
  const { docs: points, problems } = buildPlaceCoords(sheetRows, USER);
  if (problems.length) { console.error('PlaceCoord sheet has problems:\n  ' + problems.join('\n  ')); process.exit(1); }
  const listed = sheetNames(sheetRows);
  const pointOf = new Map(points.map(p => [p.name, { lat: p.lat, lng: p.lng }]));

  // ── The log ──
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const docs = await db.collection('log').find(
    { userId: USER, 'activity.category': '이동' },
    { projection: { start: 1, end: 1, activity: 1, location: 1, transport: 1, people: 1 } },
  ).toArray();
  const favRaw = await db.collection('favorite_place').find({ userId: USER }).toArray();
  await mongoose.disconnect();

  const fav = favRaw.map((f: any) => ({
    label: f.label, name: f.name,
    from: f.from ? { ...f.from, at: new Date(f.from.at) } : null,
    to: f.to ? { ...f.to, at: new Date(f.to.at) } : null,
  }));
  const labels = new Set(fav.map(f => f.label));
  const favNames = new Set(fav.map(f => f.name));
  const homes = [...new Set(fav.filter(f => f.label === HOME).map(f => f.name))];

  type Use = { n: number; tz: Map<string, number>; home: Map<string, number> };
  const uses = new Map<string, Use>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const l of legsFromDocs(docs)) {
    for (const [raw, tz, at] of [[l.from, l.startTz, l.startAt], [l.to, l.endTz, l.endAt]] as const) {
      if (!raw) continue;
      const name = labels.has(raw) ? resolveFavoritePlace(fav as any, raw, new Date(at)) : raw;
      if (!name) continue;                       // 집 between homes (the move) — no place
      const u = uses.get(name) ?? { n: 0, tz: new Map(), home: new Map() };
      u.n++;
      bump(u.tz, tz || '?');
      bump(u.home, resolveFavoritePlace(fav as any, HOME, new Date(at)) ?? '');
      uses.set(name, u);
    }
  }
  const totalUses = [...uses.values()].reduce((s, u) => s + u.n, 0);
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0][0];

  const todo = [...uses].filter(([n, u]) => u.n >= MIN_USES && !listed.has(n)).sort((a, b) => b[1].n - a[1].n);
  const alreadyUses = [...uses].filter(([n]) => pointOf.has(n)).reduce((s, [, u]) => s + u.n, 0);

  // ── Search ──
  type Row = { name: string; uses: number; status: string; hit?: Hit; note: string };
  const rows: Row[] = [];
  for (const [name, u] of todo) {
    process.stderr.write(`\r${rows.length + 1}/${todo.length} (${asked} new questions)   `);
    if (isPersonal(name, favNames)) { rows.push({ name, uses: u.n, status: 'by hand', note: '' }); continue; }

    const country = countryOf(top(u.tz));
    const homeName = top(u.home);
    const home = homeName ? pointOf.get(homeName) ?? null : null;

    let hit: Hit | undefined, usedQuery = '', second: Hit | undefined, nearHome = false;
    const qs = queries(name, country);
    for (const q of qs) {
      if (home) {
        const near = await search(q, country, home, cache);
        if (near.length) {
          hit = [...near].sort((a, b) => km(a, home) - km(b, home))[0];
          usedQuery = q; nearHome = true; break;
        }
      }
      const wide = await search(q, country, null, cache);
      if (wide.length) {
        hit = home ? [...wide].sort((a, b) => km(a, home) - km(b, home))[0] : wide[0];
        second = wide.find(h => h !== hit);
        usedQuery = q; break;
      }
    }

    if (!hit) { rows.push({ name, uses: u.n, status: 'not found', note: '' }); continue; }
    const reasons: string[] = [];
    if (usedQuery !== qs[0]) reasons.push(`found as "${usedQuery}"`);
    if (isBroad(hit)) reasons.push(`matched a ${hit.type || hit.cls}`);
    if (home && !nearHome) {
      const d = km(hit, home);
      if (d > FAR_FROM_HOME_KM) reasons.push(`${Math.round(d)} km from ${homeName}`);
    }
    if (!home && second && km(hit, second) > AMBIGUOUS_KM) reasons.push(`another match ${Math.round(km(hit, second))} km away`);
    rows.push({
      name, uses: u.n, status: reasons.length ? 'check' : 'found', hit,
      note: [hit.name.slice(0, 80), ...reasons].join(' · '),
    });
  }
  process.stderr.write('\n');

  // ── Report ──
  const order = ['by hand', 'not found', 'check', 'found'];
  const by = (s: string) => rows.filter(r => r.status === s);
  const pct = (n: number) => `${(n / totalUses * 100).toFixed(1)}%`;
  console.log(`=== PlaceCoord sheet: ${listed.size} names listed, ${points.length} with a point (${pct(alreadyUses)} of uses) ===`);
  const homesWithout = homes.filter(h => !pointOf.has(h));
  if (homesWithout.length) console.log(`Homes without a point (no near-home search for names used from them): ${homesWithout.join(', ')}`);
  console.log(`\n=== NEW: names used ${MIN_USES}+ times not in the sheet (${rows.length}) ===`);
  console.log('status     | names | share of all endpoint uses');
  for (const s of order) console.log(`${s.padEnd(10)} | ${String(by(s).length).padStart(5)} | ${pct(by(s).reduce((a, r) => a + r.uses, 0)).padStart(6)}`);
  console.log(`(${asked} new questions sent to OpenStreetMap; the rest came from the cache)`);
  for (const s of ['by hand', 'not found', 'check']) {
    console.log(`\n=== ${s.toUpperCase()} (most used first) ===`);
    for (const r of by(s)) console.log(`${String(r.uses).padStart(4)} | ${r.name}${r.note ? ` | ${r.note}` : ''}`);
  }

  // ── CSV: same columns as the sheet, worst first so you work from the top ──
  const header = ['Name', 'Coords', 'Source', 'Note', 'Uses', 'Status', 'Map'];
  const lines = order.flatMap(s => by(s)).map(r => [
    r.name,
    r.hit ? `${r.hit.lat.toFixed(6)}, ${r.hit.lng.toFixed(6)}` : '',
    r.hit ? 'osm' : '',
    r.note,
    r.uses,
    r.status,
    r.hit ? `https://www.openstreetmap.org/?mlat=${r.hit.lat}&mlon=${r.hit.lng}#map=17/${r.hit.lat}/${r.hit.lng}` : '',
  ].map(csvCell).join(','));
  fs.writeFileSync(CSV_FILE, '﻿' + [header.join(','), ...lines].join('\n'));
  console.log(`\nWrote ${path.basename(CSV_FILE)} (${rows.length} rows).`);
}

main().catch(e => { console.error('\n' + (e?.message ?? e)); process.exit(1); });
