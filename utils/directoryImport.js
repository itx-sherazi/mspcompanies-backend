/**
 * Master sheet import for a directory with location pages (MSSP, cybersecurity): preview (no writes), report
 * (Excel), or apply.
 *
 *  1. Read + clean + de-duplicate the sheet, work out the pages (the plan function of the directory).
 *  2. Apply: upsert every company by slug, then remove the companies that are no longer in the sheet.
 *     The directory is never emptied first, so a failure half way cannot leave it blank.
 *  3. Apply: save the country / state / city pages the same way.
 *  4. No backup copy is kept anywhere. Run a preview first; applying replaces the data.
 */
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");

const CHUNK = 500;

async function upsertAll(Model, docs) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    await Model.bulkWrite(
      docs.slice(i, i + CHUNK).map((d) => ({ updateOne: { filter: { slug: d.slug }, update: { $set: d }, upsert: true } })),
      { ordered: false },
    );
  }
}

/**
 * @param Company, Page   the two models
 * @param plan            (buffer) => { companies, pages, report }
 * @param pageUrl         (slug) => public path of a page
 * @param profileUrl      (slug) => public path of a company profile (for the report)
 * @param revalidate      public paths to refresh besides the pages
 */
function createDirectoryImport({ Company, Page, plan, pageUrl, profileUrl, revalidate }) {
  async function run({ buffer, apply = false, withPlan = false, log = () => {} }) {
    const started = Date.now();
    const planned = plan(buffer);
    const count = (type) => planned.pages.filter((p) => p.type === type).length;
    const [directoryBefore, pagesBefore] = await Promise.all([Company.estimatedDocumentCount(), Page.estimatedDocumentCount()]);

    const warnings = [];
    if (planned.report.unknownHeaders.length) warnings.push(`Columns not saved (not in the master sheet): ${planned.report.unknownHeaders.join(", ")}`);
    if (planned.report.skippedDuplicates) warnings.push(`${planned.report.skippedDuplicates} duplicate rows skipped, for example ${planned.report.duplicateExamples.slice(0, 3).join("; ")}`);
    if (planned.report.skippedNoName) warnings.push(`${planned.report.skippedNoName} rows without a company name skipped.`);
    const noCountry = planned.companies.filter((c) => !c.countryPageSlug).length;
    if (noCountry) warnings.push(`${noCountry} companies are on no country page (no country, or a country with too few companies). They stay in the directory.`);
    const noIndex = planned.companies.filter((c) => !c.indexEligible).length;
    if (noIndex) warnings.push(`${noIndex} of ${planned.companies.length} companies are not Index Eligible yet, so Google is told not to index their profiles.`);

    const result = {
      ok: true,
      mode: apply ? "apply" : "preview",
      sheet: planned.report,
      directory: { before: directoryBefore, after: planned.companies.length },
      pages: { before: pagesBefore, total: planned.pages.length, country: count("country"), state: count("state"), city: count("city") },
      rows: planned.pages.map((p) => ({ slug: p.slug, url: pageUrl(p.slug), name: p.name, type: p.type, country: p.countryName, state: p.stateName, companies: p.companyCount })),
      warnings,
    };
    if (withPlan) result._plan = planned;
    if (!apply) {
      result.tookMs = Date.now() - started;
      return result;
    }

    await upsertAll(Company, planned.companies);
    const gone = await Company.deleteMany({ slug: { $nin: planned.companies.map((c) => c.slug) } });
    result.directory.removed = gone.deletedCount;
    log(`companies saved: ${planned.companies.length}, removed: ${gone.deletedCount}`);

    await upsertAll(Page, planned.pages);
    await Page.deleteMany({ slug: { $nin: planned.pages.map((p) => p.slug) } });
    log(`pages saved: ${planned.pages.length}`);
    publicCache.clear();

    // A local database must never poke the live website (FRONTEND_URL in .env points to it).
    if (/localhost|127.0.0.1/.test(process.env.MONGO_URI || "")) {
      log("local database: website revalidation skipped");
    } else {
      const paths = [...revalidate, ...planned.pages.map((p) => pageUrl(p.slug))];
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
    const pages = result.rows.map((r) => ({ Page: r.name, URL: r.url, Type: r.type, Country: r.country, State: r.state, Companies: r.companies }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(pages), "Pages");
    const placements = (result._plan?.companies || []).map((c) => ({
      Company: c.companyName, URL: profileUrl(c.slug), City: c.companyCity, State: c.companyState, Country: c.companyCountry,
      "City page": c.cityPageSlug, "State page": c.statePageSlug, "Country page": c.countryPageSlug, "Index eligible": c.indexEligible ? "Y" : "N",
    }));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(placements), "Companies");
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Warning"], ...(result.warnings || []).map((w) => [w])]), "Warnings");
    return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  return { run, buildReportWorkbook };
}

module.exports = { createDirectoryImport };
