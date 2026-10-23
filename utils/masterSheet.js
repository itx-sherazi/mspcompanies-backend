/**
 * Master sheet engine: reads the master Excel, cleans every row, removes duplicates, and decides which
 * companies belong on which page (city / state / country). No database access here, so it can be tested
 * on its own. masterController.js does the saving.
 */
const xlsx = require("xlsx");
const { cleanCompanyData, createSafeSlug } = require("./companyData");
const { METRO_ENABLED, US_STATES, COUNTRY_ALIASES, CITY_RULES } = require("../config/pageRules");

const HUB_MANAGED_IT = "managed-service-providers";
const HUB_TOP_MSPS = "top-msps";

// Headers the master sheet may contain (anything else is reported, never silently dropped).
const KNOWN_HEADERS = [
  "Company Name", "# Employees", "Industry", "Website", "Company Linkedin Url", "Facebook Url", "Twitter Url",
  "Company Street", "Company City", "Company State", "Company Country", "Company Postal Code", "Company Address",
  "Keywords", "Company Phone", "Technologies", "Short Description", "Founded Year", "Logo Url", "Company Services",
  "Company Partners", "Revenue", "Profile Summary", "Tagline", "Industries Served", "Service Area",
  "Certifications", "Support Hours", "Index Eligible", "Client Size Focus", "Specialization",
  "Compliance Frameworks", "Booking/Contact URL", "City Slug", "State Slug", "Country Slug", "Google Maps URL", "Company FAQ",
  // older exports
  "SIC Codes", "NAICS Codes", "Employees Size", "ZIP Code", "Country", "LOGO", "FaceBook URL", "Twitter URL",
  "Company Linkedin URLs", "Phone Number", "Services", "VARS",
];
// One upload may hold at most this many companies, and a sheet may not be larger than this (a tiny file can
// declare a huge range and freeze the server while it is read).
const MAX_UPLOAD_COMPANIES = 10000;
const MAX_SHEET_ROWS = 20000;
const MAX_SHEET_COLUMNS = 80;
const REQUIRED_HEADERS = ["Company Name", "Website", "Company City", "Company State", "Company Country"];

