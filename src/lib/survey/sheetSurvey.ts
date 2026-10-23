// src/lib/survey/sheetSurvey.ts
// Phase 5 step 2 (WBS #66): read-only survey of the source spreadsheets.
// Pure: no Sheets or database access, so every part can be tested on its own.
// scripts/survey-sheets.ts fetches the data and calls these functions.
//
// What the survey answers (Data Entry Plan, "Decisions and next steps"):
//   1. Which master tabs the entry sheet depends on, through dropdowns and formulas
//   2. Which columns are typed and which come from formulas (for the nightly export)
//   3. Which field groups each activity category uses (seeds the entry form's rules)
// Each answer is cross-checked against what the migration code and the design
// document (v4.15) say.

// ── COLUMNS ──────────────────────────────────────────────────────────────────

export const NCOLS = 87; // A..CI, the migration's fetch range

export function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// What each column holds, according to rowToDocument.ts (C map) and design §10.1.5.
// null = the migration does not read the column.
export const DESIGN_FIELDS: (string | null)[] = (() => {
  const f: (string | null)[] = new Array(NCOLS).fill(null);
  const set = (i: number, name: string) => { f[i] = name; };
  [
    'activity.category', 'activity.name', 'activity.title', 'activity.additionalInfo',
    'sync.export', 'activity.crossActivity', 'activity.relationship',
    'start.timezone', 'start.year', 'start.month', 'start.day', 'start.weekday', 'start.hour',
    'start.timezoneOffset',
    'end.timezone', 'end.year', 'end.month', 'end.day', 'end.weekday', 'end.hour',
    'end.timezoneOffset',
  ].forEach((n, i) => set(i, n));
  // 21..25 (V..Z) are not read
  const rest: [number, string][] = [
    [26, 'location.activity'], [27, 'location.online'], [28, 'location.other'],
    [29, 'cost.amountKRW'], [30, 'cost.amountForeign'], [31, 'cost.currency'],
    [32, 'cost.categoryDetail'], [33, 'cost.category'],
    [34, 'purchase[].item'], [35, 'purchase[].amount'], [36, 'purchase[].unit'],
    [37, 'food.type'], [38, 'food.carbs'], [39, 'food.fat'], [40, 'food.spiciness'],
    [41, 'food.drinks[].item'], [42, 'food.drinks[].amount'], [43, 'food.drinks[].unit'], [44, 'food.drinks[].note'],
    [45, 'food.foods[].item'], [46, 'food.foods[].amount'], [47, 'food.foods[].unit'], [48, 'food.foods[].note'],
    [49, 'food.alcohols[].item'], [50, 'food.alcohols[].amount'], [51, 'food.alcohols[].unit'], [52, 'food.alcohols[].note'],
    [53, 'people[].method'], [54, 'people[].category'], [55, 'people[].target'],
    [56, 'transport.from'], [57, 'transport.to'], [58, 'transport.purpose'], [59, 'transport.method'],
    [60, 'transport.returnType'],
    [61, 'bowel.amount'], [62, 'bowel.quality'], [63, 'bowel.characteristics'],
    [64, 'body.weight'], [65, 'body.muscleMass'], [66, 'body.bodyFat'], [67, 'body.bodyFatPercent'],
    [68, 'sleep.quality'],
    [69, 'exercise[].item'], [70, 'exercise[].amount'], [71, 'exercise[].unit'],
    [72, 'exercise[].loadKg'], [73, 'exercise[].setStyle'],
    [74, 'reading.title'], [75, 'movie.title'],
    [76, 'golf.score'], [77, 'golf.approach'], [78, 'golf.putts'],
    [79, 'income.gross'], [80, 'income.net'],
    [81, 'travel.city'], [82, 'travel.theme'], [83, 'notes'],
    [84, 'sync.status'], [85, 'sync.eventId'],
    // 86 (CI) is the spare column in the fetch range
  ];
  rest.forEach(([i, n]) => set(i, n));
  return f;
})();

// Field groups of the entry form. `paths` are read from the migrated document
// (what the database stores); `cols` are the sheet columns (what was typed).
export interface FieldGroup { key: string; label: string; cols: number[]; paths: string[] }

