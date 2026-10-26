/**
 * One admin API for the companies of all three directories (Managed IT, MSSP, cybersecurity): list them together,
 * read, create, update and delete one. The dashboard's "All Companies" page uses it.
 *
 *   directory  mit | mssp | cyber
 *
 * Editing or deleting a Managed IT company also fixes its copy on the city, state and country pages (City.hubCompanies).
 * Adding a Managed IT company, or changing its city, state or country, puts it on the pages it now belongs to and takes
 * it off the others (placeCompanyOnPages), so it needs no Master Sheet upload.
 * After a change in the MSSP or cybersecurity directory the location pages are worked out again, because a changed
 * city or state can move a company to another page.
 */
const ManagedItCompany = require("../models/ManagedItCompany");
const MsspCompany = require("../models/MsspCompany");
const MsspPage = require("../models/MsspPage");
const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const CyberPage = require("../models/CyberPage");
const City = require("../models/City");
const publicCache = require("../utils/memoryCache");
const { escapeRegex, queryString } = require("../utils/escapeRegex");
const { makeSlug, domainOf, norm } = require("../utils/masterSheet");
const { relinkMssp } = require("../utils/msspImport");
const { relinkCyber } = require("../utils/cyberImport");
const { placeCompanyOnPages } = require("../utils/placeCompany");
const cloudinary = require("../config/cloudinary");
const { removeManagedItCompany, deletePictures } = require("../utils/removeCompany");

const DIRECTORIES = {
  mit: { Model: ManagedItCompany, label: "Managed IT", profilePath: "/managed-it-services" },
  mssp: { Model: MsspCompany, Page: MsspPage, label: "MSSP", profilePath: "/managed-security-service-providers", relink: relinkMssp },
  cyber: { Model: CyberSecurityCompany, Page: CyberPage, label: "Cybersecurity", profilePath: "/cybersecurity-companies", relink: relinkCyber },
};

// ── input cleaning ──────────────────────────────────────────────────────

const text = (v, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const longText = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const list = (v, maxItems = 40, maxLen = 200) => {
  const items = Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]/);
  return [...new Set(items.map((x) => text(x, maxLen)).filter(Boolean))].slice(0, maxItems);
};
/** "" for an empty value, null when it is not a web link. A bare domain gets https. */
const link = (v) => {
  const s = text(v, 500);
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s) && !/^https?:/i.test(s)) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
};
const LINK_FIELDS = ["website", "linkedinUrl", "facebookUrl", "twitterUrl", "image", "bookingUrl", "googleMapsUrl"];
const STRING_FIELDS = {
  companyName: 200, employees: 50, revenueSize: 80, industry: 300, companyStreet: 200, companyCity: 120, companyState: 120, companyCountry: 120,
  companyPostalCode: 30, address: 400, phone: 60, serviceArea: 400, supportHours: 200, clientSizeFocus: 300, specialization: 300, tagline: 200,
};
const LONG_FIELDS = { description: 5000, profileSummary: 8000 };
const LIST_FIELDS = ["companyServices", "companyPartners", "keywords", "technologies", "industriesServed", "certifications", "complianceFrameworks"];

