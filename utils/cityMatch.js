/** Hub URL slug decides the MIT field: city slug → companyCity, state slug → companyState. */

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cityKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const US_STATE_ALIASES = {
  alabama: ["al"],
  alaska: ["ak"],
  arizona: ["az"],
  arkansas: ["ar"],
  california: ["ca"],
  colorado: ["co"],
  connecticut: ["ct"],
  delaware: ["de"],
  "district-of-columbia": ["dc", "washington-dc"],
  florida: ["fl"],
  georgia: ["ga"],
  hawaii: ["hi"],
  idaho: ["id"],
  illinois: ["il"],
  indiana: ["in"],
  iowa: ["ia"],
  kansas: ["ks"],
  kentucky: ["ky"],
  louisiana: ["la"],
  maine: ["me"],
  maryland: ["md"],
  massachusetts: ["ma"],
  michigan: ["mi"],
  minnesota: ["mn"],
  mississippi: ["ms"],
  missouri: ["mo"],
  montana: ["mt"],
  nebraska: ["ne"],
  nevada: ["nv"],
  "new-hampshire": ["nh"],
  "new-jersey": ["nj"],
  "new-mexico": ["nm"],
  "new-york": ["ny"],
  "north-carolina": ["nc"],
  "north-dakota": ["nd"],
  ohio: ["oh"],
  oklahoma: ["ok"],
  oregon: ["or"],
  pennsylvania: ["pa"],
  "rhode-island": ["ri"],
  "south-carolina": ["sc"],
  "south-dakota": ["sd"],
  tennessee: ["tn"],
  texas: ["tx"],
  utah: ["ut"],
  vermont: ["vt"],
  virginia: ["va"],
  washington: ["wa"],
  "west-virginia": ["wv"],
  wisconsin: ["wi"],
  wyoming: ["wy"],
};

/** CMS typos that still need to resolve to a real state slug. */
const HUB_SLUG_FIXES = {
  lowa: "iowa",
};

/** Extra city-name spellings that appear in the MIT sheet. */
const CITY_NAME_ALIASES = {
  "washington-dc": ["washington", "washington dc", "washington d.c.", "dc", "d.c.", "district of columbia"],
  "new-york": ["nyc", "new york city"],
  "new-orleans": ["new orleans"],
};

/** Known /msp city hubs so matching works before admin fills State. */
const CITY_STATE_FALLBACK = {
  atlanta: "Georgia",
  austin: "Texas",
  baltimore: "Maryland",
  boston: "Massachusetts",
  charlotte: "North Carolina",
  chicago: "Illinois",
  cincinnati: "Ohio",
  cleveland: "Ohio",
  columbus: "Ohio",
  dallas: "Texas",
  denver: "Colorado",
  detroit: "Michigan",
  fresno: "California",
  houston: "Texas",
  indianapolis: "Indiana",
  jacksonville: "Florida",
  "las-vegas": "Nevada",
  "los-angeles": "California",
  memphis: "Tennessee",
  miami: "Florida",
  minneapolis: "Minnesota",
  nashville: "Tennessee",
  "new-orleans": "Louisiana",
  "new-york": "New York",
  "oklahoma-city": "Oklahoma",
  omaha: "Nebraska",
  "orange-county": "California",
  orlando: "Florida",
  philadelphia: "Pennsylvania",
  phoenix: "Arizona",
  pittsburgh: "Pennsylvania",
  portland: "Oregon",
  raleigh: "North Carolina",
  richmond: "Virginia",
  sacramento: "California",
  "salt-lake-city": "Utah",
  "san-antonio": "Texas",
  "san-diego": "California",
  "san-francisco": "California",
  seattle: "Washington",
  tampa: "Florida",
  tucson: "Arizona",
  "virginia-beach": "Virginia",
  "washington-dc": "District of Columbia",
  wichita: "Kansas",
};

function canonicalHubSlug(city) {
  const slug = String(city?.slug || "").trim().toLowerCase();
  return HUB_SLUG_FIXES[slug] || slug;
}

function titleCaseSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isUsStateKey(key) {
  if (!key) return false;
  if (US_STATE_ALIASES[key]) return true;
  for (const [name, abbrs] of Object.entries(US_STATE_ALIASES)) {
    if (abbrs.includes(key)) return true;
  }
  return false;
}

/** True when /msp/{slug} is a US state page, not a city page. New York stays a city hub. */
function isStateHub(city) {
  const rawSlug = String(city?.slug || "").trim().toLowerCase();
  if (CITY_STATE_FALLBACK[rawSlug] || CITY_NAME_ALIASES[rawSlug]) return false;
  const slug = canonicalHubSlug(city);
  if (CITY_STATE_FALLBACK[slug]) return false;
  const nameKey = cityKey(city?.name);
  return isUsStateKey(slug) || isUsStateKey(nameKey);
}

function resolveCityState(city) {
  if (isStateHub(city)) return displayStateName(city);
  const explicit = String(city?.state || "").trim();
  if (explicit) return explicit;
  const rawSlug = String(city?.slug || "").trim().toLowerCase();
  return CITY_STATE_FALLBACK[rawSlug] || CITY_STATE_FALLBACK[canonicalHubSlug(city)] || "";
}

function displayStateName(city) {
  const slug = canonicalHubSlug(city);
  if (US_STATE_ALIASES[slug]) return titleCaseSlug(slug);
  const name = String(city?.name || "").trim();
  return name || titleCaseSlug(slug);
}

