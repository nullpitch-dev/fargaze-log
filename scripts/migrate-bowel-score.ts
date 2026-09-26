import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import BowelScore from '../src/models/BowelScore';

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
    range: `${sheetName}!A${startRow}:F`,
  });
  return response.data.values || [];
}

// ── MIGRATION ─────────────────────────────────────────────────────────────────

// Bowel sheet: row 1 = header, data from row 2.
// Three independent column pairs — value | score:
//   A|B amount · C|D quality · E|F characteristics
const PAIRS = [
  { field: 'amount',          valueCol: 0, scoreCol: 1 },
  { field: 'quality',         valueCol: 2, scoreCol: 3 },
  { field: 'characteristics', valueCol: 4, scoreCol: 5 },
] as const;

async function migrateBowelScore(spreadsheetId: string, userId: string) {
  console.log('\n📋 Migrating: bowel_score');

  const rows = await getSheetData(spreadsheetId, 'Bowel', 2);

  const docs: { userId: string; field: (typeof PAIRS)[number]['field']; value: string; score: number }[] = [];
  const problems: string[] = [];

  rows.forEach((row, i) => {
    for (const p of PAIRS) {
      const value = (row[p.valueCol] ?? '').toString().trim();
      const rawScore = (row[p.scoreCol] ?? '').toString().trim();
      if (value === '' && rawScore === '') continue;
      const score = parseFloat(rawScore.replace(/,/g, ''));
      if (value === '' || isNaN(score)) {
        problems.push(`Row ${i + 2} ${p.field}: value "${value}", score "${rawScore}"`);
        continue;
      }
      docs.push({ userId, field: p.field, value, score });
    }
  });

  // Fail before touching the collection if the sheet is incomplete
  if (problems.length > 0) {
    throw new Error('Bowel sheet has incomplete rows:\n  ' + problems.join('\n  '));
  }
  for (const p of PAIRS) {
    if (!docs.some(d => d.field === p.field)) {
      throw new Error(`Bowel sheet has no ${p.field} values — check the sheet name and columns`);
    }
  }

  await BowelScore.deleteMany({ userId });
  const result = await BowelScore.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length} rows`);

  // Print summary for verification
  for (const p of PAIRS) {
    const list = docs.filter(d => d.field === p.field).map(d => `${d.value} ${d.score}`);
    console.log(`    ${p.field.padEnd(15)} → ${list.join(', ')}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Bowel Score Migration Starting...\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);

  await BowelScore.syncIndexes();
  console.log('✅ Indexes synced');

  await migrateBowelScore(process.env.SPREADSHEET_ID_ACTIVE!, 'hyoje');

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  return mongoose.disconnect();
});
