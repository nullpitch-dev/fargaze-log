// Plan upload (#71, Hyoje 10 Nov 2026): sends the rows in the Archive file's 'Plan' tab to
// log_plan as plans, for Coming up and the entry app. The tab has the same columns as
// Staging; the only difference is that End is read as the planned end (a plan hasn't
// ended). It only adds plans; it never deletes or edits.
//
//   npm run plans               checks everything, then inserts all Plan rows
//   npm run plans -- --check    reads and checks only; writes nothing
//
// Nothing is written unless every check passes:
//   1. every row passes the same checks as the daily migration (lists, values);
//   2. the record rules of the edit form (item, amount and unit together; a cost's
//      categories; times that make sense …);
//   3. the same plan (activity + title + start + planned end) twice in the tab;
//   4. a plan already waiting in Coming up (an open plan with the same key).
// Warnings only: a start that has passed (it goes to Coming up as overdue — Start now,
// Done as planned or Delete there); a food or drink without ingredients (fill it in
// when it happens).
// After a successful run, clear the Plan rows by hand. The plans are not in the sheet:
// once one happens, its record is made in the app (no sheet steps).

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { loadMasterChecks, prepareSheet, refusalReport } from '../src/lib/migration/checkRecords';
import { getSheetData } from '../src/lib/migration/sheet';
import { recordKey, describe, duplicatesWithin, existingQuery, KEY_FIELDS, type Located } from '../src/lib/migration/staging';
import { missingIngredients, describeMissing } from '../src/lib/records/ingredients';
import { newRecordRules } from '../src/lib/records/form';
import { loadFormContext } from '../src/lib/records/edit';
import { instantOf } from '../src/lib/entry/time';
import LogPlan from '../src/models/LogPlan';

const USER_ID = 'hyoje';
const CHECK = process.argv.includes('--check');
const PLAN_TAB = 'Plan';
const START_ROW = 4;                       // the same layout as Staging and the year tabs
const EMPTY_POINT = { timezone: null, datetime: null, year: null, month: null, day: null, weekday: null, hour: null, timezoneOffset: null };

/** End → planned end (in place): a plan has only a planned end. */
function asPlan(doc: any) {
  if (doc.end?.year) {
    doc.plannedEnd = { ...doc.end };
    doc.end = { ...EMPTY_POINT, timezone: doc.end.timezone ?? null };
  }
  doc.duration = { totalSeconds: null };
  return doc;
}

