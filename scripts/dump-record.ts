// scripts/dump-record.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ID = '6a82f34c1f94a8cbe894b322';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const doc = await db
    .collection('log')
    .findOne({ _id: new mongoose.Types.ObjectId(ID) });

  if (!doc) {
    console.log('not found');
  } else {
    console.log(JSON.stringify(doc, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
