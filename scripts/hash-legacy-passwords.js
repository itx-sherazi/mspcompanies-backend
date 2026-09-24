/**
 * One-time migration: bcrypt-hash any AdminUser password still stored in plaintext.
 * Login no longer accepts plaintext passwords, so run this BEFORE deploying that change.
 *
 *   node scripts/hash-legacy-passwords.js          # dry run, lists affected users
 *   node scripts/hash-legacy-passwords.js --apply  # hashes them
 *
 * Users keep the same password; only its storage changes.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$.{53}$/;

(async () => {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);

  const users = await AdminUser.find().select("email password");
  const legacy = users.filter((u) => !BCRYPT_HASH.test(u.password || ""));

  console.log(`${users.length} users, ${legacy.length} with non-bcrypt passwords`);
  for (const u of legacy) {
    if (!u.password) {
      console.log(`  ${u.email}: no password set, skipped (reset it manually)`);
      continue;
    }
    if (apply) {
      u.password = await bcrypt.hash(u.password, 10);
      await u.save();
      console.log(`  ${u.email}: hashed`);
    } else {
      console.log(`  ${u.email}: would hash`);
    }
  }
  if (!apply && legacy.length) console.log("Dry run only. Re-run with --apply to write changes.");

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