async function main() {
  console.log(`📅 FarGaze Log plan upload${CHECK ? ' — CHECK ONLY, nothing is written' : ''}\n`);
  const archive = process.env.SPREADSHEET_ID_ARCHIVE!;

  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  const problems: string[] = [];
  const stop = (title: string, lines: string[]) => { problems.push(title); console.error(`\n⛔ ${title}`); lines.forEach(l => console.error(l)); };

  // 1. Read and check the rows (as a record would be).
  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);
  const checks = await loadMasterChecks(USER_ID);

  console.log(`\n📋 Reading '${PLAN_TAB}'`);
  let rows: any[][];
  try { rows = await getSheetData(archive, PLAN_TAB, START_ROW); }
  catch (e: any) { console.error(`⛔ Could not read the '${PLAN_TAB}' tab: ${e.message}`); process.exitCode = 1; return; }
  const sheet = prepareSheet(PLAN_TAB, rows, START_ROW, USER_ID, checks);
  const refusedRows = new Set(sheet.refused.map(r => r.row)).size;
  console.log(`  Rows: ${sheet.total} | Plans: ${sheet.docs.length} | Empty: ${sheet.skipped} | Refused: ${refusedRows}`);
  if (refusedRows) {
    stop(`${refusedRows} refused row${refusedRows === 1 ? '' : 's'}.`, [
      ...refusalReport(PLAN_TAB, sheet.refused),
      'Fix each value in the tab, or add it to its list on /admin, then run again.']);
  }

  // 2. The record rules, on the row as typed (End still as End).
  const formCtx = await loadFormContext(USER_ID);
  const broken = new Map<string, number[]>();
  sheet.docs.forEach((doc, i) => {
    for (const p of newRecordRules(doc, formCtx).problems) broken.set(p, [...(broken.get(p) ?? []), sheet.rowNos[i]]);
  });
  if (broken.size) {
    const n = new Set([...broken.values()].flat()).size;
    stop(`${n} row${n === 1 ? ' breaks' : 's break'} a record rule.`, [
      ...[...broken.entries()].map(([p, rs]) => `  ✗ ${p} — '${PLAN_TAB}' row${rs.length === 1 ? '' : 's'} ${[...new Set(rs)].join(', ')}`),
      'Fix each row in the tab, then run again.']);
  }

  const items: Located[] = sheet.docs.map((doc, i) => ({ row: sheet.rowNos[i], doc: asPlan(doc) }));
  if (!items.length && !problems.length) {
    console.log(`\n✅ '${PLAN_TAB}' is empty. Nothing to send.`);
    return;
  }

  // 3. The same plan twice in the tab.
  const twice = duplicatesWithin(items);
  if (twice.length) {
    stop(`${twice.length} plan${twice.length === 1 ? ' is' : 's are'} in the tab more than once.`, [
      ...twice.map(g => `  ✗ ${describe(g[0].doc)} — rows ${g.map(x => x.row).join(', ')}`),
      'Delete the extra rows, then run again.']);
  }

  // 4. Already waiting in Coming up.
  const existing = await LogPlan.find({ ...existingQuery(USER_ID, items.map(x => x.doc)), 'plan.state': 'open' }).select(KEY_FIELDS).lean();
  const keys = new Set((existing as any[]).map(recordKey));
  const there = items.filter(x => keys.has(recordKey(x.doc)));
  if (there.length) {
    stop(`${there.length} plan${there.length === 1 ? ' is' : 's are'} already in Coming up.`, [
      ...there.map(x => `  ✗ '${PLAN_TAB}' row ${x.row} · ${describe(x.doc)}`),
      'If they were sent before, clear them from the tab, then run again.']);
  }

  // Warnings.
  const now = Date.now();
  const past = items.filter(x => { const t = instantOf(x.doc.start); return t != null && t <= now; });
  if (past.length) {
    console.warn(`\n⚠️  ${past.length} plan${past.length === 1 ? ' starts' : 's start'} in the past: ${past.length === 1 ? 'it goes' : 'they go'} to Coming up as overdue.`);
    past.forEach(x => console.warn(`  ! '${PLAN_TAB}' row ${x.row} · ${describe(x.doc)}`));
  }
  const noIngredients = items.flatMap(x => missingIngredients(x.doc).map(m => `  ! '${PLAN_TAB}' row ${x.row} · ${describeMissing(m)}`));
  if (noIngredients.length) {
    console.warn(`\n⚠️  ${noIngredients.length} food or drink item${noIngredients.length === 1 ? ' has' : 's have'} no ingredients yet (needed when it happens):`);
    noIngredients.forEach(l => console.warn(l));
  }

  if (problems.length) {
    console.error(`\n⛔ ${CHECK ? 'A real run would stop' : 'Stopped'}: ${problems.length} problem${problems.length === 1 ? '' : 's'} above. Nothing was written.`);
    process.exitCode = 1;
    return;
  }
  if (CHECK) {
    console.log(`\n✅ Check passed. A real run would send ${items.length} plan${items.length === 1 ? '' : 's'}. Nothing was written.`);
    return;
  }

  // Everything passed: insert all of them, or none.
  const t = new Date();
  const docs = items.map(x => ({ ...x.doc, userId: USER_ID, origin: 'app', createdAt: t, updatedAt: t, plan: { state: 'open' } }));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => { await LogPlan.insertMany(docs, { session, ordered: true }); });
  } finally {
    await session.endSession();
  }
  const rowNos = items.map(x => x.row);
  console.log(`\n✅ Sent ${items.length} plan${items.length === 1 ? '' : 's'}.`);
  console.log(`👉 Now clear '${PLAN_TAB}' rows ${Math.min(...rowNos)}–${Math.max(...rowNos)}.`);
  console.log(`✅ Open plans in MongoDB: ${await LogPlan.countDocuments({ userId: USER_ID, 'plan.state': 'open' })}`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
