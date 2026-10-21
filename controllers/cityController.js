const path = require("path");
const publicCache = require("../utils/memoryCache");
const fs = require("fs/promises");
const City = require("../models/City.js");
const ManagedItCompany = require("../models/ManagedItCompany.js");
const cloudinary = require("../config/cloudinary.js");
const { cleanCompanyData } = require("../utils/companyData");
const { cleanHtml } = require("../utils/sanitizeHtml");
const { revalidateFrontend } = require("../utils/revalidateFrontend");
const { escapeRegex } = require("../utils/escapeRegex");

const HUB_MANAGED_IT = "managed-service-providers";
const HUB_TOP_MSPS = "top-msps";

/** Public URL base for a given hub  used for revalidation paths. */
function hubBasePath(hubSlug) {
  if (hubSlug === HUB_TOP_MSPS) return "/top-msps";
  return "/msp";
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


/** Master-sheet profile fields (Profile Summary, Tagline, Index Eligible ...). */
const PROFILE_FIELDS = [
  "profileSummary", "tagline", "industriesServed", "serviceArea", "certifications", "supportHours", "indexEligible",
  "clientSizeFocus", "specialization", "complianceFrameworks", "bookingUrl", "citySlug", "stateSlug", "countrySlug",
  "googleMapsUrl", "faqs",
];

// --- Public (no auth) ---

exports.getPublishedCitiesByHub = async (req, res) => {
  try {
    const { hubSlug } = req.params;
    const cacheKey = `citiesList|${hubSlug}`;
    const cached = publicCache.get(cacheKey);
    if (cached) return res.json(cached);

    const cities = await City.find({
      hubSlug,
      isPublished: true,
    })
      .sort({ name: 1 })
      .select("name slug state")
      .lean();

    const payload = {
      ok: true,
      data: cities.map((c) => ({
        name: c.name,
        slug: c.slug,
        state: c.state || "",
      })),
    };
    publicCache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("getPublishedCitiesByHub:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.getCityPublicByHub = async (req, res) => {
  try {
    const { hubSlug, citySlug } = req.params;

    // Hot path (every city page render): serve from the short-lived cache when possible.
    const cacheKey = `cityPublic|${hubSlug}|${String(citySlug).toLowerCase()}|${req.query.limit || ""}|${req.query.page || ""}`;
    const cached = publicCache.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", "private, no-store");
      return res.json(cached);
    }

    // Pagination is opt-in via ?page=&limit= (the city, state and country pages use it). A page like the United States
    // holds thousands of companies (about 12 MB), so for a paginated request the database only hands over the page
    // text and the 50 companies of the page, never the whole list.
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null;
    const match = { hubSlug, slug: String(citySlug).toLowerCase(), isPublished: true };

    let city;
    let companies;
    let companiesTotal;
    let pagination = null;

    if (limit) {
      const list = (cond) => ({ $filter: { input: { $ifNull: ["$hubCompanies", []] }, as: "c", cond } });
      const isSponsored = { $eq: ["$$c.isSponsored", true] };

      // 1) the page itself and how many companies it has (no company data leaves the database)
      [city] = await City.aggregate([
        { $match: match },
        {
          $project: {
            name: 1, slug: 1, state: 1, heading: 1, metaTitle: 1, metaDescription: 1, content: 1, faqs: 1,
            total: { $size: { $ifNull: ["$hubCompanies", []] } },
            sponsoredCount: { $size: list(isSponsored) },
          },
        },
      ]);
      if (!city) {
        return res.status(404).json({ ok: false, message: "City not found" });
      }
      const regularCount = city.total - city.sponsoredCount;
      const totalPages = Math.max(1, Math.ceil(regularCount / limit));
      const pageParam = parseInt(req.query.page, 10);
      const page = Math.min(Math.max(1, Number.isFinite(pageParam) ? pageParam : 1), totalPages);
      const start = (page - 1) * limit;

      // 2) only the sponsored companies and the slice of regular companies for this page
      const [rows] = await City.aggregate([
        { $match: match },
        { $project: { _id: 0, sponsored: list(isSponsored), regular: { $slice: [list({ $ne: ["$$c.isSponsored", true] }), start, limit] } } },
      ]);
      companies = [...((rows && rows.sponsored) || []), ...((rows && rows.regular) || [])];
      companiesTotal = city.total;
      pagination = { page, limit, totalPages, totalCompanies: regularCount };
    } else {
      // no pagination asked for: the full list, as before
      city = await City.findOne(match).lean();
      if (!city) {
        return res.status(404).json({ ok: false, message: "City not found" });
      }
      companies = Array.isArray(city.hubCompanies) ? city.hubCompanies : [];
      companiesTotal = companies.length;
    }

    const payload = {
      ok: true,
      data: {
        name: city.name,
        slug: city.slug,
        state: city.state || "",
        heading: city.heading || "",
        metaTitle: city.metaTitle,
        metaDescription: city.metaDescription,
        content: city.content || "",
        faqs: Array.isArray(city.faqs) ? city.faqs : [],
        companies,
        companiesTotal,
        companiesSource: "hub",
        ...(pagination ? { pagination } : {}),
      },
    };
    publicCache.set(cacheKey, payload);
    res.set("Cache-Control", "private, no-store");
    res.json(payload);
  } catch (err) {
    console.error("getCityPublicByHub:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


/**
 * Compact tree for sitemap: published cities + company slugs + lastmod (city updatedAt).
 * Public, no auth single round-trip vs N+1 city fetches.
 */
exports.getManagedItHubSitemapEntries = async (req, res) => {
  try {
    const hubSlug = req.params.hubSlug || HUB_MANAGED_IT;
    // Page level only: the sitemap lists city / state / country pages, never company copies.
    const cities = await City.aggregate([
      { $match: { hubSlug, isPublished: true } },
      { $sort: { name: 1 } },
      // companyCount lets the sitemap leave out pages that have no listings (they are noindex)
      { $project: { slug: 1, updatedAt: 1, companyCount: { $size: { $ifNull: ["$hubCompanies", []] } } } },
    ]);

    const data = cities.map((c) => ({
      slug: c.slug,
      lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      companyCount: c.companyCount,
    }));

    res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
    res.json({ ok: true, data });
  } catch (err) {
    console.error("getManagedItHubSitemapEntries:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// --- Admin ---

/** Lightweight city list — no hubCompanies / content blobs (those load on demand). */
exports.listCitiesAdmin = async (req, res) => {
  try {
    const hubSlug = req.query.hubSlug || HUB_MANAGED_IT;
    const cities = await City.aggregate([
      { $match: { hubSlug } },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          name: 1,
          slug: 1,
          state: 1,
          hubSlug: 1,
          heading: 1,
          metaTitle: 1,
          metaDescription: 1,
          isPublished: 1,
          faqs: 1,
          createdAt: 1,
          updatedAt: 1,
          companyCount: { $size: { $ifNull: ["$hubCompanies", []] } },
        },
      },
    ]);

    res.json({ ok: true, data: cities });
  } catch (err) {
    console.error("listCitiesAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Single city for admin — include=content|companies|all (default: meta + faqs, no heavy arrays). */
exports.getCityAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const include = String(req.query.include || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const wantCompanies = include.includes("companies") || include.includes("all");
    const wantContent = include.includes("content") || include.includes("all");

    const select = [
      "name",
      "slug",
      "state",
      "hubSlug",
      "heading",
      "metaTitle",
      "metaDescription",
      "isPublished",
      "faqs",
      "createdAt",
      "updatedAt",
      ...(wantContent ? ["content"] : []),
      ...(wantCompanies ? ["hubCompanies"] : []),
    ].join(" ");

    const city = await City.findById(id).select(select).lean();
    if (!city) {
      return res.status(404).json({ ok: false, message: "City not found" });
    }

    res.json({
      ok: true,
      data: {
        ...city,
        companyCount: Array.isArray(city.hubCompanies)
          ? city.hubCompanies.length
          : undefined,
      },
    });
  } catch (err) {
    console.error("getCityAdmin:", err);
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

    // Search path: still flatten, but only search-relevant fields (much smaller payload).
    if (q) {
      const cities = await City.find({ hubSlug })
        .sort({ name: 1 })
        .select({
          name: 1,
          slug: 1,
          "hubCompanies.slug": 1,
          "hubCompanies.companyName": 1,
          "hubCompanies.companyCity": 1,
          "hubCompanies.description": 1,
          "hubCompanies.keywords": 1,
          "hubCompanies.image": 1,
          "hubCompanies.website": 1,
          "hubCompanies.isSponsored": 1,
          "hubCompanies.employees": 1,
          "hubCompanies.foundedYear": 1,
          "hubCompanies.phone": 1,
          "hubCompanies.address": 1,
          "hubCompanies.companyStreet": 1,
          "hubCompanies.companyPostalCode": 1,
          "hubCompanies.companyServices": 1,
          "hubCompanies.companyPartners": 1,
          "hubCompanies.industryTags": 1,
          "hubCompanies.linkedinUrl": 1,
          "hubCompanies.facebookUrl": 1,
          "hubCompanies.twitterUrl": 1,
          "hubCompanies.naicsCodes": 1,
          "hubCompanies.sicCodes": 1,
          "hubCompanies.technologies": 1,
          "hubCompanies.vars": 1,
          "hubCompanies.revenueSize": 1,
          "hubCompanies.companyState": 1,
          "hubCompanies.companyCountry": 1,
          "hubCompanies.tagline": 1,
          "hubCompanies.profileSummary": 1,
          "hubCompanies.industriesServed": 1,
          "hubCompanies.serviceArea": 1,
          "hubCompanies.certifications": 1,
          "hubCompanies.supportHours": 1,
          "hubCompanies.indexEligible": 1,
          "hubCompanies.clientSizeFocus": 1,
          "hubCompanies.specialization": 1,
          "hubCompanies.complianceFrameworks": 1,
          "hubCompanies.bookingUrl": 1,
          "hubCompanies.googleMapsUrl": 1,
          "hubCompanies.faqs": 1,
        })
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

      const filtered = rows.filter((r) => hubCompanySearchHaystack(r).includes(q));
      filtered.sort((a, b) => {
        const da = hubCompanyRelevanceScore(a, q);
        const db = hubCompanyRelevanceScore(b, q);
        if (da !== db) return da - db;
        return (a.companyName || "").localeCompare(b.companyName || "", undefined, {
          sensitivity: "base",
        });
      });

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * limit;
      const pageData = filtered.slice(skip, skip + limit);

      return res.json({
        ok: true,
        data: pageData,
        total,
        page: safePage,
        limit,
        totalPages,
      });
    }

    // Browse path: Mongo unwind + skip/limit so Node never holds the full flatten.
    const [agg] = await City.aggregate([
      { $match: { hubSlug } },
      { $sort: { name: 1 } },
      { $project: { name: 1, slug: 1, hubCompanies: 1 } },
      { $unwind: { path: "$hubCompanies", preserveNullAndEmptyArrays: false } },
      { $sort: { name: 1, "hubCompanies.companyName": 1 } },
      {
        $facet: {
          meta: [{ $count: "total" }],
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: [
                    "$hubCompanies",
                    {
                      cityId: "$_id",
                      cityName: "$name",
                      citySlug: "$slug",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ]);

    const total = agg?.meta?.[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
    let safePage = Math.min(page, totalPages);
    let pageData = Array.isArray(agg?.data) ? agg.data : [];

    // Out-of-range page: re-run skip against last valid page.
    if (safePage !== page && total > 0) {
      const [retry] = await City.aggregate([
        { $match: { hubSlug } },
        { $sort: { name: 1 } },
        { $project: { name: 1, slug: 1, hubCompanies: 1 } },
        { $unwind: { path: "$hubCompanies", preserveNullAndEmptyArrays: false } },
        { $sort: { name: 1, "hubCompanies.companyName": 1 } },
        {
          $facet: {
            data: [
              { $skip: (safePage - 1) * limit },
              { $limit: limit },
              {
                $replaceRoot: {
                  newRoot: {
                    $mergeObjects: [
                      "$hubCompanies",
                      {
                        cityId: "$_id",
                        cityName: "$name",
                        citySlug: "$slug",
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ]);
      pageData = Array.isArray(retry?.data) ? retry.data : [];
    }

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
      state = "",
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
      state: String(state || "").trim(),
      slug: safeSlug,
      hubSlug,
      isPublished: Boolean(isPublished),
      heading: String(heading).trim(),
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      content: typeof content === "string" ? cleanHtml(content) : "",
      faqs: normalizeCityFaqs(faqs),
      hubCompanies: [],
    });

    revalidateFrontend([hubBasePath(city.hubSlug), `${hubBasePath(city.hubSlug)}/${city.slug}`]);
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
    if (req.body.state !== undefined) {
      city.state = String(req.body.state || "").trim();
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
      city.content = typeof req.body.content === "string" ? cleanHtml(req.body.content) : "";
    }
    if (req.body.faqs !== undefined) {
      city.faqs = normalizeCityFaqs(req.body.faqs);
    }

    await city.save();
    revalidateFrontend([hubBasePath(city.hubSlug), `${hubBasePath(city.hubSlug)}/${city.slug}`]);
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
      "Company State": body.companyState,
      "Country": body.companyCountry,
      "ZIP Code": body.companyPostalCode,
      "Revenue Size": body.revenueSize,
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
      "Profile Summary": body.profileSummary,
      Tagline: body.tagline,
      "Industries Served": body.industriesServed,
      "Service Area": body.serviceArea,
      Certifications: body.certifications,
      "Support Hours": body.supportHours,
      "Index Eligible": body.indexEligible,
      "Client Size Focus": body.clientSizeFocus,
      Specialization: body.specialization,
      "Compliance Frameworks": body.complianceFrameworks,
      "Booking/Contact URL": body.bookingUrl,
      "City Slug": body.citySlug,
      "State Slug": body.stateSlug,
      "Country Slug": body.countrySlug,
      "Google Maps URL": body.googleMapsUrl,
      "Company FAQ": body.faqs,
    };

    const cleaned = cleanCompanyData(mapped);
    // Only the profile fields the form actually sent are changed; the rest stay as they are.
    const profilePatch = {};
    for (const k of PROFILE_FIELDS) if (body[k] !== undefined) profilePatch[k] = cleaned[k];
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
      // The slug is the company's one URL everywhere, so it has to be free in the whole directory, not just on this page.
      if (candidate !== nextSlug && (await ManagedItCompany.exists({ slug: candidate }))) {
        return res.status(409).json({ ok: false, message: "Another company in the directory already uses that slug" });
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

    const currentPlain = typeof current.toObject === "function" ? current.toObject() : { ...current };
    const updated = {
      ...currentPlain,
      ...profilePatch,
      slug: nextSlug,
      companyName: cleaned.companyName,
      description: cleaned.description,
      address: cleaned.address,
      companyStreet: cleaned.companyStreet,
      companyCity: cleaned.companyCity,
      companyState: cleaned.companyState,
      companyCountry: cleaned.companyCountry,
      companyPostalCode: cleaned.companyPostalCode,
      revenueSize: cleaned.revenueSize,
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

    // The same company is also in the main directory and on its other city / state / country pages.
    // Keep those copies in step with this edit (sponsorship stays per page).
    try {
      const oldSlug = String(current.slug || "").toLowerCase();
      const { isSponsored, ...shared } = updated;
      const dirFields = { ...shared, industry: (shared.industryTags || []).join(", ") };
      delete dirFields.industryTags;
      delete dirFields.vars;
      await ManagedItCompany.updateOne({ slug: oldSlug }, { $set: dirFields });
      const setObj = {};
      for (const [k, v] of Object.entries(shared)) setObj[`hubCompanies.$[c].${k}`] = v;
      await City.updateMany(
        { _id: { $ne: city._id }, "hubCompanies.slug": oldSlug },
        { $set: setObj },
        { arrayFilters: [{ "c.slug": oldSlug, "c.isSponsored": { $ne: true } }] },
      );
      publicCache.clear();
    } catch (syncErr) {
      console.error("updateHubCompany sync:", syncErr?.message);
    }

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


// Public: search companies by name across all cities
exports.searchCompanies = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 8, 20);
    if (!q) return res.json({ ok: true, data: [] });

    // One list of companies: the directory. (Searching every city page copy returned the same company many times.)
    const rows = await ManagedItCompany.find({ companyName: new RegExp(escapeRegex(q), "i") })
      .select("companyName slug image website companyCity companyState")
      .limit(limit)
      .lean();

    const matches = rows.map((c) => ({
      companyName: c.companyName,
      slug: c.slug,
      image: c.image || "",
      website: c.website || "",
      companyCity: c.companyCity || "",
      companyState: c.companyState || "",
    }));

    res.json({ ok: true, data: matches });
  } catch (err) {
    console.error("searchCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

function slugifyCityKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Find a published /msp city hub by slug or display name. */
exports.findPublishedMspCity = async (slugOrName, fallbackName) => {
  const slug = slugifyCityKey(slugOrName);
  const name = String(fallbackName || slugOrName || "").trim();

  if (slug) {
    const bySlug = await City.findOne({
      hubSlug: HUB_MANAGED_IT,
      isPublished: true,
      slug,
    });
    if (bySlug) return bySlug;
  }

  if (name) {
    const escaped = escapeRegex(name);
    const byName = await City.findOne({
      hubSlug: HUB_MANAGED_IT,
      isPublished: true,
      name: new RegExp(`^${escaped}$`, "i"),
    });
    if (byName) return byName;
  }

  return null;
};

/** Find a published /top-msps country hub by slug or display name. */
exports.findPublishedMspCountry = async (slugOrName, fallbackName) => {
  const slug = slugifyCityKey(slugOrName);
  const name = String(fallbackName || slugOrName || "").trim();

  if (slug) {
    const bySlug = await City.findOne({
      hubSlug: HUB_TOP_MSPS,
      isPublished: true,
      slug,
    });
    if (bySlug) return bySlug;
  }

  if (name) {
    const escaped = escapeRegex(name);
    const byName = await City.findOne({
      hubSlug: HUB_TOP_MSPS,
      isPublished: true,
      name: new RegExp(`^${escaped}$`, "i"),
    });
    if (byName) return byName;
  }

  return null;
};

/**
 * POST /api/v1/admin/wipe-listing-companies
 * Deletes listing companies only:
 *  - all Managed IT Services documents
 *  - hubCompanies on every /msp city page
 *  - hubCompanies on every /top-msps country page
 * Does NOT delete city/country pages, SEO content, cyber, MSSP, or vendors.
 * Body: { confirm: "DELETE_COMPANIES" }
 */
exports.wipeListingCompanies = async (req, res) => {
  if (String(req.body?.confirm || "").trim() !== "DELETE_COMPANIES") {
    return res.status(400).json({
      ok: false,
      message: 'Confirm by sending { "confirm": "DELETE_COMPANIES" }',
    });
  }

  try {
    const cityFilter = { hubSlug: HUB_MANAGED_IT };
    const countryFilter = { hubSlug: HUB_TOP_MSPS };

    const [cityHubs, countryHubs, mitCount] = await Promise.all([
      City.find(cityFilter).select("slug hubCompanies").lean(),
      City.find(countryFilter).select("slug hubCompanies").lean(),
      ManagedItCompany.countDocuments({}),
    ]);

    const cityCompanyCount = cityHubs.reduce((n, c) => n + (c.hubCompanies?.length || 0), 0);
    const countryCompanyCount = countryHubs.reduce((n, c) => n + (c.hubCompanies?.length || 0), 0);

    const [mitResult] = await Promise.all([
      ManagedItCompany.deleteMany({}),
      City.updateMany(cityFilter, { $set: { hubCompanies: [] } }),
      City.updateMany(countryFilter, { $set: { hubCompanies: [] } }),
    ]);

    const revalidatePaths = [
      "/managed-it-services",
      "/msp",
      "/top-msps",
      ...cityHubs.map((c) => `/msp/${c.slug}`),
      ...countryHubs.map((c) => `/top-msps/${c.slug}`),
    ];
    await revalidateFrontend(revalidatePaths);

    res.json({
      ok: true,
      message: `Deleted ${mitResult.deletedCount} MIT, ${cityCompanyCount} city, and ${countryCompanyCount} country companies. Pages and SEO kept.`,
      deleted: {
        managedItServices: mitResult.deletedCount,
        mspCityPages: cityCompanyCount,
        topMspsCountries: countryCompanyCount,
        cityPagesCleared: cityHubs.length,
        countryPagesCleared: countryHubs.length,
      },
    });
  } catch (err) {
    console.error("wipeListingCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
