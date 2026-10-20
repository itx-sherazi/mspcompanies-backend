/**
 * Master sheet import from the command line (same engine as the dashboard).
 *
 *   node scripts/master-import.js ../master-msp-final.xlsx                 preview only, nothing is saved
 *   node scripts/master-import.js ../master-msp-final.xlsx --apply         save
 *   options: --metro (include nearby cities)   --keep-directory (do not remove directory companies missing from the sheet)
 */
const fs = require("fs");
const path = require("path");
const { requireLocalDb } = require("./localDbGuard");
const mongoose = require("mongoose");
const { runMasterImport } = require("../utils/masterImport");

(async () => {
  const uri = requireLocalDb();
  const args = process.argv.slice(2);
  await mongoose.connect(uri);

  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Give the Excel file path.");
  const result = await runMasterImport({
    buffer: fs.readFileSync(path.resolve(file)),
    apply: args.includes("--apply"),
    metro: args.includes("--metro"),
    replaceDirectory: !args.includes("--keep-directory"),
    log: (m) => console.log("  ·", m),
  });

  console.log(`\n${result.mode.toUpperCase()}  (${(result.tookMs / 1000).toFixed(1)} s)`);
  console.log("sheet:", JSON.stringify(result.sheet));
  console.log("directory:", JSON.stringify(result.directory));
  console.log("pages:", JSON.stringify(result.pages));
  console.log(`\nwarnings (${result.warnings.length}):`);
  result.warnings.slice(0, 40).forEach((w) => console.log("  -", w));
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
