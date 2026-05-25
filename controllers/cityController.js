const xlsx =require("xlsx");
const path = require("path");
const fs = require("fs/promises");
const City = require("../models/City.js");
const cloudinary = require("../config/cloudinary.js");
const { cleanCompanyData, createSafeSlug } = require("./uploadCompaniesToSubcategory.js");

const HUB_MANAGED_IT = "managed-service-providers";

async function revalidateFrontend(paths = ["/msp"]) {
  try {
    const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const secret = process.env.REVALIDATE_SECRET || "";
    await fetch(`${base}/api/revalidate?secret=${secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
  } catch (_) {
    // non-blocking — revalidation failure should not break the API response
  }
}

function normalizeCityFaqs(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((f) => ({
      question: String(f?.question ?? "").trim(),
      answer: String(f?.answer ?? "").trim(),
    }))
    .filter((f) => f.question || f.answer);
}

function getCloudinaryPublicId(url) {
  if (!url || !String(url).includes("res.cloudinary.com")) return null;
  const parts = String(url).split("/");
  const uploadIndex = parts.indexOf("upload");
  if (uploadIndex === -1) return null;
  let startIndex = uploadIndex + 1;
  if (parts[startIndex]?.match(/^v\d+$/)) startIndex += 1;
  const publicIdWithExt = parts.slice(startIndex).join("/");
  const dot = publicIdWithExt.lastIndexOf(".");
  return dot === -1 ? publicIdWithExt : publicIdWithExt.substring(0, dot);
}

function safeHubCompanySlugInput(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t;
}

async function persistHubCompanyLogo(file, previousImageUrl) {
  if (previousImageUrl && String(previousImageUrl).includes("res.cloudinary.com")) {
    const pid = getCloudinaryPublicId(previousImageUrl);
    if (pid) {
      try {
        await cloudinary.uploader.destroy(pid);
      } catch (e) {
        /* ignore */
      }
    }
  }
  try {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "hub-company",
      upload_preset: "firmo",
    });
    return result.secure_url;
  } catch (err) {
    console.error("Hub logo Cloudinary upload failed, using local file:", err?.message);
    const dir = path.join(__dirname, "../uploads/hub-company");
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `hub-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const full = path.join(dir, name);
    await fs.writeFile(full, file.buffer);
    return `/uploads/hub-company/${name}`;
  }
}

/**
 * Build unique slug within this city's upload batch.
 */
function uniqueSlugForBatch(companyName, usedSlugs) {
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

function cleanedToHubDoc(cleaned, slug) {
  const fullAddress = [
    cleaned.companyStreet,
    cleaned.companyCity,
    cleaned.companyPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    slug,
    companyName: cleaned.companyName,
    description: cleaned.description || "",
    address: cleaned.address || fullAddress || "",
    companyStreet: cleaned.companyStreet || "",
    companyCity: cleaned.companyCity || "",
    companyPostalCode: cleaned.companyPostalCode || "",
    companyServices: cleaned.companyServices || [],
    companyPartners: cleaned.companyPartners || [],
    industryTags: cleaned.industryTags || [],
    keywords: cleaned.keywords || [],
    employees: cleaned.employees || "",
    foundedYear: cleaned.foundedYear ?? null,
    phone: cleaned.phone || "",
    image: cleaned.image || "",
    website: cleaned.website || "",
    linkedinUrl: cleaned.linkedinUrl || "",
    facebookUrl: cleaned.facebookUrl || "",
    twitterUrl: cleaned.twitterUrl || "",
    naicsCodes: cleaned.naicsCodes || [],
    sicCodes: cleaned.sicCodes || [],
    technologies: cleaned.technologies || [],
    vars: cleaned.vars || "",
    isSponsored: false,
  };
}

// --- Public (no auth) ---

exports.getPublishedCitiesByHub = async (req, res) => {
  try {
    const { hubSlug } = req.params;
    if (hubSlug !== HUB_MANAGED_IT) {
      return res.status(404).json({ ok: false, data: [] });
    }
    const cities = await City.find({
      hubSlug: HUB_MANAGED_IT,
      isPublished: true,
    })
      .sort({ name: 1 })
      .select("name slug")
      .lean();

    res.json({ ok: true, data: cities });
  } catch (err) {
    console.error("getPublishedCitiesByHub:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getCityPublicByHub = async (req, res) => {
  try {
    const { hubSlug, citySlug } = req.params;
    if (hubSlug !== HUB_MANAGED_IT) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const city = await City.findOne({
      hubSlug: HUB_MANAGED_IT,
      slug: String(citySlug).toLowerCase(),
      isPublished: true,
    }).lean();

    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    const companies = Array.isArray(city.hubCompanies) ? city.hubCompanies : [];

    res.set("Cache-Control", "private, no-store");
    res.json({
      ok: true,
      data: {
        name: city.name,
        slug: city.slug,
        heading: city.heading || "",
        metaTitle: city.metaTitle,
        metaDescription: city.metaDescription,
        content: city.content || "",
        faqs: Array.isArray(city.faqs) ? city.faqs : [],
        companies,
      },
    });
  } catch (err) {
    console.error("getCityPublicByHub:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Single company on a city page (same data as hubCompanies entry). */
exports.getCityCompanyPublicByHub = async (req, res) => {
  try {
    const { hubSlug, citySlug, companySlug } = req.params;
    if (hubSlug !== HUB_MANAGED_IT) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const city = await City.findOne({
      hubSlug: HUB_MANAGED_IT,
      slug: String(citySlug).toLowerCase(),
      isPublished: true,
    })
      .select("name slug heading metaTitle metaDescription hubCompanies")
      .lean();

    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    const wanted = String(companySlug).toLowerCase();
    const company = (city.hubCompanies || []).find(
      (c) => c.slug && String(c.slug).toLowerCase() === wanted,
    );

    if (!company) {
      return res.status(404).json({ ok: false, message: "Company not found" });
    }

    res.set("Cache-Control", "private, no-store");
    res.json({
      ok: true,
      data: {
        city: {
          name: city.name,
          slug: city.slug,
          heading: city.heading || "",
          metaTitle: city.metaTitle,
          metaDescription: city.metaDescription,
        },
        company,
      },
    });
  } catch (err) {
    console.error("getCityCompanyPublicByHub:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * Compact tree for sitemap: published cities + company slugs + lastmod (city updatedAt).
 * Public, no auth single round-trip vs N+1 city fetches.
 */
exports.getManagedItHubSitemapEntries = async (req, res) => {
  try {
    const cities = await City.find({
      hubSlug: HUB_MANAGED_IT,
      isPublished: true,
    })
      .sort({ name: 1 })
      .select("slug updatedAt hubCompanies")
      .lean();

    const data = cities.map((c) => ({
      slug: c.slug,
      lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      companySlugs: (c.hubCompanies || [])
        .map((co) => (co && co.slug ? String(co.slug).trim() : ""))
        .filter(Boolean),
    }));

    res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
    res.json({ ok: true, data });
  } catch (err) {
    console.error("getManagedItHubSitemapEntries:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// --- Admin ---

exports.listCitiesAdmin = async (req, res) => {
  try {
    const hubSlug = req.query.hubSlug || HUB_MANAGED_IT;
    const cities = await City.find({ hubSlug })
      .sort({ updatedAt: -1 })
      .lean();

    const data = cities.map((c) => ({
      ...c,
      companyCount: Array.isArray(c.hubCompanies) ? c.hubCompanies.length : 0,
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error("listCitiesAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Flatten every embedded hub company with its city (admin search / manage all). */
function hubCompanySearchHaystack(r) {
  const kw = Array.isArray(r.keywords) ? r.keywords.join(" ") : "";
  return [
    r.companyName,
    r.slug,
    r.cityName,
    r.citySlug,
    r.companyCity,
    r.description,
    kw,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Lower = better match when searching (company name matches surface first). */
function hubCompanyRelevanceScore(row, q) {
  if (!q) return 0;
  const name = (row.companyName || "").toLowerCase();
  const slug = (row.slug || "").toLowerCase();
  if (name === q) return 0;
  if (slug === q) return 1;
  if (name.startsWith(q)) return 2;
  if (slug.startsWith(q)) return 3;
  if (name.includes(q)) return 4;
  if (slug.includes(q)) return 5;
  return 6;
}

exports.listAllHubCompaniesAdmin = async (req, res) => {
  try {
    const hubSlug = req.query.hubSlug || HUB_MANAGED_IT;
    const q = String(req.query.q || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const rawLimit = parseInt(String(req.query.limit || "50"), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));

    const cities = await City.find({ hubSlug })
      .sort({ name: 1 })
      .select("name slug hubCompanies")
      .lean();

    const rows = [];
    for (const c of cities) {
      for (const co of c.hubCompanies || []) {
        rows.push({
          cityId: c._id,
          cityName: c.name,
          citySlug: c.slug,
          ...co,
        });
      }
    }

    const filtered = q
      ? rows.filter((r) => hubCompanySearchHaystack(r).includes(q))
      : rows;

    if (q) {
      filtered.sort((a, b) => {
        const da = hubCompanyRelevanceScore(a, q);
        const db = hubCompanyRelevanceScore(b, q);
        if (da !== db) return da - db;
        return (a.companyName || "").localeCompare(b.companyName || "", undefined, {
          sensitivity: "base",
        });
      });
    } else {
      filtered.sort((a, b) => {
        const c0 = (a.cityName || "").localeCompare(b.cityName || "", undefined, {
          sensitivity: "base",
        });
        if (c0 !== 0) return c0;
        return (a.companyName || "").localeCompare(b.companyName || "", undefined, {
          sensitivity: "base",
        });
      });
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const pageData = filtered.slice(skip, skip + limit);

    res.json({
      ok: true,
      data: pageData,
      total,
      page: safePage,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error("listAllHubCompaniesAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.createCity = async (req, res) => {
  try {
    const {
      name,
      slug,
      hubSlug = HUB_MANAGED_IT,
      isPublished = false,
      metaTitle = "",
      metaDescription = "",
      heading = "",
      content = "",
      faqs = [],
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ ok: false, message: "name and slug required" });
    }

    const safeSlug = String(slug)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    if (!metaTitle?.trim()) {
      return res.status(400).json({
        ok: false,
        message: "metaTitle is required for SEO.",
      });
    }
    if (!String(heading || "").trim()) {
      return res.status(400).json({
        ok: false,
        message: "heading is required for the public page hero (H1).",
      });
    }
    if (!metaDescription?.trim()) {
      return res.status(400).json({
        ok: false,
        message: "metaDescription is required for SEO.",
      });
    }

    const exists = await City.findOne({ hubSlug, slug: safeSlug });
    if (exists) {
      return res.status(409).json({ ok: false, message: "City slug already exists for this hub" });
    }

    const city = await City.create({
      name: name.trim(),
      slug: safeSlug,
      hubSlug,
      isPublished: Boolean(isPublished),
      heading: String(heading).trim(),
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      content: typeof content === "string" ? content : "",
      faqs: normalizeCityFaqs(faqs),
      hubCompanies: [],
    });

    revalidateFrontend(["/msp", `/msp/${city.slug}`]);
    res.status(201).json({ ok: true, data: city });
  } catch (err) {
    console.error("createCity:", err);
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, message: "Duplicate slug" });
    }
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const city = await City.findById(id);
    if (!city) return res.status(404).json({ ok: false, message: "City not found" });

    if (req.body.slug !== undefined) {
      const safeSlug = String(req.body.slug)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (!safeSlug) {
        return res.status(400).json({ ok: false, message: "Invalid URL slug" });
      }
      const dup = await City.findOne({
        hubSlug: city.hubSlug,
        slug: safeSlug,
        _id: { $ne: city._id },
      });
      if (dup) {
        return res.status(409).json({
          ok: false,
          message: "Another city already uses this slug",
        });
      }
      city.slug = safeSlug;
    }

    const allowed = ["name", "isPublished"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) city[key] = req.body[key];
    }

    if (req.body.heading !== undefined) {
      const h = String(req.body.heading).trim();
      if (!h) {
        return res.status(400).json({
          ok: false,
          message: "heading cannot be empty",
        });
      }
      city.heading = h;
    }

    if (req.body.metaTitle !== undefined) {
      const t = String(req.body.metaTitle).trim();
      if (!t) {
        return res.status(400).json({
          ok: false,
          message: "metaTitle cannot be empty",
        });
      }
      city.metaTitle = t;
    }
    if (req.body.metaDescription !== undefined) {
      const t = String(req.body.metaDescription).trim();
      if (!t) {
        return res.status(400).json({
          ok: false,
          message: "metaDescription cannot be empty",
        });
      }
      city.metaDescription = t;
    }

    if (req.body.content !== undefined) {
      city.content = typeof req.body.content === "string" ? req.body.content : "";
    }
    if (req.body.faqs !== undefined) {
      city.faqs = normalizeCityFaqs(req.body.faqs);
    }

    await city.save();
    revalidateFrontend(["/msp", `/msp/${city.slug}`]);
    res.json({ ok: true, data: city });
  } catch (err) {
    console.error("updateCity:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Update one embedded hub company (multipart: fields + optional image file "image"). */
exports.updateHubCompany = async (req, res) => {
  try {
    const { id, companySlug } = req.params;
    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    const want = decodeURIComponent(String(companySlug || "")).toLowerCase();
    const list = city.hubCompanies || [];
    const idx = list.findIndex(
      (c) => String(c.slug || "").toLowerCase() === want,
    );
    if (idx === -1) {
      return res.status(404).json({
        ok: false,
        message: "Company not found on this city",
      });
    }

    const body = req.body || {};
    const mapped = {
      companyName: body.companyName,
      "Short Description": body.description,
      "Company Address": body.address,
      "Company Street": body.companyStreet,
      "Company City": body.companyCity,
      "Company Postal Code": body.companyPostalCode,
      "Company Services": body.companyServices,
      "Company Partners": body.companyPartners,
      Industry: body.industryTags,
      Keywords: body.keywords,
      "# Employees": body.employees,
      "Founded Year": body.foundedYear,
      "Company Phone": body.phone,
      "Logo Url": body.image,
      Website: body.website,
      "Company Linkedin Url": body.linkedinUrl,
      "Facebook Url": body.facebookUrl,
      "Twitter Url": body.twitterUrl,
      "NAICS Codes": body.naicsCodes,
      "SIC Codes": body.sicCodes,
      Technologies: body.technologies,
      VARS: body.vars,
    };

    const cleaned = cleanCompanyData(mapped);
    if (!cleaned.companyName?.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Company name is required",
      });
    }

    const current = list[idx];
    let nextSlug = String(current.slug || "").toLowerCase();
    if (body.slug !== undefined && String(body.slug).trim() !== "") {
      const candidate = safeHubCompanySlugInput(body.slug);
      if (!candidate) {
        return res.status(400).json({ ok: false, message: "Invalid company URL slug" });
      }
      const taken = list.some(
        (c, i) =>
          i !== idx && String(c.slug || "").toLowerCase() === candidate,
      );
      if (taken) {
        return res.status(409).json({
          ok: false,
          message: "Another company on this city already uses that slug",
        });
      }
      nextSlug = candidate;
    }

    let imageUrl = current.image;
    if (req.file?.buffer) {
      imageUrl = await persistHubCompanyLogo(req.file, current.image);
    } else if (body.image !== undefined) {
      const fromClean = cleaned.image;
      imageUrl = fromClean || "";
    }

    const updated = {
      slug: nextSlug,
      companyName: cleaned.companyName,
      description: cleaned.description,
      address: cleaned.address,
      companyStreet: cleaned.companyStreet,
      companyCity: cleaned.companyCity,
      companyPostalCode: cleaned.companyPostalCode,
      companyServices: cleaned.companyServices,
      companyPartners: cleaned.companyPartners,
      industryTags: cleaned.industryTags,
      keywords: cleaned.keywords,
      employees: cleaned.employees,
      foundedYear: cleaned.foundedYear,
      phone: cleaned.phone,
      image: imageUrl,
      website: cleaned.website,
      linkedinUrl: cleaned.linkedinUrl,
      facebookUrl: cleaned.facebookUrl,
      twitterUrl: cleaned.twitterUrl,
      naicsCodes: cleaned.naicsCodes,
      sicCodes: cleaned.sicCodes,
      technologies: cleaned.technologies,
      vars: cleaned.vars,
      isSponsored: body.isSponsored !== undefined ? Boolean(body.isSponsored) : Boolean(current.isSponsored),
    };

    city.hubCompanies[idx] = updated;
    city.markModified("hubCompanies");
    await city.save();

    res.json({ ok: true, data: { cityId: city._id, company: updated } });
  } catch (err) {
    console.error("updateHubCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Toggle isSponsored on a single hub company. */
exports.toggleSponsoredHubCompany = async (req, res) => {
  try {
    const { id, companySlug } = req.params;
    const city = await City.findById(id);
    if (!city) return res.status(404).json({ ok: false, message: "City not found" });

    const want = decodeURIComponent(String(companySlug || "")).toLowerCase();
    const idx = (city.hubCompanies || []).findIndex(
      (c) => String(c.slug || "").toLowerCase() === want,
    );
    if (idx === -1) return res.status(404).json({ ok: false, message: "Company not found" });

    const current = Boolean(city.hubCompanies[idx].isSponsored);
    city.hubCompanies[idx].isSponsored = !current;
    city.markModified("hubCompanies");
    await city.save();

    res.json({ ok: true, data: { isSponsored: !current } });
  } catch (err) {
    console.error("toggleSponsoredHubCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Remove one embedded company from a city (does not touch main directory). */
exports.deleteHubCompany = async (req, res) => {
  try {
    const { id, companySlug } = req.params;
    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    const want = decodeURIComponent(String(companySlug || "")).toLowerCase();
    const list = city.hubCompanies || [];
    const before = list.length;
    city.hubCompanies = list.filter(
      (c) => String(c.slug || "").toLowerCase() !== want,
    );

    if (city.hubCompanies.length === before) {
      return res.status(404).json({
        ok: false,
        message: "Company not found on this city",
      });
    }

    await city.save();
    res.json({
      ok: true,
      message: "Company removed from this city page",
      count: city.hubCompanies.length,
    });
  } catch (err) {
    console.error("deleteHubCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await City.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ ok: false, message: "City not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteCity:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.uploadCityCompaniesExcel = async (req, res) => {
  try {
    const citySlug =
      req.body.citySlug?.trim() ||
      req.params.citySlug ||
      req.query.citySlug?.trim();
    const fileBuffer = req.files?.file?.[0]?.buffer;

    if (!citySlug || !fileBuffer) {
      return res.status(400).json({
        ok: false,
        message: "citySlug and Excel file (field: file) are required.",
      });
    }

    const city = await City.findOne({
      hubSlug: HUB_MANAGED_IT,
      slug: String(citySlug).toLowerCase(),
    });
    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    let workbook;
    try {
      workbook = xlsx.read(fileBuffer, {
        type: "buffer",
        cellText: false,
        cellNF: false,
        raw: false,
      });
    } catch (e) {
      return res.status(400).json({
        ok: false,
        message: "Invalid Excel file.",
        error: e.message,
      });
    }

    if (!workbook.Sheets["Companies"]) {
      return res.status(400).json({
        ok: false,
        message: "Excel file must contain a sheet named 'Companies'.",
      });
    }

    let companiesSheet;
    try {
      companiesSheet = xlsx.utils.sheet_to_json(workbook.Sheets["Companies"]);
    } catch (e) {
      return res.status(400).json({
        ok: false,
        message: "Could not read sheet data.",
        error: e.message,
      });
    }

    if (!companiesSheet.length) {
      return res.status(400).json({
        ok: false,
        message: "No company rows found in the Companies sheet.",
      });
    }

    if (companiesSheet.length > 50) {
      return res.status(400).json({
        ok: false,
        message: "Maximum 50 companies per upload. Split into multiple files.",
      });
    }

    const hubCompanies = [];
    const usedSlugs = new Set();
    const seenNames = new Set();

    for (const row of companiesSheet) {
      const companyName = String(row["Company Name"] ?? "").trim();
      if (!companyName) continue;
      const key = companyName.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const cleaned = cleanCompanyData(row);
      if (!cleaned.companyName) continue;

      const slug = uniqueSlugForBatch(cleaned.companyName, usedSlugs);
      if (!slug) continue;

      hubCompanies.push(cleanedToHubDoc(cleaned, slug));
    }

    city.hubCompanies = hubCompanies;
    await city.save();

    res.status(200).json({
      ok: true,
      message: `Saved ${hubCompanies.length} companies on ${city.name} only (not added to main service directory).`,
      count: hubCompanies.length,
    });
  } catch (err) {
    console.error("uploadCityCompaniesExcel:", err);
    res.status(500).json({
      ok: false,
      message: "Server error during upload",
      error:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
