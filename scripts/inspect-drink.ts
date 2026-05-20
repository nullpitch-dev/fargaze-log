import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const col = db.collection('log');

  const total   = await col.countDocuments({ userId: 'hyoje' });
  const nonNull = await col.countDocuments({ userId: 'hyoje', 'food.drink': { $exists: true, $nin: [null, ''] } });

  console.log(`\nTotal entries:          ${total}`);
  console.log(`food.drink non-null:    ${nonNull}`);
  console.log(`food.drink null/empty:  ${total - nonNull}`);

  const samples = await col
    .find({ userId: 'hyoje', 'food.drink': { $exists: true, $nin: [null, ''] } })
    .project({ 'food.drink': 1, date: 1, _id: 0 })
    .limit(30)
    .toArray();

  console.log('\n── 30 raw samples ──────────────────────────────');
  samples.forEach(s => console.log(`  [${s.date ?? ''}]  ${JSON.stringify(s.food?.drink)}`));

  const distinct = await col.distinct('food.drink', { userId: 'hyoje' });
  const cleaned  = distinct.filter((v: any) => v !== null && v !== '').slice(0, 100);

  console.log(`\n── Distinct values (up to 100, total ${distinct.length}) ──`);
  cleaned.forEach((v: any) => console.log(`  ${JSON.stringify(v)}`));

  await mongoose.disconnect();
}

main().catch(console.error);
