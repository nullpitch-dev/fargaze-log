// Staging migration (#68, Design §11.7): sends the records in the Archive file's
// 'Staging' tab to the database. It only adds records; it never deletes or edits.
//
//   npm run staging               checks everything, then inserts all Staging records
//   npm run staging -- --check    reads and checks only; writes nothing (safe on production)
//
// Nothing is written unless every check passes:
//   1. a change on /admin not yet ticked as repeated in the sheet stops the run;
//   2. every Staging row passes the same checks as the daily migration;
//   3. a food or drink without ingredients (written without brackets) stops the run:
//      the fill scripts run only with a full migration, so Staging needs them typed;
//   4. the same record (activity + start + end) twice in Staging stops the run;
//   5. a Staging record already in the database stops the run.
// A Staging record missing from its year tab is a warning only: it is still sent, but
// the next full migration would drop it, so copy the row into the year tab.
// After a successful run, clear the Staging rows by hand.

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { loadMasterChecks, prepareSheet, refusalReport } from '../src/lib/migration/checkRecords';
import { getSheetData, waitingChanges } from '../src/lib/migration/sheet';
import {
  recordKey, describe, duplicatesWithin, alreadyThere, existingQuery, yearTabFor, missingFromYearTab, KEY_FIELDS,
  type Located,
} from '../src/lib/migration/staging';
import { missingIngredients, describeMissing } from '../src/lib/records/ingredients';
import Log from '../src/models/Log';

const USER_ID = 'hyoje';
const CHECK = process.argv.includes('--check');
const STAGING_TAB = 'Staging';
const START_ROW = 4;                       // the same layout as the year tabs

