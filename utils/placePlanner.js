/**
 * Shared by the MSSP and the cybersecurity directories: decides which country, state and city pages a master
 * sheet gets, gives every page a unique slug, and builds the company documents. No database access.
 *
 * rules:
 *   states, cities  : [[country, place]] lists, or null to use `min`
 *   min             : with no list, a state or city needs this many companies to get a page
 *   minCountry      : a country needs this many companies
 *   stateWinsName   : when a state and a city share a name (New York), the state keeps the plain slug
 *   dropSameAsParent: skip a city page that has exactly the companies of its state or country page
 */
const { makeSlug, norm } = require("./masterSheet");
const { createSafeSlug } = require("./companyData");

// The same region written two ways in a sheet. Used for grouping and page names only, the company keeps its own text.
const STATE_ALIASES = {
  bayern: "Bavaria",
  hessen: "Hesse",
  "nordrhein westfalen": "North Rhine-Westphalia",
  "noord holland": "North Holland",
  "zuid holland": "South Holland",
  "noord brabant": "North Brabant",
  andalucia: "Andalusia",
  catalunya: "Catalonia",
  "comunidad de madrid": "Community of Madrid",
  euskadi: "Basque Country",
  brussel: "Brussels",
  "rhone alpes": "Auvergne-Rhone-Alpes",
  "canton of zug": "Zug",
  "canton of bern": "Bern",
  niedersachsen: "Lower Saxony",
  lombardia: "Lombardy",
  piemonte: "Piedmont",
  toscana: "Tuscany",
  sicilia: "Sicily",
};
const CITY_ALIASES = { roma: "Rome", milano: "Milan", torino: "Turin", firenze: "Florence" };
const COUNTRY_ALIASES = { usa: "United States", us: "United States", "united states of america": "United States", uk: "United Kingdom", "great britain": "United Kingdom", holland: "Netherlands", deutschland: "Germany" };

