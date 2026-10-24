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
//             (Hyoje, 23–24 Oct: activity and cost first; other lists later).
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
}

export interface UsageSpec {
  key: Record<string, string>;
  unwind?: string[];
  when?: Record<string, string>;
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
  /** Shown under the title. */
  note?: string;
}

// ── Reference lists (one entry each) ─────────────────────────────────────────

export interface ReferenceListName { listName: string; title: string; usage: UsageSpec[] }

export const REFERENCE_LIST_NAMES: ReferenceListName[] = [
  { listName: 'activity.crossActivity', title: 'Cross activity',
    usage: [{ key: { value: 'activity.crossActivity' } }] },
  { listName: 'activity.relationship', title: 'Relationship',
    usage: [{ key: { value: 'activity.relationship' } }] },
  { listName: 'nutrient_level', title: 'Nutrient level',
    usage: [{ key: { value: 'food.carbs' } }, { key: { value: 'food.fat' } }, { key: { value: 'food.spiciness' } }] },
  { listName: 'food.type', title: 'Food type',
    usage: [{ key: { value: 'food.type' } }] },
  { listName: 'transport.purpose', title: 'Transport purpose',
    usage: [{ key: { value: 'transport.purpose' } }] },
  { listName: 'transport.method', title: 'Transport method',
    usage: [{ key: { value: 'transport.method' } }] },
  { listName: 'transport.returnType', title: 'Return type',
    usage: [{ key: { value: 'transport.returnType' } }] },
  { listName: 'people.method', title: 'People method',
    usage: [{ unwind: ['people'], key: { value: 'people.method' } }] },
  { listName: 'people.category', title: 'People category',
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
  },
  {
    slug: 'place-coord',
    title: 'Place points',
    group: 'Time, money and places',
    model: () => PlaceCoord,
    columns: [
      { key: 'name', label: 'Place', type: 'text', required: true },
      { key: 'coords', label: 'Point', type: 'coords', required: true },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    unique: ['name'],
    sort: { name: 1 },
    note: 'One name = one point. Names are as logged after 집 / 회사 / 사이트 / 내차 are resolved.',
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
