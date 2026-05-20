// scripts/list-alcohol-items.ts
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  
  const results = await mongoose.connection.db!.collection('log').aggregate([
    { $match: { userId: "hyoje", "food.alcohols": { $exists: true, $not: { $size: 0 } } } },
    { $unwind: "$food.alcohols" },
    { $match: { "food.alcohols.item": { $nin: [null, ""] } } },
    { $group: { _id: "$food.alcohols.item", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log(results.map((r: any) => `${r._id}: ${r.count}`).join('\n'));

  await mongoose.disconnect();
}

main();