// ── text helpers ─────────────────────────────────────────────────────────
const s = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** "St. Louis", "Saint Louis", "ST LOUIS" -> "st louis". Also strips accents. */
function norm(value) {
  return s(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bmount\b/g, "mt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function domainOf(url) {
  return s(url)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

/** "Acme IT, LLC" and "acme it" are the same company name. */
function nameKey(name) {
  return norm(name).replace(/\b(llc|inc|ltd|llp|corp|corporation|co|company|the|gmbh|bv|pty|limited|ag|sa|srl|spa|ab|as|aps|nv)\b/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Two rows are the same company when:
 *   same website domain AND same city   (a franchise that shares a website but sits in another city is kept), or
 *   same name AND same city AND same state (different website spelling).
 */
function dedupeKeys(c) {
  const city = norm(c.companyCity);
  const keys = [];
  const d = domainOf(c.website);
  if (d) keys.push(`d:${d}|${city}`);
  const n = nameKey(c.companyName);
  if (n) keys.push(`n:${n}|${city}|${norm(c.companyState)}`);
  return keys;
}

// ── page rules ───────────────────────────────────────────────────────────
const US_STATE_SET = new Set(US_STATES.map(norm));

function canonicalCountry(value) {
  const n = norm(value);
  return COUNTRY_ALIASES[n] ? norm(COUNTRY_ALIASES[n]) : n;
}

/**
 * Decide how a City document is filled. Returns
 *   { kind: "country"|"state"|"city"|"skip", label, match(company) -> boolean }
 */
function ruleForPage(page, { metro = METRO_ENABLED } = {}) {
  const slug = s(page.slug).toLowerCase();
  const nameN = norm(page.name);

  if (page.hubSlug === HUB_TOP_MSPS) {
    const want = canonicalCountry(page.name || slug.replace(/-/g, " "));
    return { kind: "country", label: `country = ${page.name}`, match: (c) => canonicalCountry(c.companyCountry) === want };
  }
  if (page.hubSlug !== HUB_MANAGED_IT) return { kind: "skip", label: "hub not covered by the master sheet", match: () => false };

  const rule = CITY_RULES[slug];
  if (rule) {
    const stateN = norm(rule.state);
    const exact = new Set(rule.cities.map(norm));
    const sameState = new Set();
    const crossState = new Set();
    if (metro && Array.isArray(rule.metro)) {
      for (const m of rule.metro) {
        const [cityPart, statePart] = String(m).split("|");
        if (statePart) crossState.add(`${norm(cityPart)}|${norm(statePart)}`);
        else sameState.add(norm(cityPart));
      }
    }
    const label = rule.region
      ? `cities in ${rule.state}: ${rule.cities.length} listed`
      : `city = ${rule.cities.join(" / ")}, ${rule.state}${metro && rule.metro ? ` + ${rule.metro.length} nearby cities` : ""}`;
    return {
      kind: "city",
      label,
      match: (c) => {
        const city = norm(c.companyCity);
        const st = norm(c.companyState);
        if (st === stateN && (exact.has(city) || sameState.has(city))) return true;
        return crossState.has(`${city}|${st}`);
      },
    };
  }

  if (US_STATE_SET.has(nameN)) {
    return { kind: "state", label: `state = ${page.name}`, match: (c) => norm(c.companyState) === nameN && canonicalCountry(c.companyCountry) === "united states" };
  }

  // A city page that is not in the rule table (created later in the dashboard).
  const stateN = norm(page.state);
  if (stateN) return { kind: "city", label: `city = ${page.name}, ${page.state}`, match: (c) => norm(c.companyCity) === nameN && norm(c.companyState) === stateN };
  return { kind: "city", label: `city = ${page.name} (any state, add a state to the page to narrow it)`, match: (c) => norm(c.companyCity) === nameN };
}

// ── reading the sheet ────────────────────────────────────────────────────
/**
 * @returns {{ companies: object[], report: object }}
 *   companies : cleaned, de-duplicated, each with `_row` (sheet row number)
 */
function parseMasterBuffer(buffer, { extraHeaders = [] } = {}) {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: "buffer", cellText: false, cellNF: false, raw: false, sheetRows: MAX_SHEET_ROWS + 1 });
  } catch (e) {
    const err = new Error("Invalid Excel file.");
    err.detail = e.message;
    throw err;
  }
  const sheetName = workbook.SheetNames.includes("Master") ? "Master" : workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (range && (range.e.r >= MAX_SHEET_ROWS || range.e.c >= MAX_SHEET_COLUMNS)) {
    const err = new Error(`The sheet is too large (more than ${MAX_SHEET_ROWS.toLocaleString("en-US")} rows or ${MAX_SHEET_COLUMNS} columns). Split it into smaller files.`);
    err.status = 400;
    throw err;
  }
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  // An empty sheet changes nothing: the callers see companies = [] and ignore the upload.
  if (!rows.length) {
    return { companies: [], report: { sheetName, sheetRows: 0, headers: 0, unknownHeaders: [], kept: 0, indexEligible: 0, withFaq: 0, skippedNoName: 0, skippedDuplicates: 0, duplicateExamples: [], empty: true } };
  }

  const headers = Object.keys(rows[0]);
  const missingRequired = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingRequired.length) {
    const err = new Error(`The sheet is missing required column(s): ${missingRequired.join(", ")}`);
    err.status = 400;
    throw err;
  }
  const unknownHeaders = headers.filter((h) => !KNOWN_HEADERS.includes(h) && !extraHeaders.includes(h));
  const named = rows.filter((r) => s(r["Company Name"])).length;
  if (named > MAX_UPLOAD_COMPANIES) {
    const err = new Error(`This sheet has ${named.toLocaleString("en-US")} companies. At most ${MAX_UPLOAD_COMPANIES.toLocaleString("en-US")} companies can be uploaded at a time, please split the file.`);
    err.status = 400;
    throw err;
  }

  const seen = new Set();
  const companies = [];
  const skipped = { noName: 0, duplicates: 0 };
  const duplicateExamples = [];

  rows.forEach((row, i) => {
    const cleaned = cleanCompanyData(row);
    if (!cleaned.companyName) {
      skipped.noName += 1;
      return;
    }
    // Company Address: keep what the sheet has, otherwise build it from the parts.
    if (!cleaned.address) {
      cleaned.address = [cleaned.companyStreet, cleaned.companyCity, cleaned.companyState, cleaned.companyCountry, cleaned.companyPostalCode].filter(Boolean).join(", ");
    }
    const keys = dedupeKeys(cleaned);
    if (keys.some((k) => seen.has(k))) {
      skipped.duplicates += 1;
      if (duplicateExamples.length < 10) duplicateExamples.push(`${cleaned.companyName} (${cleaned.companyCity || "no city"}) row ${i + 2}`);
      return;
    }
    keys.forEach((k) => seen.add(k));
    cleaned._row = i + 2;
    // An empty Index Eligible cell is "not said", so an update must not switch an existing profile off.
    cleaned._indexCell = s(row["Index Eligible"]) !== "";
    companies.push(cleaned);
  });

  return {
    companies,
    report: {
      sheetName,
      sheetRows: rows.length,
      headers: headers.length,
      unknownHeaders,
      kept: companies.length,
      indexEligible: companies.filter((c) => c.indexEligible).length,
      withFaq: companies.filter((c) => c.faqs && c.faqs.length).length,
      skippedNoName: skipped.noName,
      skippedDuplicates: skipped.duplicates,
      duplicateExamples,
      empty: companies.length === 0,
    },
  };
}

