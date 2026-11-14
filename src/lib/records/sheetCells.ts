// How a record change is written down for the sheet (#70). Pure: no database.
//
// Until cutover the sheet is the truth, so every change made in the app is repeated
// there by hand. The change list is a table with ONE LINE PER CHANGED CELL (Hyoje,
// 27 Oct): the tab, how to find the row, the column, what changed, and the whole
// cell before and after, written the sheet's way (comma lists, '|' groups, '+').
//
// "What changed" is the line to act on. It says Added / Removed / Changed and names
// the item or the people group, because a cell is a list matched by position with
// its neighbours (a food's amount sits at the same place in the amount column).
//
// Before is the DATABASE's value written sheet-style, not the sheet's own text:
// '양념 치킨+떡볶이' was stored as two foods with the amount halved, so it shows as
// '양념 치킨, 떡볶이'. Find the row by its date and time, not by searching the text.
//
// (5 Nov) Hyoje found the cell lines hard to read ("one item, one amount and one unit
// were removed"), so a change also comes as PLAIN lines, one per real change, the way a
// person says it: "Added 라면 (밀, 고기 국물) 1 인분 to Foods", "Removed 민아 from 대면 · 가족".
// The cell lines stay for repeating the change in the sheet.
//
// The weekday columns (L, S) are left out: the system calculates the weekday from
// the date and the migration no longer reads them (Hyoje, 27 Oct).

import { oneIfSame } from './relationship';
import { ordinal, transportMissing } from './form';
import { weekdayOf } from '../migration/transform';

export interface ChangeLine {
  column: string;          // 'AT Food item', 'Row', 'V–Z'
  what: string;
  before: string;
  after: string;
  calculated?: boolean;    // the sheet calculates it in Active; year tabs hold the value
  /** The part of the edit form this line comes from, so the edit page's × can put it back
   *  ('activity.title', 'start', 'food.foods', 'people' …). None on calculated lines. */
  part?: string;
}

/** A change the way a person says it. `part` as on ChangeLine. */
export interface PlainChange {
  text: string;
  part?: string;
  calculated?: boolean;
}

// ── Columns ──────────────────────────────────────────────────────────────────

export function colLetter(i: number): string {
  let out = '';
  for (let k = i + 1; k > 0; k = Math.floor((k - 1) / 26)) out = String.fromCharCode(65 + ((k - 1) % 26)) + out;
  return out;
}

const s = (v: unknown) => (v == null ? '' : String(v));
const get = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const realIngredients = (x: any) => arr(x?.ingredients).map(String).filter(i => i && i !== 'Not Defined');

/** A food or drink as the sheet writes it: 김치찌개(김치|돼지고기). */
export const itemText = (x: any, withIngredients: boolean) => {
  const ings = withIngredients ? realIngredients(x) : [];
  return ings.length ? `${s(x?.item)}(${ings.join('|')})` : s(x?.item);
};
/** The separators inside a cell. The sheet's (Archive file, Staging, the change list) and the
 *  export file's (#72, 13 Nov: items can hold commas and '+' after the freeze). Ingredients
 *  stay 'item(a|b)' in both: they come from the ingredient list, which never holds '|'. */
export interface CellSeps { list: string; group: string; bowel: string }
export const SHEET_SEPS: CellSeps = { list: ', ', group: '|', bowel: '+' };
export const EXPORT_SEPS: CellSeps = { list: ' • ', group: ' ‖ ', bowel: ' • ' };

/** A list whose empty tail is dropped (the sheet can't hold an empty last value). */
const joinList = (vals: string[], sep = SHEET_SEPS.list) => {
  const v = [...vals];
  while (v.length && v[v.length - 1] === '') v.pop();
  return v.join(sep);
};

interface GroupField { i: number; label: string; key: string; noun: string }
interface ItemGroup { path: string; noun: string; plural: string; ingredients: boolean; fields: GroupField[] }

const PLURAL: Record<string, string> = { Purchase: 'Purchases', Drink: 'Drinks', Food: 'Foods', Alcohol: 'Alcohol', Exercise: 'Exercise' };
const group = (path: string, noun: string, ingredients: boolean, fields: [number, string, string][]): ItemGroup =>
  ({ path, noun, plural: PLURAL[noun] ?? noun, ingredients, fields: fields.map(([i, key, label]) => ({ i, key, label, noun })) });

