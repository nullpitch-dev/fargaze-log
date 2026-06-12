import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import { createRowFilter, loadValidLevel2 } from '../src/lib/migration/transform';
import { rowToDocument } from '../src/lib/migration/rowToDocument';
import Log from '../src/models/Log';
import CostMaster from '../src/models/CostMaster';
import ActivityMaster from '../src/models/ActivityMaster';
import ReferenceList from '../src/models/ReferenceList';
import TimezoneMaster from '../src/models/TimezoneMaster';
import ExchangeRate from '../src/models/ExchangeRate';
import AlcoholConversion from '../src/models/AlcoholConversion';

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────

async function getSheetData(
  spreadsheetId: string,
  sheetName: string,
  startRow: number = 3
): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${startRow}:CG`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

async function migrateSheet(
  spreadsheetId: string,
  sheetName: string,
  userId: string,
  startRow: number = 3
) {
  console.log(`\n📋 Migrating sheet: ${sheetName}`);

  const rows = await getSheetData(spreadsheetId, sheetName, startRow);
  const shouldSkipRow = createRowFilter();

  let skipped = 0;
  let errors = 0;
  let duplicates = 0;
  const docsToInsert: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (shouldSkipRow(row)) {
      skipped++;
      continue;
    }
    try {
      const doc = rowToDocument(row, userId);
      docsToInsert.push(doc);
    } catch (error: any) {
      errors++;
      console.error(`  ⚠️  Row ${i + 3}: ${error.message}`);
    }
  }

  let inserted = 0;

  if (docsToInsert.length > 0) {
    try {
      const insertResult = await Log.insertMany(docsToInsert, { ordered: false });
      inserted = insertResult.length;
    } catch (error: any) {
      if (error.writeErrors) {
        inserted = docsToInsert.length - error.writeErrors.length;
        duplicates = error.writeErrors.length;
      } else {
        throw error;
      }
    }
  }

  console.log(`  ✅ Total: ${rows.length} | Skipped: ${skipped} | Inserted: ${inserted} | Duplicates: ${duplicates} | Errors: ${errors}`);
  return { sheet: sheetName, total: rows.length, skipped, inserted, duplicates, errors };
}

async function migrateCostMaster(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: cost_master');
  const rows = await getSheetData(spreadsheetId, 'Cost', 2);
  let inserted = 0;
  const docs = rows
    .filter(row => row[0] && row[1])
    .map(row => ({
      userId,
      categoryDetail: row[0].toString().trim(),
      category: row[1].toString().trim(),
    }));
  await CostMaster.deleteMany({ userId });
  const result = await CostMaster.insertMany(docs);
  inserted = result.length;
  console.log(`  ✅ Inserted: ${inserted}`);
}

async function migrateActivityMaster(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: activity_master');
  const rows = await getSheetData(spreadsheetId, 'Activity', 2);
  let inserted = 0;
  const docs = rows
    .filter(row => row[0] && row[1])
    .map(row => ({
      userId,
      name: row[0].toString().trim(),
      category: row[1].toString().trim(),
    }));
  await ActivityMaster.deleteMany({ userId });
  const result = await ActivityMaster.insertMany(docs);
  inserted = result.length;
  console.log(`  ✅ Inserted: ${inserted}`);
}

async function migrateReferenceLists(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: reference_lists');

  const rows = await getSheetData(spreadsheetId, 'Activity', 2);

  // Column indices for reference lists (0-based, columns C to N)
  const lists = [
    { name: 'activity.crossActivity', col: 2 },
    { name: 'activity.relationship', col: 3 },
    { name: 'nutrient_level', col: 4 },
    { name: 'food.drinks.note', col: 5 },
    { name: 'food.type', col: 6 },
    { name: 'food.foods.note', col: 7 },
    { name: 'transport.purpose', col: 8 },
    { name: 'transport.method', col: 9 },
    { name: 'transport.returnType', col: 10 },
    { name: 'people.method', col: 12 },
    { name: 'people.category', col: 13 },
    { name: 'food.alcohols.item', col: 14 },
  ];

  await ReferenceList.deleteMany({ userId });

  for (const list of lists) {
    const values = rows
      .map(row => row[list.col]?.toString().trim())
      .filter(v => v && v !== '');
    const unique = [...new Set(values)];
    await ReferenceList.create({ userId, listName: list.name, values: unique });
    console.log(`  ✅ ${list.name}: ${unique.length} values`);
  }
}

async function migrateTimezoneMaster(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: timezone_master');
  const rows = await getSheetData(spreadsheetId, 'TimeDiff', 2);
  const docs = rows
    .filter(row => row[0] && row[1] && row[2])
    .map(row => ({
      userId,
      code: row[0].toString().trim(),
      offsetUTC: parseFloat(row[1].toString().trim()),
      ianaTimezone: row[2].toString().trim(),
      city: row[3]?.toString().trim() ?? '',
    }));
  await TimezoneMaster.deleteMany({ userId });
  const result = await TimezoneMaster.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length}`);
}

