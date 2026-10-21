/**
 * Cybersecurity master sheet engine: same columns as the MSP and MSSP master sheets. Companies that are already on
 * the live site keep their slug (column "Live Slug"), so their profile links do not change.
 */
const xlsx = require("xlsx");
const { parseMasterBuffer } = require("./masterSheet");
const { planDirectoryPages } = require("./placePlanner");
const { MIN } = require("../config/cyberPages");

/** Live Slug of every sheet row, by row number (the number parseMasterBuffer puts in `_row`). */
function liveSlugsByRow(buffer) {
  const wb = xlsx.read(buffer, { type: "buffer", sheetRows: 20001 });
  const name = wb.SheetNames.includes("Master") ? "Master" : wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false });
  return new Map(rows.map((r, i) => [i + 2, String(r["Live Slug"] || "").trim()]));
}

function parseCyber(buffer) {
  const parsed = parseMasterBuffer(buffer, { extraHeaders: ["Live Slug"] });
  if (parsed.companies.length) {
    const live = liveSlugsByRow(buffer);
    for (const c of parsed.companies) c._slug = live.get(c._row) || "";
  }
  return parsed;
}

const buildCyber = (companies) => planDirectoryPages(companies, { min: MIN, minCountry: MIN, stateWinsName: true, dropSameAsParent: true });

module.exports = { parseCyber, buildCyber };