const GROUPS: ItemGroup[] = [
  group('purchase', 'Purchase', false, [[34, 'item', 'Purchase item'], [35, 'amount', 'Purchase amount'], [36, 'unit', 'Purchase unit']]),
  group('food.drinks', 'Drink', true, [[41, 'item', 'Drink item'], [42, 'amount', 'Drink amount'], [43, 'unit', 'Drink unit'], [44, 'note', 'Drink note']]),
  group('food.foods', 'Food', true, [[45, 'item', 'Food item'], [46, 'amount', 'Food amount'], [47, 'unit', 'Food unit'], [48, 'note', 'Food note']]),
  group('food.alcohols', 'Alcohol', false, [[49, 'item', 'Alcohol item'], [50, 'amount', 'Alcohol amount'], [51, 'unit', 'Alcohol unit'], [52, 'note', 'Alcohol note']]),
  group('exercise', 'Exercise', false, [[69, 'item', 'Exercise item'], [70, 'amount', 'Exercise amount'], [71, 'unit', 'Exercise unit'], [72, 'loadKg', 'Load (kg)'], [73, 'setStyle', 'Style']]),
];

const groupCell = (g: ItemGroup, f: GroupField) => (doc: any, sp: CellSeps = SHEET_SEPS) => {
  const items = arr(get(doc, g.path));
  return f.key === 'item' ? items.map(x => itemText(x, g.ingredients)).join(sp.list) : joinList(items.map(x => s(x?.[f.key])), sp.list);
};

// People: consecutive entries with the same method and category form one '|' group.
export interface PeopleGroup { method: string; category: string; targets: string[] }
export function peopleGroups(doc: any): PeopleGroup[] {
  const out: PeopleGroup[] = [];
  for (const p of arr(doc?.people)) {
    const m = s(p?.method), c = s(p?.category), tg = s(p?.target);
    const last = out[out.length - 1];
    if (last && last.method === m && last.category === c) { if (tg) last.targets.push(tg); }
    else out.push({ method: m, category: c, targets: tg ? [tg] : [] });
  }
  return out;
}

interface Column { i: number; label: string; cell: (doc: any, sp?: CellSeps) => string; calculated?: boolean; group?: string; part?: string }

// A start or end cell puts back the whole point (date, time, zone).
const partOf = (path: string) => (/^(start|end)\./.test(path) ? path.split('.')[0] : path);
const scalar = (i: number, label: string, path: string, calculated = false): Column =>
  ({ i, label, cell: (d: any) => s(get(d, path)), calculated, ...(calculated ? {} : { part: partOf(path) }) });