async function migrateExchangeRate(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: exchange_rate');
  const rows = await getSheetData(spreadsheetId, 'TimeDiff', 2);
  // Exchange rates start after an empty row — find rows with currency + rate
  const docs = rows
    .filter(row => row[0] && row[1] && !row[2]) // currency rows have no IANA timezone
    .map(row => ({
      userId,
      currency: row[0].toString().trim(),
      rateKRW: parseFloat(row[1].toString().replace(/,/g, '').trim()),
    }))
    .filter(doc => !isNaN(doc.rateKRW));
  await ExchangeRate.deleteMany({ userId });
  const result = await ExchangeRate.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length}`);
}


// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 FarGaze Log Migration Starting...\n');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  // Sync indexes for all models
  console.log('🔧 Syncing indexes...');
  await Log.syncIndexes();
  await CostMaster.syncIndexes();
  await ActivityMaster.syncIndexes();
  await ReferenceList.syncIndexes();
  await TimezoneMaster.syncIndexes();
  await ExchangeRate.syncIndexes();
  await AlcoholConversion.syncIndexes();
  console.log('✅ Indexes synced');

  const userId = 'hyoje';

  // Load level2 ingredient vocabulary from ingredient_master (single source of truth).
  // Run `npm run migrate-ingredient` first if this throws.
  await loadValidLevel2(userId);
  console.log('✅ Level2 vocabulary loaded from ingredient_master');
  const results = [];

  // ── RARELY NEEDED — uncomment when supporting collections change ──────────
  // await migrateCostMaster(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // await migrateActivityMaster(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // await migrateReferenceLists(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // await migrateTimezoneMaster(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // await migrateExchangeRate(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // await migrateAlcoholConversion(process.env.SPREADSHEET_ID_ACTIVE!, userId);
  // ─────────────────────────────────────────────────────────────────────────

  // ── RARELY NEEDED — uncomment when ~2025 data needs correction ────────────
  // await Log.deleteMany({ userId, 'start.year': { $lt: 2026 } });
  // console.log('🗑️  Cleared ~2025 logs');
  // results.push(await migrateSheet(process.env.SPREADSHEET_ID_ARCHIVE!, '~2025', userId, 4));
  // ─────────────────────────────────────────────────────────────────────────

  // ── DAILY — current year archive ─────────────────────────────────────────
  await Log.deleteMany({ userId, 'start.year': 2026 });
  console.log('🗑️  Cleared 2026 logs');
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ARCHIVE!, '2026', userId, 4));
  // ─────────────────────────────────────────────────────────────────────────

  // Summary
  const total = results.reduce((a, r) => a + (r.total || 0), 0);
  const inserted = results.reduce((a, r) => a + (r.inserted || 0), 0);
  const skipped = results.reduce((a, r) => a + (r.skipped || 0), 0);
  const duplicates = results.reduce((a, r) => a + (r.duplicates || 0), 0);
  const errors = results.reduce((a, r) => a + (r.errors || 0), 0);

  console.log('\n📊 Migration Summary:');
  console.log(`  Total rows:  ${total}`);
  console.log(`  Inserted:    ${inserted}`);
  console.log(`  Skipped:     ${skipped}`);
  console.log(`  Duplicates:  ${duplicates}`);
  console.log(`  Errors:      ${errors}`);

  const finalCount = await Log.countDocuments({ userId });
  console.log(`\n✅ Total documents in MongoDB: ${finalCount}`);

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch(console.error);
