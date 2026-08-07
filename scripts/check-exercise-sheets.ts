/**
 * scripts/check-exercise-sheets.ts
 *
 * Read-only verification of the Google Sheets source AFTER the 부하(kg) / 방식
 * column insertion and the exercise data cleanup. Writes nothing, to Sheets or
 * to MongoDB.
 *
 * Run BEFORE re-migrating. Exits non-zero if a blocking problem is found.
 *
 * Run: npx tsx scripts/check-exercise-sheets.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/* ------------------------------------------------------------------ *
 * Column layout — 0-based, AFTER inserting two columns at BU / BV
 * ------------------------------------------------------------------ */
const COL = {
  ACTIVITY_CATEGORY: 0,
  ACTIVITY_NAME: 1,
  EX_ITEM: 69, // BR  운동 항목
  EX_AMOUNT: 70, // BS  양/강도
  EX_UNIT: 71, // BT  운동단위
  EX_LOAD: 72, // BU  부하(kg)      <- NEW
  EX_STYLE: 73, // BV  방식          <- NEW
  READING: 74, // BW  독서 항목      (was BU / 72)
  SYNC_STATUS: 84, // CG            (was CE / 82)
  EVENT_ID: 85, // CH               (was CF / 83)
} as const;

const FETCH_RANGE = 'A:CI'; // was A:CG before the +2 shift

const SHEETS: { file: 'ACTIVE' | 'ARCHIVE'; name: string }[] = [
  { file: 'ACTIVE', name: 'Active' },
  { file: 'ACTIVE', name: 'Future' },
  { file: 'ACTIVE', name: 'History' },
  { file: 'ARCHIVE', name: '2026' },
  { file: 'ARCHIVE', name: '~2025' },
];

/* Expected vocabularies after cleanup */
const ALLOWED_UNITS = new Set(['개', '층', 'km', '분', '초', '시간', '회']);
const ALLOWED_STYLE = new Set(['', '총']);

/* Items that should no longer exist anywhere */
const RETIRED_ITEMS = new Set([
  '턱걸이 총',
  '팔굽혀펴기 총',
  '스쿼트 10kg',
  '허벅지',
  '트레드밀 달리기',
  '걷기/달리기',
  '상체회전 스쿼트',
]);

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

type Row = string[];

const cell = (row: Row, i: number): string => (row[i] ?? '').toString().trim();

const tokens = (s: string): string[] =>
  s === '' ? [] : s.split(',').map((t) => t.trim());

