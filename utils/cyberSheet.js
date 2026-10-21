/**
 * Cybersecurity master sheet engine: same columns as the MSP and MSSP master sheets. Companies that are already on
 * the live site keep their slug (column "Live Slug"), so their profile links do not change.
 */
const xlsx = require("xlsx");
const { parseMasterBuffer } = require("./masterSheet");
const { planDirectoryPages } = require("./placePlanner");
const { MIN } = require("../config/cyberPages");

const EXTRA_HEADERS = ["Live Slug"];

/** Live Slug of every sheet row, by row number (the number parseMasterBuffer puts in `_row`). */
function liveSlugsByRow(buffer) {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const name = wb.SheetNames.includes("Master") ? "Master" : wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false });
  return new Map(rows.map((r, i) => [i + 2, String(r["Live Slug"] || "").trim()]));
}

function planCyber(buffer) {
  const { companies, report } = parseMasterBuffer(buffer, { extraHeaders: EXTRA_HEADERS });
  const live = liveSlugsByRow(buffer);
  const plan = planDirectoryPages(companies, { min: MIN, minCountry: MIN, stateWinsName: true, dropSameAsParent: true }, { reservedSlug: (c) => live.get(c._row) || "" });
  return { ...plan, report, noPage: plan.companies.filter((d) => !d.countryPageSlug).length };
}

module.exports = { planCyber };
