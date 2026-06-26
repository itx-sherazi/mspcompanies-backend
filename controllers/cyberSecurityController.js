const xlsx = require("xlsx");
const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const { cleanCompanyData, createSafeSlug } = require("./uploadCompaniesToSubcategory");

function uniqueSlug(companyName, usedSlugs) {
  const base = createSafeSlug(companyName);
  if (!base) return null;
  let slug = base;
  let n = 1;
  while (usedSlugs.has(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  usedSlugs.add(slug);
  return slug;
}

function rowToDoc(cleaned, slug) {
  return {
    slug,
    companyName:       cleaned.companyName,
    employees:         cleaned.employees || "",
    industry:          (cleaned.industryTags || []).join(", ") || "",
    website:           cleaned.website || "",
    companyServices:   cleaned.companyServices || [],
    companyPartners:   cleaned.companyPartners || [],
    linkedinUrl:       cleaned.linkedinUrl || "",
    facebookUrl:       cleaned.facebookUrl || "",
    twitterUrl:        cleaned.twitterUrl || "",
    companyStreet:     cleaned.companyStreet || "",
    companyCity:       cleaned.companyCity || "",
    companyState:      cleaned.companyState || "",
    companyCountry:    cleaned.companyCountry || "",
    companyPostalCode: cleaned.companyPostalCode || "",
    address:           cleaned.address || "",
    keywords:          cleaned.keywords || [],
    phone:             cleaned.phone || "",
    technologies:      cleaned.technologies || [],
    sicCodes:          cleaned.sicCodes || [],
    naicsCodes:        cleaned.naicsCodes || [],
    description:       cleaned.description || "",
    foundedYear:       cleaned.foundedYear || null,
    image:             cleaned.image || "",
    isPublished:       true,
  };
}

// ── Public ──────────────────────────────────────────────

exports.listCompanies = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",  10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10) || 20));
    const skip  = (page - 1) * limit;

    const filter = { isPublished: true };
    if (req.query.state) filter.companyState = { $regex: new RegExp(`^${req.query.state.trim()}$`, "i") };

    if (req.query.city) {
      const cityRe = new RegExp(req.query.city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ companyCity: cityRe }, { companyState: cityRe }, { companyCountry: cityRe }] });
    }

    if (req.query.industry) {
      const inds = req.query.industry.split(",").map((i) => i.trim()).filter(Boolean);
      if (inds.length === 1) {
        filter.industry = { $regex: new RegExp(inds[0], "i") };
      } else if (inds.length > 1) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: inds.map((i) => ({ industry: { $regex: new RegExp(i, "i") } })) });
      }
    }

    if (req.query.employees) {
      filter.employees = { $regex: new RegExp(req.query.employees.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
    }

    if (req.query.q) {
      const re = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ companyName: re }, { description: re }, { keywords: re }];
    }

    const [total, companies] = await Promise.all([
      CyberSecurityCompany.countDocuments(filter),
      CyberSecurityCompany.find(filter)
        .sort({ companyName: 1 })
        .skip(skip)
        .limit(limit)
        .select("slug companyName employees industry website companyCity companyState companyCountry phone description image companyServices foundedYear linkedinUrl facebookUrl twitterUrl")
        .lean(),
    ]);

    res.json({ ok: true, data: companies, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("cyberSecurity listCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getFilters = async (req, res) => {
  try {
    const base = { isPublished: true };
    const [states, industries, servicesRaw, technologiesRaw, partnersRaw] = await Promise.all([
      CyberSecurityCompany.distinct("companyState",    { ...base, companyState:    { $nin: ["", null] } }),
      CyberSecurityCompany.distinct("industry",        { ...base, industry:        { $nin: ["", null] } }),
      CyberSecurityCompany.distinct("companyServices", { ...base, companyServices: { $not: { $size: 0 } } }),
      CyberSecurityCompany.distinct("technologies",    { ...base, technologies:    { $not: { $size: 0 } } }),
      CyberSecurityCompany.distinct("companyPartners", { ...base, companyPartners: { $not: { $size: 0 } } }),
    ]);
    const clean = (arr) => arr.filter((v) => v && String(v).trim()).sort();
    res.json({
      ok: true,
      states:       clean(states),
      industries:   clean(industries),
      services:     clean(servicesRaw),
      technologies: clean(technologiesRaw),
      partners:     clean(partnersRaw),
    });
  } catch (err) {
    console.error("cyberSecurity getFilters:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getCompany = async (req, res) => {
  try {
    const company = await CyberSecurityCompany.findOne({
      slug: String(req.params.slug).toLowerCase(),
      isPublished: true,
    }).lean();
    if (!company) return res.status(404).json({ ok: false, message: "Company not found" });
    res.set("Cache-Control", "private, no-store");
    res.json({ ok: true, data: company });
  } catch (err) {
    console.error("cyberSecurity getCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getRelated = async (req, res) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const company = await CyberSecurityCompany.findOne({ slug, isPublished: true })
      .select("industry companyState keywords").lean();

    if (!company) return res.json({ ok: true, data: [] });

    const orClauses = [];
    if (company.industry)         orClauses.push({ industry:     company.industry });
    if (company.companyState)     orClauses.push({ companyState: company.companyState });
    if (company.keywords?.length) orClauses.push({ keywords: { $in: company.keywords.slice(0, 5) } });

    const filter = {
      isPublished: true,
      slug: { $ne: slug },
      ...(orClauses.length ? { $or: orClauses } : {}),
    };

    const related = await CyberSecurityCompany.aggregate([
      { $match: filter },
      { $sample: { size: 4 } },
      { $project: { slug: 1, companyName: 1, industry: 1, companyCity: 1, companyState: 1, description: 1, image: 1, employees: 1 } },
    ]);

    res.json({ ok: true, data: related });
  } catch (err) {
    console.error("cyberSecurity getRelated:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ── Admin ────────────────────────────────────────────────

exports.uploadSheet = async (req, res) => {
  try {
    const fileBuffer = req.files?.file?.[0]?.buffer;
    if (!fileBuffer) return res.status(400).json({ ok: false, message: "Excel file (field: file) is required." });

    let workbook;
    try {
      workbook = xlsx.read(fileBuffer, { type: "buffer", raw: false });
    } catch (e) {
      return res.status(400).json({ ok: false, message: "Invalid Excel file.", error: e.message });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ ok: false, message: "Excel file has no sheets." });

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ ok: false, message: "No rows found in sheet." });

    const mode = String(req.body.mode || "append").toLowerCase();

    const existingSlugs = new Set(
      (await CyberSecurityCompany.find({}, "slug").lean()).map((c) => c.slug)
    );
    const usedSlugs = new Set(existingSlugs);

    const docs = [];
    const seenNames = new Set();

    for (const row of rows) {
      const companyName = String(row["Company Name"] ?? "").trim();
      if (!companyName) continue;
      const key = companyName.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const cleaned = cleanCompanyData(row);
      if (!cleaned.companyName) continue;


      const slug = uniqueSlug(cleaned.companyName, usedSlugs);
      if (!slug) continue;
      docs.push(rowToDoc(cleaned, slug));
    }

    if (!docs.length) return res.status(400).json({ ok: false, message: "No valid company rows found." });

    if (mode === "replace") {
      await CyberSecurityCompany.deleteMany({});
      await CyberSecurityCompany.insertMany(docs, { ordered: false });
    } else {
      const ops = docs.map((d) => ({
        updateOne: { filter: { slug: d.slug }, update: { $set: d }, upsert: true },
      }));
      await CyberSecurityCompany.bulkWrite(ops, { ordered: false });
    }

    res.json({ ok: true, message: `${docs.length} companies ${mode === "replace" ? "replaced" : "upserted"} successfully.`, count: docs.length });
  } catch (err) {
    console.error("cyberSecurity uploadSheet:", err);
    res.status(500).json({ ok: false, message: "Server error", error: process.env.NODE_ENV === "development" ? err.message : undefined });
  }
};

exports.listAdmin = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1",  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10) || 50));
    const skip  = (page - 1) * limit;
    const filter = {};
    if (req.query.q) {
      const re = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ companyName: re }, { companyCity: re }, { companyState: re }];
    }
    const [total, data] = await Promise.all([
      CyberSecurityCompany.countDocuments(filter),
      CyberSecurityCompany.find(filter).sort({ companyName: 1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({ ok: true, data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("cyberSecurity listAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const result = await CyberSecurityCompany.findOneAndDelete({ slug: req.params.slug });
    if (!result) return res.status(404).json({ ok: false, message: "Company not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("cyberSecurity deleteCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.deleteAll = async (req, res) => {
  try {
    const result = await CyberSecurityCompany.deleteMany({});
    res.json({ ok: true, message: `Deleted ${result.deletedCount} companies.` });
  } catch (err) {
    console.error("cyberSecurity deleteAll:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
