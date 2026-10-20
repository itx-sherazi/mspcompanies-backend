/**
 * Publishing an approved Get Listed request.
 *
 * The company goes into the MAIN directory (the master data) and from there onto every city, state and
 * country page it belongs to, by the same rules the Master Sheet import uses. It is marked fromListing,
 * so every later Master Sheet import keeps it (and places it again).
 */
const City = require("../models/City");
const ManagedItCompany = require("../models/ManagedItCompany");
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");
const { makeSlug, toDirectoryCompany, toHubCompany, ruleForPage, dedupeKeys } = require("./masterSheet");
const { CITY_RULES, US_STATES, COUNTRY_ALIASES } = require("../config/pageRules");
const { cleanCompanyData } = require("./companyData");
const { escapeRegex } = require("./escapeRegex");

const HUBS = ["managed-service-providers", "top-msps"];

const norm = (s) => String(s || "").trim().toLowerCase();
const titleCase = (s) => String(s || "").trim().replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

/** "US", "usa", "united states" -> "United States". Other names are title cased. */
function canonicalCountryName(value) {
  const alias = COUNTRY_ALIASES[norm(value)];
  return alias || titleCase(value) || "United States";
}

/** State of the page the person picked: a city page knows its state, a state page IS the state. */
function stateForPage(page) {
  const rule = CITY_RULES[String(page.slug || "").toLowerCase()];
  if (rule) return { state: rule.state, isStatePage: false };
  const st = US_STATES.find((s) => norm(s) === norm(page.name));
  if (st) return { state: st, isStatePage: true };
  return { state: String(page.state || "").trim(), isStatePage: false };
}

/** The ListingRequest as a company the engine understands. */
function listingToCompany(listing, page) {
  const { state, isStatePage } = stateForPage(page);
  const country = canonicalCountryName(listing.requestedCountry);
  const cleaned = cleanCompanyData({
    "Company Name": listing.companyName,
    "Short Description": listing.companyDescription,
    "Company Address": listing.mainOfficeAddress,
    "Company City": isStatePage ? "" : page.name,
    "Company State": state,
    "Company Country": country,
    Website: listing.website,
    "Company Linkedin Url": listing.linkedinUrl,
    "Company Phone": listing.phone,
    "Founded Year": listing.foundedYear,
    "# Employees": listing.companySize,
    "Logo Url": listing.logoUrl,
    "Company Services": (listing.services || []).join(", "),
    "Company Partners": (listing.partners || []).join(", "),
    Industry: listing.verticalFocus || "",
    Certifications: (listing.certifications || []).join(", "),
  });
  cleaned.fromListing = true;
  cleaned.listingRequestId = String(listing._id);
  cleaned.indexEligible = false; // an editor can switch this on once the profile has been reviewed
  return cleaned;
}

/**
 * @param listing ListingRequest document
 * @param page    the city / state page the visitor chose (City document)
 * @returns { slug, pages: [{ name, slug, kind }], duplicate? }
 */
async function publishListing(listing, page) {
  const company = listingToCompany(listing, page);

  // Same company already in the directory (same website and city, or same name, city and state)?
  const keys = dedupeKeys(company);
  const siteDomain = String(company.website || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  const candidates = await ManagedItCompany.find({
    $or: [
      { companyName: new RegExp("^" + escapeRegex(company.companyName) + "$", "i") },
      ...(siteDomain ? [{ website: new RegExp(escapeRegex(siteDomain), "i") }] : []),
    ],
  })
    .select("companyName website companyCity companyState")
    .lean();
  if (candidates.some((r) => dedupeKeys(r).some((k) => keys.includes(k)))) {
    const err = new Error("This company is already in the directory");
    err.code = "DUPLICATE";
    throw err;
  }

  // A slug nobody in the directory uses yet.
  const stem = String(company.companyName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taken = await ManagedItCompany.find({ slug: new RegExp("^" + escapeRegex(stem)) }).select("slug").lean();
  const slug = makeSlug(company, new Set(taken.map((x) => x.slug)));
  company._slug = slug;

  // Where it goes: every published page whose rule the company matches, plus the page the visitor chose.
  const pages = await City.find({ hubSlug: { $in: HUBS }, isPublished: true }).select("name slug state hubSlug").lean();
  const placed = [];
  for (const p of pages) {
    const rule = ruleForPage(p);
    const chosen = p.hubSlug === "managed-service-providers" && p.slug === page.slug;
    if (rule.kind === "skip" || !(chosen || rule.match(company))) continue;
    placed.push({ page: p, kind: rule.kind });
  }

  const dirDoc = toDirectoryCompany(company, slug);
  for (const kind of ["city", "state", "country"]) {
    const hit = placed.find((x) => x.kind === kind);
    dirDoc[`${kind}PageSlug`] = hit ? hit.page.slug : "";
    dirDoc[`${kind}PageName`] = hit ? hit.page.name : "";
  }
  await ManagedItCompany.create(dirDoc);

  const hub = { ...toHubCompany(company, slug), isSponsored: listing.featuredAddon === true };
  const done = [];
  for (const x of placed) {
    try {
      await City.updateOne({ _id: x.page._id, "hubCompanies.slug": { $ne: slug } }, { $push: { hubCompanies: hub } });
      done.push({ name: x.page.name, slug: x.page.slug, kind: x.kind, hub: x.page.hubSlug });
    } catch (e) {
      console.error(`publishListing: could not add to ${x.page.name}:`, e.message);
    }
  }
  publicCache.clear();

  const paths = ["/managed-it-services", `/managed-it-services/${slug}`, ...done.map((d) => (d.hub === "top-msps" ? `/top-msps/${d.slug}` : `/msp/${d.slug}`))];
  await revalidateFrontend(paths);
  return { slug, pages: done };
}

module.exports = { publishListing, listingToCompany, canonicalCountryName };