const COLUMNS: Column[] = [
  scalar(0, 'Category', 'activity.category', true),
  scalar(1, 'Activity', 'activity.name'),
  scalar(2, 'Title', 'activity.title'),
  scalar(3, 'Additional info', 'activity.additionalInfo'),
  scalar(5, 'Cross activity', 'activity.crossActivity'),
  scalar(6, 'Relationship', 'activity.relationship', true),   // follows People (5 Nov)
  scalar(7, 'Start zone', 'start.timezone'),
  scalar(8, 'Start year', 'start.year'),
  scalar(9, 'Start month', 'start.month'),
  scalar(10, 'Start day', 'start.day'),
  scalar(12, 'Start time', 'start.hour'),
  scalar(13, 'Start offset', 'start.timezoneOffset', true),
  scalar(14, 'End zone', 'end.timezone'),
  scalar(15, 'End year', 'end.year'),
  scalar(16, 'End month', 'end.month'),
  scalar(17, 'End day', 'end.day'),
  scalar(19, 'End time', 'end.hour'),
  scalar(20, 'End offset', 'end.timezoneOffset', true),
  scalar(26, 'Place', 'location.activity'),
  scalar(27, 'Online', 'location.online'),
  scalar(28, 'Other location', 'location.other'),
  scalar(29, 'Cost (KRW)', 'cost.amountKRW'),
  scalar(30, 'Cost (foreign)', 'cost.amountForeign'),
  scalar(31, 'Currency', 'cost.currency'),
  scalar(32, 'Cost detail', 'cost.categoryDetail'),
  scalar(33, 'Cost category', 'cost.category'),
  scalar(37, 'Meal type', 'food.type'),
  scalar(38, 'Carbs', 'food.carbs'),
  scalar(39, 'Fat', 'food.fat'),
  scalar(40, 'Spiciness', 'food.spiciness'),
  { i: 53, label: 'People method', cell: (d: any, sp = SHEET_SEPS) => oneIfSame(peopleGroups(d).map(g => g.method)).join(sp.group), group: 'people', part: 'people' },
  { i: 54, label: 'People type', cell: (d: any, sp = SHEET_SEPS) => oneIfSame(peopleGroups(d).map(g => g.category)).join(sp.group), group: 'people', part: 'people' },
  { i: 55, label: 'People', cell: (d: any, sp = SHEET_SEPS) => peopleGroups(d).map(g => g.targets.join(sp.list)).join(sp.group), group: 'people', part: 'people' },
  scalar(56, 'From', 'transport.from'),
  scalar(57, 'To', 'transport.to'),
  scalar(58, 'Purpose', 'transport.purpose'),
  scalar(59, 'Transport', 'transport.method'),
  scalar(60, 'Return type', 'transport.returnType'),
  scalar(61, 'Bowel amount', 'bowel.amount'),
  { i: 62, label: 'Bowel quality', cell: (d: any, sp = SHEET_SEPS) => arr(d?.bowel?.quality).join(sp.bowel), part: 'bowel.quality' },
  { i: 63, label: 'Bowel characteristics', cell: (d: any, sp = SHEET_SEPS) => arr(d?.bowel?.characteristics).join(sp.bowel), part: 'bowel.characteristics' },
  scalar(64, 'Weight', 'body.weight'),
  scalar(65, 'Muscle', 'body.muscleMass'),
  scalar(66, 'Body fat', 'body.bodyFat'),
  scalar(67, 'Body fat %', 'body.bodyFatPercent'),
  scalar(68, 'Sleep quality', 'sleep.quality'),
  scalar(74, 'Book', 'reading.title'),
  scalar(75, 'Film', 'movie.title'),
  scalar(76, 'Golf score', 'golf.score'),
  scalar(77, 'Golf approach', 'golf.approach'),
  scalar(78, 'Golf putts', 'golf.putts'),
  scalar(79, 'Income (gross)', 'income.gross'),
  scalar(80, 'Income (net)', 'income.net'),
  scalar(81, 'City', 'travel.city'),
  scalar(82, 'Travel theme', 'travel.theme'),
  scalar(83, 'Notes', 'notes'),
  ...GROUPS.flatMap(g => g.fields.map(f => ({ i: f.i, label: f.label, cell: groupCell(g, f), group: g.path, part: g.path }))),
].sort((a, b) => a.i - b.i);

const colName = (c: { i: number; label: string }) => `${colLetter(c.i)} ${c.label}`;
const byIndex = new Map(COLUMNS.map(c => [c.i, c]));

/** Every column the database fills, as the sheet would show it (or the export file, with EXPORT_SEPS). */
export function sheetCells(doc: any, sp: CellSeps = SHEET_SEPS): { column: string; i: number; value: string; calculated?: boolean }[] {
  return COLUMNS.map(c => ({ column: colName(c), i: c.i, value: c.cell(doc, sp), calculated: c.calculated }));
}

// ── Finding the row ──────────────────────────────────────────────────────────

const pad = (x: unknown) => String(x ?? '').padStart(2, '0');
/** '2026-10-26 (월) 19:30 · 저녁 · 회식' — how to find the record's row. */
export function findRowText(doc: any): string {
  const st = doc?.start ?? {};
  const date = st.year ? `${st.year}-${pad(st.month)}-${pad(st.day)}` : '(no date)';
  const w = weekdayOf(st.year, st.month, st.day);
  const wd = w ? ` (${w})` : '';
  const title = s(doc?.activity?.title);
  return `${date}${wd} ${st.hour || 'all day'} · ${s(doc?.activity?.name)}${title ? ` · ${title}` : ''}`;
}

// ── Diffs ────────────────────────────────────────────────────────────────────

/** Longest common subsequence of two key lists: pairs of matching indexes. */
function lcs(a: string[], b: string[]): [number, number][] {
  const m = a.length, n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < m && j < n;) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return out;
}

type Step<T> = { kind: 'same' | 'changed'; a: T; b: T; ai: number; bi: number } | { kind: 'added'; b: T; bi: number } | { kind: 'removed'; a: T; ai: number };

