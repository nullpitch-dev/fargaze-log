// scripts/check-bowel-coverage.js
// READ-ONLY. Per-field coverage of bowel (배변) data by year — first step of WBS #62.
// Question it answers: did any field (or any value inside characteristics, e.g. urgency / pain)
// start partway through the log? An absent value must not be read as a real one.
//
// Run from the project root:  node scripts/check-bowel-coverage.js

const path = require('path');
// dotenv BEFORE mongoose (require, not import, so nothing is hoisted above it)
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
require('dotenv').config(); // .env fallback — does not override values already set
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
const USER = 'hyoje';

// Allowed values — Active file > Activity sheet, columns P / Q / R
const VOCAB = {
  amount: ['보통', '많음', '적음', '아주 적음'],
  quality: ['좋음', '보통', '무름', '묽음', '설사', '푸석함', '가늠', '딱딱함', '토끼똥'],
  characteristics: ['편하게', '급하게', '힘들게', '복통 수반', '복통 심함', '잔변감', '냄새 심함',
    '가스 많음', '뜨거움', '바지에', '길에서'],
};

// ── helpers ──────────────────────────────────────────────────────────────
function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (v instanceof Date) return false;
  if (typeof v === 'object') return Object.keys(v).length === 0 || Object.values(v).every(isEmpty);
  return false; // numbers (including 0) and booleans count as present
}

// Split a value into individual items (array elements, or a "+"-joined string)
function tokens(v) {
  if (isEmpty(v)) return [];
  if (Array.isArray(v)) return v.flatMap(tokens);
  if (typeof v === 'object') return [JSON.stringify(v)];
  return String(v).split('+').map((s) => s.trim()).filter(Boolean);
}

const pad = (n) => String(n).padStart(2, '0');
function dateKey(doc) {
  const s = doc.start || {};
  if (s.year && s.month && s.day) return `${s.year}-${pad(s.month)}-${pad(s.day)}`;
  if (s.datetime) return new Date(s.datetime).toISOString().slice(0, 10); // naive local wall clock
  return 'unknown';
}
const yearOf = (doc) => (doc.start && doc.start.year) || dateKey(doc).slice(0, 4);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—');
const inc = (obj, k, by = 1) => { obj[k] = (obj[k] || 0) + by; };

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  if (!URI) {
    console.error('No Mongo URI found. Env keys that look relevant:',
      Object.keys(process.env).filter((k) => /MONGO|DATABASE/i.test(k)));
    process.exit(1);
  }
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  const names = (await db.listCollections().toArray()).map((c) => c.name);
  if (!names.includes('log')) {
    console.log('No "log" collection. Real collection names:', names);
    return;
  }
  const col = db.collection('log');

  // 1. Which records actually carry bowel values, and what activity are they?
  const candidates = await col
    .find({ userId: USER, bowel: { $exists: true } }, { projection: { bowel: 1, activity: 1, start: 1 } })
    .toArray();
  const withData = candidates.filter((d) => !isEmpty(d.bowel));
  console.log(`\nRecords with a bowel field: ${candidates.length} · with any bowel value: ${withData.length}`);

  if (withData.length === 0) {
    console.log('No populated bowel data. Sample bowel shapes:',
      candidates.slice(0, 3).map((d) => d.bowel));
    return;
  }

  const pairs = {};
  withData.forEach((d) => inc(pairs, `${d.activity?.category} / ${d.activity?.name}`));
  console.log('\nActivity (category / name) of records that carry bowel values:');
  Object.entries(pairs).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));

  // 2. Denominator = EVERY record of those activities, populated or not
  const pairFilters = Object.keys(pairs).map((k) => {
    const [category, name] = k.split(' / ');
    return { 'activity.category': category, 'activity.name': name };
  });
  const all = await col
    .find({ userId: USER, $or: pairFilters }, { projection: { bowel: 1, activity: 1, start: 1 } })
    .toArray();
  all.sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  console.log(`\nAll records of those activities: ${all.length} (${dateKey(all[0])} → ${dateKey(all[all.length - 1])})`);

  // Every key that ever appears under bowel (catches fields beyond the expected three)
  const keyCounts = {};
  all.forEach((d) => d.bowel && Object.keys(d.bowel).forEach((k) => { if (!isEmpty(d.bowel[k])) inc(keyCounts, k); }));
  console.log('\nKeys under bowel with a value (all years):', keyCounts);
  const FIELDS = Array.from(new Set(['amount', 'quality', 'characteristics', ...Object.keys(keyCounts)]));

  // 3. Per-year coverage + records per day
  const years = {};
  for (const d of all) {
    const y = yearOf(d);
    const Y = (years[y] ||= { records: 0, days: {}, fields: {} });
    Y.records++;
    inc(Y.days, dateKey(d));
    FIELDS.forEach((f) => { if (!isEmpty(d.bowel?.[f])) inc(Y.fields, f); });
  }
  const table = {};
  for (const [y, Y] of Object.entries(years).sort()) {
    const perDay = Object.values(Y.days);
    const row = {
      records: Y.records,
      days: perDay.length,
      'per day avg': (Y.records / perDay.length).toFixed(2),
      'per day max': Math.max(...perDay),
    };
    FIELDS.forEach((f) => { row[f] = pct(Y.fields[f] || 0, Y.records); });
    table[y] = row;
  }
  console.log('\nCoverage by year (% of records with a value):');
  console.table(table);

  // 4. Value vocabulary by year — a value that appears only from some year onward shows up here
  for (const f of FIELDS) {
    const byYear = {};
    const firstLast = {};
    for (const d of all) {
      const y = yearOf(d);
      const toks = tokens(d.bowel?.[f]);
      if (toks.length === 0) toks.push('(empty)');
      for (const t of toks) {
        inc((byYear[y] ||= {}), t);
        const k = dateKey(d);
        firstLast[t] ||= { first: k, last: k, total: 0 };
        firstLast[t].last = k;
        firstLast[t].total++;
      }
    }
    console.log(`\n── ${f}: values by year ──`);
    for (const [y, counts] of Object.entries(byYear).sort()) {
      const line = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ');
      console.log(`  ${y}: ${line}`);
    }
    // Stored shape: after the list change, quality and characteristics must be arrays
    const shapes = {};
    all.forEach((d) => { const v = d.bowel?.[f]; if (!isEmpty(v)) inc(shapes, Array.isArray(v) ? 'array' : typeof v); });
    console.log(`  stored as: ${JSON.stringify(shapes)}`);
    const unknown = Object.keys(firstLast).filter((t) => t !== '(empty)' && VOCAB[f] && !VOCAB[f].includes(t));
    console.log(`  NOT in Activity sheet list: ${unknown.length ? unknown.map((t) => `${t} (${firstLast[t].total})`).join(', ') : 'none'}`);
    console.log(`  first / last seen:`);
    Object.entries(firstLast).sort((a, b) => a[1].first.localeCompare(b[1].first))
      .forEach(([t, v]) => console.log(`    ${t}: ${v.first} → ${v.last} (${v.total})`));
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
