/**
 * Master sheet import: preview (no writes) or apply.
 *
 *  1. Read + clean + de-duplicate the sheet.
 *  2. Fill the main directory (ManagedItCompany): upsert by slug, then remove companies that are no longer
 *     in the sheet. The directory is never emptied first, so a failure half way cannot leave it blank.
 *  3. Fill every city / state / country page (City.hubCompanies). Companies marked sponsored are kept.
 *  4. No backup copy is kept anywhere. Run a preview first; applying replaces the data.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const City = require("../models/City");
const ManagedItCompany = require("../models/ManagedItCompany");
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");
const { parseMasterBuffer, planDistribution, planDirectory, directoryToCleaned, dedupeKeys } = require("./masterSheet");
const { METRO_ENABLED } = require("../config/pageRules");
const CATALOG = require("../config/pageCatalog.json");

const HUBS = ["managed-service-providers", "top-msps"];
// MongoDB documents are limited to 16 MB; stay well below it.
const MAX_PAGE_DOC_BYTES = 12 * 1024 * 1024;

function docBytes(hubCompanies) {
  return mongoose.mongo.BSON.calculateObjectSize({ hubCompanies });
}

/** Drop the lowest-ranked companies (the list is already best-first) until the page fits in one document. */
function fitToDocumentLimit(list, sponsoredCount) {
  if (docBytes(list) <= MAX_PAGE_DOC_BYTES) return { list, trimmed: 0 };
  // Very large pages (the country pages) first give up the FAQ text on their copies. The FAQs stay on the main
  // directory profile, which is the page Google indexes, so no company has to leave the page.
  list = list.map((c) => (c.faqs && c.faqs.length ? { ...c, faqs: [] } : c));
  if (docBytes(list) <= MAX_PAGE_DOC_BYTES) return { list, trimmed: 0, faqsDropped: true };
  let keep = list.length;
  let lo = sponsoredCount;
  let hi = list.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (docBytes(list.slice(0, mid)) <= MAX_PAGE_DOC_BYTES) lo = mid;
    else hi = mid - 1;
  }
  keep = lo;
  return { list: list.slice(0, keep), trimmed: list.length - keep };
}

function pagePath(page) {
  if (page.hubSlug === "top-msps") return `/top-msps/${page.slug}`;
  return `/msp/${page.slug}`;
}

