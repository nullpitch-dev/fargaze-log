import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import AlcoholConversion from '../src/models/AlcoholConversion';

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
    range: `${sheetName}!A${startRow}:E`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

async function migrateAlcoholConversion(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: alcohol_conversion');

  // Row 1 = header, data starts at row 2
  const rows = await getSheetData(spreadsheetId, 'AlcoholConv', 2);

  const docs = rows
    .filter(row => row[0] && row[1])   // must have item + unit
    .map(row => ({
      userId,
      item:         row[0].toString().trim(),
      unit:         row[1].toString().trim(),
      unitTo50ml:   parseFloat(row[2].toString().replace(/,/g, '').trim()),
      alcoholRatio: parseFloat(row[3].toString().replace(/,/g, '').trim()),
      drinks:       parseFloat(row[4].toString().replace(/,/g, '').trim()),
    }))
    .filter(doc =>
      !isNaN(doc.unitTo50ml) &&
      !isNaN(doc.alcoholRatio) &&
      !isNaN(doc.drinks)
    );

  await AlcoholConversion.deleteMany({ userId });
  const result = await AlcoholConversion.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length} rows`);

  // Print summary for verification
  console.log('\n  item × unit → drinks:');
  for (const doc of docs) {
    console.log(`    ${doc.item.padEnd(12)} × ${doc.unit.padEnd(6)} → ${doc.drinks}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Alcohol Conversion Migration Starting...\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  await AlcoholConversion.syncIndexes();
  console.log('✅ Indexes synced');

  await migrateAlcoholConversion(process.env.SPREADSHEET_ID_ACTIVE!, 'hyoje');

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch(console.error);