const r = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const FIELD_GROUPS: FieldGroup[] = [
  { key: 'title',      label: 'Title / additional info (C–D)',   cols: [2, 3],   paths: ['activity.title', 'activity.additionalInfo'] },
  { key: 'calendar',   label: 'Calendar export (E, CG–CH)',      cols: [4, 84, 85], paths: ['sync.export', 'sync.status', 'sync.eventId'] },
  { key: 'link',       label: 'Cross activity / relationship (F–G)', cols: [5, 6], paths: ['activity.crossActivity', 'activity.relationship'] },
  { key: 'startDate',  label: 'Start date (I–K)',                cols: [8, 9, 10], paths: ['start.year', 'start.month', 'start.day'] },
  { key: 'startTime',  label: 'Start time (M)',                  cols: [12],     paths: ['start.hour'] },
  { key: 'endDate',    label: 'End date (P–R)',                  cols: [15, 16, 17], paths: ['end.year', 'end.month', 'end.day'] },
  { key: 'endTime',    label: 'End time (T)',                    cols: [19],     paths: ['end.hour'] },
  { key: 'zones',      label: 'Time zones and offsets (H, N, O, U)', cols: [7, 13, 14, 20], paths: ['start.timezone', 'start.timezoneOffset', 'end.timezone', 'end.timezoneOffset'] },
  { key: 'place',      label: 'Place (AA–AC)',                   cols: r(26, 28), paths: ['location'] },
  { key: 'cost',       label: 'Cost (AD–AH)',                    cols: r(29, 33), paths: ['cost'] },
  { key: 'purchase',   label: 'Purchase (AI–AK)',                cols: r(34, 36), paths: ['purchase'] },
  { key: 'meal',       label: 'Meal type / carbs / fat / spiciness (AL–AO)', cols: r(37, 40), paths: ['food.type', 'food.carbs', 'food.fat', 'food.spiciness'] },
  { key: 'drinks',     label: 'Drinks (AP–AS)',                  cols: r(41, 44), paths: ['food.drinks'] },
  { key: 'foods',      label: 'Foods (AT–AW)',                   cols: r(45, 48), paths: ['food.foods'] },
  { key: 'alcohols',   label: 'Alcohol (AX–BA)',                 cols: r(49, 52), paths: ['food.alcohols'] },
  { key: 'people',     label: 'People (BB–BD)',                  cols: r(53, 55), paths: ['people'] },
  { key: 'transport',  label: '이동 (BE–BI)',                    cols: r(56, 60), paths: ['transport'] },
  { key: 'bowel',      label: 'Bowel (BJ–BL)',                   cols: r(61, 63), paths: ['bowel'] },
  { key: 'body',       label: 'Body (BM–BP)',                    cols: r(64, 67), paths: ['body'] },
  { key: 'sleep',      label: 'Sleep (BQ)',                      cols: [68],     paths: ['sleep'] },
  { key: 'exercise',   label: 'Exercise (BR–BV)',                cols: r(69, 73), paths: ['exercise'] },
  { key: 'reading',    label: 'Reading (BW)',                    cols: [74],     paths: ['reading'] },
  { key: 'movie',      label: 'Movie (BX)',                      cols: [75],     paths: ['movie'] },
  { key: 'golf',       label: 'Golf (BY–CA)',                    cols: r(76, 78), paths: ['golf'] },
  { key: 'income',     label: 'Income (CB–CC)',                  cols: [79, 80], paths: ['income'] },
  { key: 'travel',     label: 'Travel (CD–CE)',                  cols: [81, 82], paths: ['travel'] },
  { key: 'notes',      label: 'Notes (CF)',                      cols: [83],     paths: ['notes'] },
  { key: 'unread',     label: 'Columns V–Z (not read by the migration)', cols: r(21, 25), paths: [] },
];

// Tabs named in design §4.1 (Active spreadsheet), and tabs the migration scripts load.
export const DESIGN_TABS = ['Active', 'Future', 'History', 'Cost', 'Activity', 'TimeDiff', 'AlcoholConv', 'Ingredient', 'Bowel'];
export const DESIGN_TABS_ELSEWHERE: Record<string, string> = {
  FavoritePlace: '§12 (procedure only)',
  PlaceCoord: '§12 (procedure only)',
  Calendar: '§13.2',
};
export const MIGRATION_TABS: Record<string, string> = {
  Cost: 'migrate.ts → cost_master (commented out)',
  Activity: 'migrate.ts → activity_master + reference_lists (commented out)',
  TimeDiff: 'migrate.ts → timezone_master + exchange_rate (commented out)',
  AlcoholConv: 'npm run migrate-alcohol → alcohol_conversion',
  Ingredient: 'npm run migrate-ingredient → ingredient_master',
  Bowel: 'npm run migrate-bowel → bowel_score',
  FavoritePlace: 'npm run migrate-favorite-place → favorite_place',
  PlaceCoord: 'npm run migrate-place-coord → place_coord',
};

