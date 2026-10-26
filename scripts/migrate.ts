// Migration: rebuilds the log from the Archive file (Design §11).
//
//   npm run migrate                  rebuilds every year tab ('2026', and '2027' from January)
//   npm run migrate -- --check       reads and checks only; writes nothing (safe on production)
//   npm run migrate -- --full        also rebuilds the archive tab '~2025' (§11.6)
//   npm run migrate -- --full --rollover
//                                    after the January merge (§11.8): reads '~2026' and, if
//                                    the run succeeds, moves the stored archive year on
//
// The tabs come from the Archive file's tab names, checked against the archive year
// in the database (#73, src/lib/yearTabs.ts). Each tab rebuilds only its own years, and
// a record in the wrong tab is refused.
//
// Day to day, new records go up with the Staging migration instead (npm run staging, #68);
// this full run is for when a past record was changed in the sheet.
//
// Nothing is deleted unless every row passes (#67 step 4):
//   1. a change on /admin not yet ticked as repeated in the sheet stops the run;
//   2. the tabs must agree with the stored archive year (#73);
//   3. every row is read and checked against the master lists in the database, and
//      against its tab's years; one refused row stops the run, and the report says
//      which rows and why.
// Master lists are never loaded from the sheet; they are edited on /admin (§15.5).

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { loadMasterChecks, prepareSheet, refusalReport, type PreparedSheet } from '../src/lib/migration/checkRecords';
import Log from '../src/models/Log';
import { getSheetData, listTabs, waitingChanges } from '../src/lib/migration/sheet';
import { planTabs, clearFilter, wrongTab, archiveTabName, type TabJob } from '../src/lib/yearTabs';
import { getArchiveUntil, setArchiveUntil } from '../src/lib/archiveYear';

const USER_ID = 'hyoje';
const CHECK = process.argv.includes('--check');
const FULL = process.argv.includes('--full');
const ROLLOVER = process.argv.includes('--rollover');
const START_ROW = 4;

const label = (j: TabJob) => (j.archive ? `${j.tab} (up to ${j.to})` : j.tab);

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 FarGaze Log migration${CHECK ? ' — CHECK ONLY, nothing is written' : ''}${FULL ? ' — FULL (archive and year tabs)' : ''}${ROLLOVER ? ' — ROLLOVER' : ''}\n`);
  if (ROLLOVER && !FULL) {
    console.error('⛔ --rollover needs --full: the archive tab has to be rebuilt. Run npm run migrate -- --full --rollover.');
    process.exitCode = 1;
    return;
  }
  const archiveFile = process.env.SPREADSHEET_ID_ARCHIVE!;

  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  // Gate 1. No override: repeat each change in the sheet and tick it on /admin (or Undo it).
  const waiting = await waitingChanges(USER_ID);
  if (waiting.length) {
    console.error(`\n${CHECK ? '⚠️ ' : '⛔ Stopped:'} ${waiting.length} change(s) on /admin are not yet repeated in the sheet.${CHECK ? ' A real run would stop here.' : ' Nothing was deleted.'}`);
    waiting.forEach(w => console.error(w));
    console.error('Repeat each in the sheet and tick it on /admin, then run the migration again.');
    process.exitCode = 1;
    if (!CHECK) return;
  }

  // Gate 2. Which tabs to read: the Archive file's tab names against the stored year.
  const stored = await getArchiveUntil(USER_ID);
  const plan = planTabs(await listTabs(archiveFile), stored, ROLLOVER);
  if (!plan.ok) {
    console.error(`\n⛔ ${CHECK ? 'A real run would stop here' : 'Stopped'}: the Archive file's tabs don't match the archive year in the database (${archiveTabName(stored)}). Nothing was deleted.`);
    plan.errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exitCode = 1;
    return;
  }
  const archiveUntil = plan.archive.to;
  const jobs: TabJob[] = [...(FULL ? [plan.archive] : []), ...plan.years];
  console.log(`✅ Archive file: ${[plan.archive, ...plan.years].map(label).join(', ')}${plan.rolloverTo ? ` — rollover: the archive year moves from ${stored} to ${plan.rolloverTo}` : ''}`);
  if (!jobs.length) {
    console.log('\nNo year tab to read. Add a tab for this year, or run with --full.');
    return;
  }

  // The lists the rows are checked against.
  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);
  const checks = await loadMasterChecks(USER_ID);
  console.log(`✅ Master lists loaded (${new Set(checks.map(c => c.def.slug)).size} lists)`);

  // Gate 3. Read and check every sheet BEFORE anything is deleted.
  const prepared: PreparedSheet[] = [];
  for (const job of jobs) {
    console.log(`\n📋 Reading '${job.tab}'`);
    const rows = await getSheetData(archiveFile, job.tab, START_ROW);
    const p = prepareSheet(job.tab, rows, START_ROW, USER_ID, checks);
    // A record in the wrong tab would be deleted by one tab's rebuild and put back by
    // another's, or put back twice.
    const wrong = wrongTab(job, p.docs, archiveUntil);
    if (wrong.size) {
      for (const [i, reason] of wrong) {
        const d = p.docs[i];
        const date = [d?.start?.year, String(d?.start?.month ?? '').padStart(2, '0'), String(d?.start?.day ?? '').padStart(2, '0')].join('-');
        p.refused.push({ row: p.rowNos[i], date, activity: `${d?.activity?.category ?? ''} › ${d?.activity?.name ?? ''}`, reason });
      }
      p.docs = p.docs.filter((_, i) => !wrong.has(i));
      p.rowNos = p.rowNos.filter((_, i) => !wrong.has(i));
    }
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
    for (const [i, job] of jobs.entries()) {
      const now = await Log.countDocuments({ userId: USER_ID, ...clearFilter(job) });
      console.log(`\n🔍 ${label(job)}: ${now} records in the database now; a real run would put back ${prepared[i].docs.length}.`);
    }
    if (plan.rolloverTo) console.log(`\n🔍 A real run would then set the archive year to ${plan.rolloverTo} (${archiveTabName(plan.rolloverTo)}).`);
    console.log(refused || waiting.length ? '\n⚠️  Check finished with problems (above).' : '\n✅ Check passed. Nothing was written.');
    return;
  }

  // Everything passed: replace the records.
  await Log.syncIndexes();
  for (const [i, job] of jobs.entries()) {
    const p = prepared[i];
    const del = await Log.deleteMany({ userId: USER_ID, ...clearFilter(job) });
    console.log(`\n🗑️  Deleted ${del.deletedCount} records (${label(job)})`);
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

  // The rollover counts only once its records are in.
  if (plan.rolloverTo) {
    await setArchiveUntil(USER_ID, plan.rolloverTo);
    console.log(`\n✅ Archive year set to ${plan.rolloverTo}: the archive tab is now ${archiveTabName(plan.rolloverTo)}.`);
  }

  const finalCount = await Log.countDocuments({ userId: USER_ID });
  console.log(`\n✅ Total documents in MongoDB: ${finalCount}`);
  console.log('✅ Done!');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
