/**
 * MSSP master sheet engine. Reads the sheet with the same code as the MSP master sheet, then decides the
 * /mssp pages: one per country, plus every state and city that has enough companies. No database access.
 */
const { parseMasterBuffer, makeSlug, norm } = require("./masterSheet");
const { createSafeSlug } = require("./companyData");

const { STATES: WANTED_STATES, CITIES: WANTED_CITIES, MIN_COUNTRY } = require("../config/msspPages");

// The same region written two ways in the sheet. Used for grouping and page names only, the company keeps its own text.
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
};
const COUNTRY_ALIASES = { usa: "United States", us: "United States", "united states of america": "United States", uk: "United Kingdom", "great britain": "United Kingdom", holland: "Netherlands", deutschland: "Germany" };

const s = (v) => (v === null || v === undefined ? "" : String(v).trim());
const slugOf = (t) => createSafeSlug(s(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")).replace(/_+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

function placeOf(c) {
  const country = COUNTRY_ALIASES[norm(c.companyCountry)] || s(c.companyCountry);
  const state = STATE_ALIASES[norm(c.companyState)] || s(c.companyState);
  return { country, state, city: s(c.companyCity) };
}

/** Most common spelling wins as the page name. */
function topName(counter) {
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Pages for the whole sheet.
 * @returns {{ pages: object[], placeOf: Map }}  pages: { type, name, slug, key, state, stateSlug, country, countrySlug, count }
 */
function planPages(companies) {
  const wantedStates = new Set(WANTED_STATES.map(([c, n]) => `${norm(c)}|${norm(n)}`));
  const wantedCities = new Set(WANTED_CITIES.map(([c, n]) => `${norm(c)}|${norm(n)}`));
  const countries = new Map();
  const states = new Map();
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
  const cities = new Map();

  const bump = (map, key, names, extra) => {
    if (!map.has(key)) map.set(key, { count: 0, names: new Map(), ...extra });
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
    if (p.country) bump(countries, norm(p.country), { name: p.country }, {});
    if (p.country && p.state) bump(states, `${norm(p.country)}|${norm(p.state)}`, { name: p.state, country: p.country }, {});
    if (p.country && p.city) bump(cities, cityKey(p), { name: p.city, country: p.country, state: p.state }, {});
  }

  const cand = [];
  for (const [key, e] of countries) if (e.count >= MIN_COUNTRY) cand.push({ type: "country", key, name: topName(e.name), country: topName(e.name), state: "", count: e.count });
  for (const [key, e] of states) if (wantedStates.has(key)) cand.push({ type: "state", key, name: topName(e.name), country: topName(e.country), state: "", count: e.count });
  for (const [key, e] of cities) if (wantedCities.has(`${norm(topName(e.country))}|${norm(topName(e.name))}`)) cand.push({ type: "city", key, name: topName(e.name), country: topName(e.country), state: e.state ? topName(e.state) : "", count: e.count });

  // A city that is also its own state (Berlin, Zurich, Auckland): one page, the state page.
  const stateByKey = new Set(cand.filter((x) => x.type === "state").map((x) => `${norm(x.country)}|${norm(x.name)}`));
  const pages = cand.filter((x) => !(x.type === "city" && stateByKey.has(`${norm(x.country)}|${norm(x.name)}`) && norm(x.state) === norm(x.name)));

  // Slugs. A name used by several pages (Georgia the country and Georgia the state, Vienna in two countries)
  // keeps the plain slug for the most important page and a qualified slug for the others.
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
    return `${pg.base}-${slugOf(pg.state) || slugOf(pg.country)}`;
  };
  for (const [base, group] of groups) {
    if (group.length === 1) { group[0].slug = base; continue; }
    const country = group.find((x) => x.type === "country");
    const cityList = group.filter((x) => x.type === "city");
    const oneCountry = new Set(group.map((x) => norm(x.country))).size === 1;
    const winner = country || (oneCountry && cityList.length === 1 ? cityList[0] : null);
    for (const pg of group) pg.slug = pg === winner ? base : qualify(pg, group);
  }
  // Safety net: any slug still taken gets the country, then a number.
  for (const pg of pages.sort((a, b) => ({ country: 0, city: 1, state: 2 }[a.type] - { country: 0, city: 1, state: 2 }[b.type]))) {
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

/** The company document stored in MsspCompany. */
function toMsspCompany(c, slug, pageSlugs) {
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
 * Whole plan: company documents with their unique slugs and page slugs, and the page documents.
 */
function planMssp(buffer) {
  const { companies, report } = parseMasterBuffer(buffer);
  const plan = planPages(companies);
  const used = new Set();
  const docs = companies.map((c) => {
    const p = placeOf(c);
    const slug = makeSlug(c, used);
    const cityPage = p.city && p.country ? plan.cityByKey.get(plan.cityKey(p)) || "" : "";
    const statePage = p.state && p.country ? plan.stateSlugByKey.get(`${norm(p.country)}|${norm(p.state)}`) || "" : "";
    return toMsspCompany(c, slug, {
      cityPageSlug: cityPage,
      statePageSlug: statePage,
      countryPageSlug: p.country ? plan.countrySlugByKey.get(norm(p.country)) || "" : "",
    });
  });
  // A city-state (Berlin) has no city page of its own: the state page serves as its city page too.
  for (const d of docs) if (!d.cityPageSlug && d.statePageSlug && norm(d.companyCity) === norm(STATE_ALIASES[norm(d.companyState)] || d.companyState)) d.cityPageSlug = d.statePageSlug;

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
  return { companies: docs, pages, report, noPage: docs.filter((d) => !d.countryPageSlug).length };
}

module.exports = { planMssp, planPages, toMsspCompany };
