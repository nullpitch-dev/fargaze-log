import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import { createRowFilter } from '../src/lib/migration/transform';
import { rowToDocument } from '../src/lib/migration/rowToDocument';
import Log from '../src/models/Log';

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────

async function getSheetData(spreadsheetId: string, sheetName: string): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A3:CG`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

async function migrateSheet(
  spreadsheetId: string,
  sheetName: string,
  userId: string
) {
  console.log(`\n📋 Migrating sheet: ${sheetName}`);

  const rows = await getSheetData(spreadsheetId, sheetName);
  const shouldSkipRow = createRowFilter();

  let skipped = 0;
  let errors = 0;
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
  let duplicates = 0;

  if (docsToInsert.length > 0) {
    try {
      const insertResult = await Log.insertMany(docsToInsert, { ordered: false });
      inserted = insertResult.length;
    } catch (error: any) {
      // Handle duplicate key errors gracefully
      if (error.writeErrors) {
        inserted = docsToInsert.length - error.writeErrors.length;
        duplicates = error.writeErrors.length;
      } else {
        console.error(`  ❌ Bulk insert error: ${error.message}`);
        errors++;
      }
    }
  }

  console.log(`  ✅ Total: ${rows.length} | Skipped: ${skipped} | Inserted: ${inserted} | Duplicates: ${duplicates} | Errors: ${errors}`);
  return { sheet: sheetName, total: rows.length, skipped, inserted, duplicates, errors };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 FarGaze Log Migration Starting...\n');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  const userId = 'hyoje';
  const results = [];

  // Migrate all sheets in order
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ARCHIVE!, '~2025', userId));
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ARCHIVE!, '2026', userId));
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ACTIVE!, 'History', userId));
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ACTIVE!, 'Future', userId));
  results.push(await migrateSheet(process.env.SPREADSHEET_ID_ACTIVE!, 'Active', userId));

  // Summary
  const total = results.reduce((a, r) => a + r.total, 0);
  const inserted = results.reduce((a, r) => a + r.inserted, 0);
  const skipped = results.reduce((a, r) => a + r.skipped, 0);
  const duplicates = results.reduce((a, r) => a + r.duplicates, 0);
  const errors = results.reduce((a, r) => a + r.errors, 0);

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
