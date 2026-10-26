// Migration: rebuilds the log from the archive sheet (Design §11).
//
//   npm run migrate                  daily: deletes 2026 and re-inserts the '2026' tab
//   npm run migrate -- --check       reads and checks only; writes nothing (safe on production)
//   npm run migrate -- --full        also deletes ~2025 and re-inserts the '~2025' tab (§11.6)
//
// Nothing is deleted unless every row passes (#67 step 4):
//   1. a change on /admin not yet ticked as repeated in the sheet stops the run;
//   2. every row is read and checked against the master lists in the database; one
//      refused row stops the run, and the report says which rows and why.
// Master lists are never loaded from the sheet; they are edited on /admin (§15.5).

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import { loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { loadMasterChecks, prepareSheet, refusalReport, type PreparedSheet } from '../src/lib/migration/checkRecords';
import Log from '../src/models/Log';
import MasterChange from '../src/models/MasterChange';

const USER_ID = 'hyoje';
const CHECK = process.argv.includes('--check');
const FULL = process.argv.includes('--full');

interface Job { sheet: string; spreadsheetId: string; startRow: number; clear: Record<string, unknown>; label: string }

const JOBS: Job[] = [
  ...(FULL ? [{ sheet: '~2025', spreadsheetId: process.env.SPREADSHEET_ID_ARCHIVE!, startRow: 4,
    clear: { 'start.year': { $lt: 2026 } }, label: 'before 2026' }] : []),
  { sheet: '2026', spreadsheetId: process.env.SPREADSHEET_ID_ARCHIVE!, startRow: 4,
    clear: { 'start.year': 2026 }, label: '2026' },
];

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────

async function getSheetData(spreadsheetId: string, sheetName: string, startRow: number): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A${startRow}:CI`,
  });
  return response.data.values || [];
}

// ── GATE 1: changes waiting to be repeated in the sheet ──────────────────────

async function waitingChanges(): Promise<string[]> {
  const waiting = await MasterChange.find({ userId: USER_ID, sheetDone: false })
    .sort({ createdAt: 1 }).select('list kind before after createdAt').lean() as any[];
  const v = (x: any) => (x ? Object.values(x).filter(y => y !== null && y !== '')
    .map(y => (typeof y === 'object' ? JSON.stringify(y) : String(y))).join(' › ') : '');
  return waiting.map(w =>
    `  - ${new Date(w.createdAt).toISOString().slice(0, 10)} ${w.list} ${w.kind}: ${[v(w.before), v(w.after)].filter(Boolean).join(' → ')}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 FarGaze Log migration${CHECK ? ' — CHECK ONLY, nothing is written' : ''}${FULL ? ' — FULL (~2025 and 2026)' : ''}\n`);

  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  // Gate 1. No override: repeat each change in the sheet and tick it on /admin (or Undo it).
  const waiting = await waitingChanges();
  if (waiting.length) {
    console.error(`\n${CHECK ? '⚠️ ' : '⛔ Stopped:'} ${waiting.length} change(s) on /admin are not yet repeated in the sheet.${CHECK ? ' A real run would stop here.' : ' Nothing was deleted.'}`);
    waiting.forEach(w => console.error(w));
    console.error('Repeat each in the sheet and tick it on /admin, then run the migration again.');
    process.exitCode = 1;
    if (!CHECK) return;
  }

  // The lists the rows are checked against.
  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);
  const checks = await loadMasterChecks(USER_ID);
  console.log(`✅ Master lists loaded (${new Set(checks.map(c => c.def.slug)).size} lists)`);

  // Gate 2. Read and check every sheet BEFORE anything is deleted.
  const prepared: PreparedSheet[] = [];
  for (const job of JOBS) {
    console.log(`\n📋 Reading '${job.sheet}'`);
    const rows = await getSheetData(job.spreadsheetId, job.sheet, job.startRow);
    const p = prepareSheet(job.sheet, rows, job.startRow, USER_ID, checks);
    console.log(`  Rows: ${p.total} | Records: ${p.docs.length} | Skipped (empty or below Preset): ${p.skipped} | Refused: ${new Set(p.refused.map(r => r.row)).size}`);
    prepared.push(p);
  }

  const refused = prepared.reduce((a, p) => a + new Set(p.refused.map(r => r.row)).size, 0);
  if (refused) {
    console.error(`\n${CHECK ? '⚠️ ' : '⛔ Stopped:'} ${refused} refused row${refused === 1 ? '' : 's'}.${CHECK ? ' A real run would stop here.' : ' Nothing was deleted.'}`);
    for (const p of prepared) if (p.refused.length) refusalReport(p.sheet, p.refused).forEach(l => console.error(l));
    console.error('\nFix each value in the sheet, or add it to its list on /admin, then run the migration again.');
    process.exitCode = 1;
    if (!CHECK) return;
  }

  if (CHECK) {
    for (const [i, job] of JOBS.entries()) {
      const now = await Log.countDocuments({ userId: USER_ID, ...job.clear });
      console.log(`\n🔍 ${job.label}: ${now} records in the database now; a real run would put back ${prepared[i].docs.length}.`);
    }
    console.log(refused || waiting.length ? '\n⚠️  Check finished with problems (above).' : '\n✅ Check passed. Nothing was written.');
    return;
  }

  // Everything passed: replace the records.
  await Log.syncIndexes();
  for (const [i, job] of JOBS.entries()) {
    const p = prepared[i];
    const del = await Log.deleteMany({ userId: USER_ID, ...job.clear });
    console.log(`\n🗑️  Deleted ${del.deletedCount} records (${job.label})`);
    let inserted = 0;
    let duplicates = 0;
    if (p.docs.length) {
      try {
        inserted = (await Log.insertMany(p.docs, { ordered: false })).length;
      } catch (error: any) {
        if (!error.writeErrors) throw error;
        duplicates = error.writeErrors.length;
        inserted = p.docs.length - duplicates;
      }
    }
    console.log(`  ✅ '${p.sheet}': Inserted: ${inserted} | Duplicates: ${duplicates}`);
    if (duplicates) process.exitCode = 1;
  }

  const finalCount = await Log.countDocuments({ userId: USER_ID });
  console.log(`\n✅ Total documents in MongoDB: ${finalCount}`);
  console.log('✅ Done!');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
