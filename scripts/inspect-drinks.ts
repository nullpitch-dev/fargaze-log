import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected:', mongoose.connection.db!.databaseName, '\n');
  const userId = 'hyoje';

  const docsWithDrinks = await Log.countDocuments({ userId, 'food.drinks.0': { $exists: true } });
  console.log(`Documents with drinks: ${docsWithDrinks}`);

  const stats = await Log.aggregate([
    { $match: { userId, 'food.drinks.0': { $exists: true } } },
    { $unwind: '$food.drinks' },
    { $project: {
        hasIng: { $cond: [{ $gt: [{ $size: { $ifNull: ['$food.drinks.ingredients', []] } }, 0] }, 1, 0] },
        isND: { $cond: [{ $eq: ['$food.drinks.ingredients', ['Not Defined']] }, 1, 0] },
    }},
    { $group: { _id: null, totalItems: { $sum: 1 }, withIngredients: { $sum: '$hasIng' }, notDefined: { $sum: '$isND' } } },
  ]);
  const s = stats[0] ?? { totalItems: 0, withIngredients: 0, notDefined: 0 };
  console.log(`\nDrink items total:       ${s.totalItems}`);
  console.log(`  with ingredients:      ${s.withIngredients}`);
  console.log(`  = "Not Defined":       ${s.notDefined}`);
  console.log(`  missing ingredients:   ${s.totalItems - s.withIngredients}`);

  const dist = await Log.aggregate([
    { $match: { userId, 'food.drinks.0': { $exists: true } } },
    { $unwind: '$food.drinks' },
    { $unwind: '$food.drinks.ingredients' },
    { $group: { _id: '$food.drinks.ingredients', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]);
  console.log('\nTop 25 drink level2 values:');
  for (const d of dist) console.log(`  ${String(d._id).padEnd(16)} ${d.count}`);

  console.log('\nSample food.drinks from 7 recent docs:');
  const samples = await Log.find({ userId, 'food.drinks.0': { $exists: true } })
    .sort({ 'start.datetime': -1 }).limit(7).select('start.year start.month start.day food.drinks').lean();
  for (const doc of samples as any[]) {
    const d = doc.start;
    console.log(`  ${d.year}-${d.month}-${d.day}:`);
    for (const dr of doc.food.drinks) console.log(`    ${dr.item}  [${(dr.ingredients ?? []).join(', ')}]`);
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}
main().catch(console.error);