function stateKeys(value) {
  const key = cityKey(value);
  if (!key) return [];
  if (US_STATE_ALIASES[key]) return [key, ...US_STATE_ALIASES[key]];
  for (const [name, abbrs] of Object.entries(US_STATE_ALIASES)) {
    if (abbrs.includes(key)) return [name, ...abbrs];
  }
  return [key];
}

function hubStateKeys(city) {
  const keys = new Set([
    ...stateKeys(canonicalHubSlug(city)),
    ...stateKeys(city?.name),
    ...stateKeys(displayStateName(city)),
  ]);
  keys.delete("");
  return [...keys];
}

function cityMatchVariants(city) {
  const name = String(city?.name || "").trim();
  const slug = String(city?.slug || "").trim().toLowerCase();
  const extras = CITY_NAME_ALIASES[slug] || [];
  const raw = [
    name,
    slug,
    slug.replace(/-/g, " "),
    cityKey(name).replace(/-/g, " "),
    ...extras,
  ];
  return [...new Set(raw.map((s) => String(s || "").trim()).filter(Boolean))];
}

function hubCityKeys(city) {
  const keys = new Set();
  cityMatchVariants(city).forEach((v) => keys.add(cityKey(v)));
  keys.delete("");
  return keys;
}

function matchesHubState(companyState, city) {
  const st = String(companyState || "").trim();
  if (!st) return false;
  const want = new Set(hubStateKeys(city));
  return stateKeys(st).some((k) => want.has(k));
}

function companyBelongsToCity(company, city) {
  if (!city) return false;
  if (isStateHub(city)) {
    return matchesHubState(company?.companyState, city);
  }
  const key = cityKey(company?.companyCity);
  if (!key || !hubCityKeys(city).has(key)) return false;
  const hubState = resolveCityState(city);
  if (!hubState) return true;
  const st = String(company?.companyState || "").trim();
  if (!st) return false;
  const want = new Set(stateKeys(hubState));
  return stateKeys(st).some((k) => want.has(k));
}

function exactFieldOr(field, variants) {
  const values = [...new Set((variants || []).map((v) => String(v || "").trim()).filter(Boolean))];
  if (!values.length) return null;
  return {
    $or: values.map((v) => ({
      [field]: { $regex: `^${escapeRegex(v.replace(/-/g, " "))}$`, $options: "i" },
    })),
  };
}

function mitCityFilter(city) {
  if (isStateHub(city)) {
    const stateClause = exactFieldOr("companyState", hubStateKeys(city).map((k) => k.replace(/-/g, " ")));
    if (!stateClause) return { _id: { $exists: false } };
    return {
      isPublished: { $ne: false },
      companyState: { $exists: true, $nin: ["", null] },
      ...stateClause,
    };
  }

  const cityClause = exactFieldOr("companyCity", cityMatchVariants(city));
  if (!cityClause) return { _id: { $exists: false } };
  const hubState = resolveCityState(city);
  const stateVariants = stateKeys(hubState);
  const filter = {
    isPublished: { $ne: false },
    companyCity: { $exists: true, $nin: ["", null] },
  };
  if (stateVariants.length) {
    const stateClause = exactFieldOr(
      "companyState",
      stateVariants.map((k) => k.replace(/-/g, " ")),
    );
    filter.$and = [cityClause, stateClause];
  } else {
    Object.assign(filter, cityClause);
  }
  return filter;
}

function companyBelongsToCountry(company, country) {
  const key = cityKey(company?.companyCountry);
  if (!key || !country) return false;
  return key === String(country.slug || "").toLowerCase() || key === cityKey(country.name);
}

function mitCountryFilter(country) {
  const variants = cityMatchVariants(country);
  if (!variants.length) return { _id: { $exists: false } };
  return {
    isPublished: { $ne: false },
    companyCountry: { $exists: true, $nin: ["", null] },
    $or: variants.map((v) => ({
      companyCountry: { $regex: `^${escapeRegex(v)}$`, $options: "i" },
    })),
  };
}

function mapMitToHubCompany(doc) {
  const industryTags = String(doc.industry || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    slug: doc.slug,
    companyName: doc.companyName,
    description: doc.description || "",
    address: doc.address || "",
    companyStreet: doc.companyStreet || "",
    companyCity: doc.companyCity || "",
    companyPostalCode: doc.companyPostalCode || "",
    companyServices: Array.isArray(doc.companyServices) ? doc.companyServices : [],
    companyPartners: Array.isArray(doc.companyPartners) ? doc.companyPartners : [],
    industryTags,
    keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
    employees: doc.employees || "",
    revenueSize: "",
    companyState: doc.companyState || "",
    companyCountry: doc.companyCountry || "",
    foundedYear: doc.foundedYear || null,
    phone: doc.phone || "",
    image: doc.image || "",
    website: doc.website || "",
    linkedinUrl: doc.linkedinUrl || "",
    facebookUrl: doc.facebookUrl || "",
    twitterUrl: doc.twitterUrl || "",
    naicsCodes: Array.isArray(doc.naicsCodes) ? doc.naicsCodes : [],
    sicCodes: Array.isArray(doc.sicCodes) ? doc.sicCodes : [],
    technologies: Array.isArray(doc.technologies) ? doc.technologies : [],
    vars: "",
    isSponsored: false,
  };
}

module.exports = {
  cityKey,
  cityMatchVariants,
  canonicalHubSlug,
  isStateHub,
  displayStateName,
  resolveCityState,
  companyBelongsToCity,
  companyBelongsToCountry,
  mitCityFilter,
  mitCountryFilter,
  mapMitToHubCompany,
};
