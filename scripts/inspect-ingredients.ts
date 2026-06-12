import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected:', mongoose.connection.db!.databaseName, '\n');

  const userId = 'hyoje';

  // 1. How many docs have foods, and how many food items total
  const docsWithFoods = await Log.countDocuments({ userId, 'food.foods.0': { $exists: true } });
  console.log(`Documents with foods: ${docsWithFoods}`);

  // 2. Aggregate over every food item: count filled vs Not Defined vs missing
  const stats = await Log.aggregate([
    { $match: { userId, 'food.foods.0': { $exists: true } } },
    { $unwind: '$food.foods' },
    { $project: {
        hasIng: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$food.foods.ingredients', []] } }, 0] },
            1, 0
          ]
        },
        isND: {
          $cond: [
            { $eq: ['$food.foods.ingredients', ['Not Defined']] },
            1, 0
          ]
        },
      }
    },
    { $group: {
        _id: null,
        totalItems: { $sum: 1 },
        withIngredients: { $sum: '$hasIng' },
        notDefined: { $sum: '$isND' },
      }
    },
  ]);
  const s = stats[0] ?? { totalItems: 0, withIngredients: 0, notDefined: 0 };
  console.log(`\nFood items total:        ${s.totalItems}`);
  console.log(`  with ingredients:      ${s.withIngredients}`);
  console.log(`  = "Not Defined":       ${s.notDefined}`);
  console.log(`  missing ingredients:   ${s.totalItems - s.withIngredients}`);

  // 3. Distribution of level2 values (top 25)
  const dist = await Log.aggregate([
    { $match: { userId, 'food.foods.0': { $exists: true } } },
    { $unwind: '$food.foods' },
    { $unwind: '$food.foods.ingredients' },
    { $group: { _id: '$food.foods.ingredients', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]);
  console.log('\nTop 25 level2 values:');
  for (const d of dist) console.log(`  ${String(d._id).padEnd(14)} ${d.count}`);

  // 4. Show 7 sample documents' food.foods for eyeballing
  console.log('\nSample food.foods from 7 recent docs:');
  const samples = await Log.find({ userId, 'food.foods.0': { $exists: true } })
    .sort({ 'start.datetime': -1 }).limit(7)
    .select('start.year start.month start.day food.foods').lean();
  for (const doc of samples as any[]) {
    const d = doc.start;
    console.log(`  ${d.year}-${d.month}-${d.day}:`);
    for (const f of doc.food.foods) {
      console.log(`    ${f.item}  [${(f.ingredients ?? []).join(', ')}]`);
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}
main().catch(console.error);
