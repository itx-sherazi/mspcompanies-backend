/**
 * Puts one Managed IT company on the city, state and country pages it belongs to, and takes it off the pages it no
 * longer belongs to. Used when a company is added or its location is changed in the dashboard, so the company moves
 * to the right pages at once, without a Master Sheet upload.
 *
 * It uses the same page rules as the Master Sheet import (ruleForPage), so both always agree. A sponsored copy stays
 * where it is. The other companies of a page are not changed.
 */
const City = require("../models/City");
const ManagedItCompany = require("../models/ManagedItCompany");
const { ruleForPage, existingToCleaned, toHubCompany, sortForDisplay } = require("./masterSheet");
const { revalidateFrontend } = require("./revalidateFrontend");

const HUBS = ["managed-service-providers", "top-msps"];
// MongoDB documents are limited to 16 MB; stay well below it (the same limit as the import).
const MAX_PAGE_DOC_BYTES = 12 * 1024 * 1024;

const pagePath = (page) => (page.hubSlug === "top-msps" ? `/top-msps/${page.slug}` : `/msp/${page.slug}`);

async function docSize(id) {
  const [row] = await City.aggregate([{ $match: { _id: id } }, { $project: { n: { $bsonSize: "$$ROOT" } } }]);
  return row ? row.n : 0;
}

/** @returns { added: [{name, path}], removed: [{name, path}], skipped: [{name, why}] } */
async function placeCompanyOnPages(slug) {
  const result = { added: [], removed: [], skipped: [] };
  const company = await ManagedItCompany.findOne({ slug }).lean();
  if (!company) return result;
  const cleaned = existingToCleaned(company);

  // Only the slugs and the sponsored flag of each page are read to decide; the page is loaded fully only when it changes.
  const pages = await City.find({ hubSlug: { $in: HUBS } })
    .select("name slug state hubSlug hubCompanies.slug hubCompanies.isSponsored")
    .lean();

  const touched = [];
  for (const page of pages) {
    const rule = ruleForPage(page);
    if (rule.kind === "skip") continue;
    const copy = (page.hubCompanies || []).find((c) => c.slug === slug);
    const belongs = rule.match(cleaned);

    if (belongs && !copy) {
      const full = await City.findById(page._id).select("hubCompanies").lean();
      const hub = toHubCompany(cleaned, slug);
      if ((await docSize(page._id)) + JSON.stringify(hub).length * 2 > MAX_PAGE_DOC_BYTES) {
        result.skipped.push({ name: page.name, why: "the page is full" });
        continue;
      }
      // Same order as the import: sponsored companies first, then the others by how complete they are.
      const sponsored = full.hubCompanies.filter((c) => c.isSponsored === true);
      const others = sortForDisplay([...full.hubCompanies.filter((c) => c.isSponsored !== true), hub]);
      await City.updateOne({ _id: page._id }, { $set: { hubCompanies: [...sponsored, ...others] } });
      result.added.push({ name: page.name, path: pagePath(page) });
      touched.push(page);
    } else if (!belongs && copy && copy.isSponsored !== true) {
      await City.updateOne({ _id: page._id }, { $pull: { hubCompanies: { slug } } });
      result.removed.push({ name: page.name, path: pagePath(page) });
      touched.push(page);
    }
  }

  if (touched.length && !/localhost|127.0.0.1/.test(process.env.MONGO_URI || "")) {
    revalidateFrontend(touched.map(pagePath)).catch(() => {});
  }
  return result;
}

module.exports = { placeCompanyOnPages };