/** The editable fields of a request body, cleaned. Only the fields that were sent are returned. Throws { field } on a bad value. */
function cleanBody(body) {
  const out = {};
  for (const [k, max] of Object.entries(STRING_FIELDS)) if (body[k] !== undefined) out[k] = text(body[k], max);
  for (const [k, max] of Object.entries(LONG_FIELDS)) if (body[k] !== undefined) out[k] = longText(body[k], max);
  for (const k of LINK_FIELDS) {
    if (body[k] === undefined) continue;
    const v = link(body[k]);
    if (v === null) throw Object.assign(new Error(`${k} is not a valid web link`), { field: k });
    out[k] = v;
  }
  for (const k of LIST_FIELDS) if (body[k] !== undefined) out[k] = list(body[k]);
  if (body.foundedYear !== undefined) {
    const n = parseInt(body.foundedYear, 10);
    out.foundedYear = Number.isFinite(n) && n > 1700 && n <= new Date().getFullYear() ? n : null;
  }
  if (body.isSponsored !== undefined) out.isSponsored = body.isSponsored === true || /^(y|yes|true|1)$/i.test(String(body.isSponsored));
  if (body.indexEligible !== undefined) out.indexEligible = body.indexEligible === true || /^(y|yes|true|1)$/i.test(String(body.indexEligible));
  if (body.isPublished !== undefined) out.isPublished = !(body.isPublished === false || /^(n|no|false|0)$/i.test(String(body.isPublished)));
  if (body.faqs !== undefined) {
    out.faqs = (Array.isArray(body.faqs) ? body.faqs : [])
      .map((f) => ({ question: text(f?.question, 300), answer: text(f?.answer, 1500) }))
      .filter((f) => f.question && f.answer)
      .slice(0, 10);
  }
  return out;
}

const publicProfile = (directory, slug) => `${DIRECTORIES[directory].profilePath}/${slug}`;

// ── Managed IT: the copy of a company on the city / state / country pages ─────────────────────────

const PAGE_COPY_FIELDS = [
  "companyName", "description", "address", "companyStreet", "companyCity", "companyState", "companyCountry", "companyPostalCode", "revenueSize",
  "companyServices", "companyPartners", "keywords", "employees", "foundedYear", "phone", "image", "website", "linkedinUrl", "facebookUrl",
  "twitterUrl", "technologies", "profileSummary", "tagline", "industriesServed", "serviceArea", "certifications", "supportHours", "indexEligible", "isSponsored",
  "clientSizeFocus", "specialization", "complianceFrameworks", "bookingUrl", "googleMapsUrl", "faqs",
];

async function syncPageCopies(slug, changes) {
  const set = {};
  for (const k of PAGE_COPY_FIELDS) if (changes[k] !== undefined) set[`hubCompanies.$[c].${k}`] = changes[k];
  if (changes.industry !== undefined) set["hubCompanies.$[c].industryTags"] = String(changes.industry).split(",").map((x) => x.trim()).filter(Boolean);
  if (!Object.keys(set).length) return;
  await City.updateMany({ "hubCompanies.slug": slug }, { $set: set }, { arrayFilters: [{ "c.slug": slug }] });
}

// ── logo upload ─────────────────────────────────────────────────────────

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * POST /api/v1/admin/companies/upload-logo   (multipart, one file in the field "image")
 * Sends the picture to Cloudinary and answers with its link. The dashboard puts the link in the Logo field of the
 * company, and the company is saved as usual. SVG is refused: it can carry script.
 */
exports.uploadLogo = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, message: "Choose a picture to upload" });
    if (!LOGO_TYPES.has(file.mimetype)) return res.status(400).json({ ok: false, message: "The picture must be a PNG, JPG, WEBP or GIF file" });
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    // The same Cloudinary folder as the logos of the city pages. No upload preset: the account in .env has none, and a signed
    // upload does not need one.
    const result = await cloudinary.uploader.upload(dataUri, { folder: "hub-company" });
    res.status(201).json({ ok: true, url: result.secure_url });
  } catch (err) {
    // Cloudinary says what is wrong (for example a wrong key), so the dashboard shows it.
    const why = String(err?.message || err?.error?.message || "").slice(0, 200);
    console.error("admin uploadLogo:", why);
    res.status(502).json({ ok: false, message: `The picture could not be uploaded to Cloudinary${why ? ` (${why})` : ""}. Try again.` });
  }
};

// ── list ────────────────────────────────────────────────────────────────

const LIST_FIELDS_OUT = { slug: 1, companyName: 1, companyCity: 1, companyState: 1, companyCountry: 1, employees: 1, website: 1, image: 1, indexEligible: 1, isPublished: 1, isSponsored: 1, updatedAt: 1 };

