/**
 * MSSP master sheet import: preview (no writes), report (Excel), or apply.
 *
 *  1. Read + clean + de-duplicate the sheet, work out the /mssp pages (msspSheet.js).
 *  2. Apply: upsert every company by slug, then remove the companies that are no longer in the sheet.
 *     The directory is never emptied first, so a failure half way cannot leave it blank.
 *  3. Apply: save the country / state / city pages the same way.
 *  4. No backup copy is kept anywhere. Run a preview first; applying replaces the data.
 */
const MsspCompany = require("../models/MsspCompany");
const MsspPage = require("../models/MsspPage");
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");
const { planMssp } = require("./msspSheet");

const CHUNK = 500;

async function upsertAll(Model, docs) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await Model.bulkWrite(
      docs.slice(i, i + CHUNK).map((d) => ({ updateOne: { filter: { slug: d.slug }, update: { $set: d }, upsert: true } })),
      { ordered: false },
    );
  }
}

async function runMsspImport({ buffer, apply = false, withPlan = false, log = () => {} }) {
  const started = Date.now();
  const plan = planMssp(buffer);
  const count = (type) => plan.pages.filter((p) => p.type === type).length;
  const [directoryBefore, pagesBefore] = await Promise.all([MsspCompany.estimatedDocumentCount(), MsspPage.estimatedDocumentCount()]);

  const warnings = [];
  if (plan.report.unknownHeaders.length) warnings.push(`Columns not saved (not in the master sheet): ${plan.report.unknownHeaders.join(", ")}`);
  if (plan.report.skippedDuplicates) warnings.push(`${plan.report.skippedDuplicates} duplicate rows skipped, for example ${plan.report.duplicateExamples.slice(0, 3).join("; ")}`);
  if (plan.report.skippedNoName) warnings.push(`${plan.report.skippedNoName} rows without a company name skipped.`);
  const noCountry = plan.companies.filter((c) => !c.countryPageSlug).length;
  if (noCountry) warnings.push(`${noCountry} companies have no country, so they are on no /mssp page (they stay in the directory).`);
  const noIndex = plan.companies.filter((c) => !c.indexEligible).length;
  if (noIndex) warnings.push(`${noIndex} of ${plan.companies.length} companies are not Index Eligible yet, so Google is told not to index their profiles.`);

  const result = {
    ok: true,
    mode: apply ? "apply" : "preview",
    sheet: plan.report,
    directory: { before: directoryBefore, after: plan.companies.length },
    pages: { before: pagesBefore, total: plan.pages.length, country: count("country"), state: count("state"), city: count("city") },
    rows: plan.pages.map((p) => ({ slug: p.slug, name: p.name, type: p.type, country: p.countryName, state: p.stateName, companies: p.companyCount })),
    warnings,
  };
  if (withPlan) result._plan = plan;
  if (!apply) {
    result.tookMs = Date.now() - started;
    return result;
  }

  await upsertAll(MsspCompany, plan.companies);
  const gone = await MsspCompany.deleteMany({ slug: { $nin: plan.companies.map((c) => c.slug) } });
  result.directory.removed = gone.deletedCount;
  log(`companies saved: ${plan.companies.length}, removed: ${gone.deletedCount}`);

  await upsertAll(MsspPage, plan.pages);
  await MsspPage.deleteMany({ slug: { $nin: plan.pages.map((p) => p.slug) } });
  log(`pages saved: ${plan.pages.length}`);
  publicCache.clear();

  // A local database must never poke the live website (FRONTEND_URL in .env points to it).
  if (/localhost|127.0.0.1/.test(process.env.MONGO_URI || "")) {
    log("local database: website revalidation skipped");
  } else {
    const paths = ["/managed-security-service-providers", "/mssp", ...plan.pages.map((p) => `/mssp/${p.slug}`)];
    for (let i = 0; i < paths.length; i += 40) await revalidateFrontend(paths.slice(i, i + 40));
  }
  result.tookMs = Date.now() - started;
  return result;
}

/** Excel report made from a preview: the pages, and the page every company lands on. */
function buildReportWorkbook(result) {
  const xlsx = require("xlsx");
  const wb = xlsx.utils.book_new();
  const summary = [
    ["Mode", result.mode],
    ["Sheet rows", result.sheet.sheetRows],
    ["Companies kept", result.sheet.kept],
    ["Duplicates skipped", result.sheet.skippedDuplicates],
    ["Index Eligible", result.sheet.indexEligible],
    ["Directory before", result.directory.before],
    ["Directory after", result.directory.after],
    ["Pages", `${result.pages.total} (${result.pages.country} country, ${result.pages.state} state, ${result.pages.city} city)`],
    ["Unknown columns (not saved)", (result.sheet.unknownHeaders || []).join(", ") || "none"],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Item", "Value"], ...summary]), "Summary");
  const pages = result.rows.map((r) => ({ Page: r.name, URL: `/mssp/${r.slug}`, Type: r.type, Country: r.country, State: r.state, Companies: r.companies }));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(pages), "Pages");
  const placements = (result._plan?.companies || []).map((c) => ({
    Company: c.companyName, URL: `/managed-security-service-providers/${c.slug}`, City: c.companyCity, State: c.companyState, Country: c.companyCountry,
    "City page": c.cityPageSlug, "State page": c.statePageSlug, "Country page": c.countryPageSlug, "Index eligible": c.indexEligible ? "Y" : "N",
  }));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(placements), "Companies");
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Warning"], ...(result.warnings || []).map((w) => [w])]), "Warnings");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { runMsspImport, buildReportWorkbook };
