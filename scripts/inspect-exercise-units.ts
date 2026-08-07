import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection("log");

  const rows = await col
    .aggregate([
      { $match: { userId: "hyoje", "activity.category": "운동" } },
      { $unwind: "$exercise" },
      {
        $group: {
          _id: { item: "$exercise.item", unit: "$exercise.unit" },
          records: { $sum: 1 },
          days: { $addToSet: { y: "$start.year", m: "$start.month", d: "$start.day" } },
          load: { $sum: { $cond: [{ $gt: ["$exercise.loadKg", null] }, 1, 0] } },
          total: { $sum: { $cond: [{ $eq: ["$exercise.setStyle", "총"] }, 1, 0] } },
          hasDur: { $sum: { $cond: [{ $gt: ["$duration.totalSeconds", null] }, 1, 0] } },
        },
      },
      { $sort: { "_id.item": 1, records: -1 } },
    ])
    .toArray();

  console.log("item | unit | records | days | load | 총 | duration");
  rows.forEach((r) =>
    console.log(
      [r._id.item, r._id.unit, r.records, r.days.length, r.load, r.total, r.hasDur].join(" | ")
    )
  );

  const multi: Record<string, number> = {};
  rows.forEach((r) => (multi[r._id.item] = (multi[r._id.item] || 0) + 1));
  const bad = Object.entries(multi).filter(([, n]) => n > 1);
  console.log("\nitems using more than one unit:", bad.length ? bad : "none");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