async function runMasterImport({ buffer, apply = false, metro = METRO_ENABLED, replaceDirectory = true, createPages = true, withPlan = false, log = () => {} }) {
  const started = Date.now();
  const { companies, report } = parseMasterBuffer(buffer);
  log(`sheet read: ${report.kept} companies (${report.skippedDuplicates} duplicates skipped)`);

  // Companies that came in through Get Listed live in the directory too. They are added to the sheet's
  // companies, so they are placed on their pages again and are never deleted by an import. A company that
  // is also in the sheet is taken from the sheet.
  const listedDocs = await ManagedItCompany.find({ fromListing: true }).lean();
  const inSheet = new Set(companies.flatMap((c) => dedupeKeys(c)));
  let listedKept = 0;
  for (const d of listedDocs) {
    const c = directoryToCleaned(d);
    if (dedupeKeys(c).some((k) => inSheet.has(k))) continue;
    companies.push(c);
    listedKept += 1;
  }
  report.listedKept = listedKept;
  if (listedKept) log(`${listedKept} Get Listed companies kept`);

  const pages = await City.find({ hubSlug: { $in: HUBS } })
    .select("name slug state hubSlug isPublished hubCompanies")
    .lean();

  const directoryDocs = planDirectory(companies); // also gives every company its one slug
  // Pages that are in the catalog but not in the database yet are created from the sheet. Existing pages are
  // never touched except for their companies (their SEO text stays).
  const have = new Set(pages.map((p) => `${p.hubSlug}|${p.slug}`));
  const missing = createPages ? CATALOG.filter((c) => !have.has(`${c.hubSlug}|${c.slug}`)) : [];
  const virtual = missing.map((c) => ({ ...c, _id: null, isNew: true, isPublished: true, state: "", hubCompanies: [] }));
  const plan = planDistribution(companies, [...pages, ...virtual], { metro });
  for (const p of plan) {
    if (!p.companies) continue;
    const sponsored = p.before.sponsored;
    const fit = fitToDocumentLimit(p.companies, sponsored);
    p.companies = fit.list;
    p.trimmed += fit.trimmed;
    p.after = fit.list.length;
  }

  const directoryBefore = await ManagedItCompany.countDocuments({});
  for (const p of plan) if (p.page.isNew && !p.matched) p.companies = null;

  // Which city / state / country page is each company on? The profile links to them.
  const placeBySlug = new Map();
  for (const p of plan) {
    if (!p.companies || !["city", "state", "country"].includes(p.rule.kind)) continue;
    for (const c of p.companies) {
      if (!c.slug) continue;
      const e = placeBySlug.get(c.slug) || {};
      const key = p.rule.kind; // first page of each kind wins
      if (!e[key]) e[key] = { slug: p.page.slug, name: p.page.name };
      placeBySlug.set(c.slug, e);
    }
  }
  for (const d of directoryDocs) {
    const e = placeBySlug.get(d.slug) || {};
    d.cityPageSlug = e.city?.slug || "";
    d.cityPageName = e.city?.name || "";
    d.statePageSlug = e.state?.slug || "";
    d.statePageName = e.state?.name || "";
    d.countryPageSlug = e.country?.slug || "";
    d.countryPageName = e.country?.name || "";
  }

  const pageRows = plan
    .map((p) => ({
      name: p.page.name,
      slug: p.page.slug,
      hub: p.page.hubSlug,
      published: Boolean(p.page.isPublished),
      isNew: Boolean(p.page.isNew),
      willCreate: Boolean(p.page.isNew && p.companies),
      removed: (p.dropped || []).length,
      kind: p.rule.kind,
      rule: p.rule.label,
      before: p.before.total,
      sponsoredKept: p.before.sponsored,
      matched: p.matched,
      after: p.after,
      trimmed: p.trimmed,
    }))
    .sort((a, b) => a.hub.localeCompare(b.hub) || a.kind.localeCompare(b.kind) || b.after - a.after);

  const warnings = [];
  const removedTotal = plan.reduce((a, p) => a + (p.dropped || []).length, 0);
  if (removedTotal) {
    warnings.push(`${removedTotal} companies that are on pages now are not in the sheet and will be removed from those pages. See the "Will be removed" sheet in the Excel report.`);
  }
  for (const r of pageRows) {
    if (r.kind === "skip") continue;
    if (r.isNew && !r.willCreate) continue; // not created: no company for it in the sheet
    if (r.published && r.after === 0) warnings.push(`${r.name} (${r.hub}) is published but would have 0 companies`);
    else if (r.published && r.after < 10) warnings.push(`${r.name} (${r.hub}) would have only ${r.after} companies`);
    if (r.trimmed) warnings.push(`${r.name}: ${r.trimmed} companies left off because the page would exceed the database document limit`);
    if (r.after < r.before - r.sponsoredKept) warnings.push(`${r.name}: ${r.before} companies before, ${r.after} after (fewer than now)`);
  }

  const result = {
    ok: true,
    mode: apply ? "apply" : "preview",
    metro: Boolean(metro),
    sheet: report,
    directory: { before: directoryBefore, after: directoryDocs.length, replace: Boolean(replaceDirectory) },
    pages: {
      total: pageRows.length,
      created: pageRows.filter((r) => r.willCreate).length,
      updated: pageRows.filter((r) => r.kind !== "skip" && !r.isNew).length,
      skipped: pageRows.filter((r) => r.kind === "skip").length,
      companiesPlaced: pageRows.reduce((a, r) => a + (r.kind === "skip" ? 0 : r.after), 0),
      removedFromPages: removedTotal,
    },
    warnings,
    rows: pageRows,
  };
  if (withPlan) Object.defineProperty(result, "_plan", { value: plan, enumerable: false });
  if (!apply) {
    result.tookMs = Date.now() - started;
    return result;
  }

  // ── apply ──
  // 1) main directory
  const now = new Date();
  for (let i = 0; i < directoryDocs.length; i += 500) {
    const ops = directoryDocs.slice(i, i + 500).map((d) => ({
      replaceOne: { filter: { slug: d.slug }, replacement: { ...d, createdAt: now, updatedAt: now }, upsert: true },
    }));
    await ManagedItCompany.bulkWrite(ops, { ordered: false });
  }
  let directoryRemoved = 0;
  if (replaceDirectory) {
    const keep = directoryDocs.map((d) => d.slug);
    const del = await ManagedItCompany.deleteMany({ slug: { $nin: keep } });
    directoryRemoved = del.deletedCount || 0;
  }
  log(`directory saved: ${directoryDocs.length} companies, ${directoryRemoved} old ones removed`);

  // 2) pages
  const touched = [];
  let created = 0;
  for (const p of plan) {
    if (!p.companies) continue;
    if (p.page.isNew) {
      const { _id, isNew, ...doc } = p.page;
      await City.create({ ...doc, isPublished: true, faqs: [], content: "", hubCompanies: p.companies });
      created += 1;
    } else {
      await City.updateOne({ _id: p.page._id }, { $set: { hubCompanies: p.companies } });
    }
    touched.push(pagePath(p.page));
  }
  result.pages.createdNow = created;
  publicCache.clear();
  log(`pages saved: ${touched.length} (${created} newly created)`);

  // A local database must never poke the live website (FRONTEND_URL in .env points to it). The local
  // site refreshes itself within a minute, so nothing is lost.
  const localDb = /localhost|127.0.0.1/.test(process.env.MONGO_URI || "");
  if (localDb) {
    log("local database: website revalidation skipped");
  } else {
    const toRevalidate = ["/managed-it-services", "/msp", "/top-msps", ...touched];
    for (let i = 0; i < toRevalidate.length; i += 40) await revalidateFrontend(toRevalidate.slice(i, i + 40));
  }

  result.directory.removed = directoryRemoved;
  result.tookMs = Date.now() - started;
  return result;
}