async function main() {
  console.log(`📤 FarGaze Log Staging migration${CHECK ? ' — CHECK ONLY, nothing is written' : ''}\n`);
  const archive = process.env.SPREADSHEET_ID_ARCHIVE!;

  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  const problems: string[] = [];            // anything here stops a real run
  const stop = (title: string, lines: string[]) => { problems.push(title); console.error(`\n⛔ ${title}`); lines.forEach(l => console.error(l)); };

  // 1. The change list.
  const waiting = await waitingChanges(USER_ID);
  if (waiting.length) {
    stop(`${waiting.length} change(s) on /admin are not yet repeated in the sheet.`, [
      ...waiting, 'Repeat each in the sheet and tick it on /admin, then run again.']);
  }

  // 2. Read and check the Staging rows.
  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);
  const checks = await loadMasterChecks(USER_ID);

  console.log(`\n📋 Reading '${STAGING_TAB}'`);
  const staged = prepareSheet(STAGING_TAB, await getSheetData(archive, STAGING_TAB, START_ROW), START_ROW, USER_ID, checks);
  const refusedRows = new Set(staged.refused.map(r => r.row)).size;
  console.log(`  Rows: ${staged.total} | Records: ${staged.docs.length} | Empty: ${staged.skipped} | Refused: ${refusedRows}`);
  if (refusedRows) {
    stop(`${refusedRows} refused row${refusedRows === 1 ? '' : 's'}.`, [
      ...refusalReport(STAGING_TAB, staged.refused),
      'Fix each value in the sheet, or add it to its list on /admin, then run again.']);
  }

  const items: Located[] = staged.docs.map((doc, i) => ({ row: staged.rowNos[i], doc }));
  if (!items.length && !problems.length) {
    console.log('\n✅ Staging is empty. Nothing to send.');
    return;
  }

  // 3. Every food and drink names its ingredients.
  const noIngredients = new Map<string, number[]>();
  for (const it of items) {
    for (const m of missingIngredients(it.doc)) {
      const k = describeMissing(m);
      noIngredients.set(k, [...(noIngredients.get(k) ?? []), it.row]);
    }
  }
  if (noIngredients.size) {
    stop(`${noIngredients.size} food or drink item${noIngredients.size === 1 ? ' has' : 's have'} no ingredients.`, [
      ...[...noIngredients.entries()].map(([k, rows]) =>
        `  ✗ ${k} — '${STAGING_TAB}' row${rows.length === 1 ? '' : 's'} ${[...new Set(rows)].join(', ')}`),
      'Write each with its ingredients in brackets, e.g. 김치찌개(김치|돼지고기) or 라떼(커피|우유),',
      'in Staging and in the year tab, then run again.']);
  }

  // 4. The same record twice in Staging.
  const twice = duplicatesWithin(items);
  if (twice.length) {
    stop(`${twice.length} record${twice.length === 1 ? ' is' : 's are'} in Staging more than once (same activity, start and end).`, [
      ...twice.map(g => `  ✗ ${describe(g[0].doc)} — rows ${g.map(x => x.row).join(', ')}`),
      'Delete the extra rows from Staging, then run again.']);
  }

  // 5. Already in the database.
  const existing = await Log.find(existingQuery(USER_ID, staged.docs))
    .select(KEY_FIELDS).lean();
  const there = alreadyThere(items, new Set(existing.map(recordKey)));
  if (there.length) {
    stop(`${there.length} Staging record${there.length === 1 ? ' is' : 's are'} already in the database. Staging only adds new records.`, [
      ...there.map(x => `  ✗ '${STAGING_TAB}' row ${x.row} · ${describe(x.doc)}`),
      'If they were sent before, clear them from Staging. To change a record that is already there,',
      'use the edit feature (later) or a full migration (npm run migrate).']);
  }

  // Warning only: each record must also be in its year tab.
  const tabs = [...new Set(items.map(x => yearTabFor(x.doc)).filter((t): t is string => !!t))];
  const tabKeys = new Map<string, Set<string>>();
  for (const tab of tabs) {
    try {
      const p = prepareSheet(tab, await getSheetData(archive, tab, START_ROW), START_ROW, USER_ID, checks);
      tabKeys.set(tab, new Set(p.docs.map(recordKey)));
      console.log(`  Read '${tab}' for the year-tab check: ${p.docs.length} records`);
    } catch (e: any) {
      console.error(`  Could not read '${tab}': ${e.message}`);
    }
  }
  const missing = missingFromYearTab(items, tabKeys);
  if (missing.length) {
    const sent = problems.length ? 'Not a reason to stop on its own' : CHECK ? 'A real run would still send' : 'Still sent';
    console.warn(`\n⚠️  ${missing.length} Staging record${missing.length === 1 ? ' has' : 's have'} no match in the year tab. ${sent}, but the next full migration would drop ${missing.length === 1 ? 'it' : 'them'}.`);
    missing.forEach(m => console.warn(`  ! '${STAGING_TAB}' row ${m.it.row} · ${describe(m.it.doc)} — ${m.why}`));
    console.warn('Copy each into its year tab (as plain values).');
  }

  if (problems.length) {
    console.error(`\n⛔ ${CHECK ? 'A real run would stop' : 'Stopped'}: ${problems.length} problem${problems.length === 1 ? '' : 's'} above. Nothing was written.`);
    process.exitCode = 1;
    return;
  }

  if (CHECK) {
    console.log(`\n✅ Check passed. A real run would send ${items.length} record${items.length === 1 ? '' : 's'}. Nothing was written.`);
    return;
  }

  // Everything passed: insert all of them, or none.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Log.insertMany(staged.docs, { session, ordered: true });
    });
  } finally {
    await session.endSession();
  }
  const rows = items.map(x => x.row);
  console.log(`\n✅ Sent ${items.length} record${items.length === 1 ? '' : 's'}.`);
  console.log(`👉 Now clear '${STAGING_TAB}' rows ${Math.min(...rows)}–${Math.max(...rows)}.`);
  console.log(`✅ Total documents in MongoDB: ${await Log.countDocuments({ userId: USER_ID })}`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
