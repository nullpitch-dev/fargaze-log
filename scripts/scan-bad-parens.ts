import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { google } from 'googleapis';
import { createRowFilter, loadValidLevel2, parseFoodIngredients } from '../src/lib/migration/transform';

const FOOD_ITEM = 45;
const DRINK_ITEM = 41;

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

// Split the food cell the same way migration does (comma, then plus), then
// test each token through parseFoodIngredients; report any that throw.
function tokens(foodText: string): string[] {
  return foodText
    .split(',').map(s => s.trim()).filter(Boolean)
    .flatMap(s => s.split('+').map(x => x.trim()).filter(Boolean));
}

async function main() {
  const mongoose = await import('mongoose');
  await mongoose.connect(process.env.MONGODB_URI!);
  const userId = 'hyoje';
  await loadValidLevel2(userId);

  const archive = process.env.SPREADSHEET_ID_ARCHIVE!;
  const sheets: Array<[string, number]> = [['~2025', 4], ['2026', 4]];

  let total = 0;
  for (const [sheet, startRow] of sheets) {
    const rows = await getSheet(archive, sheet, startRow);
    const shouldSkip = createRowFilter();
    const bad: Array<{ row: number; item: string; bad: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const skip = shouldSkip(row);           // keep filter state in sync
      if (skip) continue;

      // Scan BOTH the food column and the drink column — rowToDocument now
      // parses parentheses in both, so a bad paren in either skips the row.
      for (const [col, label] of [[FOOD_ITEM, 'food'], [DRINK_ITEM, 'drink']] as Array<[number, string]>) {
        const text = row[col]?.toString().trim() ?? '';
        if (!text) continue;
        for (const tok of tokens(text)) {
          try {
            parseFoodIngredients(tok);
          } catch (e: any) {
            bad.push({ row: i + startRow, item: `[${label}] ${tok}`, bad: e.badValue ?? e.message });
          }
        }
      }
    }

    console.log(`\n══ Sheet "${sheet}": ${bad.length} bad token(s) ══`);
    for (const b of bad) console.log(`  row ${b.row}\t${b.item}\t(bad: ${b.bad})`);
    total += bad.length;
  }

  console.log(`\nTOTAL bad tokens across sheets: ${total}`);
  await mongoose.disconnect();
}
main().catch(console.error);
