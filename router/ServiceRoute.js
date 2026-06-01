const express = require("express");
const {
  createService,
  getAllServices,
  getServiceBySlug,
  updateService,
  deleteService,
  getCompaniesByServiceSlug,
  updateServiceFilters,
  getServiceFilters,
  getAllCompaniesSitemap,
  getCompaniesSitemapByService,
  deleteAllCompaniesByService,
  getAllServicesSitemap,
  getCompanyBySlug,
} = require("../controllers/serviceController");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.post("/services", adminAuthMiddleware, createService);
router.get("/services", getAllServices);
router.get("/services/:slug", getServiceBySlug);
router.put("/services/:id", adminAuthMiddleware, updateService);
router.delete("/services/:id", adminAuthMiddleware, deleteService);

router.put("/services/:id/filters", adminAuthMiddleware, updateServiceFilters);
router.get("/services/:slug/filters", getServiceFilters);

router.get("/services/:slug/companies", getCompaniesByServiceSlug);

router.get("/get-sitemapcompanies", getAllCompaniesSitemap);
router.get("/services/:slug/sitemap-companies", getCompaniesSitemapByService);
router.get("/get-sitemapservices", getAllServicesSitemap);

router.delete("/services/:id/delete-all-companies", adminAuthMiddleware, deleteAllCompaniesByService);

router.get("/companybyslug/:slug", getCompanyBySlug);

module.exports = router;
