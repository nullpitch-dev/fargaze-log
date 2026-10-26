// Master-list descriptions for the generic admin editor (#67).
//
// One entry per list the admin pages show. The editor, the API and the record
// checks all read these entries; nothing else should hard-code a list's columns.
//
//   columns   what a row holds and how each value is typed
//   unique    the columns that together must not repeat (within the user)
//   usage     which record fields hold this list's values, so the editor can count
//             how many records use each row and find values used in records but
//             missing from the list. `key` maps a column of the list to a record
//             path; `unwind` names the arrays to open first; `when` limits the spec
//             to rows whose columns have these values (bowel_score keeps three
//             vocabularies in one collection).
//   recordsFollow  rename / merge / move are applied to past records too
//             (Hyoje, 23–24 Oct: activity and cost first; 26 Oct: place points;
//             other lists later).
//   refuseUnknown  false = a value in records that the list lacks is normal (place
//             names without a point): no missing-values box, and the migration
//             does not refuse it. Default true.
//
// The reference lists are one collection with one document per value; each list
// is its own entry here, narrowed with `filter`.

import type { Model } from 'mongoose';
import ActivityMaster from '../../models/ActivityMaster';
import CostMaster from '../../models/CostMaster';
import ReferenceList from '../../models/ReferenceList';
import TimezoneMaster from '../../models/TimezoneMaster';
import ExchangeRate from '../../models/ExchangeRate';
import AlcoholConversion from '../../models/AlcoholConversion';
import IngredientMaster from '../../models/IngredientMaster';
import BowelScore from '../../models/BowelScore';
import FavoritePlace from '../../models/FavoritePlace';
import PlaceCoord from '../../models/PlaceCoord';

export type ColumnType = 'text' | 'number' | 'zoneTime' | 'coords';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  /** Offer the values already in this column; a new value asks for confirmation. */
  pickExisting?: boolean;
  /** Shown narrow: long text is cut with … and shown whole on hover. */
  narrow?: boolean;
  /** Left out of the page's search box. */
  noSearch?: boolean;
}

export interface UsageSpec {
  key: Record<string, string>;
  unwind?: string[];
  when?: Record<string, string>;
  /** Names this spec in a row's breakdown of records (Place · From · To). */
  label?: string;
  /** viaFavorites lists: the record's moment that resolves 집 / 회사 … (start or end). */
  at?: 'start' | 'end';
}

/** Where a list lives in the sheet, so each change can say what to repeat there. */
export interface SheetPlace {
  /** e.g. "Cost tab"; a function when it depends on the row (bowel_score) */
  where: string | ((values: Record<string, unknown>) => string);
  /** the list's columns in the sheet's left-to-right order */
  order: string[];
  /** reference lists: one column of the Activity tab */
  column?: string;
  /** the Active sheet dropdown(s) that read this list */
  dropdown?: string;
}

export interface ListDef {
  slug: string;
  title: string;
  group: string;
  model: () => Model<any>;
  filter?: Record<string, unknown>;
  columns: ColumnDef[];
  unique: string[];
  sort: Record<string, 1 | -1>;
  usage?: UsageSpec[];
  recordsFollow?: boolean;
  /** false: values missing from the list are normal; not shown, not refused. */
  refuseUnknown?: boolean;
  /** Records that say 집 / 회사 / 사이트 / 내차 count for the place that label meant
   *  then (favourite places), as Journeys reads them; a place a period names can't be deleted. */
  viaFavorites?: boolean;
  /** Columns that never change on an existing row here, used or not: lists without a
   *  record count, whose names records refer to (place points, favourite places).
   *  Renaming them must also change the records, so it waits for rename (step 3). */
  fixedOnEdit?: string[];
  /** Shown under the title. */
  note?: string;
  /** The column the alphabet bar sorts into ㄱ–ㅎ, A–Z and # (long lists). */
  indexBy?: string;
  sheet: SheetPlace;
}

// ── Reference lists (one entry each) ─────────────────────────────────────────

