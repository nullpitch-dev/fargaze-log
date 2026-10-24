// scripts/survey-sheets.ts
// Phase 5 step 2 (WBS #66) — READ-ONLY survey of the source spreadsheets.
//
//   npx tsx --tsconfig tsconfig.json scripts/survey-sheets.ts
//
// Writes myfiles/survey/survey-YYYY-MM-DD.md (the report) and
// myfiles/survey/survey-YYYY-MM-DD.json (the same figures, to seed the
// entry form's category rules later).
//
// Reads only: the Sheets service account is read-only, and the database is used
// for find / countDocuments / aggregate only. Nothing is written anywhere except
// the two files above.

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import fs from 'fs';
import mongoose from 'mongoose';
import { google, sheets_v4 } from 'googleapis';
import { createRowFilter, loadValidLevel2, loadBowelVocabulary } from '../src/lib/migration/transform';
import { rowToDocument } from '../src/lib/migration/rowToDocument';
import { buildPlaceCoords } from '../src/lib/migration/placeCoord';
import Log from '../src/models/Log';
import CostMaster from '../src/models/CostMaster';
import ActivityMaster from '../src/models/ActivityMaster';
import ReferenceList from '../src/models/ReferenceList';
import TimezoneMaster from '../src/models/TimezoneMaster';
import ExchangeRate from '../src/models/ExchangeRate';
import AlcoholConversion from '../src/models/AlcoholConversion';
import IngredientMaster from '../src/models/IngredientMaster';
import BowelScore from '../src/models/BowelScore';
import FavoritePlace from '../src/models/FavoritePlace';
import PlaceCoord from '../src/models/PlaceCoord';
import {
  NCOLS, colLetter, colIndex, DESIGN_FIELDS, FIELD_GROUPS, REFERENCE_LISTS,
  gridToCells, surveyEntrySheet, compareEntrySheets, checkDropdowns, masterTabTable,
  headerText, tabsIn, looksLikeArrayFormula, newUsage, addTabUsage, suggest,
  diffKeys, SHEET_KEYS, DB_KEYS, esc, pct, topEntries, rowList,
  DEFAULT_SHARE, REQUIRED_SHARE, MIN_RECENT,
  type EntrySheetSurvey, type TabInfo, type ListDiff, type Cell,
} from '../src/lib/survey/sheetSurvey';

// ── SETTINGS ─────────────────────────────────────────────────────────────────

const USER_ID = 'hyoje';
const ACTIVE_ID = process.env.SPREADSHEET_ID_ACTIVE!;
const ARCHIVE_ID = process.env.SPREADSHEET_ID_ARCHIVE!;
const YEAR_TABS = [
  { tab: '~2025', startRow: 4 },
  { tab: '2026', startRow: 4 },
];
const CURRENT_YEAR_TAB = '2026';
const ENTRY_SHEETS = ['Active', 'Future', 'History'];
const LAST = colLetter(NCOLS - 1); // CI
const OTHER_TAB_MAX_ROWS = 5000;

// ── SHEETS ACCESS (read-only) ────────────────────────────────────────────────

let sheets: sheets_v4.Sheets;
const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function connectSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(process.cwd(), 'myfiles', process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  sheets = google.sheets({ version: 'v4', auth: client as any });
}

async function tabList(spreadsheetId: string): Promise<{ title: string; tabs: TabInfo[]; namedRanges: { name: string; range: string }[] }> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,namedRanges(name,range),sheets.properties(title,hidden,gridProperties(rowCount,columnCount))',
  });
  const tabs = (res.data.sheets ?? []).map(s => ({
    title: s.properties?.title ?? '',
    hidden: !!s.properties?.hidden,
    rows: s.properties?.gridProperties?.rowCount ?? 0,
    cols: s.properties?.gridProperties?.columnCount ?? 0,
  }));
  const titleOf = (id: number | null | undefined) =>
    (res.data.sheets ?? []).find(s => (s.properties as any)?.sheetId === id)?.properties?.title ?? `sheet ${id}`;
  const namedRanges = (res.data.namedRanges ?? []).map(n => ({
    name: n.name ?? '',
    range: n.range ? `${titleOf(n.range.sheetId)} rows ${(n.range.startRowIndex ?? 0) + 1}–${n.range.endRowIndex ?? '…'}, cols ${colLetter(n.range.startColumnIndex ?? 0)}–${n.range.endColumnIndex ? colLetter(n.range.endColumnIndex - 1) : '…'}` : '',
  }));
  return { title: res.data.properties?.title ?? '', tabs, namedRanges };
}

async function grid(spreadsheetId: string, range: string, fields: string) {
  const res = await sheets.spreadsheets.get({ spreadsheetId, ranges: [range], includeGridData: true, fields });
  return res.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
}

