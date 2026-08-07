// scripts/inspect-setStyle.ts
// One-off: find every value used in exercise[].setStyle.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing from .env.local');

  await mongoose.connect(uri);
  const db  = mongoose.connection.db!;
  const col = db.collection('log');

  const styles = await col.distinct('exercise.setStyle', { userId: 'hyoje' });
  console.log('distinct setStyle values:', styles);

  const rows = await col.aggregate([
    { $match: { userId: 'hyoje', 'activity.category': '운동' } },
    { $unwind: '$exercise' },
    { $group: { _id: '$exercise.setStyle', records: { $sum: 1 } } },
    { $sort: { records: -1 } },
  ]).toArray();

  console.log('\nsetStyle | records');
  for (const r of rows) console.log(`${r._id ?? '(none)'} | ${r.records}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
