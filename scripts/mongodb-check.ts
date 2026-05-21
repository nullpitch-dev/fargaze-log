import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '.env.local' });
import { google } from 'googleapis';

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID_ACTIVE!,
    range: 'AlcoholConv!A2:E',
  });
  const rows = response.data.values || [];
  // Print only rows where column E (drinks) looks small
  for (const row of rows) {
    const drinks = parseFloat(row[4]?.toString().replace(/,/g, '').trim());
    if (!isNaN(drinks) && drinks <= 0.1) {
      console.log(`item=${row[0]} unit=${row[1]} raw_drinks="${row[4]}" parsed=${drinks}`);
    }
  }
}

main().catch(console.error);
