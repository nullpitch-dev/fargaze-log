// #72 Export (Hyoje, 12 Nov 2026): the database → the export spreadsheet, one tab per year.
//
//   npm run export                       nightly: rewrites only the year tabs whose rows changed
//   npm run export -- --all              rewrites every year tab (after big edits to old records)
//   npm run export -- --year 2026        rewrites the tabs named (comma list: 2025,2026)
//   npm run export -- --check            builds every row, reads it back with the migration's
//                                        own reader and compares with the record; writes nothing
//   npm run export -- --verify           reads every year tab back from the sheet and compares
//                                        with the records; writes nothing. With --all or --year:
//                                        writes those tabs, then reads them back
//   npm run export -- --compare 2026     the Archive file's 2026 tab against the database's 2026
//                                        records (up to --until 2026-11-15, default today):
//                                        missing, extra and different records; writes nothing
//   --test                               the test database (.env.development.local) and the test
//                                        export file (SPREADSHEET_ID_EXPORT_TEST)
//
// Env (.env.local; the Action sets the same names): MONGODB_URI, GOOGLE_SERVICE_ACCOUNT_FILE
// (in myfiles/), SPREADSHEET_ID_EXPORT, SPREADSHEET_ID_EXPORT_TEST, SPREADSHEET_ID_ARCHIVE.
// The database is only read: the Action uses the read-only user of the backup.
//
// What changed is judged by the rows themselves: each year's rows are fingerprinted and the
// fingerprint kept in the tab's CK1 (a short code; nothing in the database is written). Any edit,
// delete, rename on /admin, or a record moving to another year changes the fingerprint.
//
// The export file needs a 'Template' tab (rows 1–3 copied from the 2026 tab); a new year tab
// starts as a copy of it. Only tabs named as a year are written.

import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const TEST = process.argv.includes('--test');
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
if (TEST) dotenv.config({ path: path.join(process.cwd(), '.env.development.local'), override: true });

