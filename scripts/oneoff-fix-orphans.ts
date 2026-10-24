// One-off (24 Oct 2026): clears the values that records use but master lists lack
// (scripts/check-master-orphans.ts, 24 Oct). Hyoje's decisions:
//
//   Lists
//     cost        + 통신 › 휴대폰   (row 1 of the Cost tab, which had no header; already in the sheet)
//     people.category + 업무지인   (to be cleaned up later on the admin pages)
//     exchange    + SGD at 1048 KRW (already added to the TimeDiff tab)
//   Records (~2025, fixed in the sheet by Hyoje)
//     2022-11-07  cost 생활 › 기타 잡화      → 패션 › 기타 잡화
//     2019-09-28  cost 생활 › 음료           → 식음 › 음료
//     2020-06-13  cost 의료비/건강 › 약 구매 → 의료비/건강 › 치료
//     2021-06-07  carbs l → L, fat h → H
//     2022-02-04  people method 웹콜/대면 → 웹콜|대면: the first target group
//                 (6 people) 웹콜, the second (3 people) 대면
//   Ingredients written by the historical fill (all years; not in any sheet)
//     기타해산물 → 기타 해산물,  야채 육수 → 채소 육수,  춘장 → 짜장
//
//   npx tsx --tsconfig tsconfig.json scripts/oneoff-fix-orphans.ts           (dry run)
//   npx tsx --tsconfig tsconfig.json scripts/oneoff-fix-orphans.ts --apply
//
// Delete this script once it has been applied.

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import CostMaster from '../src/models/CostMaster';
import IngredientMaster from '../src/models/IngredientMaster';
import ReferenceList from '../src/models/ReferenceList';
import ExchangeRate from '../src/models/ExchangeRate';
import MasterChange from '../src/models/MasterChange';

const USER_ID = 'hyoje';
const APPLY = process.argv.includes('--apply');
const SGD_RATE = 1048;

const on = (y: number, m: number, d: number) => ({ 'start.year': y, 'start.month': m, 'start.day': d });

const RECORD_FIXES: { what: string; filter: Record<string, unknown>; set: Record<string, string> }[] = [
  { what: '2022-11-07 cost 생활 › 기타 잡화 → 패션 › 기타 잡화',
    filter: { ...on(2022, 11, 7), 'cost.category': '생활', 'cost.categoryDetail': '기타 잡화' }, set: { 'cost.category': '패션' } },
  { what: '2019-09-28 cost 생활 › 음료 → 식음 › 음료',
    filter: { ...on(2019, 9, 28), 'cost.category': '생활', 'cost.categoryDetail': '음료' }, set: { 'cost.category': '식음' } },
  { what: '2020-06-13 cost 의료비/건강 › 약 구매 → 의료비/건강 › 치료',
    filter: { ...on(2020, 6, 13), 'cost.category': '의료비/건강', 'cost.categoryDetail': '약 구매' }, set: { 'cost.categoryDetail': '치료' } },
  { what: '2021-06-07 carbs l → L',
    filter: { ...on(2021, 6, 7), 'food.carbs': 'l' }, set: { 'food.carbs': 'L' } },
  { what: '2021-06-07 fat h → H',
    filter: { ...on(2021, 6, 7), 'food.fat': 'h' }, set: { 'food.fat': 'H' } },
];

