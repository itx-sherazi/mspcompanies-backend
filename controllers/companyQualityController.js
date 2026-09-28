// Data-quality tools for company listings across every public source:
// city/country hub companies (embedded in City), Managed IT and Cybersecurity directories.
// Finds broken characters (mojibake) and duplicate companies, and edits / fixes / deletes them.
//
// Speed: MongoDB pre-filters with a cheap regex so only suspicious companies reach Node, and
// scan results are cached for a few minutes (cleared on every edit / fix / delete).
const mongoose = require("mongoose");
const City = require("../models/City.js");
const ManagedItCompany = require("../models/ManagedItCompany.js");
const CyberSecurityCompany = require("../models/CyberSecurityCompany.js");
const { fixText, findBadSequences } = require("../utils/badChars");
const { revalidateFrontend } = require("../utils/revalidateFrontend");

const HUB_LABELS = {
  "managed-service-providers": "MSP city pages (/msp)",
  "top-msps": "Top MSPs country pages (/top-msps)",
  "top-mssp": "Top MSSP country pages (/top-mssp)",
};
const HUB_PATHS = {
  "managed-service-providers": "/msp",
  "top-msps": "/top-msps",
  "top-mssp": "/top-mssp",
};
const FLAT_SOURCES = {
  mit: { model: ManagedItCompany, label: "Managed IT Services", path: "/managed-it-services" },
  cyber: { model: CyberSecurityCompany, label: "Cybersecurity Companies", path: "/cybersecurity-companies" },
};

// Fields shown on the public site that we scan for bad characters.
const TEXT_FIELDS = ["companyName", "description", "address", "companyStreet", "companyCity", "companyState", "companyCountry"];
const LIST_FIELDS = ["companyServices", "companyPartners", "keywords", "industryTags", "technologies"];
const SCAN_FIELDS = [...TEXT_FIELDS, ...LIST_FIELDS];
// Fields the dashboard may edit directly.
const EDITABLE_FIELDS = ["companyName", "description", "linkedinUrl", "website"];

// Cheap MongoDB-side pre-filter: anything that isn't plain printable ASCII (every bad
// sequence contains such a character). Only \x escapes, which every MongoDB regex engine
// understands; the exact check happens in Node with findBadSequences.
const SUSPECT_RE = /[^\x09\x0A\x0D\x20-\x7E]/;
const suspectMatch = (prefix = "") => ({ $or: SCAN_FIELDS.map((f) => ({ [`${prefix}${f}`]: SUSPECT_RE })) });

const CACHE_TTL_MS = 5 * 60 * 1000;
let badCache = null; // { at, rows, pages }
const dupCache = new Map(); // source -> { at, rows }
function clearCaches() {
  badCache = null;
  dupCache.clear();
}

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

/** The public page a company is listed on: "city:<cityId>" for hubs, "mit" / "cyber" otherwise. */
const pageKeyOf = (row) => (row.cityId ? `city:${row.cityId}` : row.source);

/** Sources the dashboard can filter by (hubs found in the DB + flat directories). */
async function listSources() {
  const hubs = await City.distinct("hubSlug");
  return [
    ...hubs.map((h) => ({ key: `hub:${h}`, label: HUB_LABELS[h] || h })),
    ...Object.entries(FLAT_SOURCES).map(([key, v]) => ({ key, label: v.label })),
  ];
}

/** Hub companies as flat rows, via $unwind so MongoDB does the filtering. */
async function hubRows({ match = {}, companyMatch = null, fields }) {
  const project = { name: 1, slug: 1, hubSlug: 1 };
  for (const f of Object.keys(fields)) project[`hubCompanies.${f}`] = 1;
  const pipeline = [
    { $match: { ...match, ...(companyMatch ? suspectMatch("hubCompanies.") : {}) } },
    { $project: project },
    { $unwind: "$hubCompanies" },
  ];
  if (companyMatch) pipeline.push({ $match: suspectMatch("hubCompanies.") });
  const shaped = { _id: 0, cityId: { $toString: "$_id" }, cityName: "$name", citySlug: "$slug", hubSlug: 1 };
  for (const [f, expr] of Object.entries(fields)) shaped[f] = expr === 1 ? `$hubCompanies.${f}` : expr("$hubCompanies.");
  pipeline.push({ $project: shaped });

  const docs = await City.aggregate(pipeline);
  return docs.map((d) => ({ ...d, source: `hub:${d.hubSlug}`, id: `${d.cityId}:${d.slug}` }));
}