/** Aligns two lists by key; between matches, removed and added entries pair up as 'changed'. */
function align<T>(a: T[], b: T[], key: (x: T) => string): Step<T>[] {
  const pairs = lcs(a.map(key), b.map(key));
  const out: Step<T>[] = [];
  let i = 0, j = 0;
  const gap = (ie: number, je: number) => {
    const ra: number[] = [], rb: number[] = [];
    for (; i < ie; i++) ra.push(i);
    for (; j < je; j++) rb.push(j);
    const k = Math.min(ra.length, rb.length);
    for (let x = 0; x < k; x++) out.push({ kind: 'changed', a: a[ra[x]], b: b[rb[x]], ai: ra[x], bi: rb[x] });
    for (const x of ra.slice(k)) out.push({ kind: 'removed', a: a[x], ai: x });
    for (const x of rb.slice(k)) out.push({ kind: 'added', b: b[x], bi: x });
  };
  for (const [pi, pj] of pairs) {
    gap(pi, pj);
    out.push({ kind: 'same', a: a[pi], b: b[pj], ai: pi, bi: pj });
    i = pi + 1; j = pj + 1;
  }
  gap(a.length, b.length);
  return out;
}

const shown = (v: unknown) => (s(v) === '' ? '(empty)' : s(v));

/** Item-list lines (foods, drinks, alcohol, purchases, exercise), keyed by column index. */
function groupLines(g: ItemGroup, before: any, after: any): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (i: number, what: string) => out.set(i, [...(out.get(i) ?? []), what]);
  const a = arr(get(before, g.path)), b = arr(get(after, g.path));
  const itemCol = g.fields[0].i;
  for (const st of align(a, b, x => s(x?.item))) {
    if (st.kind === 'added') {
      const prev = st.bi > 0 ? `, after ${s(b[st.bi - 1]?.item)}` : st.bi < b.length - 1 ? ', at the start' : '';
      add(itemCol, `Added ${itemText(st.b, g.ingredients)} as the ${ordinal(st.bi)} item${prev}`);
      for (const f of g.fields.slice(1)) add(f.i, `${s(st.b?.item)} (added, ${ordinal(st.bi)}): ${f.label.toLowerCase()} ${shown(st.b?.[f.key])}`);
    } else if (st.kind === 'removed') {
      add(itemCol, `Removed ${itemText(st.a, g.ingredients)} (was the ${ordinal(st.ai)} item)`);
      for (const f of g.fields.slice(1)) add(f.i, `${s(st.a?.item)} (removed, was ${ordinal(st.ai)}): ${f.label.toLowerCase()} ${shown(st.a?.[f.key])} goes`);
    } else {
      const name = s(st.b?.item);
      const where = `${name} (${ordinal(st.bi)})`;
      if (st.kind === 'changed') add(itemCol, `Renamed ${s(st.a?.item)} → ${name} (${ordinal(st.bi)} item)`);
      if (g.ingredients) {
        const ia = realIngredients(st.a), ib = realIngredients(st.b);
        for (const x of ia.filter(x => !ib.includes(x))) add(itemCol, `${where}: removed ingredient ${x}`);
        for (const x of ib.filter(x => !ia.includes(x))) add(itemCol, `${where}: added ingredient ${x}`);
        if (ia.length === ib.length && ia.every(x => ib.includes(x)) && ia.join('|') !== ib.join('|')) add(itemCol, `${where}: ingredients reordered`);
      }
      for (const f of g.fields.slice(1)) {
        if (s(st.a?.[f.key]) !== s(st.b?.[f.key])) add(f.i, `${where}: ${f.label.toLowerCase()} ${shown(st.a?.[f.key])} → ${shown(st.b?.[f.key])}`);
      }
    }
  }
  return out;
}

