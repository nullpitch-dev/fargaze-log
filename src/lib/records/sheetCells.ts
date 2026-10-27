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
// The weekday columns (L, S) are left out: the system calculates the weekday from
// the date and the migration no longer reads them (Hyoje, 27 Oct).

import { ordinal } from './form';
import { weekdayOf } from '../migration/transform';

export interface ChangeLine {
  column: string;          // 'AT Food item', 'Row', 'V–Z'
  what: string;
  before: string;
  after: string;
  calculated?: boolean;    // the sheet calculates it in Active; year tabs hold the value
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
/** A comma list whose empty tail is dropped (the sheet can't hold an empty last value). */
const joinList = (vals: string[]) => {
  const v = [...vals];
  while (v.length && v[v.length - 1] === '') v.pop();
  return v.join(', ');
};

interface GroupField { i: number; label: string; key: string; noun: string }
interface ItemGroup { path: string; noun: string; ingredients: boolean; fields: GroupField[] }

const group = (path: string, noun: string, ingredients: boolean, fields: [number, string, string][]): ItemGroup =>
  ({ path, noun, ingredients, fields: fields.map(([i, key, label]) => ({ i, key, label, noun })) });

const GROUPS: ItemGroup[] = [
  group('purchase', 'Purchase', false, [[34, 'item', 'Purchase item'], [35, 'amount', 'Purchase amount'], [36, 'unit', 'Purchase unit']]),
  group('food.drinks', 'Drink', true, [[41, 'item', 'Drink item'], [42, 'amount', 'Drink amount'], [43, 'unit', 'Drink unit'], [44, 'note', 'Drink note']]),
  group('food.foods', 'Food', true, [[45, 'item', 'Food item'], [46, 'amount', 'Food amount'], [47, 'unit', 'Food unit'], [48, 'note', 'Food note']]),
  group('food.alcohols', 'Alcohol', false, [[49, 'item', 'Alcohol item'], [50, 'amount', 'Alcohol amount'], [51, 'unit', 'Alcohol unit'], [52, 'note', 'Alcohol note']]),
  group('exercise', 'Exercise', false, [[69, 'item', 'Exercise item'], [70, 'amount', 'Exercise amount'], [71, 'unit', 'Exercise unit'], [72, 'loadKg', 'Load (kg)'], [73, 'setStyle', 'Style']]),
];

const groupCell = (g: ItemGroup, f: GroupField) => (doc: any) => {
  const items = arr(get(doc, g.path));
  return f.key === 'item' ? items.map(x => itemText(x, g.ingredients)).join(', ') : joinList(items.map(x => s(x?.[f.key])));
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

interface Column { i: number; label: string; cell: (doc: any) => string; calculated?: boolean; group?: string }

const scalar = (i: number, label: string, path: string, calculated = false): Column =>
  ({ i, label, cell: (d: any) => s(get(d, path)), calculated });

const COLUMNS: Column[] = [
  scalar(0, 'Category', 'activity.category', true),
  scalar(1, 'Activity', 'activity.name'),
  scalar(2, 'Title', 'activity.title'),
  scalar(3, 'Additional info', 'activity.additionalInfo'),
  scalar(5, 'Cross activity', 'activity.crossActivity'),
  scalar(6, 'Relationship', 'activity.relationship'),
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
  { i: 53, label: 'People method', cell: (d: any) => peopleGroups(d).map(g => g.method).join('|'), group: 'people' },
  { i: 54, label: 'People type', cell: (d: any) => peopleGroups(d).map(g => g.category).join('|'), group: 'people' },
  { i: 55, label: 'People', cell: (d: any) => peopleGroups(d).map(g => g.targets.join(', ')).join('|'), group: 'people' },
  scalar(56, 'From', 'transport.from'),
  scalar(57, 'To', 'transport.to'),
  scalar(58, 'Purpose', 'transport.purpose'),
  scalar(59, 'Transport', 'transport.method'),
  scalar(60, 'Return type', 'transport.returnType'),
  scalar(61, 'Bowel amount', 'bowel.amount'),
  { i: 62, label: 'Bowel quality', cell: (d: any) => arr(d?.bowel?.quality).join('+') },
  { i: 63, label: 'Bowel characteristics', cell: (d: any) => arr(d?.bowel?.characteristics).join('+') },
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
  ...GROUPS.flatMap(g => g.fields.map(f => ({ i: f.i, label: f.label, cell: groupCell(g, f), group: g.path }))),
].sort((a, b) => a.i - b.i);

const colName = (c: { i: number; label: string }) => `${colLetter(c.i)} ${c.label}`;
const byIndex = new Map(COLUMNS.map(c => [c.i, c]));

/** Every column the database fills, as the sheet would show it. */
export function sheetCells(doc: any): { column: string; i: number; value: string; calculated?: boolean }[] {
  return COLUMNS.map(c => ({ column: colName(c), i: c.i, value: c.cell(doc), calculated: c.calculated }));
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
    const base = { column: colName(c), before: b, after: a, ...(c.calculated ? { calculated: true } : {}) };
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

/** The whole change for the sheet: same tab → changed cells; another tab → delete + add. */
export function sheetChange(before: any, after: any, tabBefore: string | null, tabAfter: string | null):
  { tab: string; findRow: string; moveTo: string | null; lines: ChangeLine[] } {
  const tab = tabBefore ?? '(no tab)';
  if (tabAfter && tabAfter !== tabBefore) {
    return { tab, findRow: findRowText(before), moveTo: tabAfter, lines: [...deleteRowLines(before, tab), ...addRowLines(after, tabAfter)] };
  }
  return { tab, findRow: findRowText(before), moveTo: null, lines: changeLines(before, after) };
}
