const express = require("express");
const csvUpload = require("../middleware/csvUpload");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");
const mssp = require("../controllers/msspController");

const router = express.Router();

// Public: the directory (/managed-security-service-providers) and the /mssp pages
router.get("/managed-security-service-providers/filters",         mssp.getFilters);
router.get("/managed-security-service-providers",                 mssp.listCompanies);
router.get("/managed-security-service-providers/sitemap-entries", mssp.getSitemapEntries);
router.get("/managed-security-service-providers/:slug/related",   mssp.getRelated);
router.get("/managed-security-service-providers/:slug",           mssp.getCompany);
router.get("/mssp-pages",                                         mssp.listPages);
router.get("/mssp-pages/:slug",                                   mssp.getPage);

// Admin
router.post("/admin/mssp/upload", adminAuthMiddleware, requireRole("admin"), csvUpload.fields([{ name: "file", maxCount: 1 }]), mssp.uploadSheet);

router.get( "/admin/mssp-pages",       adminAuthMiddleware, mssp.listPagesAdmin);
router.get( "/admin/mssp-pages/:slug", adminAuthMiddleware, mssp.getPageAdmin);
router.put( "/admin/mssp-pages/:slug", adminAuthMiddleware, mssp.updatePageAdmin);

module.exports = router;
