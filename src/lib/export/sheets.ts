// #72 Export: writing year tabs in the export spreadsheet (Google Sheets API).
//
// Safety: only tabs named as a 4-digit year are ever written or trimmed; the 'Template' tab is
// only copied. Nothing else in the file is touched.
//
// A tab is rewritten whole: the rows are written over the old ones first (in chunks), then the
// rows left below are deleted. A run that fails half way leaves the old rows below the new ones,
// never an empty tab; the next run puts it right.

import path from 'path';
import { google, type sheets_v4 } from 'googleapis';
import { EXPORT_WIDTH, FIRST_ROW, isYearTab, colLetter, type Cell } from './rows';

export const TEMPLATE_TAB = 'Template';

/** One Sheets call, named for the report. Busy / rate-limit answers (429, 5xx, and the odd
 *  FAILED_PRECONDITION Google gives while a file is still settling) are tried again up to 4
 *  times with a growing wait; anything else stops with Google's full answer and the step. */
async function call<T>(step: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code ?? e?.response?.status;
      const status = e?.response?.data?.error?.status ?? e?.status ?? '';
      const retry = code === 429 || (code >= 500 && code < 600) || status === 'FAILED_PRECONDITION';
      if (retry && attempt < 5) {
        const wait = 5000 * attempt;
        console.log(`   … ${step}: Google said ${code} ${status} — trying again in ${wait / 1000} s`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      const detail = JSON.stringify(e?.response?.data?.error ?? e?.errors ?? e?.message ?? e);
      throw new Error(`${step} failed (try ${attempt}): ${code ?? ''} ${status} ${detail}`);
    }
  }
}
const CHUNK = 2000;
const LAST_COL = colLetter(EXPORT_WIDTH - 1); // CK

export async function sheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: (await auth.getClient()) as any });
}

export interface TabInfo { title: string; sheetId: number; index: number; rows: number; cols: number }

export async function listTabInfo(api: sheets_v4.Sheets, fileId: string): Promise<TabInfo[]> {
  const res = await call('reading the tab list', () => api.spreadsheets.get({ spreadsheetId: fileId, fields: 'sheets.properties(title,sheetId,index,gridProperties)' }));
  return (res.data.sheets ?? []).map(s => ({
    title: s.properties?.title ?? '',
    sheetId: s.properties?.sheetId ?? 0,
    index: s.properties?.index ?? 0,
    rows: s.properties?.gridProperties?.rowCount ?? 0,
    cols: s.properties?.gridProperties?.columnCount ?? 0,
  }));
}

/** Makes the year tab from Template if it isn't there, placed in year order. */
async function ensureTab(api: sheets_v4.Sheets, fileId: string, year: number, tabs: TabInfo[]): Promise<TabInfo> {
  const name = String(year);
  const have = tabs.find(t => t.title === name);
  if (have) return have;
  const template = tabs.find(t => t.title === TEMPLATE_TAB);
  if (!template) throw new Error(`The export file has no '${TEMPLATE_TAB}' tab (rows 1–3 copied from the 2026 tab).`);
  // Before the first later year tab, else at the end.
  const later = tabs.filter(t => isYearTab(t.title) && Number(t.title) > year).sort((a, b) => a.index - b.index)[0];
  const index = later ? later.index : Math.max(...tabs.map(t => t.index)) + 1;
  const res = await call(`${name}: copying Template`, () => api.spreadsheets.batchUpdate({
    spreadsheetId: fileId,
    requestBody: { requests: [{ duplicateSheet: { sourceSheetId: template.sheetId, newSheetName: name, insertSheetIndex: index } }] },
  }));
  const p = res.data.replies?.[0]?.duplicateSheet?.properties;
  const made: TabInfo = { title: name, sheetId: p?.sheetId ?? 0, index, rows: p?.gridProperties?.rowCount ?? 0, cols: p?.gridProperties?.columnCount ?? 0 };
  for (const t of tabs) if (t.index >= index) t.index++;
  tabs.push(made);
  return made;
}

/** Rewrites one year tab with these rows (already in order). */
export { call };

export async function writeYearTab(api: sheets_v4.Sheets, fileId: string, year: number, rows: Cell[][], tabs: TabInfo[], stamp: string) {
  const tab = await ensureTab(api, fileId, year, tabs);
  if (!isYearTab(tab.title)) throw new Error(`Refusing to write '${tab.title}'`);
  const q = `'${tab.title}'`;
  const need = FIRST_ROW - 1 + Math.max(rows.length, 1);

  // Room first: enough rows and columns A–CK.
  const grow: sheets_v4.Schema$Request[] = [];
  if (tab.rows < need) grow.push({ appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: need - tab.rows } });
  if (tab.cols < EXPORT_WIDTH) grow.push({ appendDimension: { sheetId: tab.sheetId, dimension: 'COLUMNS', length: EXPORT_WIDTH - tab.cols } });
  if (grow.length) {
    await call(`${tab.title}: adding room (${tab.rows} → ${need} rows, ${tab.cols} → ${EXPORT_WIDTH} columns)`,
      () => api.spreadsheets.batchUpdate({ spreadsheetId: fileId, requestBody: { requests: grow } }));
    tab.rows = Math.max(tab.rows, need);
    tab.cols = Math.max(tab.cols, EXPORT_WIDTH);
  }

  // The rows, over the old ones.
  for (let k = 0; k < rows.length; k += CHUNK) {
    const part = rows.slice(k, k + CHUNK);
    const top = FIRST_ROW + k;
    const range = `${q}!A${top}:${LAST_COL}${top + part.length - 1}`;
    await call(`writing ${range}`, () => api.spreadsheets.values.update({
      spreadsheetId: fileId, range, valueInputOption: 'RAW', requestBody: { values: part },
    }));
  }
  if (!rows.length) await call(`${tab.title}: clearing`, () => api.spreadsheets.values.clear({ spreadsheetId: fileId, range: `${q}!A${FIRST_ROW}:${LAST_COL}` }));

  // The extra columns' labels and when it was written (row 1 = when, row 3 = labels).
  await call(`${tab.title}: labels`, () => api.spreadsheets.values.batchUpdate({
    spreadsheetId: fileId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${q}!CJ1`, values: [[`Exported ${stamp}`]] },
        { range: `${q}!CJ3:CK3`, values: [['Record id', 'Planned end']] },
      ],
    },
  }));

  // Then the old rows left below go.
  if (tab.rows > need) {
    await call(`${tab.title}: deleting rows ${need + 1}–${tab.rows}`, () => api.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: need, endIndex: tab.rows } } }] },
    }));
    tab.rows = need;
  }
}

/** One year tab as displayed, from row 4, columns A–CK (to prove the round trip on test). */
export async function readYearTab(api: sheets_v4.Sheets, fileId: string, year: number): Promise<string[][]> {
  const res = await call(`${year}: reading back`, () => api.spreadsheets.values.get({ spreadsheetId: fileId, range: `'${year}'!A${FIRST_ROW}:${LAST_COL}` }));
  return (res.data.values ?? []) as string[][];
}