export interface ReferenceListName { listName: string; title: string; usage: UsageSpec[]; column: string; dropdown?: string }

export const REFERENCE_LIST_NAMES: ReferenceListName[] = [
  { listName: 'activity.crossActivity', column: 'C', dropdown: 'Active F', title: 'Cross activity',
    usage: [{ key: { value: 'activity.crossActivity' } }] },
  { listName: 'activity.relationship', column: 'D', title: 'Relationship',
    usage: [{ key: { value: 'activity.relationship' } }] },
  { listName: 'nutrient_level', column: 'E', dropdown: 'Active AM, AN and AO', title: 'Nutrient level',
    usage: [{ key: { value: 'food.carbs' } }, { key: { value: 'food.fat' } }, { key: { value: 'food.spiciness' } }] },
  { listName: 'food.type', column: 'G', dropdown: 'Active AL', title: 'Food type',
    usage: [{ key: { value: 'food.type' } }] },
  { listName: 'transport.purpose', column: 'I', dropdown: 'Active BG', title: 'Transport purpose',
    usage: [{ key: { value: 'transport.purpose' } }] },
  { listName: 'transport.method', column: 'J', dropdown: 'Active BH', title: 'Transport method',
    usage: [{ key: { value: 'transport.method' } }] },
  { listName: 'transport.returnType', column: 'K', dropdown: 'Active BI', title: 'Return type',
    usage: [{ key: { value: 'transport.returnType' } }] },
  { listName: 'people.method', column: 'M', dropdown: 'Active BB', title: 'People method',
    usage: [{ unwind: ['people'], key: { value: 'people.method' } }] },
  { listName: 'people.category', column: 'N', dropdown: 'Active BC', title: 'People category',
    usage: [{ unwind: ['people'], key: { value: 'people.category' } }] },
];

/** Lists retired on 24 Oct 2026: no dropdown reads them; alcohol items live in alcohol_conversion. */
export const RETIRED_REFERENCE_LISTS = ['food.drinks.note', 'food.foods.note', 'food.alcohols.item'];

const referenceDefs: ListDef[] = REFERENCE_LIST_NAMES.map(r => ({
  slug: 'ref-' + r.listName.replace(/[._]/g, '-').toLowerCase(),
  title: r.title,
  group: 'Reference lists',
  model: () => ReferenceList,
  filter: { listName: r.listName },
  columns: [{ key: 'value', label: 'Value', type: 'text', required: true }],
  unique: ['value'],
  sort: { order: 1 },
  usage: r.usage,
  sheet: { where: `Activity tab, column ${r.column}`, order: ['value'], column: r.column, dropdown: r.dropdown },
}));

// ── All lists ────────────────────────────────────────────────────────────────

