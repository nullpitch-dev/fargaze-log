// Shared by the daily migration (scripts/migrate.ts) and the Staging migration
// (scripts/migrate-staging.ts): reading a sheet tab, listing the tabs, and the
// change-list gate.

import path from 'path';
import { google } from 'googleapis';

/** Reads one tab from startRow down, columns A–CI, as displayed. */
export async function getSheetData(spreadsheetId: string, sheetName: string, startRow: number): Promise<any[][]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A${startRow}:CI`,
  });
  return response.data.values || [];
}

/** The names of every tab in a spreadsheet, left to right (#73). */
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (response.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean);
}

// (waitingChanges went with the freeze, 14 Nov 2026: nothing on /admin waits for the sheet.)
