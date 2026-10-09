import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import FavoritePlace from '../src/models/FavoritePlace';
import TimezoneMaster from '../src/models/TimezoneMaster';
import { buildFavoritePlaces } from '../src/lib/migration/favoritePlace';

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
    range: `${sheetName}!A${startRow}:H`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

async function migrateFavoritePlace(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: favorite_place');

  // Offsets come from timezone_master (the TimeDiff sheet), so the same codes
  // mean the same thing here as in the log records.
  const tzRows = await TimezoneMaster.find({ userId }).lean<{ code: string; offsetUTC: number }[]>();
  if (tzRows.length === 0) {
    throw new Error('timezone_master is empty — run the TimeDiff import in migrate.ts first');
  }
  const offsets = new Map(tzRows.map(r => [r.code, r.offsetUTC]));

  const rows = await getSheetData(spreadsheetId, 'FavoritePlace', 2);
  const { docs, problems } = buildFavoritePlaces(rows, offsets, userId);

  // Fail before touching the collection if the sheet has problems
  if (problems.length > 0) {
    throw new Error('FavoritePlace sheet has problems:\n  ' + problems.join('\n  '));
  }
  if (docs.length === 0) {
    throw new Error('FavoritePlace sheet has no rows — check the sheet name and columns');
  }

  await FavoritePlace.deleteMany({ userId });
  const result = await FavoritePlace.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length} rows`);

  // Print summary for verification (times shown as true UTC)
  const fmt = (d: Date | undefined) => d ? d.toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '…';
  for (const d of docs) {
    console.log(`    ${d.label.padEnd(4)} ${d.name.padEnd(16)} ${fmt(d.from?.at)} → ${fmt(d.to?.at)}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Favorite Place Migration Starting...\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  await FavoritePlace.syncIndexes();
  console.log('✅ Indexes synced');

  await migrateFavoritePlace(process.env.SPREADSHEET_ID_ACTIVE!, 'hyoje');

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  return mongoose.disconnect();
});
