const ManagedItCompany = require("../models/ManagedItCompany");
const City = require("../models/City");
const publicCache = require("../utils/memoryCache");
const { createDirectoryController } = require("./directoryController");

/** The published city, state and country pages this company is listed on, for the end of its profile. */
async function listedOn(company) {
  const key = `listedOn|${company.slug}`;
  let out = publicCache.get(key);
  if (!out) {
    const pages = await City.find({ isPublished: true, "hubCompanies.slug": company.slug })
      .select("name slug hubSlug state")
      .lean();
    out = pages
      .map((p) => ({
        name: p.name,
        state: p.state || "",
        path: p.hubSlug === "top-msps" ? `/top-msps/${p.slug}` : `/msp/${p.slug}`,
        country: p.hubSlug === "top-msps",
      }))
      // city and state pages first, country pages last, each group by name
      .sort((a, b) => Number(a.country) - Number(b.country) || a.name.localeCompare(b.name));
    publicCache.set(key, out);
  }
  return { listedOn: out };
}

module.exports = createDirectoryController(ManagedItCompany, { decorate: listedOn });