import mongoose from 'mongoose';
import { loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { loadMasterChecks, prepareSheet, type MasterCheck } from '../src/lib/migration/checkRecords';
import { getSheetData } from '../src/lib/migration/sheet';
import Log from '../src/models/Log';
import {
  recordRow, displayed, compareRecords, yearOf, isYearTab, roundTripDiffs, ROW_FORMAT, FIRST_ROW, type Cell,
} from '../src/lib/export/rows';
import { sheetsClient, listTabInfo, writeYearTab, readYearTab } from '../src/lib/export/sheets';
import { findRowText } from '../src/lib/records/sheetCells';

const USER_ID = 'hyoje';
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const valueOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const CHECK = has('--check');
const VERIFY = has('--verify');
const ALL = has('--all');
const YEARS = (valueOf('--year') ?? '').split(',').map(Number).filter(Boolean);
const COMPARE = Number(valueOf('--compare')) || null;
const UNTIL = valueOf('--until') ?? new Date().toISOString().slice(0, 10);
const SHOW = 12;

const summary: string[] = [];
const say = (line = '') => { console.log(line); summary.push(line); };

const fingerprint = (rows: Cell[][]) =>
  crypto.createHash('sha1').update(JSON.stringify([ROW_FORMAT, rows])).digest('hex').slice(0, 16);

/** Rows read back through the migration's reader; problems per record. */
function roundTrip(label: string, records: any[], shown: string[][], checks: MasterCheck[]): string[] {
  const prepared = prepareSheet(label, shown, FIRST_ROW, USER_ID, checks);
  const out: string[] = [];
  for (const r of prepared.refused) out.push(`row ${r.row} (${r.date} ${r.activity}): the migration would refuse it: ${r.reason}`);
  const back = new Map(prepared.rowNos.map((n, k) => [n, prepared.docs[k]]));
  records.forEach((rec, i) => {
    const rowNo = FIRST_ROW + i;
    if (prepared.refused.some(r => r.row === rowNo)) return;
    const doc = back.get(rowNo);
    if (!doc) { out.push(`row ${rowNo} (${findRowText(rec)}): skipped by the migration's reader`); return; }
    const diffs = roundTripDiffs(rec, doc);
    if (diffs.length) out.push(`row ${rowNo} (${findRowText(rec)}): ${diffs.join('; ')}`);
  });
  if (shown.length !== records.length) out.push(`${shown.length} rows in the tab, ${records.length} records`);
  return out;
}

function report(title: string, problems: string[]) {
  if (!problems.length) return;
  say(`⚠️  ${title}: ${problems.length} problem(s)`);
  problems.slice(0, SHOW).forEach(p => say(`   - ${p}`));
  if (problems.length > SHOW) say(`   … and ${problems.length - SHOW} more`);
}

// ── --compare: the hand-kept year tab in the Archive file against the database ──

const keyOf = (d: any) => [d.start?.year, d.start?.month, d.start?.day, d.start?.hour ?? '', d.activity?.name ?? ''].join('|');
const dayNum = (d: any) => (d.start?.year ?? 0) * 10000 + (d.start?.month ?? 0) * 100 + (d.start?.day ?? 0);

async function compareTab(year: number, checks: MasterCheck[]) {
  const until = Number(UNTIL.replace(/-/g, ''));
  say(`🔎 Comparing the Archive file's '${year}' tab with the database (records up to ${UNTIL})`);
  const rows = await getSheetData(process.env.SPREADSHEET_ID_ARCHIVE!, String(year), FIRST_ROW);
  const prepared = prepareSheet(String(year), rows, FIRST_ROW, USER_ID, checks);
  const sheet = prepared.docs.map((d, k) => ({ d, row: prepared.rowNos[k] })).filter(x => dayNum(x.d) <= until);
  const db = (await Log.find({ userId: USER_ID, 'start.year': year }).lean() as any[]).filter(d => dayNum(d) <= until);
  say(`   sheet ${sheet.length} records (${prepared.refused.length} refused rows), database ${db.length}`);
  report('Rows the migration refuses', prepared.refused.map(r => `row ${r.row} (${r.date} ${r.activity}): ${r.reason}`));

  const left = new Map<string, any[]>();
  for (const d of db) left.set(keyOf(d), [...(left.get(keyOf(d)) ?? []), d]);
  const onlySheet: string[] = [], different: string[] = [];
  for (const { d, row } of sheet) {
    const cands = left.get(keyOf(d)) ?? [];
    if (!cands.length) { onlySheet.push(`row ${row}: ${findRowText(d)}`); continue; }
    // The candidate with the fewest differences.
    let best = 0, bestDiffs = roundTripDiffs(cands[0], d);
    cands.forEach((c, k) => { const x = roundTripDiffs(c, d); if (x.length < bestDiffs.length) { best = k; bestDiffs = x; } });
    const [match] = cands.splice(best, 1);
    if (bestDiffs.length) different.push(`row ${row}: ${findRowText(match)}: ${bestDiffs.join('; ')}`);
  }
  const onlyDb = [...left.values()].flat().sort(compareRecords).map(d => `${findRowText(d)}${d.origin === 'app' ? ' (app)' : ''}`);
  report('In the sheet, not in the database', onlySheet);
  report('In the database, not in the sheet', onlyDb);
  report('Different (database → sheet)', different);
  if (!onlySheet.length && !onlyDb.length && !different.length && !prepared.refused.length) say('✅ The tab and the database agree.');
  return onlySheet.length + onlyDb.length + different.length + prepared.refused.length;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fileId = TEST ? process.env.SPREADSHEET_ID_EXPORT_TEST : process.env.SPREADSHEET_ID_EXPORT;
  const verifyOnly = VERIFY && !ALL && !YEARS.length;
  const mode = COMPARE ? `compare ${COMPARE}` : CHECK ? 'CHECK ONLY, nothing is written' : verifyOnly ? 'read back only, nothing is written'
    : ALL ? 'all years' : YEARS.length ? `years ${YEARS.join(', ')}` : 'changed years';
  say(`📤 FarGaze Log export — ${mode}${TEST ? ' — TEST' : ''}`);

  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  const dbName = mongoose.connection.db!.databaseName;
  say(`✅ Database: ${dbName}`);
  if (TEST && !/test/.test(dbName)) throw new Error(`--test but the database is '${dbName}'. Check .env.development.local.`);
  if (!TEST && /test/.test(dbName)) throw new Error(`The database is '${dbName}': use --test for the test database.`);

  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);
  const checks = await loadMasterChecks(USER_ID);

  if (COMPARE) {
    const n = await compareTab(COMPARE, checks);
    if (n) process.exitCode = 1;
    return;
  }

  // Every record, by year, in the sheet's order.
  const byYear = new Map<number, any[]>();
  const noYear: any[] = [];
  for (const d of await Log.find({ userId: USER_ID }).lean() as any[]) {
    const y = yearOf(d);
    if (y == null) { noYear.push(d); continue; }
    byYear.set(y, [...(byYear.get(y) ?? []), d]);
  }
  for (const list of byYear.values()) list.sort(compareRecords);
  const years = [...byYear.keys()].sort();
  const total = years.reduce((n, y) => n + byYear.get(y)!.length, 0);
  say(`✅ ${total} records in ${years.length} years (${years[0]}–${years[years.length - 1]})`);
  report('Records with no start year (left out)', noYear.map(d => `${d._id} ${d.activity?.name ?? ''}`));
  const built = new Map(years.map(y => [y, byYear.get(y)!.map(recordRow)]));

  let trouble = 0;
  const check = (y: number, shown: string[][]) => {
    const p = roundTrip(String(y), byYear.get(y)!, shown, checks);
    report(`${y}`, p);
    trouble += p.length;
  };

  if (CHECK) {
    for (const y of years) check(y, built.get(y)!.map(displayed));
    say(trouble ? `\n⚠️  ${trouble} problem(s) in total. Nothing was written.` : `\n✅ Every row reads back as its record. Nothing was written.`);
    if (trouble) process.exitCode = 1;
    return;
  }

  if (!fileId) throw new Error(`${TEST ? 'SPREADSHEET_ID_EXPORT_TEST' : 'SPREADSHEET_ID_EXPORT'} is not set.`);
  const api = await sheetsClient();
  const tabs = await listTabInfo(api, fileId);

  // Which tabs to write.
  let todo: number[];
  if (verifyOnly) todo = [];
  else if (ALL) todo = years;
  else if (YEARS.length) todo = YEARS;
  else {
    const present = tabs.filter(t => isYearTab(t.title)).map(t => Number(t.title));
    const res = present.length ? await api.spreadsheets.values.batchGet({ spreadsheetId: fileId, ranges: present.map(y => `'${y}'!CK1`) }) : null;
    const stored = new Map(present.map((y, k) => [y, String(res?.data.valueRanges?.[k]?.values?.[0]?.[0] ?? '')]));
    // A year with records whose fingerprint differs, or a tab left with no records.
    todo = [...new Set([...years, ...present])].sort().filter(y => {
      const rows = built.get(y) ?? [];
      return stored.get(y) !== (rows.length ? fingerprint(rows) : 'empty');
    });
  }
  const stamp = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  if (!verifyOnly) say(todo.length ? `✏️  Writing ${todo.join(', ')}` : '✅ Nothing changed since the last export.');

  for (const y of todo) {
    const rows = built.get(y) ?? [];
    // Each tab is checked before it is written: a row the migration would refuse is reported.
    check(y, rows.map(displayed));
    await writeYearTab(api, fileId, y, rows, tabs, stamp);
    await api.spreadsheets.values.update({
      spreadsheetId: fileId, range: `'${y}'!CK1`, valueInputOption: 'RAW',
      requestBody: { values: [[rows.length ? fingerprint(rows) : 'empty']] },
    });
    say(`   ${y}: ${rows.length} rows`);
  }

  if (VERIFY) {
    const targets = verifyOnly ? years : todo;
    say(`🔎 Reading back ${targets.join(', ')} from the sheet`);
    for (const y of targets) {
      if (!byYear.has(y)) continue;
      const shown = await readYearTab(api, fileId, y);
      const p = roundTrip(String(y), byYear.get(y)!, shown, checks);
      report(`${y} (read back)`, p);
      trouble += p.length;
      if (!p.length) say(`   ${y}: ✅ ${shown.length} rows read back as their records`);
    }
  }

  say(trouble ? `\n⚠️  ${trouble} problem(s) — see above.` : '\n✅ Done.');
  if (trouble) process.exitCode = 1;
}

main()
  .catch(e => { say(`⛔ ${e?.message ?? e}`); process.exitCode = 1; })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
    // The Action shows this in the run's summary page.
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['```', ...summary, '```', ''].join('\n'));
    }
  });
