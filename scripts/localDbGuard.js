/** Scripts in this folder change data. They refuse to run against anything but a local database. */
require("dotenv").config({ quiet: true });

function requireLocalDb() {
  const uri = process.env.MONGO_URI || "";
  const local = /\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri) || /^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(uri);
  if (!local && !process.argv.includes("--live")) {
    console.error("Refusing to run: MONGO_URI is not a local database. Add --live only if you really mean the live database.");
    process.exit(1);
  }
  return uri;
}

module.exports = { requireLocalDb };
