const express = require("express");
const multer = require("multer");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");
const companies = require("../controllers/companyAdminController");

const router = express.Router();

// A company logo: one picture of at most 5 MB, kept in memory until it is sent to Cloudinary.
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const oneLogo = (req, res, next) =>
  logoUpload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, message: err.code === "LIMIT_FILE_SIZE" ? "The picture is larger than 5 MB" : "The picture could not be read" });
    next();
  });

// Every company of the three directories (:directory is mit, mssp or cyber). The SEO role may read and edit, only an admin may delete.
router.post(  "/admin/companies/upload-logo",           adminAuthMiddleware, oneLogo, companies.uploadLogo); // before /:directory
router.get(   "/admin/companies",                      adminAuthMiddleware, companies.listCompanies);
router.get(   "/admin/companies/:directory/:slug",     adminAuthMiddleware, companies.getCompany);
router.post(  "/admin/companies/:directory",           adminAuthMiddleware, companies.createCompany);
router.put(   "/admin/companies/:directory/:slug",     adminAuthMiddleware, companies.updateCompany);
router.delete("/admin/companies/:directory/:slug",     adminAuthMiddleware, requireRole("admin"), companies.deleteCompany);

module.exports = router;
