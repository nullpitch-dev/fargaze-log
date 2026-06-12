import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import IngredientMaster from '../src/models/IngredientMaster';

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────

async function getSheetData(
  spreadsheetId: string,
  sheetName: string,
  startRow: number = 2
): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${startRow}:B`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

async function migrateIngredient(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: ingredient_master');

  // Row 1 = header (level1 | level2), data starts at row 2
  const rows = await getSheetData(spreadsheetId, 'Ingredient', 2);

  const docs = rows
    .filter(row => row[0] && row[1])   // must have level1 + level2
    .map(row => ({
      userId,
      level1: row[0].toString().trim(),
      level2: row[1].toString().trim(),
    }));

  await IngredientMaster.deleteMany({ userId });
  const result = await IngredientMaster.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length} rows`);

  // Print summary grouped by level1
  console.log('\n  level1 → level2:');
  const byL1: Record<string, string[]> = {};
  for (const doc of docs) {
    (byL1[doc.level1] ??= []).push(doc.level2);
  }
  for (const [l1, l2s] of Object.entries(byL1)) {
    console.log(`    ${l1.padEnd(6)} → ${l2s.join(', ')}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Ingredient Master Migration Starting...\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  await IngredientMaster.syncIndexes();
  console.log('✅ Indexes synced');

  await migrateIngredient(process.env.SPREADSHEET_ID_ACTIVE!, 'hyoje');

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch(console.error);