// The reference lists migrate.ts loads from the Activity tab (migrateReferenceLists),
// and the log columns each list should feed through a dropdown.
export interface DropdownExpectation { source: string; col: string; what: string; logCols: number[] }
export const DROPDOWN_EXPECTATIONS: DropdownExpectation[] = [
  { source: 'Activity', col: 'A', what: 'activity names (activity_master)', logCols: [1] },
  { source: 'Activity', col: 'C', what: 'reference list activity.crossActivity', logCols: [5] },
  { source: 'Activity', col: 'D', what: 'reference list activity.relationship', logCols: [6] },
  { source: 'Activity', col: 'E', what: 'reference list nutrient_level', logCols: [38, 39] },
  { source: 'Activity', col: 'F', what: 'reference list food.drinks.note', logCols: [44] },
  { source: 'Activity', col: 'G', what: 'reference list food.type', logCols: [37] },
  { source: 'Activity', col: 'H', what: 'reference list food.foods.note', logCols: [48] },
  { source: 'Activity', col: 'I', what: 'reference list transport.purpose', logCols: [58] },
  { source: 'Activity', col: 'J', what: 'reference list transport.method', logCols: [59] },
  { source: 'Activity', col: 'K', what: 'reference list transport.returnType', logCols: [60] },
  { source: 'Activity', col: 'M', what: 'reference list people.method', logCols: [53] },
  { source: 'Activity', col: 'N', what: 'reference list people.category', logCols: [54] },
  { source: 'Activity', col: 'O', what: 'reference list food.alcohols.item', logCols: [49] },
  { source: 'Activity', col: 'P', what: 'bowel amounts (design §4.1)', logCols: [61] },
  { source: 'Activity', col: 'Q', what: 'bowel qualities (design §4.1)', logCols: [62] },
  { source: 'Activity', col: 'R', what: 'bowel characteristics (design §4.1)', logCols: [63] },
  { source: 'Cost', col: 'A', what: 'cost category detail (cost_master)', logCols: [32] },
  { source: 'TimeDiff', col: 'A', what: 'time zone codes (timezone_master)', logCols: [7, 14] },
];

// migrateReferenceLists in scripts/migrate.ts — same names, same Activity columns.
export const REFERENCE_LISTS: { name: string; col: number }[] = [
  { name: 'activity.crossActivity', col: 2 },
  { name: 'activity.relationship', col: 3 },
  { name: 'nutrient_level', col: 4 },
  { name: 'food.drinks.note', col: 5 },
  { name: 'food.type', col: 6 },
  { name: 'food.foods.note', col: 7 },
  { name: 'transport.purpose', col: 8 },
  { name: 'transport.method', col: 9 },
  { name: 'transport.returnType', col: 10 },
  { name: 'people.method', col: 12 },
  { name: 'people.category', col: 13 },
  { name: 'food.alcohols.item', col: 14 },
];

// ── CELLS ────────────────────────────────────────────────────────────────────

export type CellKind = 'typed' | 'formula' | 'spilled' | 'empty';

export interface Cell {
  kind: CellKind;
  text: string;          // what the cell shows
  formula?: string;      // only when kind === 'formula'
  validation?: string;   // dropdown / validation rule, described
}

/** Minimal shapes of the Sheets API grid data we read. */
export interface ApiCell {
  userEnteredValue?: { formulaValue?: string | null; stringValue?: string | null; numberValue?: number | null; boolValue?: boolean | null } | null;
  formattedValue?: string | null;
  dataValidation?: { condition?: { type?: string | null; values?: { userEnteredValue?: string | null }[] | null } | null; strict?: boolean | null } | null;
}

export function describeValidation(v: ApiCell['dataValidation']): string | undefined {
  if (!v || !v.condition) return undefined;
  const type = v.condition.type ?? '?';
  const vals = (v.condition.values ?? []).map(x => x.userEnteredValue ?? '');
  if (type === 'ONE_OF_RANGE') return `range ${vals[0] ?? ''}`;
  if (type === 'ONE_OF_LIST') {
    const shown = vals.slice(0, 8).join(', ');
    return `list: ${shown}${vals.length > 8 ? `, … (${vals.length} values)` : ''}`;
  }
  return `${type}${vals.length ? ' ' + vals.join(', ') : ''}`;
}

export function toCell(c: ApiCell | undefined): Cell {
  if (!c) return { kind: 'empty', text: '' };
  const text = (c.formattedValue ?? '').toString();
  const validation = describeValidation(c.dataValidation);
  const u = c.userEnteredValue;
  if (u && u.formulaValue != null) return { kind: 'formula', text, formula: u.formulaValue, validation };
  if (u && (u.stringValue != null || u.numberValue != null || u.boolValue != null)) {
    const t = text !== '' ? text : String(u.stringValue ?? u.numberValue ?? u.boolValue);
    return { kind: t.trim() === '' ? 'empty' : 'typed', text: t, validation };
  }
  // No entered value but something is shown: the cell is filled by an array
  // formula elsewhere (ARRAYFORMULA, QUERY, FILTER … spilling into it).
  if (text.trim() !== '') return { kind: 'spilled', text, validation };
  return { kind: 'empty', text: '', validation };
}

export function gridToCells(rowData: { values?: ApiCell[] | null }[] | null | undefined, ncols = NCOLS): Cell[][] {
  return (rowData ?? []).map(rd => {
    const vals = rd.values ?? [];
    return Array.from({ length: ncols }, (_, i) => toCell(vals[i]));
  });
}