export const LISTS: ListDef[] = [
  {
    slug: 'activity',
    title: 'Activities',
    group: 'Activity and cost',
    model: () => ActivityMaster,
    columns: [
      { key: 'category', label: 'Category', type: 'text', required: true, pickExisting: true },
      { key: 'name', label: 'Activity', type: 'text', required: true },
    ],
    unique: ['name'],
    sort: { category: 1, name: 1 },
    usage: [{ key: { name: 'activity.name', category: 'activity.category' } }],
    recordsFollow: true,
    note: 'An activity name is unique across all categories.',
    sheet: { where: 'Activity tab', order: ['name', 'category'] },
  },
  {
    slug: 'cost',
    title: 'Cost categories',
    group: 'Activity and cost',
    model: () => CostMaster,
    columns: [
      { key: 'category', label: 'Category', type: 'text', required: true, pickExisting: true },
      { key: 'categoryDetail', label: 'Detail', type: 'text', required: true },
    ],
    unique: ['categoryDetail'],
    sort: { category: 1, categoryDetail: 1 },
    usage: [{ key: { categoryDetail: 'cost.categoryDetail', category: 'cost.category' } }],
    recordsFollow: true,
    sheet: { where: 'Cost tab', order: ['categoryDetail', 'category'] },
  },
  ...referenceDefs,
  {
    slug: 'alcohol',
    title: 'Alcohol conversion',
    group: 'Food and health',
    model: () => AlcoholConversion,
    columns: [
      { key: 'item', label: 'Item', type: 'text', required: true, pickExisting: true },
      { key: 'unit', label: 'Unit', type: 'text', required: true },
      { key: 'unitTo50ml', label: 'Unit → 50 ml', type: 'number', required: true },
      { key: 'alcoholRatio', label: 'Alcohol ratio', type: 'number', required: true },
      { key: 'drinks', label: 'Drinks', type: 'number', required: true },
    ],
    unique: ['item', 'unit'],
    sort: { item: 1, unit: 1 },
    usage: [{ unwind: ['food.alcohols'], key: { item: 'food.alcohols.item', unit: 'food.alcohols.unit' } }],
    sheet: { where: 'AlcoholConv tab', order: ['item', 'unit', 'unitTo50ml', 'alcoholRatio', 'drinks'] },
  },
  {
    slug: 'ingredient',
    title: 'Ingredients',
    group: 'Food and health',
    model: () => IngredientMaster,
    columns: [
      { key: 'level1', label: 'Group', type: 'text', required: true, pickExisting: true },
      { key: 'level2', label: 'Ingredient', type: 'text', required: true },
    ],
    unique: ['level2'],
    sort: { level1: 1, level2: 1 },
    usage: [
      { unwind: ['food.foods', 'food.foods.ingredients'], key: { level2: 'food.foods.ingredients' } },
      { unwind: ['food.drinks', 'food.drinks.ingredients'], key: { level2: 'food.drinks.ingredients' } },
    ],
    sheet: { where: 'Ingredient tab', order: ['level1', 'level2'] },
  },
  {
    slug: 'bowel',
    title: 'Bowel scores',
    group: 'Food and health',
    model: () => BowelScore,
    columns: [
      { key: 'field', label: 'Field', type: 'text', required: true, pickExisting: true },
      { key: 'value', label: 'Value', type: 'text', required: true },
      { key: 'score', label: 'Score', type: 'number', required: true },
    ],
    unique: ['field', 'value'],
    sort: { field: 1, score: -1, value: 1 },
    usage: [
      { when: { field: 'amount' }, key: { value: 'bowel.amount' } },
      { when: { field: 'quality' }, unwind: ['bowel.quality'], key: { value: 'bowel.quality' } },
      { when: { field: 'characteristics' }, unwind: ['bowel.characteristics'], key: { value: 'bowel.characteristics' } },
    ],
    sheet: {
      where: v => `Bowel tab, columns ${({ amount: 'A–B', quality: 'C–D', characteristics: 'E–F' } as Record<string, string>)[String(v.field)] ?? '?'} (${v.field})`,
      order: ['value', 'score'],
    },
  },
  {
    slug: 'timezone',
    title: 'Time zones',
    group: 'Time, money and places',
    model: () => TimezoneMaster,
    columns: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'offsetUTC', label: 'UTC offset', type: 'number', required: true },
      { key: 'ianaTimezone', label: 'IANA zone', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text' },
    ],
    unique: ['code'],
    sort: { offsetUTC: 1, code: 1 },
    usage: [{ key: { code: 'start.timezone' } }, { key: { code: 'end.timezone' } }],
    sheet: { where: 'TimeDiff tab (time zones)', order: ['code', 'offsetUTC', 'ianaTimezone', 'city'] },
  },
  {
    slug: 'exchange',
    title: 'Exchange rates',
    group: 'Time, money and places',
    model: () => ExchangeRate,
    columns: [
      { key: 'currency', label: 'Currency', type: 'text', required: true },
      { key: 'rateKRW', label: 'KRW per unit', type: 'number', required: true },
    ],
    unique: ['currency'],
    sort: { currency: 1 },
    usage: [{ key: { currency: 'cost.currency' } }],
    sheet: { where: 'TimeDiff tab (exchange rates)', order: ['currency', 'rateKRW'] },
  },
  {
    slug: 'favorite-place',
    title: 'Favourite places',
    group: 'Time, money and places',
    model: () => FavoritePlace,
    columns: [
      { key: 'label', label: 'Label', type: 'text', required: true, pickExisting: true },
      { key: 'name', label: 'Place', type: 'text', required: true },
      { key: 'from', label: 'From', type: 'zoneTime' },
      { key: 'to', label: 'To', type: 'zoneTime' },
    ],
    unique: ['label', 'from'],
    sort: { label: 1, 'from.at': 1 },
    note: 'Which real place 집 / 회사 / 사이트 / 내차 meant between two moments. Both ends are inclusive; an empty end is open.',
    sheet: { where: 'FavoritePlace tab', order: ['label', 'name', 'from', 'to'] },
    fixedOnEdit: ['label', 'name'],
  },
  {
    slug: 'place-coord',
    title: 'Place points',
    group: 'Time, money and places',
    model: () => PlaceCoord,
    columns: [
      { key: 'name', label: 'Place', type: 'text', required: true },
      { key: 'coords', label: 'Point', type: 'coords', required: true },
      { key: 'note', label: 'Note', type: 'text', narrow: true, noSearch: true },
    ],
    unique: ['name'],
    sort: { name: 1 },
    note: 'One name = one point. Names are as logged after 집 / 회사 / 사이트 / 내차 are resolved.',
    indexBy: 'name',
    // Records counted where the name is written, and (viaFavorites) where 집 / 회사 …
    // meant it at that moment: Place and From at the record's start, To at its end,
    // as Journeys reads them. A rename changes only the written names; the
    // favourite-place periods follow, so the labels keep pointing at it (renamePlace.ts).
    usage: [
      { key: { name: 'location.activity' }, label: 'Place', at: 'start' },
      { key: { name: 'transport.from' }, label: 'From', at: 'start' },
      { key: { name: 'transport.to' }, label: 'To', at: 'end' },
    ],
    recordsFollow: true,
    refuseUnknown: false,
    viaFavorites: true,
    // Source is no longer kept (26 Oct): old values stay in the database, unseen and
    // untouched. It stays in the order so sheet steps leave the tab's column C empty.
    sheet: { where: 'PlaceCoord tab', order: ['name', 'coords', 'source', 'note'] },
  },
];

