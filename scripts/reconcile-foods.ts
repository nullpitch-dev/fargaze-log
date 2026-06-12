import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import { createRowFilter, loadValidLevel2 } from '../src/lib/migration/transform';
import { rowToDocument } from '../src/lib/migration/rowToDocument';
import Log from '../src/models/Log';

const FOOD_ITEM = 45; // column index of food item (from rowToDocument C map)

async function getSheet(spreadsheetId: string, sheetName: string, startRow: number) {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${sheetName}!A${startRow}:CG`,
  });
  return res.data.values || [];
}

// Reconcile one sheet against MongoDB.
async function reconcile(spreadsheetId: string, sheetName: string, startRow: number, userId: string) {
  console.log(`\n══ Reconciling sheet "${sheetName}" ══`);
  const rows = await getSheet(spreadsheetId, sheetName, startRow);
  const shouldSkip = createRowFilter();

  let sourceFoodRows = 0;        // rows with non-empty food item text
  let skippedButHadFood = 0;     // food rows the filter would skip
  let parseEmptyFood = 0;        // passed filter but food parsed to nothing / doc had no foods
  let parseError = 0;
  const skippedExamples: Array<{ row: number; reason: string; food: string }> = [];
  const emptyExamples: Array<{ row: number; food: string }> = [];
  const errorExamples: Array<{ row: number; msg: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRowNum = i + startRow;
    const foodText = (row[FOOD_ITEM]?.toString().trim()) ?? '';
    const hasFood = foodText !== '';
    if (hasFood) sourceFoodRows++;

    const skip = shouldSkip(row); // NOTE: stateful (Preset latch) — call once per row in order
    if (!hasFood) continue;

    if (skip) {
      skippedButHadFood++;
      if (skippedExamples.length < 20)
        skippedExamples.push({ row: sheetRowNum, reason: 'row filter (Preset/empty cat/header)', food: foodText });
      continue;
    }

    // Passed the filter — try to build the doc and see if it yields foods
    try {
      const doc: any = rowToDocument(row, userId);
      const foods = doc?.food?.foods;
      if (!Array.isArray(foods) || foods.length === 0) {
        parseEmptyFood++;
        if (emptyExamples.length < 20) emptyExamples.push({ row: sheetRowNum, food: foodText });
      }
    } catch (e: any) {
      parseError++;
      if (errorExamples.length < 20) errorExamples.push({ row: sheetRowNum, msg: e.message });
    }
  }

  console.log(`  Source rows with food text:         ${sourceFoodRows}`);
  console.log(`  ─ skipped by row filter:            ${skippedButHadFood}`);
  console.log(`  ─ passed filter but no foods parsed:${parseEmptyFood}`);
  console.log(`  ─ row threw during parse:           ${parseError}`);
  console.log(`  = expected docs-with-foods:         ${sourceFoodRows - skippedButHadFood - parseEmptyFood - parseError}`);

  if (skippedExamples.length) {
    console.log('\n  ⚠️  Food rows SKIPPED by filter:');
    for (const e of skippedExamples) console.log(`     row ${e.row}: "${e.food}"  (${e.reason})`);
  }
  if (emptyExamples.length) {
    console.log('\n  ⚠️  Food rows that parsed to NO foods:');
    for (const e of emptyExamples) console.log(`     row ${e.row}: "${e.food}"`);
  }
  if (errorExamples.length) {
    console.log('\n  ⚠️  Food rows that ERRORED (these get skipped → row not inserted):');
    for (const e of errorExamples) console.log(`     row ${e.row}: ${e.msg}`);
  }

  return { sourceFoodRows, skippedButHadFood, parseEmptyFood, parseError };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected:', mongoose.connection.db!.databaseName);

  const userId = 'hyoje';

  // Load level2 vocabulary so rowToDocument's parseFoodIngredients works
  // (mirrors migrate.ts). Requires ingredient_master to be seeded.
  await loadValidLevel2(userId);
  console.log('✅ Level2 vocabulary loaded');

  // MongoDB side
  const dbDocsWithFoods = await Log.countDocuments({ userId, 'food.foods.0': { $exists: true } });
  console.log(`\nMongoDB documents with foods: ${dbDocsWithFoods}`);

  // Reconcile both archive sheets. Adjust names/rows to match your migrate.ts.
  const archive = process.env.SPREADSHEET_ID_ARCHIVE!;
  const totals = { src: 0, skip: 0, empty: 0, err: 0 };
  for (const [sheet, startRow] of [['~2025', 4], ['2026', 4]] as Array<[string, number]>) {
    try {
      const r = await reconcile(archive, sheet, startRow, userId);
      totals.src += r.sourceFoodRows;
      totals.skip += r.skippedButHadFood;
      totals.empty += r.parseEmptyFood;
      totals.err += r.parseError;
    } catch (e: any) {
      console.log(`  (could not read sheet "${sheet}": ${e.message})`);
    }
  }

  const expected = totals.src - totals.skip - totals.empty - totals.err;
  console.log('\n══ OVERALL ══');
  console.log(`  Source food rows (all sheets):  ${totals.src}`);
  console.log(`  Expected docs-with-foods:       ${expected}`);
  console.log(`  Actual MongoDB docs-with-foods: ${dbDocsWithFoods}`);
  const gap = expected - dbDocsWithFoods;
  console.log(`  Unexplained gap:                ${gap}  ${gap === 0 ? '✅ fully reconciled' : '(likely duplicate-key rejections — see migrate summary)'}`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}
main().catch(console.error);
