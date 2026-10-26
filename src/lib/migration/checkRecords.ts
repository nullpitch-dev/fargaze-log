// Checks sheet rows before the migration writes anything (#67 step 4).
//
// The master lists live in the database (§15.5). Every value a record points to
// must be a row of its list; a value the list does not have is REFUSED, and so is
// the whole run: the migration deletes nothing while any row is refused.
//
// The rule is the one the admin pages' "missing from the list" box and
// scripts/check-master-orphans.ts use: each list's `usage` specs in lists.ts say
// which record fields hold its values. A list added there is checked here too.
//
// Also refused (these were skipped quietly before):
//   - a row with an activity name and no category, or an error like #N/A as its
//     category (in the entry sheets column A is a formula; #N/A = unknown name)
//   - a row whose leading value is filled but whose partner is empty
//     (a cost detail without a category, an alcohol item without a unit)
//   - any row the parser cannot read (unknown ingredient or bowel value as before)

import { LISTS, toRow, rowKey, type ListDef, type UsageSpec } from '../admin/lists';
import { createRowFilter } from './transform';
import { rowToDocument } from './rowToDocument';

/** Values every record may hold although no list row has them. */
const ALWAYS_ALLOWED: Record<string, string[]> = {
  // "Not Defined" = a food or drink without brackets; the fill scripts replace it
  ingredient: ['Not Defined'],
};

export interface MasterCheck {
  def: ListDef;
  spec: UsageSpec;
  cols: string[];
  paths: string[];
  known: Set<string>;
}

/** Reads every master list once. Refuses to run against an empty list (wrong database?). */
export async function loadMasterChecks(userId: string): Promise<MasterCheck[]> {
  const out: MasterCheck[] = [];
  for (const def of LISTS) {
    if (!def.usage?.length) continue;
    const docs = await def.model().find({ userId, ...(def.filter ?? {}) }).lean();
    const rows = (docs as any[]).map(d => toRow(def, d));
    if (!rows.length) {
      throw new Error(`The list "${def.title}" (/admin/${def.slug}) is empty in this database. Is MONGODB_URI the right database?`);
    }
    for (const spec of def.usage) {
      const cols = Object.keys(spec.key);
      const known = new Set(
        rows.filter(r => !spec.when || Object.entries(spec.when).every(([k, v]) => r.values[k] === v))
          .map(r => rowKey(r.values, cols)),
      );
      if (cols.length === 1) for (const v of ALWAYS_ALLOWED[def.slug] ?? []) known.add(rowKey({ [cols[0]]: v }, cols));
      out.push({ def, spec, cols, paths: cols.map(c => spec.key[c]), known });
    }
  }
  return out;
}

// ── Reading record paths the way $unwind does ────────────────────────────────

const getPath = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

function withPath(o: any, p: string, v: unknown): any {
  const [k, ...rest] = p.split('.');
  return { ...o, [k]: rest.length ? withPath(o?.[k] ?? {}, rest.join('.'), v) : v };
}

function unwindAll(doc: any, unwind: string[] = []): any[] {
  let docs = [doc];
  for (const u of unwind) {
    const next: any[] = [];
    for (const d of docs) {
      const v = getPath(d, u);
      if (v == null) continue;                       // $unwind drops missing / null
      if (!Array.isArray(v)) { next.push(d); continue; }
      for (const el of v) next.push(withPath(d, u, el));
    }
    docs = next;
  }
  return docs;
}

const isEmpty = (v: unknown) => v == null || String(v).trim() === '';

/** Each value of this record that its list does not have, as one line of text. */
export function unknownValues(doc: any, checks: MasterCheck[]): string[] {
  const out = new Set<string>();
  for (const c of checks) {
    for (const d of unwindAll(doc, c.spec.unwind)) {
      const vals = c.paths.map(p => getPath(d, p));
      if (isEmpty(vals[0])) continue;                // nothing recorded for this list
      const labels = c.cols.map(k => c.def.columns.find(x => x.key === k)?.label ?? k);
      const shown = vals.map(v => (isEmpty(v) ? '(empty)' : `'${String(v).trim()}'`)).join(' › ');
      const where = `${c.def.title} (/admin/${c.def.slug})`;
      const missing = c.cols.filter((_, i) => isEmpty(vals[i]));
      if (missing.length) {
        out.add(`${labels.join(' › ')} ${shown}: ${missing.map(k => labels[c.cols.indexOf(k)]).join(', ')} is empty — ${where}`);
        continue;
      }
      const values = Object.fromEntries(c.cols.map((k, i) => [k, String(vals[i]).trim()]));
      if (!c.known.has(rowKey(values, c.cols))) {
        out.add(`${labels.join(' › ')} ${shown} is not in ${where}`);
      }
    }
  }
  return [...out];
}

// ── One sheet ────────────────────────────────────────────────────────────────

export interface Refused { row: number; date: string; activity: string; reason: string }

export interface PreparedSheet {
  sheet: string;
  total: number;
  skipped: number;
  docs: any[];
  refused: Refused[];
}

const cell = (row: any[], i: number) => row[i]?.toString().trim() ?? '';

/** Parses and checks every row; writes nothing. */
export function prepareSheet(
  sheet: string, rows: any[][], startRow: number, userId: string, checks: MasterCheck[],
): PreparedSheet {
  const shouldSkipRow = createRowFilter();
  const docs: any[] = [];
  const refused: Refused[] = [];
  let skipped = 0;
  let afterPreset = false;

  rows.forEach((row, i) => {
    const rowNo = i + startRow;
    const category = cell(row, 0);
    const name = cell(row, 1);
    const date = [cell(row, 8), cell(row, 9).padStart(2, '0'), cell(row, 10).padStart(2, '0')].join('-');
    if (name === 'Preset') afterPreset = true;

    // An activity name with no usable category: the name is not in the Activity tab.
    if (!afterPreset && name && (category === '' || category.startsWith('#'))) {
      refused.push({ row: rowNo, date, activity: name,
        reason: `Activity '${name}' has ${category ? `the category ${category}` : 'no category'} — not in Activities (/admin/activity)?` });
      return;
    }
    if (shouldSkipRow(row)) { skipped++; return; }

    let doc: any;
    try {
      doc = rowToDocument(row, userId);
    } catch (e: any) {
      refused.push({ row: rowNo, date, activity: `${category} › ${name}`, reason: e.message });
      return;
    }
    const unknown = unknownValues(doc, checks);
    if (unknown.length) {
      for (const reason of unknown) refused.push({ row: rowNo, date, activity: `${category} › ${name}`, reason });
      return;
    }
    docs.push(doc);
  });

  return { sheet, total: rows.length, skipped, docs, refused };
}

/** Groups refusals by reason, so one typo used 40 times is one line. */
export function refusalReport(sheet: string, refused: Refused[], showRows = 8): string[] {
  const by = new Map<string, Refused[]>();
  for (const r of refused) by.set(r.reason, [...(by.get(r.reason) ?? []), r]);
  const out: string[] = [];
  for (const [reason, rs] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`  ✗ ${reason}  — ${rs.length} row${rs.length === 1 ? '' : 's'}`);
    for (const r of rs.slice(0, showRows)) out.push(`      '${sheet}' row ${r.row} · ${r.date} · ${r.activity}`);
    if (rs.length > showRows) out.push(`      … and ${rs.length - showRows} more`);
  }
  return out;
}
