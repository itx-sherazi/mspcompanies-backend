const Vendor = require("../models/Vendor");

function parseCSV(val) {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function cleanStr(val) {
  return String(val || "").trim().replace(/^'+/, "").replace(/'+$/, "");
}

async function revalidateFrontend(paths = []) {
  try {
    const base   = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const secret = process.env.REVALIDATE_SECRET || "";
    await fetch(`${base}/api/revalidate?secret=${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
  } catch (_) {}
}

// GET /api/v1/vendors?category=rmm-software&limit=10
exports.getVendors = async (req, res) => {
  try {
    const { category, group, search, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (category) filter.categories = category;
    if (group) filter.groups = group;
    if (search) filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vendors, total] = await Promise.all([
      Vendor.find(filter)
        .sort({ pageCount: -1, name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-__v"),
      Vendor.countDocuments(filter),
    ]);

    res.json({ ok: true, data: vendors, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("getVendors error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// GET /api/v1/vendors/:slug
exports.getVendorBySlug = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug }).select("-__v");
    if (!vendor) return res.status(404).json({ ok: false, error: "Vendor not found" });
    res.json({ ok: true, data: vendor });
  } catch (err) {
    console.error("getVendorBySlug error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// POST /api/v1/vendors  create new vendor
exports.createVendor = async (req, res) => {
  try {
    const { slug, name } = req.body;
    if (!slug || !name) return res.status(400).json({ ok: false, error: "slug and name required" });

    const safeSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const exists = await Vendor.findOne({ slug: safeSlug });
    if (exists) return res.status(409).json({ ok: false, error: "Slug already exists" });

    const vendor = await Vendor.create({
      slug: safeSlug,
      name: String(name).trim(),
      website:               String(req.body.website               || "").trim(),
      logoUrl:               String(req.body.logoUrl               || "").trim(),
      founded:               req.body.founded ? Number(req.body.founded) : null,
      hq:                    String(req.body.hq                    || "").trim(),
      companySize:           String(req.body.companySize           || "").trim(),
      description:           String(req.body.description           || "").trim(),
      employees:             String(req.body.employees             || "").trim(),
      industry:              String(req.body.industry              || "").trim(),
      phone:                 String(req.body.phone                 || "").trim(),
      street:                String(req.body.street                || "").trim(),
      city:                  String(req.body.city                  || "").trim(),
      state:                 String(req.body.state                 || "").trim(),
      country:               String(req.body.country               || "").trim(),
      postalCode:            String(req.body.postalCode            || "").trim(),
      address:               String(req.body.address               || "").trim(),
      linkedinUrl:           String(req.body.linkedinUrl           || "").trim(),
      facebookUrl:           String(req.body.facebookUrl           || "").trim(),
      twitterUrl:            String(req.body.twitterUrl            || "").trim(),
      sicCodes:              String(req.body.sicCodes              || "").trim(),
      naicsCodes:            String(req.body.naicsCodes            || "").trim(),
      pricingModel:          String(req.body.pricingModel          || "").trim(),
      pricingNotes:          String(req.body.pricingNotes          || "").trim(),
      bestFor:               String(req.body.bestFor               || "").trim(),
      mspPartnerProgram:     Boolean(req.body.mspPartnerProgram),
      mspPartnerProgramNotes:String(req.body.mspPartnerProgramNotes|| "").trim(),
      keyFeatures:    parseCSV(req.body.keyFeatures),
      integrations:   parseCSV(req.body.integrations),
      pros:           parseCSV(req.body.pros),
      cons:           parseCSV(req.body.cons),
      categories:     parseCSV(req.body.categories),
      groups:         parseCSV(req.body.groups),
      keywords:       parseCSV(req.body.keywords),
      technologies:   parseCSV(req.body.technologies),
    });

    res.status(201).json({ ok: true, data: vendor });
  } catch (err) {
    console.error("createVendor error:", err);
    if (err.code === 11000) return res.status(409).json({ ok: false, error: "Duplicate slug" });
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// PUT /api/v1/vendors/:slug  update vendor
exports.updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug });
    if (!vendor) return res.status(404).json({ ok: false, error: "Vendor not found" });

    const stringFields = ["name","website","logoUrl","hq","companySize",
      "description","pricingModel","pricingNotes","bestFor","mspPartnerProgramNotes",
      "employees","industry","phone","street","city","state","country","postalCode","address",
      "linkedinUrl","facebookUrl","twitterUrl","sicCodes","naicsCodes"];
    for (const f of stringFields) {
      if (req.body[f] !== undefined) vendor[f] = String(req.body[f]).trim();
    }
    if (req.body.founded           !== undefined) vendor.founded           = req.body.founded ? Number(req.body.founded) : null;
    if (req.body.mspPartnerProgram !== undefined) vendor.mspPartnerProgram = Boolean(req.body.mspPartnerProgram);

    const arrayFields = ["keyFeatures","integrations","pros","cons","categories","groups","keywords","technologies"];
    for (const f of arrayFields) {
      if (req.body[f] !== undefined) vendor[f] = parseCSV(req.body[f]);
    }

    await vendor.save();
    revalidateFrontend(["/tools", `/tools/${vendor.slug}`]);
    res.json({ ok: true, data: vendor });
  } catch (err) {
    console.error("updateVendor error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// DELETE /api/v1/vendors/:slug  delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const result = await Vendor.findOneAndDelete({ slug: req.params.slug });
    if (!result) return res.status(404).json({ ok: false, error: "Vendor not found" });
    res.json({ ok: true, message: "Vendor deleted" });
  } catch (err) {
    console.error("deleteVendor error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// GET /api/v1/vendors/by-slugs?slugs=ninjaone,veeam,atera
exports.getVendorsBySlugs = async (req, res) => {
  try {
    const slugs = (req.query.slugs || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!slugs.length) return res.json({ ok: true, data: [] });
    const vendors = await Vendor.find({ slug: { $in: slugs } }).select("-__v");
    // return in same order as requested slugs
    const map = Object.fromEntries(vendors.map((v) => [v.slug, v]));
    const ordered = slugs.map((s) => map[s]).filter(Boolean);
    res.json({ ok: true, data: ordered });
  } catch (err) {
    console.error("getVendorsBySlugs error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// POST /api/v1/vendors/import  bulk upsert from sheet
exports.importVendors = async (req, res) => {
  try {
    const rows = req.body.vendors;
    if (!Array.isArray(rows) || !rows.length)
      return res.status(400).json({ ok: false, error: "No vendor rows provided" });

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      const name = String(row.name || row["Company Name"] || "").trim();
      if (!name) { skipped++; continue; }

      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!slug) { skipped++; continue; }

      const doc = {
        name,
        website:     String(row.website     || row["Website"]              || "").trim(),
        logoUrl:     String(row.logoUrl     || row["Logo Url"]             || "").trim(),
        description: String(row.description || row["Short Description"]    || "").trim(),
        founded:     row["Founded Year"] || row.founded ? Number(row["Founded Year"] || row.founded) || null : null,
        employees:   String(row.employees   || row["# Employees"]          || "").trim(),
        industry:    String(row.industry    || row["Industry"]             || "").trim(),
        phone:       cleanStr(row.phone       || row["Company Phone"]        || ""),
        street:      String(row.street      || row["Company Street"]       || "").trim(),
        city:        String(row.city        || row["Company City"]         || "").trim(),
        state:       String(row.state       || row["Company State"]        || "").trim(),
        country:     String(row.country     || row["Company Country"]      || "").trim(),
        postalCode:  String(row.postalCode  || row["Company Postal Code"]  || "").trim(),
        address:     String(row.address     || row["Company Address"]      || "").trim(),
        linkedinUrl: String(row.linkedinUrl || row["Company Linkedin Url"] || "").trim(),
        facebookUrl: String(row.facebookUrl || row["Facebook Url"]         || "").trim(),
        twitterUrl:  String(row.twitterUrl  || row["Twitter Url"]          || "").trim(),
        sicCodes:    String(row.sicCodes    || row["SIC Codes"]            || "").trim(),
        naicsCodes:  String(row.naicsCodes  || row["NAICS Codes"]         || "").trim(),
        keywords:    parseCSV(row.keywords    || row["Keywords"]     || ""),
        technologies:parseCSV(row.technologies|| row["Technologies"] || ""),
      };

      try {
        const existing = await Vendor.findOne({ slug });
        if (existing) {
          // only overwrite fields that are currently empty
          for (const [k, v] of Object.entries(doc)) {
            if (k === "name" || k === "slug") continue;
            if (Array.isArray(v)) {
              if (!existing[k] || existing[k].length === 0) existing[k] = v;
            } else {
              if (!existing[k] || existing[k] === "") existing[k] = v;
            }
          }
          await existing.save();
          updated++;
        } else {
          await Vendor.create({ slug, ...doc });
          created++;
        }
      } catch (e) {
        errors.push({ name, error: e.message });
      }
    }

    res.json({ ok: true, created, updated, skipped, errors });
  } catch (err) {
    console.error("importVendors error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};