// ── FORMULAS ─────────────────────────────────────────────────────────────────

/** Tabs a formula or range string refers to ('Tab'!A1, Tab!A:A). */
export function tabsIn(formula: string): string[] {
  const out = new Set<string>();
  const re = /'((?:[^']|'')+)'!|([^\s!'"(),:;=+\-*/&<>^{}[\]]+)!/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const name = (m[1] ?? m[2] ?? '').replace(/''/g, "'");
    if (name) out.add(name);
  }
  return [...out];
}

const SPILL_FUNCS = /\b(ARRAYFORMULA|QUERY|FILTER|SORT|SORTN|UNIQUE|MAP|BYROW|BYCOL|SEQUENCE|IMPORTRANGE|FLATTEN|SPLIT)\s*\(/i;
export function looksLikeArrayFormula(formula: string): boolean {
  return SPILL_FUNCS.test(formula);
}

/**
 * The formula with relative row numbers written relative to its own row, so the
 * same formula copied down a column has one shape: =Activity!B5 on row 5 → =Activity!B{r}.
 * Absolute rows ($5) and text inside quotes are left alone.
 */
export function formulaShape(formula: string, row: number): string {
  // Split out quoted strings so their contents are not rewritten.
  const parts = formula.split(/("(?:[^"]|"")*")/);
  return parts.map((p, i) => {
    if (i % 2 === 1) return p;
    return p.replace(/(^|[^A-Za-z0-9_$.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
      (_m, pre: string, d1: string, col: string, d2: string, num: string) => {
        if (d2 === '$') return `${pre}${d1}${col}$${num}`;
        const off = Number(num) - row;
        const rel = off === 0 ? '{r}' : off > 0 ? `{r+${off}}` : `{r${off}}`;
        return `${pre}${d1}${col}${rel}`;
      });
  }).join('');
}

/** "=Activity!$C$2:$C" → { tab: 'Activity', col: 'C' } */
export function parseRangeRef(s: string): { tab: string | null; col: string | null } {
  const t = s.trim().replace(/^=/, '');
  const m = t.match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})/);
  if (m) return { tab: (m[1] ?? m[2]).replace(/''/g, "'"), col: m[3] };
  const m2 = t.match(/^\$?([A-Z]{1,3})\$?\d*/);
  if (m2) return { tab: null, col: m2[1] };
  return { tab: null, col: null };
}

// ── THE ENTRY SHEET (Active, Future, History) ────────────────────────────────

export interface ColumnSummary {
  col: number;
  letter: string;
  field: string | null;
  counts: Record<CellKind, number>;
  verdict: 'typed' | 'formula' | 'filled by an array formula' | 'mixed' | 'empty';
  shapes: { shape: string; count: number; example: string; exampleRow: number }[];
  validations: { rule: string; count: number }[];
  tabs: string[];          // tabs read by this column's formulas and dropdowns
}

export interface EntrySheetSurvey {
  name: string;
  presetRow: number | null;        // 1-based sheet row, or null if there is none
  headerRows: number[];            // rows above Preset that repeat the year tab's header rows
  aboveRows: { row: number; cells: Cell[] }[];   // every row above Preset, in full
  presetRows: { row: number; cells: Cell[] }[];  // non-empty rows below Preset
  dataRows: number[];              // rows used for the column verdicts
  columns: ColumnSummary[];
  arrayFormulas: { cell: string; formula: string }[];
}

function rowIsEmpty(cells: Cell[]): boolean {
  return cells.every(c => c.kind === 'empty');
}

function rowMatchesHeader(cells: Cell[], header: string[] | undefined): boolean {
  if (!header) return false;
  let filled = 0, same = 0;
  for (let i = 0; i < NCOLS; i++) {
    const a = (cells[i]?.text ?? '').trim();
    const b = (header[i] ?? '').toString().trim();
    if (a === '' && b === '') continue;
    filled++;
    if (a === b) same++;
  }
  return filled > 0 && same / filled >= 0.8;
}

/**
 * @param cells       grid of the sheet from row 1
 * @param yearHeaders the year tab's rows 1..3 (values), used to recognise header rows
 */