/** People lines: groups are matched by method and type; people inside a group by name. */
function peopleLines(before: any, after: any): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (i: number, what: string) => out.set(i, [...(out.get(i) ?? []), what]);
  const a = peopleGroups(before), b = peopleGroups(after);
  const label = (g: PeopleGroup) => [g.method, g.category].filter(Boolean).join(' · ') || 'no method or type';
  const targetsDiff = (ga: PeopleGroup, gb: PeopleGroup, k: number) => {
    for (const st of align(ga.targets, gb.targets, x => x)) {
      if (st.kind === 'added') {
        add(55, `Added ${st.b} to group ${k} (${label(gb)}), ${st.bi > 0 ? `after ${gb.targets[st.bi - 1]}` : 'at the start'}`);
      } else if (st.kind === 'removed') {
        add(55, `Removed ${st.a} from group ${k} (${label(gb)})`);
      } else if (st.kind === 'changed') {
        add(55, `Group ${k} (${label(gb)}): ${st.a} → ${st.b}`);
      }
    }
  };
  for (const st of align(a, b, g => `${g.method}·${g.category}`)) {
    if (st.kind === 'added') {
      const k = st.bi + 1;
      const pos = st.bi > 0 ? `after group ${st.bi}` : b.length > 1 ? 'at the start' : '';
      const text = `Added group ${k} (${label(st.b)})${pos ? `, ${pos}` : ''}`;
      add(53, `${text}: method ${shown(st.b.method)}`);
      add(54, `${text}: type ${shown(st.b.category)}`);
      add(55, `${text}: ${st.b.targets.join(', ') || '(nobody named)'}`);
    } else if (st.kind === 'removed') {
      const text = `Removed group ${st.ai + 1} (${label(st.a)})`;
      add(53, text); add(54, text);
      add(55, `${text}: ${st.a.targets.join(', ') || '(nobody named)'}`);
    } else {
      const k = st.bi + 1;
      if (st.kind === 'changed') {
        if (st.a.method !== st.b.method) add(53, `Group ${k}: method ${shown(st.a.method)} → ${shown(st.b.method)}`);
        if (st.a.category !== st.b.category) add(54, `Group ${k}: type ${shown(st.a.category)} → ${shown(st.b.category)}`);
      }
      targetsDiff(st.a, st.b, k);
    }
  }
  return out;
}

/** The lines for an edit that keeps the record in the same tab. */
export function changeLines(before: any, after: any): ChangeLine[] {
  const detail = new Map<number, string[]>();
  const merge = (m: Map<number, string[]>) => { for (const [i, v] of m) detail.set(i, [...(detail.get(i) ?? []), ...v]); };
  for (const g of GROUPS) merge(groupLines(g, before, after));
  merge(peopleLines(before, after));

  const lines: ChangeLine[] = [];
  for (const c of COLUMNS) {
    const b = c.cell(before), a = c.cell(after);
    if (a === b) continue;
    // AD (KRW) is a formula in Active's template line for a foreign cost (Hyoje, 7 Nov).
    const calc = c.calculated || (c.i === 29 && s(after?.cost?.currency) !== '');
    const base = { column: colName(c), before: b, after: a, ...(calc ? { calculated: true } : {}), ...(c.part ? { part: c.part } : {}) };
    const whats = c.group ? detail.get(c.i) ?? ['Changed'] : [b === '' ? 'Added' : a === '' ? 'Removed' : 'Changed'];
    for (const what of whats) lines.push({ ...base, what });
  }
  const timeChanged = [7, 8, 9, 10, 12, 14, 15, 16, 17, 19].some(i => byIndex.get(i)!.cell(before) !== byIndex.get(i)!.cell(after));
  if (timeChanged) {
    lines.push({ column: 'V–Z', what: 'Not in the database: if your sheet keeps values here (duration …), update them too', before: '', after: '' });
  }
  return lines;
}

/** A new row (an undone delete, or the record's new tab after a move): every filled cell. */
export function addRowLines(doc: any, tab: string): ChangeLine[] {
  return [
    { column: 'Row', what: `Add a row to '${tab}', in date order, with the values below`, before: '', after: findRowText(doc) },
    ...sheetCells(doc).filter(c => c.value !== '').map(c => ({ column: c.column, what: 'Set', before: '', after: c.value, ...(c.calculated ? { calculated: true } : {}) })),
  ];
}

export function deleteRowLines(doc: any, tab: string): ChangeLine[] {
  return [{ column: 'Row', what: `Delete this row from '${tab}'`, before: findRowText(doc), after: '' }];
}

// ── Plain lines ──────────────────────────────────────────────────────────────

/** 라면 (밀, 고기 국물) 1 인분 — a list item as a person writes it. */
function itemPlain(g: ItemGroup, x: any): string {
  const ings = g.ingredients ? realIngredients(x) : [];
  const parts = [`${s(x?.item)}${ings.length ? ` (${ings.join(', ')})` : ''}`, [s(x?.amount), s(x?.unit)].filter(Boolean).join(' ')];
  if (x?.loadKg != null && x.loadKg !== '') parts.push(`${x.loadKg} kg`);
  if (s(x?.setStyle)) parts.push(s(x.setStyle));
  const note = s(x?.note);
  return parts.filter(Boolean).join(' ') + (note ? ` — ${note}` : '');
}

