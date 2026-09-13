/** Strong match: Company City ↔ hub name/slug, and Company State ↔ hub state when known. */

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

/** Known /msp hubs so matching works before admin fills State. */
const CITY_STATE_FALLBACK = {
  atlanta: "Georgia",
  austin: "Texas",
  boston: "Massachusetts",
  charlotte: "North Carolina",
  chicago: "Illinois",
  dallas: "Texas",
  denver: "Colorado",
  houston: "Texas",
  "los-angeles": "California",
  miami: "Florida",
  minneapolis: "Minnesota",
  nashville: "Tennessee",
  "new-york": "New York",
  orlando: "Florida",
  philadelphia: "Pennsylvania",
  phoenix: "Arizona",
  portland: "Oregon",
  "san-antonio": "Texas",
  "san-diego": "California",
  "san-francisco": "California",
  seattle: "Washington",
  tampa: "Florida",
  "washington-dc": "District of Columbia",
};

function resolveCityState(city) {
  const explicit = String(city?.state || "").trim();
  if (explicit) return explicit;
  return CITY_STATE_FALLBACK[String(city?.slug || "").toLowerCase()] || "";
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

function cityMatchVariants(city) {
  const name = String(city?.name || "").trim();
  const slug = String(city?.slug || "").trim().toLowerCase();
  const spaced = slug.replace(/-/g, " ");
  const fromName = cityKey(name).replace(/-/g, " ");
  return [...new Set([name, slug, spaced, fromName].map((s) => String(s || "").trim()).filter(Boolean))];
}

function companyBelongsToCity(company, city) {
  const key = cityKey(company?.companyCity);
  if (!key || !city) return false;
  const cityOk = key === String(city.slug || "").toLowerCase() || key === cityKey(city.name);
  if (!cityOk) return false;

  const hubState = resolveCityState(city);
  if (!hubState) return true;
  const companyState = String(company?.companyState || "").trim();
  if (!companyState) return false;
  const want = new Set(stateKeys(hubState));
  return stateKeys(companyState).some((k) => want.has(k));
}

function mitCityFilter(city) {
  const variants = cityMatchVariants(city);
  if (!variants.length) return { _id: { $exists: false } };
  const cityClause = {
    $or: variants.map((v) => ({
      companyCity: { $regex: `^${escapeRegex(v)}$`, $options: "i" },
    })),
  };
  const hubState = resolveCityState(city);
  const stateVariants = stateKeys(hubState);
  const filter = {
    isPublished: { $ne: false },
    companyCity: { $exists: true, $nin: ["", null] },
  };
  if (stateVariants.length) {
    filter.$and = [
      cityClause,
      {
        $or: stateVariants.map((v) => ({
          companyState: { $regex: `^${escapeRegex(v.replace(/-/g, " "))}$`, $options: "i" },
        })),
      },
    ];
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
  resolveCityState,
  companyBelongsToCity,
  companyBelongsToCountry,
  mitCityFilter,
  mitCountryFilter,
  mapMitToHubCompany,
};
