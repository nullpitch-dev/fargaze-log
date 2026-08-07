import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const col = db.collection("log");

  const base = { userId: "hyoje", "exercise.0": { $exists: true } };

  const withLoad = await col.countDocuments({
    ...base,
    "exercise.loadKg": { $nin: [null, ""] },
  });
  const withStyle = await col.countDocuments({
    ...base,
    "exercise.setStyle": { $nin: [null, ""] },
  });

  console.log("docs with loadKg :", withLoad);
  console.log("docs with setStyle:", withStyle);

  const loads = await col
    .aggregate([
      { $match: base },
      { $unwind: "$exercise" },
      { $match: { "exercise.loadKg": { $nin: [null, ""] } } },
      {
        $group: {
          _id: { item: "$exercise.item", load: "$exercise.loadKg" },
          n: { $sum: 1 },
        },
      },
      { $sort: { "_id.item": 1, "_id.load": 1 } },
    ])
    .toArray();

  console.log("\nloadKg by item:");
  loads.forEach((r) => console.log(` ${r._id.item} ${r._id.load}kg — ${r.n}`));

  const styles = await col
    .aggregate([
      { $match: base },
      { $unwind: "$exercise" },
      { $match: { "exercise.setStyle": { $nin: [null, ""] } } },
      { $group: { _id: "$exercise.setStyle", n: { $sum: 1 } } },
    ])
    .toArray();

  console.log("\nsetStyle values:");
  styles.forEach((r) => console.log(` "${r._id}" — ${r.n}`));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
