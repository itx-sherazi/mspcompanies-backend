/**
 * Local testing only: empties (almost) everything in the LOCAL database.
 *   kept : admin users (so you can still log in)
 *   wiped: every other collection, including the city / state / country pages (the Master Sheet import
 *          creates the pages again). Add --keep-pages to keep the pages and only empty their companies.
 * No backup is written.
 *
 *   node scripts/clear-local-all.js
 */
const { requireLocalDb } = require("./localDbGuard");
const mongoose = require("mongoose");

// --keep-pages keeps the city / state / country pages (emptied); by default they are deleted too and the
// Master Sheet import creates them again.
const KEEP_PAGES = process.argv.includes("--keep-pages");
const KEEP = new Set(KEEP_PAGES ? ["adminusers", "cities"] : ["adminusers"]);

(async () => {
  await mongoose.connect(requireLocalDb());
  const db = mongoose.connection.db;
  const cols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith("system."));

  const dump = { collections: {} };
  for (const n of cols) dump.collections[n] = { length: await db.collection(n).countDocuments() };
  console.log(`database: ${db.databaseName}\n`);

  for (const n of cols) {
    if (n === "cities" && KEEP_PAGES) {
      const r = await db.collection("cities").updateMany({}, { $set: { hubCompanies: [] } });
      console.log(`  ${n.padEnd(26)} kept ${dump.collections[n].length} pages, companies emptied on ${r.modifiedCount}`);
    } else if (KEEP.has(n)) {
      console.log(`  ${n.padEnd(26)} kept ${dump.collections[n].length}`);
    } else {
      const r = await db.collection(n).deleteMany({});
      console.log(`  ${n.padEnd(26)} deleted ${r.deletedCount}`);
    }
  }

  console.log("\nafter:");
  for (const n of cols) console.log(`  ${n.padEnd(26)} ${await db.collection(n).countDocuments()}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
