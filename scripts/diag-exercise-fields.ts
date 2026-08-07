import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const names = (await db.listCollections().toArray()).map((c) => c.name);
  console.log("collections:", names.join(", "));

  const col = db.collection("log");

  console.log("\ntotal docs        :", await col.countDocuments({}));
  console.log("userId=hyoje      :", await col.countDocuments({ userId: "hyoje" }));
  console.log(
    "has exercise[0]   :",
    await col.countDocuments({ userId: "hyoje", "exercise.0": { $exists: true } })
  );
  console.log(
    "loadKg key exists :",
    await col.countDocuments({ "exercise.loadKg": { $exists: true } })
  );
  console.log(
    "setStyle key exist:",
    await col.countDocuments({ "exercise.setStyle": { $exists: true } })
  );

  const sample = await col
    .find({ "exercise.0": { $exists: true } })
    .sort({ "start.datetime": -1 })
    .limit(3)
    .project({ _id: 0, start: 1, activity: 1, exercise: 1 })
    .toArray();

  console.log("\n3 most recent exercise docs:");
  console.log(JSON.stringify(sample, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