async function values(spreadsheetId: string, range: string): Promise<any[][]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values ?? [];
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  const today = new Date();
  const stamp = today.toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), 'myfiles', 'survey');
  fs.mkdirSync(outDir, { recursive: true });

  const md: string[] = [];
  const findings: string[] = [];
  const problems: string[] = []; // a part that could not run
  const json: any = { generatedAt: today.toISOString() };
  const say = (s = '') => md.push(s);
  const step = (s: string) => console.log(`… ${s}`);

  await connectSheets();

  // ── 1. Tabs ────────────────────────────────────────────────────────────────
  step('Listing tabs');
  const activeMeta = await tabList(ACTIVE_ID);
  const archiveMeta = await tabList(ARCHIVE_ID);
  json.tabs = { active: activeMeta, archive: archiveMeta };

  // ── 2. Headers of the year tabs (rows 1–3) ─────────────────────────────────
  step('Reading header rows');
  const yearHeaders: Record<string, string[][]> = {};
  for (const { tab } of YEAR_TABS) {
    try { yearHeaders[tab] = await values(ARCHIVE_ID, `${q(tab)}!A1:${LAST}3`); }
    catch (e: any) { problems.push(`Header rows of ${tab}: ${e.message}`); yearHeaders[tab] = []; }
  }
  const currentHeaders = yearHeaders[CURRENT_YEAR_TAB] ?? [];

  // ── 3. Entry sheets: formulas, dropdowns, typed cells ──────────────────────
  const entry: Record<string, EntrySheetSurvey> = {};
  for (const name of ENTRY_SHEETS) {
    const info = activeMeta.tabs.find(t => t.title === name);
    if (!info) { problems.push(`The Active spreadsheet has no ${name} tab`); continue; }
    step(`Reading the ${name} sheet (formulas and dropdowns)`);
    try {
      const rows = await grid(ACTIVE_ID, `${q(name)}!A1:${LAST}${info.rows}`,
        'sheets(data(rowData(values(userEnteredValue,formattedValue,dataValidation))))');
      entry[name] = surveyEntrySheet(name, gridToCells(rows), currentHeaders);
    } catch (e: any) { problems.push(`${name} sheet: ${e.message}`); }
  }
  const active = entry['Active'];
  if (!active) throw new Error('Could not read the Active sheet — nothing to survey. ' + problems.join('; '));

  // ── 4. Formulas in the other tabs of the Active spreadsheet ────────────────
  const otherTabs: Record<string, { formulas: number; tabs: string[]; arrays: { cell: string; formula: string }[]; truncated: boolean }> = {};
  for (const t of activeMeta.tabs) {
    if (ENTRY_SHEETS.includes(t.title)) continue;
    step(`Scanning formulas in ${t.title}`);
    const rows = Math.min(t.rows, OTHER_TAB_MAX_ROWS);
    const lastCol = colLetter(Math.max(Math.min(t.cols, 200), 1) - 1);
    try {
      const data = await grid(ACTIVE_ID, `${q(t.title)}!A1:${lastCol}${rows}`,
        'sheets(data(rowData(values(userEnteredValue/formulaValue))))');
      const tabs = new Set<string>();
      const arrays: { cell: string; formula: string }[] = [];
      let formulas = 0;
      data.forEach((rd, ri) => (rd.values ?? []).forEach((v, ci) => {
        const f = v.userEnteredValue?.formulaValue;
        if (!f) return;
        formulas++;
        tabsIn(f).forEach(x => tabs.add(x));
        if (looksLikeArrayFormula(f) && arrays.length < 20) arrays.push({ cell: `${colLetter(ci)}${ri + 1}`, formula: f });
      }));
      otherTabs[t.title] = { formulas, tabs: [...tabs].sort(), arrays, truncated: t.rows > rows };
    } catch (e: any) { problems.push(`Formula scan of ${t.title}: ${e.message}`); }
  }

  // ── 5. The current year tab should hold plain values only ──────────────────
  let yearTabCheck: { formulas: number; dropdowns: number; formulaCells: string[]; dropdownCells: string[] } | null = null;
  const yearInfo = archiveMeta.tabs.find(t => t.title === CURRENT_YEAR_TAB);
  if (yearInfo) {
    step(`Checking ${CURRENT_YEAR_TAB} holds plain values`);
    try {
      const data = await grid(ARCHIVE_ID, `${q(CURRENT_YEAR_TAB)}!A1:${LAST}${yearInfo.rows}`,
        'sheets(data(rowData(values(userEnteredValue/formulaValue,dataValidation/condition/type))))');
      yearTabCheck = { formulas: 0, dropdowns: 0, formulaCells: [], dropdownCells: [] };
      data.forEach((rd, ri) => (rd.values ?? []).forEach((v, ci) => {
        const cell = `${colLetter(ci)}${ri + 1}`;
        if (v.userEnteredValue?.formulaValue) { yearTabCheck!.formulas++; if (yearTabCheck!.formulaCells.length < 10) yearTabCheck!.formulaCells.push(cell); }
        if (v.dataValidation?.condition?.type) { yearTabCheck!.dropdowns++; if (yearTabCheck!.dropdownCells.length < 10) yearTabCheck!.dropdownCells.push(cell); }
      }));
    } catch (e: any) { problems.push(`${CURRENT_YEAR_TAB} formula check: ${e.message}`); }
  }

  // ── 6. Master tabs, read the way their migrations read them ────────────────
  step('Reading master tabs');
  const master: Record<string, any[][]> = {};
  const MASTER_RANGES: Record<string, string> = {
    Cost: 'A2:B', Activity: 'A2:R', TimeDiff: 'A2:D', AlcoholConv: 'A2:E',
    Ingredient: 'A2:B', Bowel: 'A2:F', FavoritePlace: 'A2:H', PlaceCoord: 'A2:D',
  };
  for (const [tab, range] of Object.entries(MASTER_RANGES)) {
    try { master[tab] = await values(ACTIVE_ID, `${q(tab)}!${range}`); }
    catch (e: any) { problems.push(`Master tab ${tab}: ${e.message}`); master[tab] = []; }
  }

  // ── 7. Year tabs, every row, as the migration reads them ───────────────────
  const yearRows: Record<string, any[][]> = {};
  for (const { tab, startRow } of YEAR_TABS) {
    step(`Reading ${tab} (all rows)`);
    yearRows[tab] = await values(ARCHIVE_ID, `${q(tab)}!A${startRow}:${LAST}`);
  }

  // ── 8. Database (read-only) ────────────────────────────────────────────────
  step('Connecting to MongoDB (read-only use)');
  await mongoose.connect(process.env.MONGODB_URI!);
  const dbName = mongoose.connection.db!.databaseName;
  await loadValidLevel2(USER_ID);
  await loadBowelVocabulary(USER_ID);

  step('Running every row through the migration code');
  const usage = newUsage(today);
  for (const { tab, startRow } of YEAR_TABS) {
    addTabUsage(usage, yearRows[tab], startRow, createRowFilter(), row => rowToDocument(row, USER_ID), tab);
  }

  step('Counting database records by year and category');
  const dbCountsRaw = await Log.aggregate([
    { $match: { userId: USER_ID } },
    { $group: { _id: { y: '$start.year', c: '$activity.category' }, n: { $sum: 1 } } },
  ]);
  const dbCounts = new Map<string, number>();
  for (const d of dbCountsRaw) dbCounts.set(`${d._id.y ?? 0}|${d._id.c ?? '(no category)'}`, d.n);

  step('Comparing master lists with the database');
  const lean = async (m: any) => (await m.find({ userId: USER_ID }).lean()) as any[];
  const refDocs = await lean(ReferenceList);
  const placeRows = buildPlaceCoords(master.PlaceCoord, USER_ID).docs;
  const listDiffs: ListDiff[] = [
    diffKeys('Cost → cost_master', SHEET_KEYS.cost(master.Cost), DB_KEYS.cost(await lean(CostMaster))),
    diffKeys('Activity A–B → activity_master', SHEET_KEYS.activity(master.Activity), DB_KEYS.activity(await lean(ActivityMaster))),
    ...REFERENCE_LISTS.map(l => diffKeys(
      `Activity ${colLetter(l.col)} → reference_lists ${l.name}`,
      SHEET_KEYS.referenceList(master.Activity, l.col),
			refDocs.filter(d => d.listName === l.name).sort((a, b) => a.order - b.order).map(d => String(d.value).trim()),
    )),
    diffKeys('TimeDiff (zones) → timezone_master', SHEET_KEYS.timezone(master.TimeDiff), DB_KEYS.timezone(await lean(TimezoneMaster))),
    diffKeys('TimeDiff (currencies) → exchange_rate', SHEET_KEYS.exchange(master.TimeDiff), DB_KEYS.exchange(await lean(ExchangeRate))),
    diffKeys('AlcoholConv → alcohol_conversion', SHEET_KEYS.alcohol(master.AlcoholConv), DB_KEYS.alcohol(await lean(AlcoholConversion)), 'compared on item, unit and drinks'),
    diffKeys('Ingredient → ingredient_master', SHEET_KEYS.ingredient(master.Ingredient), DB_KEYS.ingredient(await lean(IngredientMaster))),
    diffKeys('Bowel → bowel_score', SHEET_KEYS.bowel(master.Bowel), DB_KEYS.bowel(await lean(BowelScore))),
    diffKeys('FavoritePlace → favorite_place', SHEET_KEYS.favoritePlace(master.FavoritePlace), DB_KEYS.favoritePlace(await lean(FavoritePlace)), 'compared on label and name only'),
    diffKeys('PlaceCoord → place_coord', DB_KEYS.placeCoord(placeRows), DB_KEYS.placeCoord(await lean(PlaceCoord)), 'points rounded to 5 decimals'),
  ];

  // Lists the design keeps in two tabs (§12.5: Bowel and Activity P/Q/R)
  const bowelSheet = (i: number) => master.Bowel.map(r => (r[i] ?? '').toString().trim()).filter(Boolean);
  const actCol = (i: number) => master.Activity.map(r => (r[i] ?? '').toString().trim()).filter(Boolean);
  const twoPlaceDiffs: ListDiff[] = [
    diffKeys('Bowel amounts: Activity P against Bowel A', actCol(15), bowelSheet(0)),
    diffKeys('Bowel qualities: Activity Q against Bowel C', actCol(16), bowelSheet(2)),
    diffKeys('Bowel characteristics: Activity R against Bowel E', actCol(17), bowelSheet(4)),
  ];

  await mongoose.disconnect();

  // ════════════════════════════════════════════════════════════════════════
  // REPORT
  // ════════════════════════════════════════════════════════════════════════
  step('Writing the report');

  const dropdowns = checkDropdowns(active);
  const masterTabs = masterTabTable(activeMeta.tabs, active, otherTabs);

  // Findings collected from every cross-check, shown first.
  for (const c of dropdowns.checks) {
    if (c.status !== 'confirmed') findings.push(`Dropdown: ${c.exp.source} ${c.exp.col} (${c.exp.what}) → column ${c.logLetter}: ${c.status}${c.found.length ? ` (${c.found.join('; ')})` : ''}`);
  }
  for (const u of dropdowns.unexpected) findings.push(`Dropdown not known to the migration or the design: column ${u.letter} (${u.field ?? 'not read'}) uses ${u.rule}`);
  for (const t of masterTabs) {
    const used = t.dropdownCols.length || t.formulaCols.length;
    if (!t.inSpreadsheet && (t.inDesign !== '—' || t.loadedBy !== '—')) findings.push(`Tab ${t.tab} is named in the design or the migration but is not in the Active spreadsheet`);
    if (t.inSpreadsheet && used && t.inDesign === '—') findings.push(`Tab ${t.tab} is used by the Active sheet but is not in design §4.1`);
    if (t.inSpreadsheet && used && t.loadedBy === '—' && !ENTRY_SHEETS.includes(t.tab)) findings.push(`Tab ${t.tab} is used by the Active sheet but no migration loads it`);
  }
  for (const name of ['Future', 'History']) {
    if (entry[name]) {
      const d = compareEntrySheets(active, entry[name]);
      if (d.length) findings.push(`${name} differs from Active in ${d.length} column(s): ${d.map(x => x.letter).join(', ')}`);
    }
  }
  // The year tabs are compared with each other. Active's header rows are worded
  // differently and have one row fewer, so they are shown for reading, not flagged.
  const headerDiffCols: string[] = [];
  for (let i = 0; i < NCOLS; i++) {
    const texts = YEAR_TABS.map(y => headerText(yearHeaders[y.tab] ?? [], i));
    if (new Set(texts).size > 1) headerDiffCols.push(colLetter(i));
  }
  if (headerDiffCols.length) findings.push(`Header text differs between ${YEAR_TABS.map(y => y.tab).join(' and ')} in column(s) ${headerDiffCols.join(', ')}`);
  if (yearTabCheck && (yearTabCheck.formulas || yearTabCheck.dropdowns)) findings.push(`${CURRENT_YEAR_TAB} is not plain values: ${yearTabCheck.formulas} formula(s), ${yearTabCheck.dropdowns} dropdown cell(s)`);
  for (const c of active.columns) {
    if (c.field === null && c.verdict !== 'empty' && c.col !== NCOLS - 1) findings.push(`Column ${c.letter} has content in Active (${c.verdict}) but the migration does not read it`);
    if (c.col === NCOLS - 1 && c.verdict !== 'empty') findings.push(`Column CI (the spare column) has content in Active`);
  }
  for (const d of listDiffs) if (d.onlySheet.length || d.onlyDb.length) findings.push(`Master list out of step: ${d.name} — ${d.onlySheet.length} only in the sheet, ${d.onlyDb.length} only in the database`);
  for (const d of twoPlaceDiffs) if (d.onlySheet.length || d.onlyDb.length) findings.push(`Kept in two tabs, not identical: ${d.name}`);
  const refusedTotal = Object.values(usage.refused).reduce((a, r) => a + r.count, 0);
  if (refusedTotal) findings.push(`${refusedTotal} row(s) would be refused by the migration`);
  const countDiffs: { key: string; sheet: number; db: number }[] = [];
  for (const key of new Set([...usage.sheetCounts.keys(), ...dbCounts.keys()])) {
    const s = usage.sheetCounts.get(key) ?? 0, d = dbCounts.get(key) ?? 0;
    if (s !== d) countDiffs.push({ key, sheet: s, db: d });
  }
  countDiffs.sort((a, b) => a.key.localeCompare(b.key));
  if (countDiffs.length) findings.push(`Sheet and database counts differ for ${countDiffs.length} year × category pair(s)`);
  for (const [cat, cs] of usage.categories) for (const g of FIELD_GROUPS) {
    const gs = cs.groups[g.key];
    if (g.paths.length && gs.dropped) findings.push(`${cat}: ${gs.dropped} row(s) have text in ${g.label} that the migration does not store`);
  }

  // ── Write ──
  say(`# FarGaze Log — sheet survey, ${stamp}`);
  say();
  say(`Read-only. Active spreadsheet "${activeMeta.title}", archive "${archiveMeta.title}", database \`${dbName}\`. Took ${Math.round((Date.now() - started) / 1000)} s.`);
  say();
  if (problems.length) {
    say('**Parts that could not run:**');
    problems.forEach(p => say(`- ${esc(p)}`));
    say();
  }
  say('## Findings from the cross-checks');
  say();
  if (findings.length === 0) say('None — everything matched the migration code and the design document.');
  findings.forEach(f => say(`- ${esc(f)}`));
  say();

  // 1. Tabs
  say('## 1. Tabs');
  say();
  for (const meta of [activeMeta, archiveMeta]) {
    say(`**${esc(meta.title)}**`);
    say();
    say('| Tab | Hidden | Grid rows × cols |');
    say('|---|---|---|');
    meta.tabs.forEach(t => say(`| ${esc(t.title)} | ${t.hidden ? 'yes' : ''} | ${t.rows} × ${t.cols} |`));
    say();
    if (meta.namedRanges.length) {
      say('Named ranges: ' + meta.namedRanges.map(n => `\`${esc(n.name)}\` (${esc(n.range)})`).join(', '));
      say();
    }
  }

  // 2. Active sheet, rows above Preset
  say('## 2. Active sheet: the rows above Preset, in full');
  say();
  say(`Preset row: ${active.presetRow ?? 'not found'}. Rows above it: ${active.aboveRows.map(r => r.row).join(', ') || 'none'}` +
      `${active.headerRows.length ? ` (rows ${active.headerRows.join(', ')} are header rows)` : ''}. ` +
      `Preset rows below it: ${active.presetRows.length}.`);
  say();
  const above = active.aboveRows;
  say(`| Col | Design field | ${above.map(r => `Row ${r.row}`).join(' | ')} |`);
  say(`|---|---|${above.map(() => '---').join('|')}|`);
  for (let i = 0; i < NCOLS; i++) {
    const cells = above.map(r => {
      const c = r.cells[i];
      const body = c.kind === 'formula' ? `\`${esc(c.formula!)}\`` : c.kind === 'spilled' ? `(array) ${esc(c.text)}` : esc(c.text);
      return body + (c.validation ? ` ▾ ${esc(c.validation)}` : '');
    });
    say(`| ${colLetter(i)} | ${DESIGN_FIELDS[i] ?? '—'} | ${cells.join(' | ')} |`);
  }
  say();
  say('`code` = formula · (array) = filled by an array formula elsewhere · ▾ = dropdown or validation rule.');
  say();

  // 3. Typed vs formula
  say('## 3. Typed and formula columns (Active)');
  say();
  say(`Judged on ${active.dataRows.length} row(s): the non-header rows above Preset and the Preset rows below it.`);
  say();
  say(`| Col | ${CURRENT_YEAR_TAB} header | Design field | Verdict | Typed / formula / array / empty | Dropdown | Formula (most common shape, count) | Tabs read |`);
  say('|---|---|---|---|---|---|---|---|');
  for (const c of active.columns) {
    const shape = c.shapes[0] ? `\`${esc(c.shapes[0].shape)}\` ×${c.shapes[0].count}${c.shapes.length > 1 ? ` (+${c.shapes.length - 1} other shape${c.shapes.length > 2 ? 's' : ''})` : ''}` : '';
    const dd = c.validations.map(v => `${esc(v.rule)} ×${v.count}`).join('; ');
    say(`| ${c.letter} | ${esc(headerText(currentHeaders, c.col))} | ${c.field ?? '— (not read)'} | ${c.verdict} | ${c.counts.typed} / ${c.counts.formula} / ${c.counts.spilled} / ${c.counts.empty} | ${dd} | ${shape} | ${esc(c.tabs.join(', '))} |`);
  }
  say();
  const multi = active.columns.filter(c => c.shapes.length > 1);
  if (multi.length) {
    say('**Columns with more than one formula shape:**');
    say();
    for (const c of multi) {
      say(`- ${c.letter}: ` + c.shapes.map(s => `\`${esc(s.shape)}\` ×${s.count} (e.g. row ${s.exampleRow})`).join('; '));
    }
    say();
  }
  if (active.arrayFormulas.length) {
    say('**Array formulas in the Active sheet** (each fills cells below or beside it):');
    say();
    active.arrayFormulas.forEach(a => say(`- ${a.cell}: \`${esc(a.formula)}\``));
    say();
  }

  // 4. Dropdowns against master lists
  say('## 4. Dropdowns against the master lists the migration loads');
  say();
  say('| Master | What it is | Log column | Result | Dropdown found |');
  say('|---|---|---|---|---|');
  for (const c of dropdowns.checks) {
    say(`| ${c.exp.source} ${c.exp.col} | ${esc(c.exp.what)} | ${c.logLetter} (${DESIGN_FIELDS[colIndex(c.logLetter)] ?? ''}) | ${c.status} | ${esc(c.found.join('; '))} |`);
  }
  say();
  if (dropdowns.unexpected.length) {
    say('**Other dropdowns** (not in the list above):');
    say();
    dropdowns.unexpected.forEach(u => say(`- ${u.letter} (${u.field ?? 'not read'}): ${esc(u.rule)}`));
    say();
  }
	say('Activity columns F, H, L and O are not reference lists in the database (F, H and O retired on 24 Oct 2026).');
  say();

  // 5. Master tabs
  say('## 5. Master tabs: spreadsheet, design document and migration');
  say();
  say('| Tab | In spreadsheet | Design | Loaded by | Active dropdowns | Active formulas | Read by tabs |');
  say('|---|---|---|---|---|---|---|');
  for (const t of masterTabs) {
    say(`| ${esc(t.tab)} | ${t.inSpreadsheet ? 'yes' : '**no**'} | ${t.inDesign} | ${esc(t.loadedBy)} | ${t.dropdownCols.join(', ')} | ${t.formulaCols.join(', ')} | ${esc(t.readByTabs.join(', '))} |`);
  }
  say();
  say('**Formulas in the other tabs of the Active spreadsheet:**');
  say();
  say('| Tab | Formula cells | Tabs it reads | Array formulas |');
  say('|---|---|---|---|');
  for (const [name, info] of Object.entries(otherTabs)) {
    say(`| ${esc(name)} | ${info.formulas}${info.truncated ? ` (first ${OTHER_TAB_MAX_ROWS} rows)` : ''} | ${esc(info.tabs.join(', '))} | ${info.arrays.map(a => `${a.cell}: \`${esc(a.formula.slice(0, 200))}\``).join('<br>')} |`);
  }
  say();

  // 6. Future and History
  say('## 6. Future and History compared with Active');
  say();
  for (const name of ['Future', 'History']) {
    const s = entry[name];
    if (!s) { say(`- ${name}: not read.`); continue; }
    const d = compareEntrySheets(active, s);
    say(`**${name}** — Preset row ${s.presetRow ?? 'not found'}, ${s.dataRows.length} row(s) judged. ${d.length ? `${d.length} column(s) differ:` : 'Same formulas and dropdowns as Active in every column it uses.'}`);
    say();
    if (d.length) {
      say(`| Col | Field | Active | ${name} |`);
      say('|---|---|---|---|');
      d.forEach(x => say(`| ${x.letter} | ${x.field ?? '—'} | ${esc(x.base)} | ${esc(x.other)} |`));
      say();
    }
  }

  // 7. Headers
  say('## 7. Header rows: Active, year tabs and design §10.1.5');
  say();
  const activeHeaderRows = active.headerRows.map(r => active.aboveRows[r - 1].cells.map((c: Cell) => c.text));
  say(`| Col | Design field | ${active.headerRows.length ? 'Active | ' : ''}${YEAR_TABS.map(y => y.tab).join(' | ')} | Year tabs same? |`);
  say(`|---|---|${active.headerRows.length ? '---|' : ''}${YEAR_TABS.map(() => '---').join('|')}|---|`);
  for (let i = 0; i < NCOLS; i++) {
    const years = YEAR_TABS.map(y => headerText(yearHeaders[y.tab] ?? [], i));
    const cols = [...(active.headerRows.length ? [headerText(activeHeaderRows, i)] : []), ...years];
    say(`| ${colLetter(i)} | ${DESIGN_FIELDS[i] ?? '—'} | ${cols.map(esc).join(' | ')} | ${new Set(years).size > 1 ? '**no**' : ''} |`);
  }
  say();
  if (yearTabCheck) {
    say(`**${CURRENT_YEAR_TAB} plain-values check:** ${yearTabCheck.formulas} formula cell(s)${yearTabCheck.formulaCells.length ? ` (${yearTabCheck.formulaCells.join(', ')}${yearTabCheck.formulas > 10 ? ', …' : ''})` : ''}, ${yearTabCheck.dropdowns} cell(s) with a dropdown${yearTabCheck.dropdownCells.length ? ` (${yearTabCheck.dropdownCells.join(', ')}${yearTabCheck.dropdowns > 10 ? ', …' : ''})` : ''}. ~2025 was not checked (too large to read cell by cell).`);
    say();
  }

  // 8. Master lists: database against sheet
  say('## 8. Master lists: database copy against the sheet');
  say();
  say('Each tab is parsed the way its migration parses it.');
  say();
  say('| List | Sheet | Database | Only in sheet | Only in database |');
  say('|---|---|---|---|---|');
  const sample = (a: string[]) => esc(a.slice(0, 12).join('; ') + (a.length > 12 ? `; … (${a.length})` : ''));
  for (const d of listDiffs) say(`| ${esc(d.name)}${d.note ? ` (${d.note})` : ''} | ${d.sheet} | ${d.db} | ${sample(d.onlySheet)} | ${sample(d.onlyDb)} |`);
  say();
  say('**Lists kept in two tabs** (design §12.5 asks for a new bowel value in both):');
  say();
  say('| List | First tab | Second tab | Only in first | Only in second |');
  say('|---|---|---|---|---|');
  for (const d of twoPlaceDiffs) say(`| ${esc(d.name)} | ${d.sheet} | ${d.db} | ${sample(d.onlySheet)} | ${sample(d.onlyDb)} |`);
  say();

  // 9. Category usage
  const cats = [...usage.categories].sort((a, b) => b[1].records - a[1].records);
  say('## 9. Field groups by category');
  say();
  say(`From ${YEAR_TABS.map(y => y.tab).join(' and ')}: ${usage.rowsRead} rows read, ${usage.accepted} records accepted by the migration code. ` +
      `Shares are of records where the **database stores** a value for the group. ` +
      `Suggested: **required** ≥ ${REQUIRED_SHARE * 100}%, **default** ≥ ${DEFAULT_SHARE * 100}%, judged on the last 12 months when the category has at least ${MIN_RECENT} records in them, otherwise on all years. ` +
      `These seed the rules only; they are edited on the admin page later.`);
  say();
  say('### Overview');
  say();
  say('| Category | Records (last 12 months) | Required | Default |');
  say('|---|---|---|---|');
  const label = (k: string) => FIELD_GROUPS.find(g => g.key === k)!.label.replace(/ \(.*\)$/, '');
  json.categories = {};
  for (const [cat, cs] of cats) {
    const sug = suggest(cs);
    say(`| ${esc(cat)} | ${cs.records} (${cs.recent}) | ${sug.filter(s => s.suggestion === 'required').map(s => label(s.key)).join(', ')} | ${sug.filter(s => s.suggestion === 'default').map(s => label(s.key)).join(', ')} |`);
    json.categories[cat] = {
      records: cs.records, recent: cs.recent,
      activities: Object.fromEntries(topEntries(cs.activities, 1000)),
      groups: Object.fromEntries(FIELD_GROUPS.map(g => {
        const gs = cs.groups[g.key];
        const s = sug.find(x => x.key === g.key);
        return [g.key, { stored: gs.stored, storedRecent: gs.storedRecent, typed: gs.typed, dropped: gs.dropped, share: s?.share ?? null, basis: s?.basis ?? null, suggestion: s?.suggestion ?? '' }];
      })),
    };
  }
  say();
  for (const [cat, cs] of cats) {
    const sug = suggest(cs);
    say(`### ${esc(cat)} — ${cs.records} records, ${cs.recent} in the last 12 months`);
    say();
    const acts = topEntries(cs.activities, 25);
    say(`Activities: ${acts.map(([a, n]) => `${esc(a)} ${n}`).join(', ')}${cs.activities.size > 25 ? `, … (${cs.activities.size} in all)` : ''}`);
    say();
    say('| Field group | All years | Last 12 months | Suggested | Typed but not stored |');
    say('|---|---|---|---|---|');
    for (const g of FIELD_GROUPS) {
      const gs = cs.groups[g.key];
      if (gs.typed === 0 && gs.stored === 0) continue;
      const s = sug.find(x => x.key === g.key);
      const dropped = gs.dropped ? `${gs.dropped}: ${topEntries(gs.droppedValues, 3).map(([v, n]) => `"${esc(v)}" ×${n}`).join(', ')} (${rowList(gs.droppedRows, gs.dropped)})` : '';
      const all = g.paths.length ? pct(gs.stored, cs.records) : `${pct(gs.typed, cs.records)} typed`;
      const recent = g.paths.length ? pct(gs.storedRecent, cs.recent) : '';
      say(`| ${esc(g.label)} | ${all} | ${recent} | ${s?.suggestion ?? ''} | ${dropped} |`);
    }
    say();
  }

  // 9b. By activity — the rules may need to be per activity (생리 holds 대변 and 수면)
  const MIN_ACTIVITY = 20;
  const acts = [...usage.byActivity].sort((a, b) => a[0].localeCompare(b[0]) || b[1].records - a[1].records);
  say('## 9b. Field groups by activity');
  say();
  say(`Activities with at least ${MIN_ACTIVITY} records, by category, with the share of records that store each group. The full figures for every activity are in the .json file.`);
  say();
  json.activities = {};
  // Groups every listed activity requires (time, place …) add nothing per row; they are named once.
  const listed = acts.filter(([, s]) => s.records >= MIN_ACTIVITY);
  const common = new Set(FIELD_GROUPS.filter(g =>
    listed.length > 0 && listed.every(([, s]) => suggest(s).find(x => x.key === g.key)?.suggestion === 'required'),
  ).map(g => g.key));
  say(`Required by every activity listed, so left out of the rows: ${[...common].map(label).join(', ') || 'none'}.`);
  say();
  say('| Category › activity | Records (last 12 months) | Required | Default |');
  say('|---|---|---|---|');
  for (const [key, cs] of acts) {
    const sug = suggest(cs);
    json.activities[key] = {
      records: cs.records, recent: cs.recent,
      groups: Object.fromEntries(FIELD_GROUPS.map(g => {
        const gs = cs.groups[g.key];
        const s = sug.find(x => x.key === g.key);
        return [g.key, { stored: gs.stored, storedRecent: gs.storedRecent, typed: gs.typed, share: s?.share ?? null, basis: s?.basis ?? null, suggestion: s?.suggestion ?? '' }];
      })),
    };
    if (cs.records < MIN_ACTIVITY) continue;
    const pick = (kind: string) => sug.filter(s => s.suggestion === kind && !(kind === 'required' && common.has(s.key)))
      .map(s => `${label(s.key)} ${Math.round(s.share * 100)}%`).join(', ');
    say(`| ${esc(key)} | ${cs.records} (${cs.recent}) | ${pick('required')} | ${pick('default')} |`);
  }
  say();

  // 10. Migration cross-check
  say('## 10. Migration cross-check');
  say();
  say('**Rows skipped by the row filter** (design §4.8):');
  say();
  say('| Reason | Rows | First rows (sheet row numbers) |');
  say('|---|---|---|');
  for (const r of Object.values(usage.skipped).sort((a, b) => b.count - a.count)) say(`| ${esc(r.reason)} | ${r.count} | ${r.examples.join(', ')} |`);
  say();
  say('Row numbers here are real sheet rows. Note: `migrate.ts` prints `Row ${i + 3}` for a tab read from row 4, so its error messages are one row too low.');
  say();
  say('**Rows the migration would refuse:**');
  say();
  if (refusedTotal === 0) say('None.');
  else {
    say('| Reason | Rows | First rows | Messages |');
    say('|---|---|---|---|');
    for (const r of Object.values(usage.refused)) say(`| ${esc(r.reason)} | ${r.count} | ${r.examples.join(', ')} | ${topEntries(r.values, 5).map(([m, n]) => `${esc(m)} ×${n}`).join('<br>')} |`);
  }
  say();
  say('**Sheet against database, by year and category** (only the pairs that differ; 2026 differs by any rows pasted since the last `npm run migrate`):');
  say();
  if (countDiffs.length === 0) say('Every pair matches.');
  else {
    say('| Year | Category | Sheet | Database |');
    say('|---|---|---|---|');
    countDiffs.forEach(d => { const [y, c] = d.key.split('|'); say(`| ${y} | ${esc(c)} | ${d.sheet} | ${d.db} |`); });
  }
  say();

  json.findings = findings;
  json.problems = problems;
  json.activeColumns = active.columns;
  json.dropdownChecks = dropdowns;
  json.masterTabs = masterTabs;
  json.listDiffs = listDiffs;
  json.twoPlaceDiffs = twoPlaceDiffs;
  json.yearTabCheck = yearTabCheck;
  json.skipped = usage.skipped;
  json.refused = Object.fromEntries(Object.entries(usage.refused).map(([k, v]) => [k, { ...v, values: Object.fromEntries(v.values) }]));
  json.countDiffs = countDiffs;

  const mdPath = path.join(outDir, `survey-${stamp}.md`);
  const jsonPath = path.join(outDir, `survey-${stamp}.json`);
  fs.writeFileSync(mdPath, md.join('\n'));
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  console.log(`\n✅ Report: ${path.relative(process.cwd(), mdPath)}`);
  console.log(`✅ Data:   ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`   ${findings.length} finding(s), ${problems.length} part(s) could not run.`);
}

main().catch(async (e) => {
  console.error('❌', e);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => {});
});