export function surveyEntrySheet(name: string, cells: Cell[][], yearHeaders: string[][]): EntrySheetSurvey {
  let presetIdx = cells.findIndex(row => (row[1]?.text ?? '').trim() === 'Preset');
  const presetRow = presetIdx >= 0 ? presetIdx + 1 : null;
  if (presetIdx < 0) presetIdx = cells.length;

  const aboveRows = cells.slice(0, presetIdx).map((c, i) => ({ row: i + 1, cells: c }));
  // Header rows are the leading rows before the first record. A record row has a
  // formula or a value in column A that is not a header label; a header row has
  // column A empty or holding a header label (the entry sheets have two header
  // rows, the year tabs three, and their wording differs, so matching the year
  // tab's text alone is not enough).
  const headerRows: number[] = [];
  for (const { row, cells: c } of aboveRows) {
    if (row > 5) break;
    const a = c[0];
    const isHeader = rowMatchesHeader(c, yearHeaders[row - 1]) ||
      (a.kind !== 'formula' && (a.text.trim() === '' || HEADER_LABELS.includes(a.text.trim())) && !rowIsEmpty(c));
    if (!isHeader) break;
    headerRows.push(row);
  }

  const presetRows = cells
    .slice(presetIdx + 1)
    .map((c, i) => ({ row: presetIdx + 2 + i, cells: c }))
    .filter(x => !rowIsEmpty(x.cells));

  const data = [
    ...aboveRows.filter(x => !headerRows.includes(x.row) && !rowIsEmpty(x.cells)),
    ...presetRows,
  ];

  const columns: ColumnSummary[] = [];
  for (let col = 0; col < NCOLS; col++) {
    const counts: Record<CellKind, number> = { typed: 0, formula: 0, spilled: 0, empty: 0 };
    const shapes = new Map<string, { count: number; example: string; exampleRow: number }>();
    const validations = new Map<string, number>();
    const tabs = new Set<string>();
    for (const { row, cells: c } of data) {
      const cell = c[col];
      counts[cell.kind]++;
      if (cell.formula) {
        const shape = formulaShape(cell.formula, row);
        const s = shapes.get(shape);
        if (s) s.count++;
        else shapes.set(shape, { count: 1, example: cell.formula, exampleRow: row });
        tabsIn(cell.formula).forEach(t => tabs.add(t));
      }
      if (cell.validation) {
        validations.set(cell.validation, (validations.get(cell.validation) ?? 0) + 1);
        if (cell.validation.startsWith('range ')) {
          const ref = parseRangeRef(cell.validation.slice(6));
          if (ref.tab) tabs.add(ref.tab);
        }
      }
    }
    const nonEmpty = counts.typed + counts.formula + counts.spilled;
    let verdict: ColumnSummary['verdict'];
    if (nonEmpty === 0) verdict = 'empty';
    else if (counts.typed === 0 && counts.spilled === 0) verdict = 'formula';
    else if (counts.typed === 0 && counts.formula === 0) verdict = 'filled by an array formula';
    else if (counts.formula === 0 && counts.spilled === 0) verdict = 'typed';
    else verdict = 'mixed';
    columns.push({
      col, letter: colLetter(col), field: DESIGN_FIELDS[col], counts, verdict,
      shapes: [...shapes].map(([shape, s]) => ({ shape, ...s })).sort((a, b) => b.count - a.count),
      validations: [...validations].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count),
      tabs: [...tabs].sort(),
    });
  }

  const arrayFormulas: { cell: string; formula: string }[] = [];
  cells.forEach((row, ri) => row.forEach((c, ci) => {
    if (c.formula && looksLikeArrayFormula(c.formula)) {
      arrayFormulas.push({ cell: `${colLetter(ci)}${ri + 1}`, formula: c.formula });
    }
  }));

  return { name, presetRow, headerRows, aboveRows, presetRows, dataRows: data.map(d => d.row), columns, arrayFormulas };
}

/** Columns where another entry sheet (Future, History) differs from Active. */
export function compareEntrySheets(base: EntrySheetSurvey, other: EntrySheetSurvey): { letter: string; field: string | null; base: string; other: string }[] {
  const sig = (c: ColumnSummary) => {
    const shapes = c.shapes.map(s => s.shape).sort().join(' ‖ ') || '—';
    const vals = c.validations.map(v => v.rule).sort().join(' ‖ ') || '—';
    return `${c.verdict}; formulas: ${shapes}; dropdowns: ${vals}`;
  };
  const out: { letter: string; field: string | null; base: string; other: string }[] = [];
  for (let i = 0; i < NCOLS; i++) {
    const a = base.columns[i], b = other.columns[i];
    // A column that is simply empty in the other sheet is not a difference in rules.
    if (b.verdict === 'empty' && b.validations.length === 0) continue;
    if (sig(a) !== sig(b)) out.push({ letter: a.letter, field: a.field, base: sig(a), other: sig(b) });
  }
  return out;
}

// ── CROSS-CHECKS: DROPDOWNS AND MASTER TABS ──────────────────────────────────

export interface DropdownCheck {
  exp: DropdownExpectation;
  logLetter: string;
  status: 'confirmed' | 'different' | 'no dropdown';
  found: string[];
}

