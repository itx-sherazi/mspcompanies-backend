const ManagedItCompany = require("../models/ManagedItCompany");
const { escapeRegex, queryString } = require("../utils/escapeRegex");

// ── Public ──────────────────────────────────────────────

/** GET /api/v1/managed-it-services?page=1&limit=50&state=CA&city=...&industry=...&service=...&technology=...&partner=...&q=... */
exports.listCompanies = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",   10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10) || 20));
    const skip  = (page - 1) * limit;

    const filter = { isPublished: true };
    if (req.query.state) filter.companyState = { $regex: new RegExp(`^${escapeRegex(queryString(req.query.state))}$`, "i") };
    if (req.query.country) filter.companyCountry = { $regex: new RegExp(`^${escapeRegex(queryString(req.query.country))}$`, "i") };

    // city search  matches city, state, OR country
    if (req.query.city) {
      const cityRe = new RegExp(escapeRegex(queryString(req.query.city)), "i");
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ companyCity: cityRe }, { companyState: cityRe }, { companyCountry: cityRe }] });
    }

    if (req.query.industry) filter.industry = { $regex: new RegExp(escapeRegex(queryString(req.query.industry)), "i") };

    // services  comma-separated multiple values (AND logic: must have all)
    if (req.query.service) {
      const svcs = queryString(req.query.service).split(",").map((s) => s.trim()).filter(Boolean);
      if (svcs.length === 1) {
        filter.companyServices = { $elemMatch: { $regex: new RegExp(escapeRegex(svcs[0]), "i") } };
      } else if (svcs.length > 1) {
        filter.$and = filter.$and || [];
        svcs.forEach((s) => {
          filter.$and.push({ companyServices: { $elemMatch: { $regex: new RegExp(escapeRegex(s), "i") } } });
        });
      }
    }

    // partners  comma-separated multiple values (AND logic: must have all)
    if (req.query.partner) {
      const prts = queryString(req.query.partner).split(",").map((p) => p.trim()).filter(Boolean);
      if (prts.length === 1) {
        filter.companyPartners = { $elemMatch: { $regex: new RegExp(escapeRegex(prts[0]), "i") } };
      } else if (prts.length > 1) {
        filter.$and = filter.$and || [];
        prts.forEach((p) => {
          filter.$and.push({ companyPartners: { $elemMatch: { $regex: new RegExp(escapeRegex(p), "i") } } });
        });
      }
    }

    if (req.query.q) {
      const re = new RegExp(escapeRegex(queryString(req.query.q)), "i");
      filter.$or = [{ companyName: re }, { description: re }, { keywords: re }];
    }

    const [total, companies] = await Promise.all([
      ManagedItCompany.countDocuments(filter),
      ManagedItCompany.find(filter)
        .sort({ companyName: 1 })
        .skip(skip)
        .limit(limit)
        .select("slug companyName employees industry website companyCity companyState companyCountry phone description tagline image companyServices companyPartners technologies foundedYear linkedinUrl facebookUrl twitterUrl indexEligible supportHours revenueSize")
        .lean(),
    ]);

    res.json({ ok: true, data: companies, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("listCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** GET /api/v1/managed-it-services/filters  distinct values for all filter dropdowns */
exports.getFilters = async (req, res) => {
  try {
    const base = { isPublished: true };
    const [states, countries, industries, servicesRaw, technologiesRaw, partnersRaw] = await Promise.all([
      ManagedItCompany.distinct("companyState",    { ...base, companyState:    { $nin: ["", null] } }),
      ManagedItCompany.distinct("companyCountry",  { ...base, companyCountry:  { $nin: ["", null] } }),
      ManagedItCompany.distinct("industry",        { ...base, industry:        { $nin: ["", null] } }),
      ManagedItCompany.distinct("companyServices", { ...base, companyServices: { $not: { $size: 0 } } }),
      ManagedItCompany.distinct("technologies",    { ...base, technologies:    { $not: { $size: 0 } } }),
      ManagedItCompany.distinct("companyPartners", { ...base, companyPartners: { $not: { $size: 0 } } }),
    ]);
    const clean = (arr) => arr.filter((v) => v && String(v).trim()).sort();
    // How many companies each state / country has, shown next to the name in the filter dropdowns.
    const [stateCounts, countryCounts] = await Promise.all([
      ManagedItCompany.aggregate([
        { $match: { ...base, companyState: { $nin: ["", null] } } },
        { $group: { _id: { name: "$companyState", country: "$companyCountry" }, count: { $sum: 1 } } },
        { $project: { _id: 0, name: "$_id.name", country: "$_id.country", count: 1 } },
        { $sort: { name: 1 } },
      ]),
      ManagedItCompany.aggregate([
        { $match: { ...base, companyCountry: { $nin: ["", null] } } },
        { $group: { _id: "$companyCountry", count: { $sum: 1 } } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
        { $sort: { count: -1, name: 1 } },
      ]),
    ]);
    res.json({
      ok: true,
      states:       clean(states),
      countries:    clean(countries),
      stateCounts,
      countryCounts,
      industries:   clean(industries),
      services:     clean(servicesRaw),
      technologies: clean(technologiesRaw),
      partners:     clean(partnersRaw),
    });
  } catch (err) {
    console.error("getFilters:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** GET /api/v1/managed-it-services/:slug/related  4 random companies same industry/state */
exports.getRelated = async (req, res) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const company = await ManagedItCompany.findOne({ slug, isPublished: true })
      .select("companyCity companyState companyCountry")
      .lean();
    if (!company) return res.json({ ok: true, data: [], scope: "" });

    const WANT = 4;
    const base = { isPublished: true, slug: { $ne: slug } };
    // Closest first: same city, then same state, then same country. Within a step, verified profiles
    // (Index Eligible) come before the rest, picked at random so every profile gets shown over time.
    const tiers = [];
    if (company.companyCity && company.companyState) tiers.push({ scope: "city", match: { companyCity: company.companyCity, companyState: company.companyState, companyCountry: company.companyCountry } });
    if (company.companyState) tiers.push({ scope: "state", match: { companyState: company.companyState, companyCountry: company.companyCountry } });
    if (company.companyCountry) tiers.push({ scope: "country", match: { companyCountry: company.companyCountry } });

    const picked = [];
    const seen = new Set();
    let scope = "";
    const project = { slug: 1, companyName: 1, industry: 1, companyCity: 1, companyState: 1, description: 1, image: 1, employees: 1, tagline: 1, indexEligible: 1 };
    for (const tier of tiers) {
      for (const eligibleOnly of [true, false]) {
        const need = WANT - picked.length;
        if (need <= 0) break;
        const match = { ...base, ...tier.match, slug: { $nin: [slug, ...seen] }, ...(eligibleOnly ? { indexEligible: true } : {}) };
        const rows = await ManagedItCompany.aggregate([{ $match: match }, { $sample: { size: need } }, { $project: project }]);
        for (const r of rows) { picked.push(r); seen.add(r.slug); }
        if (rows.length && !scope) scope = tier.scope;
      }
      if (picked.length >= WANT) break;
    }
    res.json({ ok: true, data: picked, scope });
  } catch (err) {
    console.error("getRelated:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** GET /api/v1/managed-it-services/sitemap-entries  slugs of profiles that may be indexed (Index Eligible = Y) */
exports.getSitemapEntries = async (req, res) => {
  try {
    const rows = await ManagedItCompany.find({ isPublished: true, indexEligible: true })
      .select("slug updatedAt")
      .sort({ slug: 1 })
      .lean();
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
    res.json({ ok: true, data: rows.map((r) => ({ slug: r.slug, lastmod: r.updatedAt ? new Date(r.updatedAt).toISOString() : null })) });
  } catch (err) {
    console.error("getSitemapEntries:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** GET /api/v1/managed-it-services/:slug */
exports.getCompany = async (req, res) => {
  try {
    const company = await ManagedItCompany.findOne({
      slug: String(req.params.slug).toLowerCase(),
      isPublished: true,
    }).lean();
    if (!company) return res.status(404).json({ ok: false, message: "Company not found" });
    res.set("Cache-Control", "private, no-store");
    res.json({ ok: true, data: company });
  } catch (err) {
    console.error("getCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ── Admin ────────────────────────────────────────────────

/** GET /api/v1/admin/managed-it-services?page=1&limit=50&q= */
exports.listAdmin = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10) || 50));
    const skip  = (page - 1) * limit;
    const filter = {};
    if (req.query.q) {
      const re = new RegExp(escapeRegex(queryString(req.query.q)), "i");
      filter.$or = [{ companyName: re }, { companyCity: re }, { companyState: re }];
    }
    // Index Eligible filter: eligible=yes | no
    if (req.query.eligible === "yes") filter.indexEligible = true;
    else if (req.query.eligible === "no") filter.indexEligible = { $ne: true };
    const [total, data, eligibleTotal, directoryTotal] = await Promise.all([
      ManagedItCompany.countDocuments(filter),
      ManagedItCompany.find(filter).sort({ companyName: 1 }).skip(skip).limit(limit).lean(),
      ManagedItCompany.countDocuments({ indexEligible: true }),
      ManagedItCompany.estimatedDocumentCount(),
    ]);
    res.json({ ok: true, data, total, page, limit, totalPages: Math.ceil(total / limit), eligibleTotal, directoryTotal });
  } catch (err) {
    console.error("listAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** DELETE /api/v1/admin/managed-it-services/:slug */
exports.deleteCompany = async (req, res) => {
  try {
    const result = await ManagedItCompany.findOneAndDelete({ slug: req.params.slug });
    if (!result) return res.status(404).json({ ok: false, message: "Company not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** DELETE /api/v1/admin/managed-it-services  (delete ALL) */
exports.deleteAll = async (req, res) => {
  try {
    const result = await ManagedItCompany.deleteMany({});
    res.json({ ok: true, message: `Deleted ${result.deletedCount} companies.` });
  } catch (err) {
    console.error("deleteAll:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

