// Data-quality tools for company listings across every public source:
// city/country hub companies (embedded in City), Managed IT and Cybersecurity directories.
// Finds broken characters (mojibake) and duplicate companies, and edits / fixes / deletes them.
const mongoose = require("mongoose");
const City = require("../models/City.js");
const ManagedItCompany = require("../models/ManagedItCompany.js");
const CyberSecurityCompany = require("../models/CyberSecurityCompany.js");
const { fixText, findBadSequences } = require("../utils/badChars");
const { revalidateFrontend } = require("../utils/revalidateFrontend");

const HUB_LABELS = {
  "managed-service-providers": "MSP city pages (/msp)",
  "top-msps": "Top MSPs (/top-msps)",
  "top-mssp": "Top MSSP (/top-mssp)",
};
const HUB_PATHS = {
  "managed-service-providers": "/msp",
  "top-msps": "/top-msps",
  "top-mssp": "/top-mssp",
};
const FLAT_SOURCES = {
  mit: { model: ManagedItCompany, label: "Managed IT (/managed-it-services)", path: "/managed-it-services" },
  cyber: { model: CyberSecurityCompany, label: "Cybersecurity (/cybersecurity-companies)", path: "/cybersecurity-companies" },
};

// Fields shown on the public site that we scan for bad characters.
const TEXT_FIELDS = ["companyName", "description", "address", "companyStreet", "companyCity", "companyState", "companyCountry"];
const LIST_FIELDS = ["companyServices", "companyPartners", "keywords", "industryTags", "technologies"];
const SCAN_FIELDS = [...TEXT_FIELDS, ...LIST_FIELDS];
// Fields the dashboard may edit directly.
const EDITABLE_FIELDS = ["companyName", "description", "linkedinUrl", "website"];

const NAME_SUFFIXES = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|pllc|plc|lp|llp|group)\b/g;

