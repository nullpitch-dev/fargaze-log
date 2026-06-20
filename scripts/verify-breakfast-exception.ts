// scripts/verify-breakfast-exception.ts
// Read-only. Lists pre-6am 아침 records and shows how the exemption changes
// their date attribution (OLD = rolled back to prev day, NEW = own day),
// and flags ones carrying coffee (caffeine-cutoff impact).
require('dotenv').config({ path: '.env.local' });   // adjust if your env file differs
import mongoose from 'mongoose';

const SLEEP_THRESHOLD_HOUR = 6;
const hourToMins = (s?: string | null) => {
  if (!s) return null;
  const [h, m] = s.split(':');
  const hh = parseInt(h), mm = parseInt(m ?? '0');
  return isNaN(hh) || isNaN(mm) ? null : hh * 60 + mm;
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const docs = await db.collection('log').find({
    userId: 'hyoje',
    'food.type': '아침',
  }).sort({ 'start.datetime': 1 }).toArray();

  let affected = 0;
  for (const d of docs as any[]) {
    const mins = hourToMins(d.start?.hour);
    if (mins === null || mins >= SLEEP_THRESHOLD_HOUR * 60) continue;   // pre-6am only
    affected++;
    const dt = new Date(d.start.datetime);
    const rolled = new Date(dt); rolled.setUTCDate(rolled.getUTCDate() - 1);
    const drinks: any[] = d.food?.drinks ?? [];
    const coffee = drinks.some(dr => (dr?.ingredients ?? []).some((g: string) => g === '커피' || g === '카페인'));
    console.log(
      `start=${d.start?.hour} end=${d.end?.hour ?? '?'}  ` +
      `OLD→${rolled.toISOString().slice(0, 10)}  NEW→${dt.toISOString().slice(0, 10)}` +
      (coffee ? '  [coffee → caffeine cutoff also affected]' : ''),
    );
  }
  console.log(`\nTotal 아침 records: ${docs.length}  |  pre-6am (affected): ${affected}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