function colLetter(index0: number): string {
  let n = index0;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function head(title: string) {
  console.log('\n' + '='.repeat(74));
  console.log(title);
  console.log('='.repeat(74));
}

function table(rows: string[][], headers: string[]) {
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  const all = [headers, ...rows];
  const w = headers.map((_, c) =>
    Math.max(...all.map((r) => (r[c] ?? '').length))
  );
  const line = (r: string[]) =>
    r.map((v, c) => (v ?? '').padEnd(w[c])).join('  ');
  console.log(line(headers));
  console.log(w.map((x) => '-'.repeat(x)).join('  '));
  rows.forEach((r) => console.log(line(r)));
}

function bump(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

const byCountDesc = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/** Google Calendar event IDs: long, lowercase alphanumeric, no spaces. */
const looksLikeEventId = (s: string) => /^[a-z0-9_]{16,}$/i.test(s) && !s.includes(' ');

/* ------------------------------------------------------------------ *
 * auth
 * ------------------------------------------------------------------ */

function resolveKeyFile(): string {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not set');
  const candidates = [
    raw,
    path.resolve(process.cwd(), raw),
    path.resolve(process.cwd(), 'myfiles', raw),
    path.resolve('/myfiles', raw),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Service account file not found. Tried:\n  ${candidates.join('\n  ')}`
  );
}

/* ------------------------------------------------------------------ *
 * findings
 * ------------------------------------------------------------------ */

type Finding = {
  sheet: string;
  row: number;
  kind: string;
  detail: string;
};

const blocking: Finding[] = [];
const advisory: Finding[] = [];

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  const keyFile = resolveKeyFile();
  const idActive = process.env.SPREADSHEET_ID_ACTIVE;
  const idArchive = process.env.SPREADSHEET_ID_ARCHIVE;
  if (!idActive || !idArchive) {
    throw new Error('SPREADSHEET_ID_ACTIVE / SPREADSHEET_ID_ARCHIVE not set');
  }

  head('0. CONFIG');
  console.log(`service account : ${keyFile}`);
  console.log(`fetch range     : ${FETCH_RANGE}`);
  console.log(
    `exercise cols   : ${colLetter(COL.EX_ITEM)}/${colLetter(COL.EX_AMOUNT)}/` +
      `${colLetter(COL.EX_UNIT)} + NEW ${colLetter(COL.EX_LOAD)}(부하) ` +
      `${colLetter(COL.EX_STYLE)}(방식)`
  );

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() as never });

  /* accumulators across all sheets */
  const itemCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const styleCounts = new Map<string, number>();
  const loadValues: number[] = [];
  const perSheet: string[][] = [];

  for (const s of SHEETS) {
    const spreadsheetId = s.file === 'ACTIVE' ? idActive : idArchive;
    let values: Row[];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${s.name}'!${FETCH_RANGE}`,
      });
      values = (res.data.values ?? []) as Row[];
    } catch (e) {
      blocking.push({
        sheet: s.name,
        row: 0,
        kind: 'SHEET UNREADABLE',
        detail: (e as Error).message,
      });
      perSheet.push([s.name, '—', '—', '—', 'UNREADABLE']);
      continue;
    }

    /* ---------- layout probe ---------- */
    /* Find which column actually holds Google Calendar event IDs. Pre-shift
       that is CF (83); post-shift it must be CH (85). This is decisive
       because event IDs are self-identifying strings. */
    const eventIdHits = new Map<number, number>();
    for (const row of values.slice(0, 400)) {
      for (let i = 80; i < 90; i++) {
        if (looksLikeEventId(cell(row, i))) {
          eventIdHits.set(i, (eventIdHits.get(i) ?? 0) + 1);
        }
      }
    }
    const detected = [...eventIdHits.entries()].sort((a, b) => b[1] - a[1])[0];
    let layoutVerdict: string;
    if (!detected) {
      layoutVerdict = 'INDETERMINATE (no event IDs in first 400 rows)';
      advisory.push({
        sheet: s.name,
        row: 0,
        kind: 'LAYOUT UNVERIFIED',
        detail: 'no Event_ID-like values found; check column positions by eye',
      });
    } else if (detected[0] === COL.EVENT_ID) {
      layoutVerdict = `OK (Event_ID at ${colLetter(detected[0])})`;
    } else {
      layoutVerdict = `WRONG (Event_ID at ${colLetter(detected[0])}, expected ${colLetter(COL.EVENT_ID)})`;
      blocking.push({
        sheet: s.name,
        row: 0,
        kind: 'COLUMN SHIFT MISSING',
        detail:
          `Event_ID found at ${colLetter(detected[0])} instead of ` +
          `${colLetter(COL.EVENT_ID)} — the two new columns were probably ` +
          `not inserted in this sheet`,
      });
    }

    /* ---------- row scan ---------- */
    let dataRows = 0;
    let exerciseRows = 0;
    let stopped = false;

    for (let r = 0; r < values.length; r++) {
      const row = values[r];
      const rowNo = r + 1; // 1-based, matching the Sheets UI
      const cat = cell(row, COL.ACTIVITY_CATEGORY);
      const name = cell(row, COL.ACTIVITY_NAME);

      if (cat === 'Preset' || name === 'Preset') {
        stopped = true;
        break;
      }
      if (
        cat === '' ||
        cat.startsWith('#') ||
        cat === 'activity category' ||
        cat === 'activity' ||
        cat === 'categoryLevel1'
      ) {
        continue;
      }
      dataRows++;

      const rawItem = cell(row, COL.EX_ITEM);
      const rawAmount = cell(row, COL.EX_AMOUNT);
      const rawUnit = cell(row, COL.EX_UNIT);
      const rawLoad = cell(row, COL.EX_LOAD);
      const rawStyle = cell(row, COL.EX_STYLE);

      const anyExercise =
        rawItem !== '' || rawAmount !== '' || rawUnit !== '' || rawLoad !== '' || rawStyle !== '';
      if (!anyExercise) continue;
      exerciseRows++;

      const items = tokens(rawItem);
      const amounts = tokens(rawAmount);
      const units = tokens(rawUnit);
      const loads = tokens(rawLoad);
      const styles = tokens(rawStyle);

      const ctx = `item[${rawItem}] amt[${rawAmount}] unit[${rawUnit}] 부하[${rawLoad}] 방식[${rawStyle}]`;

      /* exercise data with no item name -> migration drops it silently */
      if (items.length === 0) {
        blocking.push({
          sheet: s.name,
          row: rowNo,
          kind: 'NO ITEM NAME',
          detail: ctx,
        });
        continue;
      }

      /* zip truncation: amount/unit longer than item loses data */
      if (amounts.length !== items.length || units.length !== items.length) {
        blocking.push({
          sheet: s.name,
          row: rowNo,
          kind: 'TOKEN COUNT MISMATCH',
          detail: `item×${items.length} amount×${amounts.length} unit×${units.length} — ${ctx}`,
        });
      }

      /* new columns must be blank or aligned with item count */
      if (loads.length > 0 && loads.length !== items.length) {
        blocking.push({
          sheet: s.name,
          row: rowNo,
          kind: '부하 COUNT MISMATCH',
          detail: `item×${items.length} 부하×${loads.length} — ${ctx}`,
        });
      }
      if (styles.length > 0 && styles.length !== items.length) {
        blocking.push({
          sheet: s.name,
          row: rowNo,
          kind: '방식 COUNT MISMATCH',
          detail: `item×${items.length} 방식×${styles.length} — ${ctx}`,
        });
      }

      /* per-token checks */
      items.forEach((it, i) => {
        bump(itemCounts, it);

        if (RETIRED_ITEMS.has(it)) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'RETIRED ITEM NAME',
            detail: `"${it}" should have been renamed — ${ctx}`,
          });
        }
        if (it.includes('/')) {
          advisory.push({
            sheet: s.name,
            row: rowNo,
            kind: 'SLASH IN ITEM',
            detail: `"${it}" — '/' is not split by migration, unlike '+'`,
          });
        }
        if (/\d+\s*kg/i.test(it)) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'LOAD STILL IN NAME',
            detail: `"${it}" — move the kg into the 부하 column`,
          });
        }
        if (it.endsWith('총') || it.includes(' 총')) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: '총 STILL IN NAME',
            detail: `"${it}" — move to the 방식 column`,
          });
        }

        const u = units[i] ?? '';
        bump(unitCounts, u === '' ? '(blank)' : u);
        if (u === '') {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'MISSING UNIT',
            detail: `"${it}" has no unit — ${ctx}`,
          });
        } else if (u === 'm') {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: "UNIT 'm'",
            detail: `"${it}" — 'm' is metres; use 분 if minutes were meant`,
          });
        } else if (u.includes('/')) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'DERIVED UNIT',
            detail: `"${u}" — speed is derived from distance and duration; do not store it`,
          });
        } else if (!ALLOWED_UNITS.has(u)) {
          advisory.push({
            sheet: s.name,
            row: rowNo,
            kind: 'UNKNOWN UNIT',
            detail: `"${u}" on "${it}"`,
          });
        }

        const a = amounts[i] ?? '';
        if (a !== '' && !Number.isFinite(Number(a.replace(/,/g, '')))) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'NON-NUMERIC AMOUNT',
            detail: `"${a}" on "${it}"`,
          });
        }

        const l = loads[i] ?? '';
        if (l !== '') {
          const ln = Number(l);
          if (!Number.isFinite(ln)) {
            blocking.push({
              sheet: s.name,
              row: rowNo,
              kind: 'NON-NUMERIC 부하',
              detail: `"${l}" on "${it}" — kg value only, no unit text`,
            });
          } else {
            loadValues.push(ln);
            if (/kg/i.test(l)) {
              blocking.push({
                sheet: s.name,
                row: rowNo,
                kind: "'kg' TEXT IN 부하",
                detail: `"${l}" — the column is already kg; store the number alone`,
              });
            }
            if ((units[i] ?? '') !== '개') {
              advisory.push({
                sheet: s.name,
                row: rowNo,
                kind: '부하 WITH NON-개 UNIT',
                detail: `"${it}" 부하 ${l} but unit is "${units[i] ?? ''}"`,
              });
            }
          }
        }

        const st = styles[i] ?? '';
        bump(styleCounts, st === '' ? '(blank)' : st);
        if (!ALLOWED_STYLE.has(st)) {
          blocking.push({
            sheet: s.name,
            row: rowNo,
            kind: 'UNEXPECTED 방식',
            detail: `"${st}" on "${it}" — expected blank or 총`,
          });
        }
      });
    }

    perSheet.push([
      s.name,
      String(values.length),
      String(dataRows),
      String(exerciseRows),
      layoutVerdict + (stopped ? ' · stopped at Preset' : ''),
    ]);
  }

  /* ---------------- report ---------------- */

  head('1. SHEET LAYOUT (critical — a wrong shift corrupts every field after BT)');
  table(perSheet, ['sheet', 'rows read', 'data rows', 'exercise rows', 'layout']);

  head('2. BLOCKING PROBLEMS — fix before re-migrating');
  const byKind = new Map<string, Finding[]>();
  for (const f of blocking) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(f);
  }
  if (byKind.size === 0) {
    console.log('None. Sheets are ready for re-migration.');
  } else {
    for (const [kind, list] of [...byKind.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )) {
      console.log(`\n--- ${kind} (${list.length}) ---`);
      table(
        list.slice(0, 30).map((f) => [f.sheet, String(f.row), f.detail]),
        ['sheet', 'row', 'detail']
      );
      if (list.length > 30) console.log(`... and ${list.length - 30} more`);
    }
  }

  head('3. ADVISORY — worth a look, not blocking');
  if (advisory.length === 0) {
    console.log('None.');
  } else {
    table(
      advisory.slice(0, 40).map((f) => [f.sheet, String(f.row), f.kind, f.detail]),
      ['sheet', 'row', 'kind', 'detail']
    );
    if (advisory.length > 40) console.log(`... and ${advisory.length - 40} more`);
  }

  head('4. ITEM VOCABULARY (as it exists in the sheets)');
  table(
    byCountDesc(itemCounts).map(([k, n]) => [
      k,
      String(n),
      RETIRED_ITEMS.has(k) ? '<-- RETIRED' : '',
    ]),
    ['item', 'tokens', '']
  );
  console.log(`\nDistinct items: ${itemCounts.size}`);

  head('5. UNIT / 방식 / 부하');
  table(
    byCountDesc(unitCounts).map(([k, n]) => [
      k,
      String(n),
      ALLOWED_UNITS.has(k) ? '' : '<-- unexpected',
    ]),
    ['unit', 'tokens', '']
  );
  console.log('');
  table(
    byCountDesc(styleCounts).map(([k, n]) => [k, String(n)]),
    ['방식', 'tokens']
  );
  if (loadValues.length) {
    const s = [...loadValues].sort((a, b) => a - b);
    console.log(
      `\n부하: ${s.length} values | min ${s[0]} | med ${s[Math.floor(s.length / 2)]} | max ${s[s.length - 1]}`
    );
    console.log(`      distinct: ${[...new Set(s)].join(', ')}`);
  } else {
    console.log('\n부하: no values found');
  }

  head('SUMMARY');
  console.log(`Blocking problems : ${blocking.length}`);
  console.log(`Advisory notes    : ${advisory.length}`);
  console.log(
    blocking.length === 0
      ? '\nReady to re-migrate (after rowToDocument.ts / Log.ts are patched).'
      : '\nFix the blocking problems above, then re-run this script.'
  );

  if (blocking.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
