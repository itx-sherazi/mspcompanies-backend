const express = require("express");
const csvUpload = require("../middleware/csvUpload");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");
const {
  listCompanies,
  getFilters,
  getCompany,
  getRelated,
  uploadSheet,
  listAdmin,
  deleteCompany,
  deleteAll,
} = require("../controllers/cyberSecurityController");

const router = express.Router();

// Public
router.get("/cybersecurity-companies/filters",        getFilters);
router.get("/cybersecurity-companies",                listCompanies);
router.get("/cybersecurity-companies/:slug/related",  getRelated);
router.get("/cybersecurity-companies/:slug",          getCompany);

// Admin
router.post(
  "/admin/cybersecurity-companies/upload",
  adminAuthMiddleware,
  csvUpload.fields([{ name: "file", maxCount: 1 }]),
  uploadSheet
);
router.get(    "/admin/cybersecurity-companies",        adminAuthMiddleware, listAdmin);
router.delete( "/admin/cybersecurity-companies/all",    adminAuthMiddleware, deleteAll);
router.delete( "/admin/cybersecurity-companies/:slug",  adminAuthMiddleware, deleteCompany);

module.exports = router;