// ── ordering ─────────────────────────────────────────────────────────────
/** Fuller profiles first, so the best listings lead each page. */
function richness(c) {
  let score = 0;
  if (c.indexEligible) score += 1000;
  if (c.profileSummary) score += 120;
  score += Math.min(80, String(c.description || "").split(/\s+/).filter(Boolean).length);
  if (c.image) score += 30;
  if (c.companyServices?.length) score += 20;
  if (c.companyPartners?.length) score += 10;
  if (c.phone) score += 10;
  if (c.companyStreet) score += 10;
  if (c.certifications?.length) score += 10;
  return score;
}

function sortForDisplay(list) {
  return [...list].sort((a, b) => richness(b) - richness(a) || a.companyName.localeCompare(b.companyName));
}

// ── document builders ────────────────────────────────────────────────────
const PROFILE_FIELDS = [
  "profileSummary", "tagline", "industriesServed", "serviceArea", "certifications", "supportHours", "indexEligible",
  "clientSizeFocus", "specialization", "complianceFrameworks", "bookingUrl", "citySlug", "stateSlug", "countrySlug",
  "googleMapsUrl", "faqs",
];

function pickProfile(c) {
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (k === "faqs") out[k] = Array.isArray(c[k]) ? c[k] : [];
    else out[k] = c[k] === undefined ? "" : c[k];
  }
  return out;
}