function listFilter(query) {
  const filter = {};
  const q = queryString(query.q).slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ companyName: re }, { companyCity: re }, { companyState: re }, { companyCountry: re }, { website: re }, { slug: re }];
  }
  if (query.eligible === "yes") filter.indexEligible = true;
  else if (query.eligible === "no") filter.indexEligible = { $ne: true };
  if (query.published === "yes") filter.isPublished = { $ne: false };
  else if (query.published === "no") filter.isPublished = false;
  return filter;
}

/** GET /api/v1/admin/companies?directory=all|mit|mssp|cyber&q=&eligible=&published=&page=&limit= */
exports.listCompanies = async (req, res) => {
  try {
    const page = Math.min(2000, Math.max(1, parseInt(req.query.page, 10) || 1));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = listFilter(req.query);
    const which = DIRECTORIES[req.query.directory] ? [req.query.directory] : Object.keys(DIRECTORIES);

    // One sorted list over every chosen directory (a union of the collections), paged.
    const [first, ...others] = which;
    const stage = (key) => [{ $match: filter }, { $project: { ...LIST_FIELDS_OUT, directory: { $literal: key } } }];
    const pipeline = [
      ...stage(first),
      ...others.map((key) => ({ $unionWith: { coll: DIRECTORIES[key].Model.collection.name, pipeline: stage(key) } })),
      { $addFields: { sortName: { $toLower: "$companyName" } } },
      { $sort: { sortName: 1, directory: 1 } },
      { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { sortName: 0 } }], total: [{ $count: "n" }] } },
    ];
    const [result, mit, mssp, cyber] = await Promise.all([
      DIRECTORIES[first].Model.aggregate(pipeline),
      ManagedItCompany.estimatedDocumentCount(),
      MsspCompany.estimatedDocumentCount(),
      CyberSecurityCompany.estimatedDocumentCount(),
    ]);
    const total = result[0]?.total[0]?.n || 0;
    res.json({ ok: true, data: result[0]?.rows || [], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)), counts: { mit, mssp, cyber } });
  } catch (err) {
    console.error("admin listCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ── one company ─────────────────────────────────────────────────────────

const directoryOf = (req, res) => {
  const dir = DIRECTORIES[req.params.directory];
  if (!dir) res.status(400).json({ ok: false, message: "Unknown directory" });
  return dir;
};

/** GET /api/v1/admin/companies/:directory/:slug */
exports.getCompany = async (req, res) => {
  try {
    const dir = directoryOf(req, res);
    if (!dir) return;
    const company = await dir.Model.findOne({ slug: String(req.params.slug).toLowerCase() }).select("-__v").lean();
    if (!company) return res.status(404).json({ ok: false, message: "Company not found" });
    res.json({ ok: true, data: { ...company, directory: req.params.directory, profilePath: publicProfile(req.params.directory, company.slug) } });
  } catch (err) {
    console.error("admin getCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** POST /api/v1/admin/companies/:directory */
exports.createCompany = async (req, res) => {
  try {
    const dir = directoryOf(req, res);
    if (!dir) return;
    let data;
    try { data = cleanBody(req.body || {}); } catch (e) { return res.status(400).json({ ok: false, message: e.message, field: e.field }); }
    if (!data.companyName) return res.status(400).json({ ok: false, message: "Company name is required", field: "companyName" });

    // The same company (website + city) must not be added twice to one directory.
    const sameSite = domainOf(data.website) ? await dir.Model.find({ website: new RegExp(escapeRegex(domainOf(data.website)), "i") }).select("slug companyCity").lean() : [];
    const twin = sameSite.find((c) => norm(c.companyCity) === norm(data.companyCity) && domainOf(data.website));
    if (twin) return res.status(409).json({ ok: false, message: `This company is already in the ${dir.label} directory (${twin.slug}).`, slug: twin.slug });

    const used = new Set((await dir.Model.find({}).select("slug").lean()).map((d) => d.slug));
    const slug = makeSlug({ companyName: data.companyName, companyCity: data.companyCity }, used);
    if (req.params.directory !== "mit") delete data.isSponsored;
    const doc = await dir.Model.create({ ...data, slug, isPublished: data.isPublished !== false });
    if (dir.relink) await dir.relink();
    const placed = req.params.directory === "mit" ? await placeCompanyOnPages(slug) : null;
    publicCache.clear();

    // Already in another directory? Allowed (a company can be listed in two), but the page says so.
    const others = await Promise.all(Object.entries(DIRECTORIES).filter(([, d]) => d !== dir && domainOf(data.website)).map(async ([key, d]) => ((await d.Model.exists({ website: new RegExp(escapeRegex(domainOf(data.website)), "i") })) ? d.label : null)));
    const alsoIn = others.filter(Boolean);
    res.status(201).json({
      ok: true,
      data: { ...doc.toObject(), directory: req.params.directory },
      placed,
      warning: [
        alsoIn.length ? `The same website is also in: ${alsoIn.join(", ")}.` : "",
        placed && !placed.added.length ? "No city, state or country page matches this location yet." : "",
      ].filter(Boolean).join(" "),
    });
  } catch (err) {
    console.error("admin createCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** PUT /api/v1/admin/companies/:directory/:slug  (the slug of a company never changes: its profile link stays) */
exports.updateCompany = async (req, res) => {
  try {
    const dir = directoryOf(req, res);
    if (!dir) return;
    let changes;
    try { changes = cleanBody(req.body || {}); } catch (e) { return res.status(400).json({ ok: false, message: e.message, field: e.field }); }
    if (changes.companyName !== undefined && !changes.companyName) return res.status(400).json({ ok: false, message: "Company name is required", field: "companyName" });
    const slug = String(req.params.slug).toLowerCase();
    if (req.params.directory !== "mit") delete changes.isSponsored; // only Managed IT companies sit on city, state and country pages
    const doc = await dir.Model.findOneAndUpdate({ slug }, { $set: changes }, { returnDocument: "after", runValidators: true }).select("-__v").lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Company not found" });
    let placed = null;
    if (req.params.directory === "mit") {
      await syncPageCopies(slug, changes);
      // Every save checks that the company is on the pages it belongs to and not on the others. A new city, state or
      // country moves it, a sponsor mark puts it on its pages, and a company that was left on the wrong pages by an
      // earlier save or an upload is put right the next time it is saved.
      placed = await placeCompanyOnPages(slug);
    }
    if (dir.relink) await dir.relink();
    publicCache.clear();
    res.json({ ok: true, data: { ...doc, directory: req.params.directory, profilePath: publicProfile(req.params.directory, slug) }, placed });
  } catch (err) {
    console.error("admin updateCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** DELETE /api/v1/admin/companies/:directory/:slug */
exports.deleteCompany = async (req, res) => {
  try {
    const dir = directoryOf(req, res);
    if (!dir) return;
    const slug = String(req.params.slug).toLowerCase();
    // Managed IT: the directory entry, every page copy and the pictures. The other directories: the entry and its picture.
    let removed;
    if (req.params.directory === "mit") {
      removed = await removeManagedItCompany(slug);
      if (!removed.found) return res.status(404).json({ ok: false, message: "Company not found" });
    } else {
      const doc = await dir.Model.findOneAndDelete({ slug });
      if (!doc) return res.status(404).json({ ok: false, message: "Company not found" });
      const used = async (url) => Boolean(await dir.Model.exists({ image: url }));
      removed = { found: true, pages: [], pictures: await deletePictures([doc.image].filter(Boolean), { alsoCheck: used }) };
    }
    if (dir.relink) await dir.relink();
    publicCache.clear();
    res.json({ ok: true, message: "Company deleted", removed: { pages: removed.pages, pictures: removed.pictures } });
  } catch (err) {
    console.error("admin deleteCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
