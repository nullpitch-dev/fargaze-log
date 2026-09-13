import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

const DATES = [
  [2019, 10, 26], [2020, 3, 28], [2021, 3, 27], [2021, 10, 30],
  [2022, 3, 26], [2022, 10, 29], [2023, 3, 25], [2024, 3, 30],
  [2024, 10, 27], [2025, 3, 29], [2025, 10, 25], [2026, 3, 28],
  [2021, 1, 7],
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db.collection('log');
  console.log(`\n  date        start            end              dur    location`);
  for (const [y, m, d] of DATES) {
    const docs = await col.find({
      userId: 'hyoje', 'activity.category': '생리', 'activity.name': '수면',
      'start.year': y, 'start.month': m, 'start.day': d,
    }).toArray();
    if (!docs.length) { console.log(`  ${y}-${m}-${d}: none`); continue; }
    for (const x of docs) {
      console.log(
        `  ${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}  ` +
        `${String(x.start?.hour).padEnd(6)}[${x.start?.timezone}/${x.start?.timezoneOffset}] ` +
        `${String(x.end?.hour).padEnd(6)}[${x.end?.timezone}/${x.end?.timezoneOffset}] ` +
        `${String(Math.round((x.duration?.totalSeconds ?? 0)/60)).padStart(5)}m  ` +
        `${x.location?.activity ?? '—'}`
      );
    }
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
