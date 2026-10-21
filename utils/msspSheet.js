/**
 * MSSP master sheet engine. Reads the sheet with the same code as the MSP master sheet, then decides the
 * /mssp pages (country pages, plus the states and cities listed in config/msspPages.js). No database access.
 */
const { parseMasterBuffer } = require("./masterSheet");
const { planDirectoryPages } = require("./placePlanner");
const { STATES, CITIES, MIN_COUNTRY } = require("../config/msspPages");

function planMssp(buffer) {
  const { companies, report } = parseMasterBuffer(buffer);
  const plan = planDirectoryPages(companies, { states: STATES, cities: CITIES, minCountry: MIN_COUNTRY });
  return { ...plan, report, noPage: plan.companies.filter((d) => !d.countryPageSlug).length };
}

module.exports = { planMssp };
