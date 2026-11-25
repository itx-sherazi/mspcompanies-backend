const ManagedItCompany = require("../models/ManagedItCompany");
const publicCache = require("../utils/memoryCache");

// One endpoint for every topic page (co-managed, HIPAA, CMMC, ...).
// A company is on a topic page only when its own profile data says so. Nothing is guessed.
// To add a page: add one entry here. `match` = the fields that decide membership.
// `query` is a ready filter (used when membership is a flag, not a word in the profile).
const TOPICS = {
  sponsored: { query: { isSponsored: true } },
  // Profiles that say they serve small business clients (their own words: "small business", "SMB", "small and mid-sized").
  "small-business": {
    regex: /\bsmall(?:[\s-]+(?:and|&)[\s-]+(?:mid|medium)[\s-]*sized?)?[\s-]+(?:business(?:es)?|compan(?:y|ies)|offices?)\b|\bsmbs?\b/i,
    match: ["clientSizeFocus", "industriesServed", "specialization", "tagline", "profileSummary", "description", "keywords"],
  },
  "co-managed": {
    regex: /co[\s-]?managed|comanaged/i,
    match: ["profileSummary", "description", "specialization", "tagline", "keywords", "companyServices"],
  },
  // Profiles that say they serve financial firms (their own words: banks, credit unions, RIAs, lenders, wealth managers...).
  financial: {
    regex: /financial|\bbank(?:s|ing)?\b|credit[\s-]+unions?|wealth[\s-]+manage|broker[\s-]?dealers?|investment[\s-]+(?:firms?|advis|manage)|\bRIAs?\b|\blenders?\b|mortgage|fintech|insurance/i,
    match: ["industriesServed", "specialization", "clientSizeFocus", "tagline", "profileSummary", "description", "keywords", "complianceFrameworks"],
  },
  // Examples for the next pages (not used yet):
  // hipaa: { regex: /hipaa/i, match: ["complianceFrameworks"] },
  // cmmc:  { regex: /cmmc/i,  match: ["complianceFrameworks"] },
};

// The fields a company card shows.
const CARD =
  "slug companyName image description tagline companyCity companyState companyCountry industry employees foundedYear revenueSize companyPartners technologies linkedinUrl twitterUrl facebookUrl supportHours indexEligible";

const MAX_LIMIT = 50;

/** Same list, different starting company. The start moves every day and differs per seed (one seed per page), so every
 *  company gets the first places in turn and two pages do not open with the same companies. */
function rotated(rows, seed) {
  if (!seed || rows.length < 2) return rows;
  const day = Math.floor(Date.now() / 86400000);
  let h = day;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  const start = h % rows.length;
  return [...rows.slice(start), ...rows.slice(0, start)];
}
const tally = (rows, field) => {
  const m = new Map();
  rows.forEach((d) => d[field] && m.set(d[field], (m.get(d[field]) || 0) + 1));
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** Every company of a topic, verified first, then by name. Kept in memory for a few minutes. */
async function loadTopic(key, topic) {
  const cacheKey = `topic|${key}`;
  let out = publicCache.get(cacheKey);
  if (out) return out;
  const filter = topic.query
    ? { isPublished: true, ...topic.query }
    : { isPublished: true, $or: topic.match.map((f) => ({ [f]: topic.regex })) };
  const rows = await ManagedItCompany.find(filter)
    .select(CARD)
    .lean();
  rows.forEach((c) => {
    c.description = String(c.description || "").slice(0, 1200);
    delete c._id;
  });
  rows.sort((a, b) => Number(!!b.indexEligible) - Number(!!a.indexEligible) || a.companyName.localeCompare(b.companyName));
  out = {
    rows,
    countries: tally(rows, "companyCountry"),
    states: (() => {
      const m = new Map();
      rows.forEach((r) => {
        if (!r.companyState) return;
        const k = `${r.companyCountry}|${r.companyState}`;
        m.set(k, { name: r.companyState, country: r.companyCountry, count: (m.get(k)?.count || 0) + 1 });
      });
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    })(),
  };
  publicCache.set(cacheKey, out, 10 * 60 * 1000);
  return out;
}

// GET /api/v1/provider-topics/:topic?page=1&limit=24&q=&country=&state=&verified=1
exports.listTopic = async (req, res) => {
  const key = String(req.params.topic || "");
  const topic = Object.prototype.hasOwnProperty.call(TOPICS, key) ? TOPICS[key] : null;
  if (!topic) return res.status(404).json({ ok: false, message: "Unknown topic" });
  try {
    const all = await loadTopic(key, topic);
    // ?names=1 returns only slug and name of every company, so a page can print a plain list of links
    if (req.query.names === "1") {
      res.set("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.json({ ok: true, topic: key, total: all.rows.length, data: all.rows.map((r) => ({ slug: r.slug, companyName: r.companyName })) });
    }
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24));
    const q = String(req.query.q || "").trim().slice(0, 80).toLowerCase();
    const country = String(req.query.country || "").slice(0, 80);
    const state = String(req.query.state || "").slice(0, 80);
    const verified = req.query.verified === "1" || req.query.verified === "true";
    const rotate = String(req.query.rotate || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);

    const rows = rotated(all.rows, rotate).filter((r) => {
      if (country && r.companyCountry !== country) return false;
      if (state && r.companyState !== state) return false;
      if (verified && !r.indexEligible) return false;
      if (!q) return true;
      return [r.companyName, r.companyCity, r.companyState, r.companyCountry].some((v) => String(v || "").toLowerCase().includes(q));
    });
    const total = rows.length;
    res.set("Cache-Control", "public, max-age=60, s-maxage=300");
    res.json({
      ok: true,
      topic: key,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: rows.slice((page - 1) * limit, page * limit),
      // the filter lists always describe the whole topic, so the dropdowns do not shrink while filtering
      countries: all.countries,
      states: all.states,
      overall: all.rows.length,
    });
  } catch (err) {
    console.error("listTopic:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
