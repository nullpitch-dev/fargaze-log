/**
 * list-alcohol-units.ts
 * Lists all distinct (item × unit) combinations from food.alcohols,
 * with total occurrence count for each combination.
 *
 * Run: npx ts-node scripts/list-alcohol-units.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;
const USER_ID = 'hyoje';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;

  const results = await db.collection('log').aggregate([
    { $match: { userId: USER_ID, 'food.alcohols.0': { $exists: true } } },
    { $unwind: '$food.alcohols' },
    {
      $group: {
        _id: {
          item: '$food.alcohols.item',
          unit: '$food.alcohols.unit',
        },
        count: { $sum: 1 },
        amounts: { $push: '$food.alcohols.amount' },
      },
    },
    { $sort: { '_id.item': 1, '_id.unit': 1 } },
  ]).toArray();

  // Print as TSV for easy copy-paste into a spreadsheet
  console.log('item\tunit\tcount\tmin_amount\tmax_amount\texample_amounts');
  for (const r of results) {
    const amounts = (r.amounts as (number | null)[])
      .filter((a): a is number => a != null && !isNaN(a));
    const min = amounts.length ? Math.min(...amounts) : '';
    const max = amounts.length ? Math.max(...amounts) : '';
    const examples = amounts.slice(0, 5).join(', ');
    console.log(`${r._id.item}\t${r._id.unit ?? '(none)'}\t${r.count}\t${min}\t${max}\t${examples}`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