export function getList(slug: string): ListDef | undefined {
  return LISTS.find(l => l.slug === slug);
}

// ── Row shape sent to the browser ────────────────────────────────────────────

export type CellValue = string | number | null | { timezone: string; local: string } | { lat: number; lng: number };

export interface RowOut {
  _id: string;
  values: Record<string, CellValue>;
  updatedAt: string | null;
}

export function toRow(def: ListDef, doc: any): RowOut {
  const values: Record<string, CellValue> = {};
  for (const c of def.columns) {
    if (c.type === 'coords') {
      values[c.key] = typeof doc.lat === 'number' && typeof doc.lng === 'number' ? { lat: doc.lat, lng: doc.lng } : null;
    } else if (c.type === 'zoneTime') {
      const b = doc[c.key];
      values[c.key] = b ? { timezone: b.timezone, local: b.local } : null;
    } else {
      values[c.key] = doc[c.key] ?? null;
    }
  }
  return { _id: String(doc._id), values, updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null };
}

/** Joins the values of the given columns into one comparable key. */
export function rowKey(values: Record<string, unknown>, cols: string[]): string {
  return cols.map(c => String(values[c] ?? '').trim()).join('\u0001');
}

// ── Columns that records point to ────────────────────────────────────────────

/** Columns that records point to (plus bowel's field). On a row that records use,
 *  these change only through rename / merge (step 3); every other column is free. */
export function lockedColumns(def: ListDef): string[] {
  const out = new Set<string>();
  for (const u of def.usage ?? []) {
    Object.keys(u.key).forEach(k => out.add(k));
    Object.keys(u.when ?? {}).forEach(k => out.add(k));
  }
  return [...out];
}
