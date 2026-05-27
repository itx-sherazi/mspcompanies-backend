const express = require("express");
const multer = require("multer");
const csvUpload = require("../middleware/csvUpload.js");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware.js");
const {
  getPublishedCitiesByHub,
  getCityCompanyPublicByHub,
  getCityPublicByHub,
  getManagedItHubSitemapEntries,
  listCitiesAdmin,
  listAllHubCompaniesAdmin,
  createCity,
  updateCity,
  deleteCity,
  deleteHubCompany,
  updateHubCompany,
  uploadCityCompaniesExcel,
  toggleSponsoredHubCompany,
  searchCompanies,
} = require("../controllers/cityController.js");

const router = express.Router();

const hubCompanyImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Logo must be an image file"));
  },
});

router.get(
  "/public/hubs/managed-service-providers/sitemap-entries",
  getManagedItHubSitemapEntries,
);
router.get("/public/hubs/:hubSlug/cities", getPublishedCitiesByHub);
router.get("/companies/search", searchCompanies);
router.get(
  "/public/hubs/:hubSlug/cities/:citySlug/companies/:companySlug",
  getCityCompanyPublicByHub,
);
router.get("/public/hubs/:hubSlug/cities/:citySlug", getCityPublicByHub);

// Admin
router.get("/cities", adminAuthMiddleware, listCitiesAdmin);
router.get(
  "/cities/hub-companies",
  adminAuthMiddleware,
  listAllHubCompaniesAdmin,
);
router.post("/cities", adminAuthMiddleware, createCity);
router.put("/cities/:id", adminAuthMiddleware, updateCity);
router.put(
  "/cities/:id/companies/:companySlug",
  adminAuthMiddleware,
  hubCompanyImageUpload.single("image"),
  updateHubCompany,
);
router.patch(
  "/cities/:id/companies/:companySlug/toggle-sponsored",
  adminAuthMiddleware,
  toggleSponsoredHubCompany,
);
router.delete(
  "/cities/:id/companies/:companySlug",
  adminAuthMiddleware,
  deleteHubCompany,
);
router.delete("/cities/:id", adminAuthMiddleware, deleteCity);
router.post(
  "/cities/upload-companies",
  adminAuthMiddleware,
  csvUpload.fields([{ name: "file", maxCount: 1 }]),
  uploadCityCompaniesExcel,
);

module.exports = router;