const s = (v) => (v === null || v === undefined ? "" : String(v).trim());
const slugOf = (t) => createSafeSlug(s(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")).replace(/_+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

function placeOf(c) {
  const country = COUNTRY_ALIASES[norm(c.companyCountry)] || s(c.companyCountry);
  const state = STATE_ALIASES[norm(c.companyState)] || s(c.companyState);
  const city = CITY_ALIASES[norm(c.companyCity)] || s(c.companyCity);
  return { country, state, city };
}

/** Most common spelling wins as the page name. */
function topName(counter) {
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function planPages(companies, rules) {
  const { states: stateList = null, cities: cityList = null, min = Infinity, minCountry = 1, stateWinsName = false, dropSameAsParent = false } = rules;
  const wantedStates = stateList && new Set(stateList.map(([c, n]) => `${norm(c)}|${norm(n)}`));
  const wantedCities = cityList && new Set(cityList.map(([c, n]) => `${norm(c)}|${norm(n)}`));

  const countries = new Map();
  const states = new Map();
  const cities = new Map();
  const cityStates = new Map(); // country|city -> set of states, to tell Portland ME from Portland OR
  for (const c of companies) {
    const p = placeOf(c);
    if (p.city) {
      const k = `${norm(p.country)}|${norm(p.city)}`;
      if (!cityStates.has(k)) cityStates.set(k, new Set());
      if (p.state) cityStates.get(k).add(norm(p.state));
    }
  }
  const cityKey = (p) => {
    const base = `${norm(p.country)}|${norm(p.city)}`;
    return (cityStates.get(base)?.size || 0) > 1 ? `${base}|${norm(p.state)}` : base;
  };

  const bump = (map, key, names) => {
    if (!map.has(key)) map.set(key, { count: 0, names: new Map() });
    const e = map.get(key);
    e.count += 1;
    for (const [field, value] of Object.entries(names)) {
      if (!value) continue;
      if (!e[field]) e[field] = new Map();
      e[field].set(value, (e[field].get(value) || 0) + 1);
    }
  };
  for (const c of companies) {
    const p = placeOf(c);
    if (p.country) bump(countries, norm(p.country), { name: p.country });
    if (p.country && p.state) bump(states, `${norm(p.country)}|${norm(p.state)}`, { name: p.state, country: p.country });
    if (p.country && p.city) bump(cities, cityKey(p), { name: p.city, country: p.country, state: p.state });
  }

  const cand = [];
  for (const [key, e] of countries) if (e.count >= minCountry) cand.push({ type: "country", key, name: topName(e.name), country: topName(e.name), state: "", count: e.count });
  for (const [key, e] of states) {
    if (wantedStates ? wantedStates.has(key) : e.count >= min) cand.push({ type: "state", key, name: topName(e.name), country: topName(e.country), state: "", count: e.count });
  }
  for (const [key, e] of cities) {
    const listed = wantedCities ? wantedCities.has(`${norm(topName(e.country))}|${norm(topName(e.name))}`) : e.count >= min;
    if (listed) cand.push({ type: "city", key, name: topName(e.name), country: topName(e.country), state: e.state ? topName(e.state) : "", count: e.count });
  }

  const stateByKey = new Map(cand.filter((x) => x.type === "state").map((x) => [`${norm(x.country)}|${norm(x.name)}`, x]));
  const countryByName = new Map(cand.filter((x) => x.type === "country").map((x) => [norm(x.country), x]));
  const pages = cand.filter((x) => {
    if (x.type !== "city") return true;
    // A city that is also its own state (Berlin, Zurich, Auckland) with the same companies: one page, the state page.
    const parentState = x.state ? stateByKey.get(`${norm(x.country)}|${norm(x.state)}`) : null;
    const sameName = stateByKey.get(`${norm(x.country)}|${norm(x.name)}`);
    if (sameName && norm(x.state) === norm(x.name) && sameName.count <= x.count) return false;
    // A city page that would list exactly the companies of its state (or country) page adds nothing.
    if (dropSameAsParent) {
      const parent = parentState || countryByName.get(norm(x.country));
      if (parent && parent.count === x.count) return false;
    }
    return true;
  });

  // Slugs. A name used by several pages (Georgia the country and Georgia the state, Vienna in two countries)
  // keeps the plain slug for one page and a qualified slug for the others.
  const groups = new Map();
  for (const pg of pages) {
    pg.base = slugOf(pg.name);
    if (!groups.has(pg.base)) groups.set(pg.base, []);
    groups.get(pg.base).push(pg);
  }
  const used = new Set();
  const qualify = (pg, group) => {
    if (pg.type === "state") {
      const sameCountry = group.some((o) => o !== pg && norm(o.country) === norm(pg.country));
      return `${pg.base}-${sameCountry ? "state" : slugOf(pg.country)}`;
    }
    if (pg.state && slugOf(pg.state) === pg.base) return `${pg.base}-city`;
    return `${pg.base}-${slugOf(pg.state) || slugOf(pg.country)}`;
  };
  for (const [base, group] of groups) {
    if (group.length === 1) { group[0].slug = base; continue; }
    const country = group.find((x) => x.type === "country");
    const cityPages = group.filter((x) => x.type === "city");
    const statePages = group.filter((x) => x.type === "state");
    const oneCountry = new Set(group.map((x) => norm(x.country))).size === 1;
    let winner = country || null;
    if (!winner && oneCountry) {
      if (stateWinsName && statePages.length === 1) winner = statePages[0];
      else if (cityPages.length === 1) winner = cityPages[0];
    }
    for (const pg of group) pg.slug = pg === winner ? base : qualify(pg, group);
  }
  // Safety net: any slug still taken gets the country, then a number.
  const order = { country: 0, city: 1, state: 2 };
  for (const pg of pages.sort((a, b) => order[a.type] - order[b.type])) {
    let slug = pg.slug;
    if (used.has(slug)) slug = `${slug}-${slugOf(pg.country)}`;
    for (let n = 2; used.has(slug); n += 1) slug = `${pg.slug}-${n}`;
    pg.slug = slug;
    used.add(slug);
  }

  const countrySlugByKey = new Map(pages.filter((x) => x.type === "country").map((x) => [norm(x.country), x.slug]));
  const stateSlugByKey = new Map(pages.filter((x) => x.type === "state").map((x) => [x.key, x.slug]));
  for (const pg of pages) {
    pg.countrySlug = countrySlugByKey.get(norm(pg.country)) || "";
    pg.stateSlug = pg.type === "city" && pg.state ? stateSlugByKey.get(`${norm(pg.country)}|${norm(pg.state)}`) || "" : "";
  }
  const cityByKey = new Map(pages.filter((x) => x.type === "city").map((x) => [x.key, x.slug]));
  return { pages, countrySlugByKey, stateSlugByKey, cityByKey, cityKey };
}

/** The company document stored in a directory (same columns as the master sheet). */
function toCompanyDoc(c, slug, pageSlugs) {
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
    description: c.description || "",
    foundedYear: c.foundedYear ?? null,
    profileSummary: c.profileSummary || "",
    tagline: c.tagline || "",
    industriesServed: c.industriesServed || [],
    serviceArea: c.serviceArea || "",
    certifications: c.certifications || [],
    supportHours: c.supportHours || "",
    indexEligible: Boolean(c.indexEligible),
    clientSizeFocus: c.clientSizeFocus || "",
    specialization: c.specialization || "",
    complianceFrameworks: c.complianceFrameworks || [],
    bookingUrl: c.bookingUrl || "",
    googleMapsUrl: c.googleMapsUrl || "",
    faqs: Array.isArray(c.faqs) ? c.faqs : [],
    image: c.image || "",
    isPublished: true,
    ...pageSlugs,
  };
}

/**
 * Companies (already read from the sheet) -> company documents with unique slugs and page slugs, plus the pages.
 * `reservedSlugs` maps a company to a slug it must keep (the slug it already has on the live site).
 */
function planDirectoryPages(companies, rules, { reservedSlug = () => "" } = {}) {
  const plan = planPages(companies, rules);
  const used = new Set();
  const reserved = companies.map((c) => {
    const r = slugOf(reservedSlug(c));
    if (r && !used.has(r)) { used.add(r); return r; }
    return "";
  });
  const docs = companies.map((c, i) => {
    const p = placeOf(c);
    const slug = reserved[i] || makeSlug(c, used);
    const cityPage = p.city && p.country ? plan.cityByKey.get(plan.cityKey(p)) || "" : "";
    const statePage = p.state && p.country ? plan.stateSlugByKey.get(`${norm(p.country)}|${norm(p.state)}`) || "" : "";
    return toCompanyDoc(c, slug, {
      cityPageSlug: cityPage,
      statePageSlug: statePage,
      countryPageSlug: p.country ? plan.countrySlugByKey.get(norm(p.country)) || "" : "",
    });
  });
  // A city-state (Berlin) has no city page of its own: the state page serves as its city page too.
  for (const d of docs) {
    if (!d.cityPageSlug && d.statePageSlug && norm(d.companyCity) === norm(STATE_ALIASES[norm(d.companyState)] || d.companyState)) d.cityPageSlug = d.statePageSlug;
  }

  const count = (field) => {
    const m = new Map();
    for (const d of docs) if (d[field]) m.set(d[field], (m.get(d[field]) || 0) + 1);
    return m;
  };
  const byCity = count("cityPageSlug");
  const byState = count("statePageSlug");
  const byCountry = count("countryPageSlug");
  const pages = plan.pages.map((pg) => ({
    slug: pg.slug,
    type: pg.type,
    name: pg.name,
    stateName: pg.type === "city" && pg.stateSlug ? pg.state : "",
    stateSlug: pg.stateSlug,
    countryName: pg.country,
    countrySlug: pg.countrySlug,
    companyCount: (pg.type === "city" ? byCity : pg.type === "state" ? byState : byCountry).get(pg.slug) || 0,
    isPublished: true,
  }));
  return { companies: docs, pages };
}

module.exports = { planPages, planDirectoryPages, toCompanyDoc, placeOf, slugOf };
