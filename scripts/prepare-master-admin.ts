// Prepares the database for the admin editor (#67 step 1). Safe to run twice.
//
//   1. Activity names: lists any name used under more than one category, in
//      activity_master and in records. The unique-name index is built only when
//      there are none.
//   2. Reference lists: converts one-document-per-list into one document per value,
//      and drops the retired lists (food.drinks.note, food.foods.note,
//      food.alcohols.item). Before writing, the old documents are saved to
//      myfiles/admin/reference_lists-before-YYYY-MM-DD.json.
//   3. Alcohol items: for information, record items with no row in
//      alcohol_conversion (the refusal in step 4 of #67 will check item + unit).
//
//   npx tsx --tsconfig tsconfig.json scripts/prepare-master-admin.ts           (dry run)
//   npx tsx --tsconfig tsconfig.json scripts/prepare-master-admin.ts --apply

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import ActivityMaster from '../src/models/ActivityMaster';
import ReferenceList from '../src/models/ReferenceList';
import AlcoholConversion from '../src/models/AlcoholConversion';
import MasterChange from '../src/models/MasterChange';
import { REFERENCE_LIST_NAMES, RETIRED_REFERENCE_LISTS } from '../src/lib/admin/lists';

const USER_ID = 'hyoje';
const APPLY = process.argv.includes('--apply');
const today = new Date().toISOString().slice(0, 10);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  const db = mongoose.connection.db!;
  console.log(`Database: ${db.databaseName}   ${APPLY ? 'APPLY' : 'dry run'}\n`);

  // ── 1. Activity names under more than one category ─────────────────────────
  console.log('1. Activity names under more than one category');
  const masterDup = await ActivityMaster.aggregate([
    { $match: { userId: USER_ID } },
    { $group: { _id: '$name', categories: { $addToSet: '$category' } } },
    { $match: { 'categories.1': { $exists: true } } },
  ]);
  const recordDup = await Log.aggregate([
    { $match: { userId: USER_ID, 'activity.name': { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: { n: '$activity.name', c: '$activity.category' }, records: { $sum: 1 } } },
    { $group: { _id: '$_id.n', cats: { $push: { c: '$_id.c', records: '$records' } } } },
    { $match: { 'cats.1': { $exists: true } } },
  ]);
  if (!masterDup.length && !recordDup.length) console.log('   none ✅');
  for (const d of masterDup) console.log(`   activity_master: ${d._id} → ${d.categories.join(', ')}`);
  for (const d of recordDup) console.log(`   records: ${d._id} → ${d.cats.map((c: any) => `${c.c} (${c.records})`).join(', ')}`);
  const namesClean = !masterDup.length && !recordDup.length;

  // ── 2. Reference lists ─────────────────────────────────────────────────────
  console.log('\n2. Reference lists');
  const raw = db.collection('reference_lists');
  const oldDocs = await raw.find({ userId: USER_ID, values: { $exists: true } }).toArray();
  const keep = new Set(REFERENCE_LIST_NAMES.map(r => r.listName));
  const newDocs: { userId: string; listName: string; value: string; order: number }[] = [];
  if (!oldDocs.length) {
    const n = await raw.countDocuments({ userId: USER_ID, value: { $exists: true } });
    console.log(`   already one document per value (${n} values) ✅`);
  } else {
    for (const d of oldDocs) {
      const name = d.listName as string;
      const values = [...new Set(((d.values ?? []) as unknown[]).map(v => String(v).trim()).filter(Boolean))];
      if (RETIRED_REFERENCE_LISTS.includes(name)) { console.log(`   ${name}: ${values.length} values → retired (dropped)`); continue; }
      if (!keep.has(name)) { console.log(`   ${name}: ${values.length} values → ⚠️ not in the admin lists, dropped`); continue; }
      values.forEach((value, i) => newDocs.push({ userId: USER_ID, listName: name, value, order: i + 1 }));
      console.log(`   ${name}: ${values.length} values → ${values.length} documents`);
    }
    const missing = [...keep].filter(n => !oldDocs.some(d => d.listName === n));
    if (missing.length) console.log(`   ⚠️ no document yet for: ${missing.join(', ')} (they start empty)`);
  }

  // ── 3. Alcohol items without a conversion row ──────────────────────────────
  console.log('\n3. Alcohol items in records with no alcohol_conversion row (item + unit)');
  const conv = new Set((await AlcoholConversion.find({ userId: USER_ID }).lean() as any[]).map(c => `${c.item}|${c.unit}`));
  const used = await Log.aggregate([
    { $match: { userId: USER_ID, 'food.alcohols.0': { $exists: true } } },
    { $unwind: '$food.alcohols' },
    { $group: { _id: { i: '$food.alcohols.item', u: '$food.alcohols.unit' }, records: { $sum: 1 } } },
  ]);
  const noConv = used.filter(g => g._id.i && !conv.has(`${g._id.i}|${g._id.u ?? ''}`));
  if (!noConv.length) console.log('   none ✅');
  for (const g of noConv) console.log(`   ${g._id.i} / ${g._id.u ?? '(no unit)'}: ${g.records}`);

  if (!APPLY) { console.log('\nDry run only. Add --apply to convert and build indexes.'); return; }

  // ── Apply ──────────────────────────────────────────────────────────────────
  console.log('\nApplying');
  await MasterChange.createIndexes();
  console.log('   master_change indexes ✅');

  if (oldDocs.length) {
    const dir = path.join(process.cwd(), 'myfiles', 'admin');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `reference_lists-before-${today}.json`);
    fs.writeFileSync(file, JSON.stringify(oldDocs, null, 2));
    console.log(`   saved the old documents → ${path.relative(process.cwd(), file)}`);

    await raw.deleteMany({ userId: USER_ID, values: { $exists: true } });
    await ReferenceList.syncIndexes();          // drops the old one-per-list unique index
    if (newDocs.length) await ReferenceList.insertMany(newDocs);
    console.log(`   reference_lists: ${newDocs.length} documents written ✅`);
  } else {
    await ReferenceList.syncIndexes();
  }

  if (namesClean) {
    await ActivityMaster.syncIndexes();
    console.log('   activity_master: unique-name index built ✅');
  } else {
    console.log('   activity_master: unique-name index NOT built — fix the names in section 1, then run again');
  }
}

main()
  .catch(e => { console.error('❌', e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
