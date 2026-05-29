import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const results = await db.collection('log').aggregate([
    { $match: { userId: 'hyoje' } },
    { $unwind: '$food.foods' },
    { $group: { _id: '$food.foods.item' } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log(results.map((r: any) => r._id).join('\n'));
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
