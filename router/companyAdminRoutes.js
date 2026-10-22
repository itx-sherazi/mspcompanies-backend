const express = require("express");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");
const companies = require("../controllers/companyAdminController");

const router = express.Router();

// Every company of the three directories (:directory is mit, mssp or cyber). The SEO role may read and edit, only an admin may delete.
router.get(   "/admin/companies",                      adminAuthMiddleware, companies.listCompanies);
router.get(   "/admin/companies/:directory/:slug",     adminAuthMiddleware, companies.getCompany);
router.post(  "/admin/companies/:directory",           adminAuthMiddleware, companies.createCompany);
router.put(   "/admin/companies/:directory/:slug",     adminAuthMiddleware, companies.updateCompany);
router.delete("/admin/companies/:directory/:slug",     adminAuthMiddleware, requireRole("admin"), companies.deleteCompany);

module.exports = router;
