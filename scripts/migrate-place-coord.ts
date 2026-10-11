import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { google } from 'googleapis';
import PlaceCoord from '../src/models/PlaceCoord';
import { buildPlaceCoords } from '../src/lib/migration/placeCoord';

// Loads the PlaceCoord sheet into place_coord (replaces every row for the user).
// Run: npm run migrate-place-coord

async function getSheetData(spreadsheetId: string, sheetName: string): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A2:D` });
  return response.data.values || [];
}

async function main() {
  console.log('🚀 Place Coord Migration Starting...\n');
  const userId = 'hyoje';

  const rows = await getSheetData(process.env.SPREADSHEET_ID_ACTIVE!, 'PlaceCoord');
  const { docs, blank, problems } = buildPlaceCoords(rows, userId);

  // Fail before touching the collection if the sheet has problems
  if (problems.length > 0) throw new Error('PlaceCoord sheet has problems:\n  ' + problems.join('\n  '));
  if (docs.length === 0) throw new Error('PlaceCoord sheet has no points — check the sheet name and columns');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected to MongoDB:', mongoose.connection.db!.databaseName);
  await PlaceCoord.syncIndexes();

  await PlaceCoord.deleteMany({ userId });
  const result = await PlaceCoord.insertMany(docs);
  console.log(`  ✅ Inserted: ${result.length} places`);
  const bySource = new Map<string, number>();
  for (const d of docs) bySource.set(d.source, (bySource.get(d.source) ?? 0) + 1);
  console.log(`     by source: ${[...bySource].map(([s, n]) => `${s} ${n}`).join(', ')}`);
  if (blank.length) console.log(`  ℹ️  Listed without a point (skipped): ${blank.length}`);

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  return mongoose.disconnect();
});
