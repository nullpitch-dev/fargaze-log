// scripts/export-bowel.js
// READ-ONLY. Writes every bowel movement record to bowel-export.json (project root)
// so the scoring framework can be tested against all years.
//
// Run from the project root:  node scripts/export-bowel.js

const path = require('path');
const fs = require('fs');
// dotenv BEFORE mongoose (require, not import, so nothing is hoisted above it)
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
require('dotenv').config();
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  if (!URI) { console.error('No Mongo URI found.'); process.exit(1); }
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  if (!names.includes('log')) { console.log('No "log" collection. Real names:', names); return; }

  const docs = await db.collection('log')
    .find(
      { userId: 'hyoje', 'activity.category': '생리', 'activity.name': '대변' },
      { projection: { _id: 0, start: 1, bowel: 1, duration: 1 } },
    )
    .toArray();

  const pad = (n) => String(n).padStart(2, '0');
  const rows = docs.map((d) => ({
    date: `${d.start.year}-${pad(d.start.month)}-${pad(d.start.day)}`,
    hour: d.start.hour || null,
    amount: d.bowel?.amount || null,
    quality: d.bowel?.quality || [],
		characteristics: d.bowel?.characteristics || [], minutes: d.duration?.totalSeconds != null ? Math.round(d.duration.totalSeconds / 60) : null,
  }));
  rows.sort((a, b) => (a.date + (a.hour || '')).localeCompare(b.date + (b.hour || '')));

  const out = path.resolve(process.cwd(), 'bowel-export.json');
  fs.writeFileSync(out, JSON.stringify(rows));
  console.log(`Wrote ${rows.length} records (${rows[0]?.date} → ${rows[rows.length - 1]?.date}) to ${out}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
