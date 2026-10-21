const express = require("express");
const csvUpload = require("../middleware/csvUpload");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");
const cyber = require("../controllers/cyberSecurityController");

const router = express.Router();

// Public: the directory (/cybersecurity-companies) and the /cybersecurity-companies-in-{place} pages
router.get("/cybersecurity-companies/filters",         cyber.getFilters);
router.get("/cybersecurity-companies",                 cyber.listCompanies);
router.get("/cybersecurity-companies/sitemap-entries", cyber.getSitemapEntries);
router.get("/cybersecurity-companies/:slug/related",   cyber.getRelated);
router.get("/cybersecurity-companies/:slug",           cyber.getCompany);
router.get("/cybersecurity-pages",                     cyber.listPages);
router.get("/cybersecurity-pages/:slug",               cyber.getPage);

// Admin
router.post(   "/admin/cybersecurity-companies/upload", adminAuthMiddleware, requireRole("admin"), csvUpload.fields([{ name: "file", maxCount: 1 }]), cyber.uploadSheet);
router.get(    "/admin/cybersecurity-companies",        adminAuthMiddleware, cyber.listAdmin);
router.delete( "/admin/cybersecurity-companies/:slug", adminAuthMiddleware, requireRole("admin"), cyber.deleteCompany);

module.exports = router;