async function flatRows(key, { filter = {}, fields }) {
  const shaped = { _id: 0, id: { $toString: "$_id" } };
  for (const [f, expr] of Object.entries(fields)) shaped[f] = expr === 1 ? `$${f}` : expr("$");
  const docs = await FLAT_SOURCES[key].model.aggregate([{ $match: filter }, { $project: shaped }]);
  return docs.map((d) => ({ ...d, source: key }));
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

/**
 * Every company with bad characters (+ its issues), and every public page with its
 * company count and bad count. Cached; `force` rescans.
 */
async function getBadScan(force = false) {
  if (!force && badCache && Date.now() - badCache.at < CACHE_TTL_MS) return badCache;

  const fields = Object.fromEntries(["slug", "linkedinUrl", "website", ...SCAN_FIELDS].map((f) => [f, 1]));
  // Pre-filtered in MongoDB; if that fails or finds nothing, scan everything so a
  // database quirk can never hide bad characters.
  const loadCandidates = async (prefilter) => Promise.all([
    hubRows({ companyMatch: prefilter, fields }),
    ...Object.keys(FLAT_SOURCES).map((key) => flatRows(key, { filter: prefilter ? suspectMatch() : {}, fields })),
  ]);
  let candidates;
  try {
    candidates = await loadCandidates(true);
  } catch (err) {
    console.error("company-quality pre-filter failed, scanning everything:", err.message);
  }
  if (!candidates || candidates.every((list) => list.length === 0)) candidates = await loadCandidates(false);
  const [hubCandidates, ...flatCandidates] = candidates;

  const [cities, ...flat] = await Promise.all([
    City.aggregate([
      {
        $project: {
          name: 1,
          slug: 1,
          hubSlug: 1,
          isPublished: 1,
          total: { $size: { $ifNull: ["$hubCompanies", []] } },
        },
      },
    ]),
    ...Object.keys(FLAT_SOURCES).map(async (key) => ({
      key,
      total: await FLAT_SOURCES[key].model.estimatedDocumentCount(),
    })),
  ]);

  const rows = [];
  for (const row of [...hubCandidates, ...flatCandidates.flat()]) {
    const issues = scanRow(row);
    if (issues.length) rows.push({ ...row, issues, pageKey: pageKeyOf(row) });
  }

  const badByPage = {};
  for (const r of rows) badByPage[r.pageKey] = (badByPage[r.pageKey] || 0) + 1;

  const pages = [
    ...cities.map((c) => ({
      key: `city:${c._id}`,
      group: `hub:${c.hubSlug}`,
      groupLabel: HUB_LABELS[c.hubSlug] || c.hubSlug,
      name: c.name,
      path: `${HUB_PATHS[c.hubSlug] || "/msp"}/${c.slug}`,
      isPublished: Boolean(c.isPublished),
      total: c.total,
      bad: badByPage[`city:${c._id}`] || 0,
    })),
    ...flat.map((f) => ({
      key: f.key,
      group: f.key,
      groupLabel: FLAT_SOURCES[f.key].label,
      name: FLAT_SOURCES[f.key].label,
      path: FLAT_SOURCES[f.key].path,
      isPublished: true,
      total: f.total,
      bad: badByPage[f.key] || 0,
    })),
  ];

  badCache = { at: Date.now(), rows, pages };
  return badCache;
}

/** Lightweight rows for duplicate matching (description cut to a preview). Cached per source. */
async function getDupRows(source, force = false) {
  const hit = dupCache.get(source);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const preview = (p) => ({ $substrCP: [{ $ifNull: [`${p}description`, ""] }, 0, 240] });
  const descLen = (p) => ({ $strLenCP: { $ifNull: [`${p}description`, ""] } });
  const fields = { slug: 1, companyName: 1, linkedinUrl: 1, website: 1, description: preview, descLen };
  const jobs = [];
  if (source === "all" || source.startsWith("hub:")) {
    jobs.push(hubRows({ match: source === "all" ? {} : { hubSlug: source.slice(4) }, fields }));
  }
  for (const key of Object.keys(FLAT_SOURCES)) {
    if (source === "all" || source === key) jobs.push(flatRows(key, { fields }));
  }
  const rows = (await Promise.all(jobs)).flat();
  dupCache.set(source, { at: Date.now(), rows });
  return rows;
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
 * GET /admin/company-quality/pages?refresh=1
 * Every public listing page (each city/country hub page, Managed IT, Cybersecurity)
 * with how many of its companies have bad characters.
 */
exports.listPages = async (req, res) => {
  try {
    const scan = await getBadScan(req.query.refresh === "1");
    res.json({
      ok: true,
      data: scan.pages,
      totalBad: scan.rows.length,
      scannedAt: new Date(scan.at).toISOString(),
    });
  } catch (err) {
    console.error("listPages:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * GET /admin/company-quality/bad-chars?target=city:<id>|mit|cyber&field=&char=&q=&page=1&limit=25
 * Companies (on one page, or all pages when target is empty) whose text contains broken
 * characters, plus a count per bad sequence.
 */
exports.listBadChars = async (req, res) => {
  try {
    const target = String(req.query.target || "");
    const field = String(req.query.field || "");
    const char = String(req.query.char || "");
    const q = String(req.query.q || "").trim().toLowerCase();

    const { rows } = await getBadScan(req.query.refresh === "1");
    const flagged = [];
    const charCounts = {};
    for (const row of rows) {
      if (target && row.pageKey !== target) continue;
      const issues = field ? row.issues.filter((i) => i.field === field) : row.issues;
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

    res.json({ ok: true, ...paginate(flagged, req), chars });
  } catch (err) {
    console.error("listBadChars:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * Duplicate groups for `rows`. Members are sorted so the one to KEEP comes first:
 * no bad characters, has LinkedIn, has website, longest description.
 * Each group gets a status:
 *  - "verified":  same name and all LinkedIn URLs match (real duplicate)
 *  - "conflict":  same name/LinkedIn but the other one differs (check by hand)
 *  - "unverified": no LinkedIn URLs to compare
 */
function buildDuplicateGroups(rows, { by, status, q, scope, badIds }) {
  const groups = new Map();
  for (const row of rows) {
    const n = normName(row.companyName);
    const l = normLinkedin(row.linkedinUrl);
    let key = "";
    if (by === "name") key = n;
    else if (by === "linkedin") key = l;
    else if (n && l) key = `${n}|${l}`;
    if (!key) continue;
    // "page" scope: only the same company listed twice on one page counts as a duplicate.
    if (scope === "page") key = `${pageKeyOf(row)}|${key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const keepScore = (m) =>
    (badIds.has(m.id) ? -5000 : 0) + (normLinkedin(m.linkedinUrl) ? 1000 : 0) + (m.website ? 300 : 0) + (m.descLen || 0);

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
    members.sort((a, b) =>
      keepScore(b) - keepScore(a) ||
      sourceLabel(a.source).localeCompare(sourceLabel(b.source)) ||
      (a.cityName || "").localeCompare(b.cityName || ""));
    out.push({ key, status: groupStatus, count: members.length, members });
  }
  out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { groups: out, statusCounts };
}

function dupParams(input) {
  return {
    source: String(input.source || "all"),
    by: ["name", "linkedin", "both"].includes(input.by) ? input.by : "name",
    status: String(input.status || ""),
    q: String(input.q || "").trim().toLowerCase(),
    scope: input.scope === "all" ? "all" : "page",
  };
}

/** GET /admin/company-quality/duplicates?source=all&by=name|linkedin|both&scope=page|all&status=&q=&page=1&limit=25 */
exports.listDuplicates = async (req, res) => {
  try {
    const { source, by, status, q, scope } = dupParams(req.query);
    const force = req.query.refresh === "1";

    const [rows, bad] = await Promise.all([getDupRows(source, force), getBadScan(force)]);
    const badIds = new Set(bad.rows.map((r) => r.id));
    const { groups, statusCounts } = buildDuplicateGroups(rows, { by, status, q, scope, badIds });

    // Only shape the groups on the requested page.
    const pageData = paginate(groups, req);
    pageData.data = pageData.data.map(({ members, ...g }) => ({
      ...g,
      companies: members.map((m, i) => ({ ...summarize(m), badChars: badIds.has(m.id), keep: i === 0 })),
    }));

    res.json({
      ok: true,
      ...pageData,
      statusCounts,
      duplicateCompanies: groups.reduce((n, g) => n + g.count, 0),
      toDelete: groups.reduce((n, g) => n + g.count - 1, 0),
      scanned: rows.length,
    });
  } catch (err) {
    console.error("listDuplicates:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * POST /admin/company-quality/dedupe  { source, by, scope, status, q }
 * For every duplicate group matching the filters: keep the first (best) company and
 * permanently delete the rest. Uses fresh data, not the cache.
 */
exports.dedupe = async (req, res) => {
  try {
    const { source, by, status, q, scope } = dupParams(req.body || {});
    const [rows, bad] = await Promise.all([getDupRows(source, true), getBadScan(true)]);
    const badIds = new Set(bad.rows.map((r) => r.id));
    const { groups } = buildDuplicateGroups(rows, { by, status, q, scope, badIds });

    const items = groups.flatMap((g) => g.members.slice(1).map((m) => ({ source: m.source, id: m.id })));
    const deleted = await bulkDelete(items);
    res.json({
      ok: true,
      groups: groups.length,
      deleted,
      message: `Cleaned ${groups.length} duplicate groups: kept 1 in each, deleted ${deleted} companies`,
    });
  } catch (err) {
    console.error("dedupe:", err);
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
    clearCaches();
    revalidateFrontend(pathsFor(t, loaded));
    res.json({ ok: true, message: "Company updated" });
  } catch (err) {
    console.error("updateCompany:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * POST /admin/company-quality/fix  { items: [{ source, id }], removeEmoji?: boolean }
 *   or { all: true, target?, char? } to fix every flagged company (on one page, optionally only `char`).
 * Auto-repairs broken characters in every scanned field of each company.
 */
exports.autoFix = async (req, res) => {
  try {
    let items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
    const removeEmoji = Boolean(req.body?.removeEmoji);
    if (req.body?.all) {
      const target = String(req.body.target || "");
      const char = String(req.body.char || "");
      items = (await getBadScan(true)).rows
        .filter((row) => (!target || row.pageKey === target) && (!char || row.issues.some((i) => i.bad.includes(char))))
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
    clearCaches();
    revalidateFrontend([...paths]);
    res.json({ ok: true, fixed, message: `Fixed ${fixed} ${fixed === 1 ? "company" : "companies"}` });
  } catch (err) {
    console.error("autoFix:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * Permanently delete companies in bulk (one update per city, one deleteMany per directory),
 * then clear caches and revalidate their public pages. Returns how many were deleted.
 */
async function bulkDelete(items) {
  const hubByCity = new Map();
  const flatBySource = new Map();
  for (const item of items) {
    const t = parseTarget(item);
    if (!t) continue;
    if (t.kind === "hub") {
      if (!hubByCity.has(t.cityId)) hubByCity.set(t.cityId, new Set());
      hubByCity.get(t.cityId).add(t.slug);
    } else {
      if (!flatBySource.has(t.source)) flatBySource.set(t.source, []);
      flatBySource.get(t.source).push(t.id);
    }
  }

  let deleted = 0;
  const paths = new Set();

  if (hubByCity.size) {
    const cities = await City.find({ _id: { $in: [...hubByCity.keys()] } })
      .select("slug hubSlug hubCompanies.slug")
      .lean();
    const ops = [];
    for (const c of cities) {
      const wanted = hubByCity.get(String(c._id));
      const existing = (c.hubCompanies || []).map((co) => co.slug).filter((s) => wanted.has(s));
      if (!existing.length) continue;
      ops.push({ updateOne: { filter: { _id: c._id }, update: { $pull: { hubCompanies: { slug: { $in: existing } } } } } });
      deleted += existing.length;
      const base = HUB_PATHS[c.hubSlug] || "/msp";
      paths.add(base);
      paths.add(`${base}/${c.slug}`);
      existing.forEach((s) => paths.add(`${base}/${c.slug}/${s}`));
    }
    if (ops.length) await City.bulkWrite(ops);
  }

  for (const [source, ids] of flatBySource) {
    const { model, path } = FLAT_SOURCES[source];
    const docs = await model.find({ _id: { $in: ids } }).select("slug").lean();
    if (!docs.length) continue;
    await model.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    deleted += docs.length;
    paths.add(path);
    docs.forEach((d) => paths.add(`${path}/${d.slug}`));
  }

  clearCaches();
  revalidateFrontend([...paths]);
  return deleted;
}

/** POST /admin/company-quality/delete  { items: [{ source, id }] } */
exports.deleteCompanies = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 5000) : [];
    if (!items.length) return res.status(400).json({ ok: false, message: "No companies selected" });
    const deleted = await bulkDelete(items);
    res.json({ ok: true, deleted, message: `Deleted ${deleted} ${deleted === 1 ? "company" : "companies"}` });
  } catch (err) {
    console.error("deleteCompanies:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