export function checkDropdowns(active: EntrySheetSurvey): { checks: DropdownCheck[]; unexpected: { letter: string; field: string | null; rule: string }[] } {
  const checks: DropdownCheck[] = [];
  const explained = new Set<string>();
  for (const exp of DROPDOWN_EXPECTATIONS) {
    for (const lc of exp.logCols) {
      const col = active.columns[lc];
      const rules = col.validations.map(v => v.rule);
      const match = rules.find(rule => {
        if (!rule.startsWith('range ')) return false;
        const ref = parseRangeRef(rule.slice(6));
        return ref.tab === exp.source && ref.col === exp.col;
      });
      if (match) explained.add(`${lc}|${match}`);
      checks.push({
        exp, logLetter: colLetter(lc),
        status: match ? 'confirmed' : rules.length ? 'different' : 'no dropdown',
        found: rules,
      });
    }
  }
  const unexpected: { letter: string; field: string | null; rule: string }[] = [];
  for (const c of active.columns) {
    for (const v of c.validations) {
      if (!explained.has(`${c.col}|${v.rule}`) && !DROPDOWN_EXPECTATIONS.some(e => e.logCols.includes(c.col))) {
        unexpected.push({ letter: c.letter, field: c.field, rule: v.rule });
      }
    }
  }
  return { checks, unexpected };
}

export interface TabInfo { title: string; hidden: boolean; rows: number; cols: number }

export interface MasterTabRow {
  tab: string;
  inSpreadsheet: boolean;
  inDesign: string;
  loadedBy: string;
  dropdownCols: string[];   // Active columns whose dropdown reads this tab
  formulaCols: string[];    // Active columns whose formulas read this tab
  readByTabs: string[];     // other tabs whose formulas read this tab
}

export function masterTabTable(
  activeTabs: TabInfo[],
  active: EntrySheetSurvey,
  otherTabFormulas: Record<string, { tabs: string[] }>,
): MasterTabRow[] {
  const names = new Set<string>([
    ...activeTabs.map(t => t.title), ...DESIGN_TABS, ...Object.keys(MIGRATION_TABS),
  ]);
  for (const c of active.columns) c.tabs.forEach(t => names.add(t));
  const rows: MasterTabRow[] = [];
  for (const tab of [...names].sort()) {
    const dropdownCols = active.columns
      .filter(c => c.validations.some(v => v.rule.startsWith('range ') && parseRangeRef(v.rule.slice(6)).tab === tab))
      .map(c => c.letter);
    const formulaCols = active.columns
      .filter(c => c.shapes.some(s => tabsIn(s.example).includes(tab)))
      .map(c => c.letter);
    const readByTabs = Object.entries(otherTabFormulas)
      .filter(([name, info]) => name !== tab && info.tabs.includes(tab))
      .map(([name]) => name);
    rows.push({
      tab,
      inSpreadsheet: activeTabs.some(t => t.title === tab),
      inDesign: DESIGN_TABS.includes(tab) ? '§4.1' : (DESIGN_TABS_ELSEWHERE[tab] ?? '—'),
      loadedBy: MIGRATION_TABS[tab] ?? '—',
      dropdownCols, formulaCols, readByTabs,
    });
  }
  return rows;
}

/** Headers of Active, 2026 and ~2025 side by side; flags any column where they differ. */
export function headerText(rows: string[][], col: number): string {
  return rows.map(r => (r[col] ?? '').toString().trim()).filter(s => s !== '').join(' / ');
}

// ── CATEGORY USAGE ───────────────────────────────────────────────────────────

export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Has a real value: not null/undefined/'', not an empty array, not an object of empties. */
export function hasValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'boolean') return true;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (Array.isArray(v)) return v.some(hasValue);
  if (typeof v === 'object') return Object.values(v).some(hasValue);
  return true;
}

export interface SkipReason { reason: string; count: number; examples: string[] }

export interface GroupStat {
  stored: number;        // records where the database holds a value for the group
  storedRecent: number;  // same, last 12 months
  typed: number;         // rows where any of the group's cells has text
  dropped: number;       // text in the sheet, nothing stored
  droppedValues: Map<string, number>;
  droppedRows: string[];   // 'tab row', e.g. '~2025 7346'
}

export interface CategoryStat {
  records: number;
  recent: number;
  activities: Map<string, number>;
  groups: Record<string, GroupStat>;
}

export interface UsageResult {
  rowsRead: number;
  accepted: number;
  skipped: Record<string, SkipReason>;
  refused: Record<string, SkipReason & { values: Map<string, number> }>;
  categories: Map<string, CategoryStat>;
  byActivity: Map<string, CategoryStat>;   // `${category} › ${activity}`
  sheetCounts: Map<string, number>;   // `${year}|${category}` → accepted records
  cutoff: number;                     // yyyymmdd, start of the last 12 months
}

export function newUsage(today: Date): UsageResult {
  const y = today.getFullYear() - 1, m = today.getMonth() + 1, d = today.getDate();
  return {
    rowsRead: 0, accepted: 0, skipped: {}, refused: {},
    categories: new Map(), byActivity: new Map(), sheetCounts: new Map(),
    cutoff: y * 10000 + m * 100 + d,
  };
}

