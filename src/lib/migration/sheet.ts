// Shared by the daily migration (scripts/migrate.ts) and the Staging migration
// (scripts/migrate-staging.ts): reading a sheet tab, listing the tabs, and the
// change-list gate.

import path from 'path';
import { google } from 'googleapis';
import MasterChange from '../../models/MasterChange';

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

/** Changes on /admin not yet ticked as repeated in the sheet, one line each. */
export async function waitingChanges(userId: string): Promise<string[]> {
  const waiting = await MasterChange.find({ userId, sheetDone: false })
    .sort({ createdAt: 1 }).select('list kind before after createdAt extra.title').lean() as any[];
  const v = (x: any) => (x ? Object.values(x).filter(y => y !== null && y !== '')
    .map(y => (typeof y === 'object' ? JSON.stringify(y) : String(y))).join(' › ') : '');
  return waiting.map(w => `  - ${new Date(w.createdAt).toISOString().slice(0, 10)} ${w.list} ${w.kind}: ${
    // A record change holds whole records; its title says which (#70, /admin/records).
    w.list === 'records' ? w.extra?.title ?? '' : [v(w.before), v(w.after)].filter(Boolean).join(' → ')}`);
}