/** "Acme IT Solutions, LLC." -> "acme it solutions" (so spelling variants group together). */
function normName(name) {
  const base = fixText(String(name || ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ");
  const squash = (s) => s.replace(/\s+/g, " ").trim();
  // Keep the suffix if it's the whole name (e.g. "Group").
  return squash(base.replace(NAME_SUFFIXES, " ")) || squash(base);
}

/** "https://uk.linkedin.com/company/Acme-IT/about?x=1" -> "company/acme-it" */
function normLinkedin(url) {
  const s = String(url || "").trim().toLowerCase();
  const m = s.match(/linkedin\.com\/(company|in|school|showcase)\/([^/?#\s]+)/);
  if (!m) return "";
  try {
    return `${m[1]}/${decodeURIComponent(m[2])}`;
  } catch (_) {
    return `${m[1]}/${m[2]}`;
  }
}

function sourceLabel(source) {
  if (source.startsWith("hub:")) return HUB_LABELS[source.slice(4)] || source.slice(4);
  return FLAT_SOURCES[source]?.label || source;
}

function publicPath(row) {
  if (row.source.startsWith("hub:")) {
    const base = HUB_PATHS[row.source.slice(4)] || "/msp";
    return `${base}/${row.citySlug}/${row.slug}`;
  }
  return `${FLAT_SOURCES[row.source].path}/${row.slug}`;
}

/** Sources the dashboard can filter by (hubs found in the DB + flat directories). */
async function listSources() {
  const hubs = await City.distinct("hubSlug");
  return [
    ...hubs.map((h) => ({ key: `hub:${h}`, label: HUB_LABELS[h] || h })),
    ...Object.entries(FLAT_SOURCES).map(([key, v]) => ({ key, label: v.label })),
  ];
}

/**
 * Every company from the chosen source ("all", "hub:<hubSlug>", "mit", "cyber") as flat rows:
 * { source, id, cityId?, cityName?, citySlug?, slug, companyName, linkedinUrl, website, ...scan fields }
 */
async function loadCompanies(source = "all") {
  const rows = [];
  const pick = ["slug", "companyName", "linkedinUrl", "website", ...SCAN_FIELDS];

  if (source === "all" || source.startsWith("hub:")) {
    const match = source === "all" ? {} : { hubSlug: source.slice(4) };
    const projection = { name: 1, slug: 1, hubSlug: 1 };
    for (const f of pick) projection[`hubCompanies.${f}`] = 1;
    const cities = await City.find(match).select(projection).lean();
    for (const c of cities) {
      for (const co of c.hubCompanies || []) {
        rows.push({
          ...co,
          source: `hub:${c.hubSlug}`,
          id: `${c._id}:${co.slug}`,
          cityId: String(c._id),
          cityName: c.name,
          citySlug: c.slug,
        });
      }
    }
  }

  for (const [key, { model }] of Object.entries(FLAT_SOURCES)) {
    if (source !== "all" && source !== key) continue;
    const docs = await model.find({}).select(pick.join(" ")).lean();
    for (const d of docs) rows.push({ ...d, source: key, id: String(d._id) });
  }
  return rows;
}

/** [{ field, bad: ["â€“", ...], value, fixed }] for the fields that contain bad characters. */
function scanRow(row) {
  const issues = [];
  for (const field of TEXT_FIELDS) {
    const bad = findBadSequences(row[field]);
    if (bad.length) issues.push({ field, bad, value: row[field], fixed: fixText(row[field]) });
  }
  for (const field of LIST_FIELDS) {
    const list = Array.isArray(row[field]) ? row[field] : [];
    const bad = [...new Set(list.flatMap(findBadSequences))];
    if (bad.length) {
      issues.push({ field, bad, value: list.join(", "), fixed: list.map((v) => fixText(v)).join(", ") });
    }
  }
  return issues;
}

function summarize(row) {
  return {
    id: row.id,
    source: row.source,
    sourceLabel: sourceLabel(row.source),
    cityId: row.cityId,
    cityName: row.cityName,
    citySlug: row.citySlug,
    slug: row.slug,
    companyName: row.companyName,
    description: row.description || "",
    linkedinUrl: row.linkedinUrl || "",
    website: row.website || "",
    publicPath: publicPath(row),
  };
}

function paginate(list, req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "25", 10) || 25));
  const totalPages = Math.max(1, Math.ceil(list.length / limit));
  const safePage = Math.min(page, totalPages);
  return {
    data: list.slice((safePage - 1) * limit, safePage * limit),
    total: list.length,
    page: safePage,
    limit,
    totalPages,
  };
}

function matchesQuery(row, q) {
  if (!q) return true;
  return [row.companyName, row.cityName, row.slug, row.linkedinUrl, row.website]
    .some((v) => String(v || "").toLowerCase().includes(q));
}

/** GET /admin/company-quality/sources */
exports.getSources = async (req, res) => {
  try {
    res.json({ ok: true, data: await listSources() });
  } catch (err) {
    console.error("getSources:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * GET /admin/company-quality/bad-chars?source=all&field=description&char=â€“&q=&page=1&limit=25
 * Companies whose public text contains broken characters, plus a count per bad sequence.
 */
exports.listBadChars = async (req, res) => {
  try {
    const source = String(req.query.source || "all");
    const field = String(req.query.field || "");
    const char = String(req.query.char || "");
    const q = String(req.query.q || "").trim().toLowerCase();

    const rows = await loadCompanies(source);
    const flagged = [];
    const charCounts = {};
    for (const row of rows) {
      let issues = scanRow(row);
      if (field) issues = issues.filter((i) => i.field === field);
      if (!issues.length) continue;
      const seqs = new Set(issues.flatMap((i) => i.bad));
      for (const s of seqs) charCounts[s] = (charCounts[s] || 0) + 1;
      if (char && !seqs.has(char)) continue;
      if (!matchesQuery(row, q)) continue;
      flagged.push({ ...summarize(row), issues });
    }
    flagged.sort((a, b) => (a.companyName || "").localeCompare(b.companyName || ""));

    const chars = Object.entries(charCounts)
      .map(([seq, count]) => ({ seq, count, fixed: fixText(seq) }))
      .sort((a, b) => b.count - a.count);

    res.json({ ok: true, ...paginate(flagged, req), chars, scanned: rows.length });
  } catch (err) {
    console.error("listBadChars:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * GET /admin/company-quality/duplicates?source=all&by=name|linkedin|both&status=&q=&page=1&limit=25
 * Groups of companies sharing a name and/or LinkedIn URL. Each group gets a status:
 *  - "verified":  same name and all LinkedIn URLs match (real duplicate)
 *  - "conflict":  same name/LinkedIn but the other one differs (check by hand)
 *  - "unverified": no LinkedIn URLs to compare
 */
exports.listDuplicates = async (req, res) => {
  try {
    const source = String(req.query.source || "all");
    const by = ["name", "linkedin", "both"].includes(req.query.by) ? req.query.by : "name";
    const status = String(req.query.status || "");
    const q = String(req.query.q || "").trim().toLowerCase();

    const rows = await loadCompanies(source);
    const groups = new Map();
    for (const row of rows) {
      const n = normName(row.companyName);
      const l = normLinkedin(row.linkedinUrl);
      let key = "";
      if (by === "name") key = n;
      else if (by === "linkedin") key = l;
      else if (n && l) key = `${n}|${l}`;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const out = [];
    const statusCounts = { verified: 0, conflict: 0, unverified: 0 };
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const linkedins = new Set(members.map((m) => normLinkedin(m.linkedinUrl)).filter(Boolean));
      const names = new Set(members.map((m) => normName(m.companyName)));
      let groupStatus;
      if (by === "both") groupStatus = "verified";
      else if (by === "linkedin") groupStatus = names.size === 1 ? "verified" : "conflict";
      else if (linkedins.size === 0) groupStatus = "unverified";
      else if (linkedins.size === 1 && members.every((m) => normLinkedin(m.linkedinUrl))) groupStatus = "verified";
      else groupStatus = "conflict";
      statusCounts[groupStatus] += 1;

      if (status && status !== groupStatus) continue;
      if (q && !members.some((m) => matchesQuery(m, q))) continue;
      out.push({
        key,
        status: groupStatus,
        count: members.length,
        companies: members
          .map((m) => ({ ...summarize(m), badChars: scanRow(m).length > 0 }))
          .sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || (a.cityName || "").localeCompare(b.cityName || "")),
      });
    }
    out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    res.json({
      ok: true,
      ...paginate(out, req),
      statusCounts,
      duplicateCompanies: out.reduce((n, g) => n + g.count, 0),
      scanned: rows.length,
    });
  } catch (err) {
    console.error("listDuplicates:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** Parse "hub:<hubSlug>" + id "<cityId>:<slug>" or a flat source + Mongo id. */
function parseTarget({ source, id }) {
  source = String(source || "");
  id = String(id || "");
  if (source.startsWith("hub:")) {
    const i = id.indexOf(":");
    const cityId = id.slice(0, i);
    const slug = id.slice(i + 1);
    if (i < 1 || !slug || !mongoose.isValidObjectId(cityId)) return null;
    return { kind: "hub", cityId, slug };
  }
  if (FLAT_SOURCES[source] && mongoose.isValidObjectId(id)) {
    return { kind: "flat", model: FLAT_SOURCES[source].model, source, id };
  }
  return null;
}

/** Load the current company for a target, or null. */
async function loadTarget(t) {
  if (t.kind === "hub") {
    const city = await City.findOne(
      { _id: t.cityId, "hubCompanies.slug": t.slug },
      { name: 1, slug: 1, hubSlug: 1, "hubCompanies.$": 1 },
    ).lean();
    if (!city) return null;
    return { company: city.hubCompanies[0], city };
  }
  const company = await t.model.findById(t.id).lean();
  return company ? { company } : null;
}

async function applyUpdate(t, set) {
  if (!Object.keys(set).length) return;
  if (t.kind === "hub") {
    const $set = {};
    for (const [k, v] of Object.entries(set)) $set[`hubCompanies.$.${k}`] = v;
    await City.updateOne({ _id: t.cityId, "hubCompanies.slug": t.slug }, { $set });
  } else {
    await t.model.updateOne({ _id: t.id }, { $set: set });
  }
}

function pathsFor(t, loaded) {
  if (t.kind === "hub") {
    const base = HUB_PATHS[loaded.city.hubSlug] || "/msp";
    return [base, `${base}/${loaded.city.slug}`, `${base}/${loaded.city.slug}/${t.slug}`];
  }
  const base = FLAT_SOURCES[t.source].path;
  return [base, `${base}/${loaded.company.slug}`];
}

/** PATCH /admin/company-quality/company  { source, id, set: { companyName?, description?, linkedinUrl?, website? } } */
exports.updateCompany = async (req, res) => {
  try {
    const t = parseTarget(req.body || {});
    if (!t) return res.status(400).json({ ok: false, message: "Invalid company reference" });
    const loaded = await loadTarget(t);
    if (!loaded) return res.status(404).json({ ok: false, message: "Company not found" });

    const set = {};
    for (const f of EDITABLE_FIELDS) {
      if (req.body.set?.[f] !== undefined) set[f] = String(req.body.set[f]).trim();
    }
    if (set.companyName === "") return res.status(400).json({ ok: false, message: "Company name is required" });
    for (const f of ["linkedinUrl", "website"]) {
      if (set[f] && !/^https?:\/\//i.test(set[f])) set[f] = `https://${set[f]}`;
    }

    await applyUpdate(t, set);
    revalidateFrontend(pathsFor(t, loaded));
    res.json({ ok: true, message: "Company updated" });
  } catch (err) {
    console.error("updateCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * POST /admin/company-quality/fix  { items: [{ source, id }], removeEmoji?: boolean }
 *   or { all: true, source?, char? } to fix every flagged company (optionally only those with `char`).
 * Auto-repairs broken characters in every scanned field of each company.
 */
exports.autoFix = async (req, res) => {
  try {
    let items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
    const removeEmoji = Boolean(req.body?.removeEmoji);
    if (req.body?.all) {
      const char = String(req.body.char || "");
      items = (await loadCompanies(String(req.body.source || "all")))
        .filter((row) => {
          const issues = scanRow(row);
          return issues.length && (!char || issues.some((i) => i.bad.includes(char)));
        })
        .map((row) => ({ source: row.source, id: row.id }));
    }
    if (!items.length) return res.status(400).json({ ok: false, message: "No companies selected" });

    let fixed = 0;
    const paths = new Set();
    for (const item of items) {
      const t = parseTarget(item);
      if (!t) continue;
      const loaded = await loadTarget(t);
      if (!loaded) continue;
      const { company } = loaded;

      const set = {};
      for (const f of TEXT_FIELDS) {
        if (typeof company[f] !== "string") continue;
        const next = fixText(company[f], { removeEmoji });
        if (next !== company[f]) set[f] = next;
      }
      for (const f of LIST_FIELDS) {
        if (!Array.isArray(company[f])) continue;
        const next = company[f].map((v) => fixText(v, { removeEmoji })).filter(Boolean);
        if (next.join("\u0000") !== company[f].join("\u0000")) set[f] = next;
      }
      if (!Object.keys(set).length) continue;
      await applyUpdate(t, set);
      pathsFor(t, loaded).forEach((p) => paths.add(p));
      fixed += 1;
    }
    revalidateFrontend([...paths]);
    res.json({ ok: true, fixed, message: `Fixed ${fixed} ${fixed === 1 ? "company" : "companies"}` });
  } catch (err) {
    console.error("autoFix:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** POST /admin/company-quality/delete  { items: [{ source, id }] } */
exports.deleteCompanies = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
    if (!items.length) return res.status(400).json({ ok: false, message: "No companies selected" });

    let deleted = 0;
    const paths = new Set();
    for (const item of items) {
      const t = parseTarget(item);
      if (!t) continue;
      const loaded = await loadTarget(t);
      if (!loaded) continue;
      if (t.kind === "hub") {
        await City.updateOne({ _id: t.cityId }, { $pull: { hubCompanies: { slug: t.slug } } });
      } else {
        await t.model.deleteOne({ _id: t.id });
      }
      pathsFor(t, loaded).forEach((p) => paths.add(p));
      deleted += 1;
    }
    revalidateFrontend([...paths]);
    res.json({ ok: true, deleted, message: `Deleted ${deleted} ${deleted === 1 ? "company" : "companies"}` });
  } catch (err) {
    console.error("deleteCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.normName = normName;
exports.normLinkedin = normLinkedin;
