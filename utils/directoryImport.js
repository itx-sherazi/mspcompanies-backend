/**
 * Master sheet import for a directory with location pages (MSSP, cybersecurity): preview (no writes), report
 * (Excel), or apply.
 *
 *  1. Read the sheet (at most 5,000 companies). A sheet with no companies is ignored.
 *  2. Merge it with the companies already in the directory: a company that is already there is UPDATED (a blank
 *     cell never wipes a stored value, the slug stays), a new company is ADDED. Nothing is ever deleted.
 *  3. Work out the country / state / city pages from the whole directory, not only from the sheet.
 *  4. Apply: save the companies and the pages. A page that no longer qualifies is unpublished, not deleted.
 *  5. No backup copy is kept anywhere. Run a preview first.
 */
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");
const { mergeWithExisting, existingToCleaned } = require("./masterSheet");

const CHUNK = 500;
const PAGE_LINKS = ["cityPageSlug", "statePageSlug", "countryPageSlug"];

async function bulkInChunks(Model, ops) {
  for (let i = 0; i < ops.length; i += CHUNK) await Model.bulkWrite(ops.slice(i, i + CHUNK), { ordered: false });
}

/**
 * @param Company, Page   the two models
 * @param parse           (buffer) => { companies, report }   the sheet, cleaned
 * @param build           (companies) => { companies, pages }  documents with slugs and the pages
 * @param pageUrl         (slug) => public path of a page
 * @param profileUrl      (slug) => public path of a company profile (for the report)
 * @param revalidate      public paths to refresh besides the pages
 */
function createDirectoryImport({ Company, Page, parse, build, pageUrl, profileUrl, revalidate }) {
  async function run({ buffer, apply = false, withPlan = false, log = () => {} }) {
    const started = Date.now();
    const { companies: sheetCompanies, report } = parse(buffer);
    const [directoryBefore, pagesBefore] = await Promise.all([Company.estimatedDocumentCount(), Page.estimatedDocumentCount()]);

    // A sheet without companies changes nothing.
    if (!sheetCompanies.length) {
      return {
        ok: true,
        ignored: true,
        mode: apply ? "apply" : "preview",
        message: "The sheet has no companies, so nothing was changed.",
        sheet: report,
        directory: { before: directoryBefore, after: directoryBefore, added: 0, updated: 0, kept: directoryBefore },
        pages: { before: pagesBefore, total: pagesBefore, country: 0, state: 0, city: 0 },
        rows: [],
        warnings: [],
        tookMs: Date.now() - started,
      };
    }

    const existing = await Company.find({}).lean();
    const merged = mergeWithExisting(sheetCompanies, existing);
    const planned = build(merged.companies);
    const count = (type) => planned.pages.filter((p) => p.type === type).length;

    const warnings = [];
    if (report.unknownHeaders.length) warnings.push(`Columns not saved (not in the master sheet): ${report.unknownHeaders.join(", ")}`);
    if (report.skippedDuplicates) warnings.push(`${report.skippedDuplicates} duplicate rows skipped, for example ${report.duplicateExamples.slice(0, 3).join("; ")}`);
    if (report.skippedNoName) warnings.push(`${report.skippedNoName} rows without a company name skipped.`);
    const noCountry = planned.companies.filter((c) => !c.countryPageSlug).length;
    if (noCountry) warnings.push(`${noCountry} companies are on no country page (no country, or a country with too few companies). They stay in the directory.`);
    const noIndex = planned.companies.filter((c) => !c.indexEligible).length;
    if (noIndex) warnings.push(`${noIndex} of ${planned.companies.length} companies are not marked Index Eligible (Y). Profiles are only indexed when the website switch INDEX_PROFILES is on and the company is Index Eligible.`);

    const result = {
      ok: true,
      mode: apply ? "apply" : "preview",
      sheet: report,
      directory: { before: directoryBefore, after: planned.companies.length, added: merged.added, updated: merged.updated, kept: merged.untouched },
      pages: { before: pagesBefore, total: planned.pages.length, country: count("country"), state: count("state"), city: count("city") },
      rows: planned.pages.map((p) => ({ slug: p.slug, url: pageUrl(p.slug), name: p.name, type: p.type, country: p.countryName, state: p.stateName, companies: p.companyCount })),
      warnings,
    };
    if (withPlan) result._plan = planned;
    if (!apply) {
      result.tookMs = Date.now() - started;
      return result;
    }

    // Companies from the sheet (new or updated) are saved whole. A stored company the sheet does not mention only gets
    // its page links refreshed, because the pages are worked out again from the whole directory.
    const oldLinks = new Map(existing.map((d) => [d.slug, d]));
    const ops = [];
    for (const { _untouched, ...doc } of planned.companies) {
      if (!_untouched) {
        ops.push({ updateOne: { filter: { slug: doc.slug }, update: { $set: doc }, upsert: true } });
        continue;
      }
      const old = oldLinks.get(doc.slug) || {};
      if (PAGE_LINKS.some((k) => (old[k] || "") !== doc[k])) {
        ops.push({ updateOne: { filter: { slug: doc.slug }, update: { $set: Object.fromEntries(PAGE_LINKS.map((k) => [k, doc[k]])) } } });
      }
    }
    await bulkInChunks(Company, ops);
    log(`companies saved: ${merged.added} added, ${merged.updated} updated, ${merged.untouched} left as they were`);

    await bulkInChunks(Page, planned.pages.map((p) => ({ updateOne: { filter: { slug: p.slug }, update: { $set: p }, upsert: true } })));
    await Page.updateMany({ slug: { $nin: planned.pages.map((p) => p.slug) } }, { $set: { isPublished: false } });
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

  /**
   * Work the location pages out again from the companies stored now, without a sheet. Used after a company is added,
   * edited or deleted in the dashboard: a new city or state can move it to another page. Only the page links of the
   * companies change, and the pages (their counts) are saved again.
   */
  async function relink() {
    const existing = await Company.find({}).lean();
    const planned = existing.length ? build(existing.map(existingToCleaned)) : { companies: [], pages: [] };
    const old = new Map(existing.map((d) => [d.slug, d]));
    const ops = [];
    for (const doc of planned.companies) {
      const was = old.get(doc.slug) || {};
      if (PAGE_LINKS.some((k) => (was[k] || "") !== doc[k])) {
        ops.push({ updateOne: { filter: { slug: doc.slug }, update: { $set: Object.fromEntries(PAGE_LINKS.map((k) => [k, doc[k]])) } } });
      }
    }
    await bulkInChunks(Company, ops);
    await bulkInChunks(Page, planned.pages.map((p) => ({ updateOne: { filter: { slug: p.slug }, update: { $set: p }, upsert: true } })));
    await Page.updateMany({ slug: { $nin: planned.pages.map((p) => p.slug) } }, { $set: { isPublished: false } });
    publicCache.clear();
  }

  /** Excel report made from a preview: the pages, and the page every company lands on. */
  function buildReportWorkbook(result) {
    const xlsx = require("xlsx");
    const wb = xlsx.utils.book_new();
    const summary = [
      ["Mode", result.mode],
      ["Sheet rows", result.sheet.sheetRows],
      ["Companies in the sheet", result.sheet.kept],
      ["Duplicates skipped", result.sheet.skippedDuplicates],
      ["Companies added", result.directory.added],
      ["Companies updated", result.directory.updated],
      ["Companies left as they were", result.directory.kept],
      ["Directory before", result.directory.before],
      ["Directory after", result.directory.after],
      ["Index Eligible in the sheet", result.sheet.indexEligible],
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

  return { run, buildReportWorkbook, relink };
}

module.exports = { createDirectoryImport };