/**
 * Excel report of an import (made from a preview): which company goes on which page.
 * Sheets: Summary, Pages, Placements (one row per company per page), Warnings.
 */
function buildReportWorkbook(result) {
  const xlsx = require("xlsx");
  const wb = xlsx.utils.book_new();
  const summary = [
    ["Mode", result.mode],
    ["Sheet rows", result.sheet.sheetRows],
    ["Companies kept", result.sheet.kept],
    ["Duplicates skipped", result.sheet.skippedDuplicates],
    ["Directory before", result.directory.before],
    ["Directory after", result.directory.after],
    ["Pages filled", (result.pages.updated || 0) + (result.pages.created || 0)],
    ["New pages", result.pages.created || 0],
    ["Listings placed on pages", result.pages.companiesPlaced],
    ["Nearby cities included", result.metro ? "yes" : "no"],
    ["Unknown columns (not saved)", (result.sheet.unknownHeaders || []).join(", ") || "none"],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Item", "Value"], ...summary]), "Summary");

  const pages = result.rows.map((r) => ({
    Page: r.name, Slug: r.slug, Hub: r.hub, Type: r.kind, Rule: r.rule, "Companies now": r.before,
    "Companies after": r.after, "Sponsored / listed kept": r.sponsoredKept, "Removed from page": r.removed || "", "New page": r.willCreate ? "yes" : "", "Left off (size limit)": r.trimmed || "",
  }));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(pages), "Pages");

  const placements = [];
  for (const p of result._plan || []) {
    if (!p.companies) continue;
    for (const c of p.companies) {
      placements.push({
        Page: p.page.name, "Page type": p.rule.kind, Hub: p.page.hubSlug, Company: c.companyName, City: c.companyCity,
        State: c.companyState, Country: c.companyCountry, "Company slug": c.slug, "Index eligible": c.indexEligible ? "Y" : "N",
        Sponsored: c.isSponsored ? "yes" : "",
      });
    }
  }
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(placements), "Placements");
  const removed = [];
  for (const p of result._plan || []) for (const d of p.dropped || []) removed.push({ Page: p.page.name, Company: d.companyName, Website: d.website, City: d.city });
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(removed.length ? removed : [{ Note: "Nothing on the pages is removed." }]), "Will be removed");
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Warning"], ...(result.warnings || []).map((w) => [w])]), "Warnings");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { runMasterImport, buildReportWorkbook, MAX_PAGE_DOC_BYTES };