const HEADER_LABELS = ['activity category', 'activity', 'categoryLevel1'];

/** Why createRowFilter skipped a row. `presetSeen` is the caller's own latch. */
export function skipReason(row: any[], presetSeen: boolean): string {
  const cat = (row[0] ?? '').toString().trim();
  const act = (row[1] ?? '').toString().trim();
  if (act === 'Preset') return 'The Preset row';
  if (presetSeen) return 'Below the Preset row';
  if (row.every((v: any) => (v ?? '').toString().trim() === '')) return 'Empty row';
  if (!cat) return 'No category (column A empty)';
  if (cat.startsWith('#')) return `Category starts with # (${cat === '#N/A' ? '#N/A' : 'other'})`;
  if (HEADER_LABELS.includes(cat)) return 'Header row';
  return 'Other';
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function addReason<T extends SkipReason>(bag: Record<string, T>, reason: string, row: string, make: () => T): T {
  const r = bag[reason] ?? (bag[reason] = make());
  r.count++;
  if (r.examples.length < 10) r.examples.push(row);
  return r;
}

/**
 * Runs one year tab through the migration's own filter and row mapper.
 * `shouldSkip` must be a fresh createRowFilter() for this tab; `toDoc` is rowToDocument.
 */
export function addTabUsage(
  usage: UsageResult,
  rows: any[][],
  startRow: number,
  shouldSkip: (row: any[]) => boolean,
  toDoc: (row: any[]) => any,
  tab = '',
) {
  let presetSeen = false;
  rows.forEach((row, i) => {
    const sheetRow = tab ? `${tab} ${i + startRow}` : String(i + startRow);
    usage.rowsRead++;
    const skip = shouldSkip(row);
    if (skip) {
      const reason = skipReason(row, presetSeen);
      addReason(usage.skipped, reason, sheetRow, () => ({ reason, count: 0, examples: [] }));
      if ((row[1] ?? '').toString().trim() === 'Preset') presetSeen = true;
      return;
    }
    let doc: any;
    try {
      doc = toDoc(row);
    } catch (e: any) {
      const reason = e?.name && e.name !== 'Error' ? e.name : 'Error';
      const r = addReason(usage.refused, reason, sheetRow, () => ({ reason, count: 0, examples: [], values: new Map() }));
      bump(r.values, (e?.message ?? String(e)).slice(0, 120));
      return;
    }
    usage.accepted++;
    const cat = doc?.activity?.category ?? '(no category)';
    const year = doc?.start?.year ?? 0;
    bump(usage.sheetCounts, `${year}|${cat}`);
    const ymd = (doc?.start?.year ?? 0) * 10000 + (doc?.start?.month ?? 0) * 100 + (doc?.start?.day ?? 0);
    const recent = ymd >= usage.cutoff;

    const act = doc?.activity?.name ?? '(no activity)';
    const stat = (map: Map<string, CategoryStat>, key: string) => {
      let s = map.get(key);
      if (!s) {
        s = { records: 0, recent: 0, activities: new Map(), groups: {} };
        for (const g of FIELD_GROUPS) {
          s.groups[g.key] = { stored: 0, storedRecent: 0, typed: 0, dropped: 0, droppedValues: new Map(), droppedRows: [] };
        }
        map.set(key, s);
      }
      return s;
    };
    const targets = [stat(usage.categories, cat), stat(usage.byActivity, `${cat} › ${act}`)];

    for (const cs of targets) {
      cs.records++;
      if (recent) cs.recent++;
      bump(cs.activities, act);
    }

    for (const g of FIELD_GROUPS) {
      const raw = g.cols.map(c => (row[c] ?? '').toString().trim());
      const typed = raw.some(v => v !== '');
      // Columns the migration does not read are judged by what was typed.
      const stored = g.paths.length === 0 ? typed : g.paths.some(p => hasValue(getPath(doc, p)));
      for (const cs of targets) {
        const gs = cs.groups[g.key];
        if (typed) gs.typed++;
        if (stored) { gs.stored++; if (recent) gs.storedRecent++; }
        if (typed && !stored) {
          gs.dropped++;
          bump(gs.droppedValues, raw.filter(v => v !== '').join(' · ').slice(0, 60));
          if (gs.droppedRows.length < 5) gs.droppedRows.push(sheetRow);
        }
      }
    }
  });
}

export const DEFAULT_SHARE = 0.5;
export const REQUIRED_SHARE = 0.98;
export const MIN_RECENT = 20;   // below this, the last 12 months are too few to judge on

export interface GroupSuggestion { key: string; share: number; basis: 'last 12 months' | 'all years'; suggestion: 'required' | 'default' | '' }

export function suggest(cs: CategoryStat): GroupSuggestion[] {
  const useRecent = cs.recent >= MIN_RECENT;
  return FIELD_GROUPS.filter(g => g.paths.length > 0).map(g => {
    const gs = cs.groups[g.key];
    const share = useRecent ? gs.storedRecent / cs.recent : gs.stored / Math.max(cs.records, 1);
    return {
      key: g.key, share,
      basis: useRecent ? 'last 12 months' : 'all years',
      suggestion: share >= REQUIRED_SHARE ? 'required' : share >= DEFAULT_SHARE ? 'default' : '',
    };
  });
}

// ── MASTER LISTS: DATABASE AGAINST SHEET ─────────────────────────────────────

const num = (s: any) => {
  const n = parseFloat((s ?? '').toString().replace(/,/g, '').trim());
  return Number.isNaN(n) ? null : n;
};
const str = (s: any) => (s ?? '').toString().trim();

export interface ListDiff { name: string; sheet: number; db: number; onlySheet: string[]; onlyDb: string[]; note?: string }

export function diffKeys(name: string, sheetKeys: string[], dbKeys: string[], note?: string): ListDiff {
  const a = new Set(sheetKeys), b = new Set(dbKeys);
  return {
    name, sheet: a.size, db: b.size,
    onlySheet: [...a].filter(k => !b.has(k)).sort(),
    onlyDb: [...b].filter(k => !a.has(k)).sort(),
    note,
  };
}

/** Each sheet parsed the way its migration parses it (rows from row 2). */
export const SHEET_KEYS = {
  cost: (rows: any[][]) => rows.filter(r => r[0] && r[1]).map(r => `${str(r[0])} | ${str(r[1])}`),
  activity: (rows: any[][]) => rows.filter(r => r[0] && r[1]).map(r => `${str(r[0])} | ${str(r[1])}`),
  referenceList: (rows: any[][], col: number) => rows.map(r => str(r[col])).filter(v => v !== ''),
  timezone: (rows: any[][]) => rows.filter(r => r[0] && r[1] && r[2]).map(r => `${str(r[0])} | ${num(r[1])} | ${str(r[2])}`),
  exchange: (rows: any[][]) => rows.filter(r => r[0] && r[1] && !r[2]).filter(r => num(r[1]) !== null).map(r => `${str(r[0])} | ${num(r[1])}`),
  alcohol: (rows: any[][]) => rows.filter(r => r[0] && r[1]).filter(r => num(r[2]) !== null && num(r[3]) !== null && num(r[4]) !== null).map(r => `${str(r[0])} | ${str(r[1])} | ${num(r[4])}`),
  ingredient: (rows: any[][]) => rows.filter(r => r[0] && r[1]).map(r => `${str(r[0])} | ${str(r[1])}`),
  bowel: (rows: any[][]) => {
    const out: string[] = [];
    const pairs: [string, number, number][] = [['amount', 0, 1], ['quality', 2, 3], ['characteristics', 4, 5]];
    for (const r of rows) for (const [field, v, s] of pairs) {
      if (str(r[v]) !== '' && num(r[s]) !== null) out.push(`${field} | ${str(r[v])} | ${num(r[s])}`);
    }
    return out;
  },
  favoritePlace: (rows: any[][]) => rows.filter(r => str(r[0]) || str(r[1])).map(r => `${str(r[0])} | ${str(r[1])}`),
};

export const DB_KEYS = {
  cost: (docs: any[]) => docs.map(d => `${str(d.categoryDetail)} | ${str(d.category)}`),
  activity: (docs: any[]) => docs.map(d => `${str(d.name)} | ${str(d.category)}`),
  timezone: (docs: any[]) => docs.map(d => `${str(d.code)} | ${d.offsetUTC} | ${str(d.ianaTimezone)}`),
  exchange: (docs: any[]) => docs.map(d => `${str(d.currency)} | ${d.rateKRW}`),
  alcohol: (docs: any[]) => docs.map(d => `${str(d.item)} | ${str(d.unit)} | ${d.drinks}`),
  ingredient: (docs: any[]) => docs.map(d => `${str(d.level1)} | ${str(d.level2)}`),
  bowel: (docs: any[]) => docs.map(d => `${str(d.field)} | ${str(d.value)} | ${d.score}`),
  favoritePlace: (docs: any[]) => docs.map(d => `${str(d.label)} | ${str(d.name)}`),
  placeCoord: (docs: any[]) => docs.map(d => `${str(d.name)} | ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}`),
};

// ── REPORT ───────────────────────────────────────────────────────────────────

export const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ⏎ ');
export const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
export function topEntries(map: Map<string, number>, n: number): [string, number][] {
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
export function rowList(rows: string[], total: number): string {
  if (rows.length === 0) return '';
  return `rows ${rows.join(', ')}${total > rows.length ? ', …' : ''}`;
}
