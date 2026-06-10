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
} = require("../controllers/managedItController");

const router = express.Router();

// Public
router.get("/managed-it-services/filters",         getFilters);
router.get("/managed-it-services",                 listCompanies);
router.get("/managed-it-services/:slug/related",   getRelated);
router.get("/managed-it-services/:slug",           getCompany);

// Admin
router.post(
  "/admin/managed-it-services/upload",
  adminAuthMiddleware,
  csvUpload.fields([{ name: "file", maxCount: 1 }]),
  uploadSheet
);
router.get(    "/admin/managed-it-services",       adminAuthMiddleware, listAdmin);
router.delete( "/admin/managed-it-services/all",   adminAuthMiddleware, deleteAll);
router.delete( "/admin/managed-it-services/:slug", adminAuthMiddleware, deleteCompany);

module.exports = router;
