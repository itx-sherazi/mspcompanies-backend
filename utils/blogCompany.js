const ManagedItCompany = require("../models/ManagedItCompany");
const MsspCompany = require("../models/MsspCompany");
const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const Vendor = require("../models/Vendor");

// Every directory a blog can be written for. `path` is the profile page of a company on the website.
const DIRECTORIES = {
  msp: { label: "MSP", model: ManagedItCompany, path: "/managed-it-services" },
  mssp: { label: "MSSP", model: MsspCompany, path: "/managed-security-service-providers" },
  cyber: { label: "Cybersecurity", model: CyberSecurityCompany, path: "/cybersecurity-companies" },
  vendor: { label: "Vendor", model: Vendor, path: "/tools" },
};
const KEYS = Object.keys(DIRECTORIES);

const cleanDirectory = (v) => (KEYS.includes(String(v)) ? String(v) : "msp");
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One shape for every directory, so the dashboard and the website do not care where a company comes from. */
function toCard(key, c) {
  const d = DIRECTORIES[key];
  const isVendor = key === "vendor";
  return {
    directory: key,
    directoryLabel: d.label,
    slug: c.slug,
    companyName: isVendor ? c.name : c.companyName,
    image: (isVendor ? c.logoUrl : c.image) || "",
    description: c.description || "",
    tagline: c.tagline || "",
    website: c.website || "",
    companyCity: isVendor ? c.city || c.hq || "" : c.companyCity || "",
    companyState: isVendor ? c.state || "" : c.companyState || "",
    profilePath: `${d.path}/${c.slug}`,
  };
}

/** Search by name in one directory, or in all of them when `directory` is "all". */
async function searchDirectories(q, directory, limit) {
  const keys = directory === "all" ? KEYS : [cleanDirectory(directory)];
  const rx = new RegExp(escapeRegex(q), "i");
  const lists = await Promise.all(
    keys.map(async (key) => {
      const isVendor = key === "vendor";
      const rows = await DIRECTORIES[key].model
        .find(isVendor ? { name: rx } : { companyName: rx })
        .select(isVendor ? "slug name logoUrl website city state hq" : "slug companyName image website companyCity companyState")
        .limit(limit)
        .lean();
      return rows.map((r) => toCard(key, r));
    }),
  );
  return lists.flat().slice(0, directory === "all" ? limit * 2 : limit);
}

/** The full card of one company, for the blog page. Null when it does not exist or is hidden. */
async function findCompanyCard(directory, slug) {
  const key = cleanDirectory(directory);
  const isVendor = key === "vendor";
  const filter = isVendor ? { slug } : { slug, isPublished: { $ne: false } };
  const c = await DIRECTORIES[key].model
    .findOne(filter)
    .select(isVendor ? "slug name logoUrl description website city state hq" : "slug companyName image description tagline companyCity companyState website")
    .lean();
  return c ? toCard(key, c) : null;
}

/** Names of the companies of many blogs at once (the blog list). Returns Map of "directory|slug" to name. */
async function companyNames(pairs) {
  const map = new Map();
  await Promise.all(
    KEYS.map(async (key) => {
      const slugs = [...new Set(pairs.filter((p) => cleanDirectory(p.directory) === key && p.slug).map((p) => p.slug))];
      if (!slugs.length) return;
      const isVendor = key === "vendor";
      const rows = await DIRECTORIES[key].model.find({ slug: { $in: slugs } }).select(isVendor ? "slug name" : "slug companyName").lean();
      rows.forEach((r) => map.set(`${key}|${r.slug}`, isVendor ? r.name : r.companyName));
    }),
  );
  return map;
}

module.exports = { DIRECTORIES, cleanDirectory, searchDirectories, findCompanyCard, companyNames };
