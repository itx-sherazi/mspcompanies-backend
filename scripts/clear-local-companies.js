/**
 * Local testing only: empties the company data in the LOCAL database so the master sheet can be imported
 * from the dashboard on a clean slate.
 *   - removes every company from the main directory (manageditcompanies)
 *   - empties the companies of every city / state / country page (the pages themselves stay)
 * Admin users, blogs, vendors, cybersecurity companies and requests are NOT touched.
 * No backup is written.
 *
 *   node scripts/clear-local-companies.js
 */
const fs = require("fs");
const path = require("path");
const { requireLocalDb } = require("./localDbGuard");
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(requireLocalDb());
  const db = mongoose.connection.db;
  const dbName = db.databaseName;

  const directory = await db.collection("manageditcompanies").find({}).toArray();
  const pages = await db.collection("cities").find({}, { projection: { hubCompanies: 1, slug: 1, hubSlug: 1 } }).toArray();
  const hubCompaniesBefore = pages.reduce((a, p) => a + (p.hubCompanies || []).length, 0);

  console.log(`database: ${dbName}`);

  const del = await db.collection("manageditcompanies").deleteMany({});
  const upd = await db.collection("cities").updateMany({}, { $set: { hubCompanies: [] } });
  console.log(`directory companies removed: ${del.deletedCount} (was ${directory.length})`);
  console.log(`pages emptied: ${upd.modifiedCount} of ${pages.length} (${hubCompaniesBefore} page companies removed)`);

  console.log("\nafter:");
  for (const c of await db.listCollections().toArray()) console.log("  ", c.name.padEnd(26), await db.collection(c.name).countDocuments());
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