const pointPlain = (p: any) => {
  if (!p?.year) return '(empty)';
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${s(p.hour) || 'all day'}${s(p.timezone) ? ` ${s(p.timezone)}` : ''}`;
};
/** 85,000 KRW, or 20 GBP (36,400 KRW). */
const num = (v: unknown) => (v == null || v === '' ? '' : Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-GB') : s(v));
const moneyPlain = (d: any) => {
  const k = num(d?.cost?.amountKRW), f = num(d?.cost?.amountForeign), c = s(d?.cost?.currency);
  if (c || f) return `${f || '?'} ${c || '?'}${k ? ` (${k} KRW)` : ''}`;
  return k ? `${k} KRW` : '(empty)';
};
/** ABC Hotel → 집 · 귀가 · 택시 · 대중교통 */
const journeyPlain = (d: any) => {
  const t = d?.transport ?? {};
  return `${s(t.from) || '?'} → ${s(t.to) || '?'} · ${[s(t.purpose), s(t.method), s(t.returnType)].filter(Boolean).join(' · ')}`;
};
const hasTransport = (d: any) => ['from', 'to', 'purpose', 'method', 'returnType'].some(k => s(d?.transport?.[k]) !== '');
/** 80.4 kg · muscle 35 kg · fat 21.5% (17.3 kg) */
const bodyPlain = (d: any) => {
  const b = d?.body ?? {};
  const parts = [num(b.weight) && `${num(b.weight)} kg`, num(b.muscleMass) && `muscle ${num(b.muscleMass)} kg`,
    (num(b.bodyFatPercent) || num(b.bodyFat)) && `fat ${num(b.bodyFatPercent) ? `${num(b.bodyFatPercent)}%` : ''}${num(b.bodyFat) ? ` (${num(b.bodyFat)} kg)` : ''}`.replace('fat  (', 'fat (')];
  return parts.filter(Boolean).join(' · ') || '(empty)';
};
const costPlain = (d: any) => [s(d?.cost?.category), s(d?.cost?.categoryDetail)].filter(Boolean).join(' › ');
const CALC_NOTE: Record<number, string> = { 0: 'from the activity', 6: 'follows People', 13: 'from the zone', 20: 'from the zone' };

function scalarPlain(label: string, b: string, a: string): string {
  if (b === '') return `${label}: added ${a}`;
  if (a === '') return `${label}: removed ${b}`;
  return `${label}: ${b} → ${a}`;
}

function groupPlain(g: ItemGroup, before: any, after: any): PlainChange[] {
  const out: PlainChange[] = [];
  const a = arr(get(before, g.path)), b = arr(get(after, g.path));
  for (const st of align(a, b, x => s(x?.item))) {
    if (st.kind === 'added') out.push({ text: `Added ${itemPlain(g, st.b)} to ${g.plural}`, part: g.path });
    else if (st.kind === 'removed') out.push({ text: `Removed ${itemPlain(g, st.a)} from ${g.plural}`, part: g.path });
    else if (st.kind === 'changed' && s(st.a?.item) !== s(st.b?.item) && itemPlain(g, { ...st.a, item: '' }) !== itemPlain(g, { ...st.b, item: '' })) {
      // A different item in the same place, not a renamed one: say it as removed + added.
      out.push({ text: `Removed ${itemPlain(g, st.a)} from ${g.plural}`, part: g.path });
      out.push({ text: `Added ${itemPlain(g, st.b)} to ${g.plural}`, part: g.path });
    } else {
      const x = itemPlain(g, st.a), y = itemPlain(g, st.b);
      const ia = realIngredients(st.a).join('|'), ib = realIngredients(st.b).join('|');
      if (x !== y || ia !== ib) out.push({ text: `${g.plural}: ${x} → ${y}`, part: g.path });
    }
  }
  return out;
}

function peoplePlain(before: any, after: any): PlainChange[] {
  const out: PlainChange[] = [];
  const say = (text: string) => out.push({ text, part: 'people' });
  const a = peopleGroups(before), b = peopleGroups(after);
  const label = (g: PeopleGroup) => [g.method, g.category].filter(Boolean).join(' · ') || 'a group with no method or type';
  const names = (g: PeopleGroup) => g.targets.join(', ') || 'nobody named';
  for (const st of align(a, b, g => `${g.method}·${g.category}`)) {
    if (st.kind === 'added') { say(`Added ${label(st.b)}: ${names(st.b)}`); continue; }
    if (st.kind === 'removed') { say(`Removed ${label(st.a)} (${names(st.a)})`); continue; }
    if (st.kind === 'changed') say(`${label(st.a)} → ${label(st.b)}`);
    for (const t of align(st.a.targets, st.b.targets, x => x)) {
      if (t.kind === 'added') say(`Added ${t.b} to ${label(st.b)}`);
      else if (t.kind === 'removed') say(`Removed ${t.a} from ${label(st.b)}`);
      else if (t.kind === 'changed') say(`${label(st.b)}: ${t.a} → ${t.b}`);
    }
  }
  return out;
}

/** The change in plain lines, in the sheet's column order. */
export function plainChanges(before: any, after: any): PlainChange[] {
  const out: PlainChange[] = [];
  const done = new Set<string>();
  const once = (k: string) => (done.has(k) ? false : (done.add(k), true));
  for (const c of COLUMNS) {
    const b = c.cell(before), a = c.cell(after);
    if (a === b) continue;
    if (c.group) {
      if (!once(c.group)) continue;
      if (c.group === 'people') out.push(...peoplePlain(before, after));
      else out.push(...groupPlain(GROUPS.find(g => g.path === c.group)!, before, after));
    } else if (c.part === 'start' || c.part === 'end') {
      if (once(c.part)) out.push({ text: `${c.part === 'start' ? 'Start' : 'End'}: ${pointPlain(before?.[c.part])} → ${pointPlain(after?.[c.part])}`, part: c.part });
    } else if (c.i >= 56 && c.i <= 60 && !hasTransport(before)) {
      // A journey added to a record: one line, once it is whole (Hyoje, 7 Nov).
      if (once('transport') && !transportMissing(after?.transport ?? {}).length) {
        out.push({ text: `Added journey: ${journeyPlain(after)}`, part: 'transport' });
      }
    } else if (c.i >= 56 && c.i <= 60 && !hasTransport(after)) {
      // A journey removed: one line with the whole journey.
      if (once('transport')) out.push({ text: `Removed journey: ${journeyPlain(before)}`, part: 'transport' });
    } else if (c.i >= 64 && c.i <= 67) {
      // Weight, muscle, fat % and the fat (kg) worked out from them: one line (7 Nov).
      if (once('body')) out.push({ text: `Body: ${bodyPlain(before)} → ${bodyPlain(after)}`, part: 'body' });
    } else if (c.i >= 29 && c.i <= 31) {
      // The amounts and the currency go together: one line.
      if (once('cost.amounts')) out.push({ text: `Cost: ${moneyPlain(before)} → ${moneyPlain(after)}`, part: 'cost.amounts' });
    } else if (c.i === 32 || c.i === 33) {
      if (once('cost.category')) out.push({ text: scalarPlain('Cost category', costPlain(before), costPlain(after)), part: 'cost.category' });
    } else if (c.calculated) {
      out.push({ text: `${scalarPlain(c.label, b, a)} (${CALC_NOTE[c.i] ?? 'calculated'})`, calculated: true });
    } else {
      out.push({ text: scalarPlain(c.label, b, a), part: c.part });
    }
  }
  return out;
}

/** The whole change for the sheet: same tab → changed cells; another tab → delete + add. */
export function sheetChange(before: any, after: any, tabBefore: string | null, tabAfter: string | null):
  { tab: string; findRow: string; moveTo: string | null; lines: ChangeLine[]; changes: PlainChange[] } {
  const tab = tabBefore ?? '(no tab)';
  if (tabAfter && tabAfter !== tabBefore) {
    // A move to another tab comes from the start date: the Row lines' × puts the start back.
    const lines = [...deleteRowLines(before, tab), ...addRowLines(after, tabAfter)].map(l => (l.column === 'Row' ? { ...l, part: 'start' } : l));
    const changes = [{ text: `Moves from tab ${tab} to ${tabAfter} (the start date)`, part: 'start' }, ...plainChanges(before, after).filter(c => c.part !== 'start')];
    return { tab, findRow: findRowText(before), moveTo: tabAfter, lines, changes };
  }
  return { tab, findRow: findRowText(before), moveTo: null, lines: changeLines(before, after), changes: plainChanges(before, after) };
}