const INGREDIENTS: [string, string][] = [['기타해산물', '기타 해산물'], ['야채 육수', '채소 육수'], ['춘장', '짜장']];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log(`Database: ${mongoose.connection.db!.databaseName}   ${APPLY ? 'APPLY' : 'dry run'}\n`);

  // ── Lists ──────────────────────────────────────────────────────────────────
  console.log('Lists');
  // Cost: 통신 › 휴대폰
  const cost = await CostMaster.findOne({ userId: USER_ID, categoryDetail: '휴대폰' }).lean() as any;
  if (cost) console.log(`  cost 휴대폰 already there (under ${cost.category})`);
  else {
    console.log('  cost + 통신 › 휴대폰');
    if (APPLY) {
      const d = await CostMaster.create({ userId: USER_ID, category: '통신', categoryDetail: '휴대폰' });
      await MasterChange.create({ userId: USER_ID, list: 'cost', kind: 'add', rowId: String(d._id),
        after: { category: '통신', categoryDetail: '휴대폰' },
        sheetSteps: ['Already in the sheet: row 1 of the Cost tab, missed because the tab had no header row.'],
        sheetDone: true, sheetDoneAt: new Date() });
    }
  }

  // People category: 업무지인
  const pc = await ReferenceList.findOne({ userId: USER_ID, listName: 'people.category', value: '업무지인' }).lean();
  if (pc) console.log('  people category 업무지인 already there');
  else {
    console.log('  people category + 업무지인');
    if (APPLY) {
      const last = await ReferenceList.findOne({ userId: USER_ID, listName: 'people.category' }).sort({ order: -1 }).lean() as any;
      const d = await ReferenceList.create({ userId: USER_ID, listName: 'people.category', value: '업무지인', order: (last?.order ?? 0) + 1 });
      await MasterChange.create({ userId: USER_ID, list: 'ref-people-category', kind: 'add', rowId: String(d._id),
        after: { value: '업무지인' },
        sheetSteps: ['Add 업무지인 to the Activity tab, column N (people category dropdown).'] });
    }
  }

  // Exchange rate: SGD
  const sgd = await ExchangeRate.findOne({ userId: USER_ID, currency: 'SGD' }).lean() as any;
  if (sgd) console.log(`  SGD already there (${sgd.rateKRW})`);
  else {
    console.log(`  exchange + SGD at ${SGD_RATE} KRW`);
    if (APPLY) {
      const d = await ExchangeRate.create({ userId: USER_ID, currency: 'SGD', rateKRW: SGD_RATE });
      await MasterChange.create({ userId: USER_ID, list: 'exchange', kind: 'add', rowId: String(d._id),
        after: { currency: 'SGD', rateKRW: SGD_RATE },
        sheetSteps: ['Already in the sheet: added to the TimeDiff tab by Hyoje (24 Oct 2026).'],
        sheetDone: true, sheetDoneAt: new Date() });
    }
  }

  // ── The new values must exist in their lists ──────────────────────────────
  console.log('\nNew values in their lists');
  const costTargets: [string, string][] = [['패션', '기타 잡화'], ['식음', '음료'], ['의료비/건강', '치료']];
  for (const [category, categoryDetail] of costTargets) {
    const ok = await CostMaster.exists({ userId: USER_ID, category, categoryDetail });
    console.log(`  ${ok ? '✅' : '⚠️  missing:'} cost ${category} › ${categoryDetail}`);
  }
  for (const v of ['웹콜', '대면']) {
    const ok = await ReferenceList.exists({ userId: USER_ID, listName: 'people.method', value: v });
    console.log(`  ${ok ? '✅' : '⚠️  missing:'} people method ${v}`);
  }
  for (const v of ['L', 'H']) {
    const ok = await ReferenceList.exists({ userId: USER_ID, listName: 'nutrient_level', value: v });
    console.log(`  ${ok ? '✅' : '⚠️  missing:'} nutrient level ${v}`);
  }
  for (const [, to] of INGREDIENTS) {
    const ok = await IngredientMaster.exists({ userId: USER_ID, level2: to });
    console.log(`  ${ok ? '✅' : '⚠️  missing:'} ingredient ${to}`);
  }

  // ── Records ────────────────────────────────────────────────────────────────
  console.log('\nRecords (expect 1 each)');
  for (const f of RECORD_FIXES) {
    const filter = { userId: USER_ID, ...f.filter };
    const n = await Log.countDocuments(filter);
    console.log(`  ${n === 1 ? '✅' : '⚠️ '} ${f.what}: ${n}`);
    if (APPLY && n === 1) await Log.updateOne(filter, { $set: f.set });
    if (APPLY && n !== 1) console.log('     not changed — expected exactly 1 record');
  }

  // People method on 2022-02-04: one method cell for two target groups
  const WEBCALL = ['정해동', '류석곤', '서영훈', '김대훈', '유상미', '유진희'];
  const MEET = ['박종필', '노웅래', '이성민'];
  const pFilter = { userId: USER_ID, ...on(2022, 2, 4), 'people.method': '웹콜/대면' };
  const pDocs = await Log.find(pFilter).select('people').lean() as any[];
  const pTargets = pDocs.flatMap(d => (d.people ?? []).filter((p: any) => p.method === '웹콜/대면').map((p: any) => p.target));
  const pExpected = [...WEBCALL, ...MEET];
  const pOk = pDocs.length === 1 && pTargets.length === 9 && pExpected.every(t => pTargets.includes(t));
  console.log(`  ${pOk ? '✅' : '⚠️ '} 2022-02-04 people 웹콜/대면 → 웹콜 (6) | 대면 (3): ${pDocs.length} record, ${pTargets.length} people`);
  if (!pOk && pTargets.length) console.log(`     people found: ${pTargets.join(', ')}`);
  if (APPLY && pOk) {
    await Log.updateOne(pFilter,
      { $set: { 'people.$[w].method': '웹콜', 'people.$[m].method': '대면' } },
      { arrayFilters: [
        { 'w.method': '웹콜/대면', 'w.target': { $in: WEBCALL } },
        { 'm.method': '웹콜/대면', 'm.target': { $in: MEET } },
      ] });
  } else if (APPLY) console.log('     not changed — the record did not look as expected');

  // ── Ingredients ────────────────────────────────────────────────────────────
  console.log('\nIngredients (all years)');
  for (const [from, to] of INGREDIENTS) {
    for (const arr of ['food.foods', 'food.drinks'] as const) {
      const filter = { userId: USER_ID, [`${arr}.ingredients`]: from };
      const n = await Log.countDocuments(filter);
      if (!n) continue;
      console.log(`  ${from} → ${to} in ${arr}: ${n} records`);
      if (APPLY) {
        const r = await Log.updateMany(filter,
          { $set: { [`${arr}.$[f].ingredients.$[i]`]: to } },
          { arrayFilters: [{ 'f.ingredients': from }, { i: from }] });
        console.log(`     ✅ ${r.modifiedCount} changed`);
      }
    }
  }

  if (!APPLY) console.log('\nDry run only. Add --apply to write.');
}

main()
  .catch(e => { console.error('❌', e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