/** Slug unique inside one page: acme-it, then acme-it-albany, then acme-it-albany-2. */
function makeSlug(c, used) {
  // createSafeSlug keeps underscores; URLs here use hyphens only.
  const hyphen = (t) => String(t || "").replace(/_+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const base = hyphen(createSafeSlug(c.companyName)) || "company";
  const cityPart = hyphen(createSafeSlug(c.companyCity || ""));
  const tries = [base, cityPart ? `${base}-${cityPart}` : null].filter(Boolean);
  for (const t of tries) {
    if (!used.has(t)) {
      used.add(t);
      return t;
    }
  }
  let n = 2;
  const stem = tries[tries.length - 1];
  while (used.has(`${stem}-${n}`)) n += 1;
  const slug = `${stem}-${n}`;
  used.add(slug);
  return slug;
}

/** Fields stored on a city / state / country page (City.hubCompanies). */
function toHubCompany(c, slug) {
  return {
    slug,
    companyName: c.companyName,
    description: c.description || "",
    address: c.address || "",
    companyStreet: c.companyStreet || "",
    companyCity: c.companyCity || "",
    companyState: c.companyState || "",
    companyCountry: c.companyCountry || "",
    companyPostalCode: c.companyPostalCode || "",
    revenueSize: c.revenueSize || "",
    companyServices: c.companyServices || [],
    companyPartners: c.companyPartners || [],
    industryTags: c.industryTags || [],
    keywords: c.keywords || [],
    employees: c.employees || "",
    foundedYear: c.foundedYear ?? null,
    phone: c.phone || "",
    image: c.image || "",
    website: c.website || "",
    linkedinUrl: c.linkedinUrl || "",
    facebookUrl: c.facebookUrl || "",
    twitterUrl: c.twitterUrl || "",
    naicsCodes: c.naicsCodes || [],
    sicCodes: c.sicCodes || [],
    technologies: c.technologies || [],
    vars: c.vars || "",
    // A company sponsored in the directory keeps its sponsored mark when a page is built again.
    isSponsored: c.isSponsored === true,
    ...pickProfile(c),
  };
}

/** Fields stored in the main directory (ManagedItCompany). */
function toDirectoryCompany(c, slug) {
  return {
    slug,
    companyName: c.companyName,
    employees: c.employees || "",
    revenueSize: c.revenueSize || "",
    industry: (c.industryTags || []).join(", "),
    website: c.website || "",
    companyServices: c.companyServices || [],
    companyPartners: c.companyPartners || [],
    linkedinUrl: c.linkedinUrl || "",
    facebookUrl: c.facebookUrl || "",
    twitterUrl: c.twitterUrl || "",
    companyStreet: c.companyStreet || "",
    companyCity: c.companyCity || "",
    companyState: c.companyState || "",
    companyCountry: c.companyCountry || "",
    companyPostalCode: c.companyPostalCode || "",
    address: c.address || "",
    keywords: c.keywords || [],
    phone: c.phone || "",
    technologies: c.technologies || [],
    sicCodes: c.sicCodes || [],
    naicsCodes: c.naicsCodes || [],
    description: c.description || "",
    foundedYear: c.foundedYear ?? null,
    image: c.image || "",
    isPublished: true,
    // Get Listed companies live in the directory too and are kept by every later import.
    fromListing: Boolean(c.fromListing),
    ...(c.listingRequestId ? { listingRequestId: c.listingRequestId } : {}),
    ...pickProfile(c),
  };
}

/** A stored directory document in the shape the engine works with (cleaned company). It keeps its own slug. */
function existingToCleaned(d) {
  return {
    ...d,
    industryTags: String(d.industry || "").split(",").map((x) => x.trim()).filter(Boolean),
    _slug: d.slug,
    _existing: true,
    fromListing: Boolean(d.fromListing),
  };
}

const isBlank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
// Fields of a cleaned company that a new sheet may fill. A blank cell in the sheet never wipes stored data.
const MERGE_FIELDS = [
  "description", "address", "companyStreet", "companyCity", "companyState", "companyCountry", "companyPostalCode", "revenueSize",
  "companyServices", "companyPartners", "industryTags", "keywords", "employees", "foundedYear", "phone", "image", "website",
  "linkedinUrl", "facebookUrl", "twitterUrl", "technologies",
  ...["profileSummary", "tagline", "industriesServed", "serviceArea", "certifications", "supportHours", "clientSizeFocus", "specialization", "complianceFrameworks", "bookingUrl", "googleMapsUrl", "faqs"],
];

/**
 * An upload adds new companies and updates the ones that are already in the directory. Nothing is deleted.
 *   sheetCompanies : cleaned companies of the sheet (parseMasterBuffer)
 *   existingDocs   : the documents stored in the directory now
 * Returns every company of the directory after the upload: the sheet companies (a match keeps the slug of the stored
 * company and any value the sheet leaves blank) plus the stored companies the sheet does not mention.
 */
function mergeWithExisting(sheetCompanies, existingDocs) {
  const existing = existingDocs.map(existingToCleaned);
  const byKey = new Map();
  for (const e of existing) for (const k of dedupeKeys(e)) if (!byKey.has(k)) byKey.set(k, e);
  // A sheet that carries the slug a company has now (cyber "Live Slug") is matched by that slug first. A stored company
  // without a city is also matched by its website alone, because the sheet may have filled in the city.
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  const noCityByDomain = new Map();
  for (const e of existing) if (!norm(e.companyCity) && domainOf(e.website) && !noCityByDomain.has(domainOf(e.website))) noCityByDomain.set(domainOf(e.website), e);
  const matched = new Set();
  let updated = 0;
  let added = 0;
  for (const c of sheetCompanies) {
    const taken = (e) => e && !matched.has(e);
    let hit = c._slug && bySlug.get(c._slug);
    if (!taken(hit)) hit = dedupeKeys(c).map((k) => byKey.get(k)).find(taken);
    if (!taken(hit) && domainOf(c.website)) hit = noCityByDomain.get(domainOf(c.website));
    if (!taken(hit)) {
      added += 1;
      continue;
    }
    matched.add(hit);
    updated += 1;
    c._slug = hit.slug;
    c._existing = true;
    for (const k of MERGE_FIELDS) if (isBlank(c[k]) && !isBlank(hit[k])) c[k] = hit[k];
    if (!c._indexCell) c.indexEligible = Boolean(hit.indexEligible);
    if (hit.isPublished === false) c.isPublished = false;
    if (hit.fromListing) c.fromListing = true;
    if (hit.listingRequestId) c.listingRequestId = hit.listingRequestId;
  }
  const untouched = existing.filter((e) => !matched.has(e)).map((e) => ({ ...e, _untouched: true }));
  return { companies: [...sheetCompanies, ...untouched], added, updated, untouched: untouched.length };
}

/** A directory document in the shape the engine works with (cleaned company). */
function directoryToCleaned(d) {
  return {
    ...d,
    industryTags: String(d.industry || "").split(",").map((x) => x.trim()).filter(Boolean),
    _slug: d.slug,
    fromListing: true,
  };
}

// ── distribution ─────────────────────────────────────────────────────────
/**
 * @param companies cleaned companies (parseMasterBuffer)
 * @param pages     plain City documents { _id, name, slug, state, hubSlug, hubCompanies }
 * @returns one plan entry per page. Sponsored companies already on a page are kept on top.
 */
function planDistribution(companies, pages, { metro = METRO_ENABLED, maxCompaniesPerPage = null } = {}) {
  return pages.map((page) => {
    const rule = ruleForPage(page, { metro });
    const existing = Array.isArray(page.hubCompanies) ? page.hubCompanies : [];
    // Kept on every page: sponsored companies. (Get Listed companies are in the directory, so the sheet engine places them.)
    const sponsored = existing.filter((c) => c && c.isSponsored === true);
    const before = { total: existing.length, sponsored: sponsored.length };

    if (rule.kind === "skip") return { page, rule, before, matched: 0, after: before.total, companies: null, trimmed: 0, dropped: [] };

    const sponsoredDomains = new Set(sponsored.map((c) => domainOf(c.website)).filter(Boolean));
    const sponsoredNames = new Set(sponsored.map((c) => nameKey(c.companyName)));
    let matched = sortForDisplay(companies.filter((c) => rule.match(c)));
    // Do not list a sponsored company twice.
    matched = matched.filter((c) => !(sponsoredDomains.has(domainOf(c.website)) || sponsoredNames.has(nameKey(c.companyName))));

    let trimmed = 0;
    if (maxCompaniesPerPage && matched.length > maxCompaniesPerPage) {
      trimmed = matched.length - maxCompaniesPerPage;
      matched = matched.slice(0, maxCompaniesPerPage);
    }

    const used = new Set(sponsored.map((c) => String(c.slug || "").toLowerCase()));
    const hub = matched.map((c) => {
      let slug = c._slug;
      if (!slug || used.has(slug)) slug = makeSlug(c, used);
      else used.add(slug);
      return toHubCompany(c, slug);
    });
    const final = [...sponsored.map((c) => (typeof c.toObject === "function" ? c.toObject() : c)), ...hub];

    // Companies on the page now that the sheet does not have: they disappear from the page on apply.
    const inSheet = new Set(companies.flatMap((c) => dedupeKeys(c)));
    const keptNow = new Set(sponsored);
    const dropped = existing
      .filter((c) => c && !keptNow.has(c))
      .filter((c) => !dedupeKeys(c).some((k) => inSheet.has(k)))
      .map((c) => ({ companyName: c.companyName, website: c.website || "", city: c.companyCity || "" }));
    return { page, rule, before, matched: matched.length, after: final.length, companies: final, trimmed, dropped };
  });
}

/** Directory documents (ManagedItCompany) with unique global slugs. */
function planDirectory(companies) {
  const used = new Set();
  return companies.map((c) => {
    let slug = c._slug && !used.has(c._slug) ? c._slug : makeSlug(c, used);
    used.add(slug);
    // The same slug is reused on the city / state / country pages, so a company has one profile URL everywhere
    // and the page copies can point their canonical to the directory profile.
    c._slug = slug;
    return toDirectoryCompany(c, slug);
  });
}

module.exports = {
  KNOWN_HEADERS,
  REQUIRED_HEADERS,
  norm,
  domainOf,
  nameKey,
  dedupeKeys,
  makeSlug,
  toHubCompany,
  toDirectoryCompany,
  directoryToCleaned,
  existingToCleaned,
  mergeWithExisting,
  MAX_UPLOAD_COMPANIES,
  parseMasterBuffer,
  ruleForPage,
  planDistribution,
  planDirectory,
  sortForDisplay,
};
