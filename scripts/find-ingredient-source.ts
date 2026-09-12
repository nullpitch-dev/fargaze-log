// scripts/find-ingredient-source.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const NEEDLE = '갑각류';

function findPaths(node: unknown, path: string, hits: string[]) {
  if (typeof node === 'string') {
    if (node.includes(NEEDLE)) hits.push(`${path} = ${node}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => findPaths(v, `${path}[${i}]`, hits));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      findPaths(v, path ? `${path}.${k}` : k, hits);
    }
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const docs = await db.collection('log').find({ userId: 'hyoje' }).toArray();

  let count = 0;
  for (const doc of docs) {
    const hits: string[] = [];
    findPaths(doc, '', hits);
    if (hits.length === 0) continue;
    count++;
    console.log('─'.repeat(60));
    console.log('_id:', String(doc._id), ' date:', doc.year, doc.month, doc.day);
    hits.forEach((h) => console.log('   ', h));
  }
  console.log('─'.repeat(60));
  console.log(`records containing "${NEEDLE}": ${count}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
