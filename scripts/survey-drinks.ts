import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected:', mongoose.connection.db!.databaseName, '\n');
  const userId = 'hyoje';

  // Documents with drinks, and total drink items
  const docsWithDrinks = await Log.countDocuments({ userId, 'food.drinks.0': { $exists: true } });
  const itemAgg = await Log.aggregate([
    { $match: { userId, 'food.drinks.0': { $exists: true } } },
    { $unwind: '$food.drinks' },
    { $group: { _id: null, total: { $sum: 1 } } },
  ]);
  console.log(`Documents with drinks: ${docsWithDrinks}`);
  console.log(`Total drink items:     ${itemAgg[0]?.total ?? 0}\n`);

  // Distinct drink item names by frequency
  const dist = await Log.aggregate([
    { $match: { userId, 'food.drinks.0': { $exists: true } } },
    { $unwind: '$food.drinks' },
    { $group: { _id: '$food.drinks.item', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`Distinct drink item names: ${dist.length}\n`);
  console.log('All distinct drink items (item <tab> count):');
  for (const d of dist) console.log(`${d._id ?? '(null)'}\t${d.count}`);

  // Distribution of the existing note tag
  const notes = await Log.aggregate([
    { $match: { userId, 'food.drinks.0': { $exists: true } } },
    { $unwind: '$food.drinks' },
    { $group: { _id: '$food.drinks.note', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log('\nExisting note-tag distribution:');
  for (const n of notes) console.log(`  ${n._id ?? '(blank)'}\t${n.count}`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}
main().catch(console.error);
