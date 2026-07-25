const express = require("express");
const {
  getVendors, getVendorBySlug, getVendorsBySlugs,
  createVendor, updateVendor, deleteVendor, importVendors, deleteAllVendors,
} = require("../controllers/vendorController");

const router = express.Router();

router.get("/by-slugs",  getVendorsBySlugs);   // must be before /:slug
router.post("/import",   importVendors);        // must be before /:slug
router.delete("/all",    deleteAllVendors);     // must be before /:slug
router.get("/",          getVendors);
router.post("/",         createVendor);
router.get("/:slug",     getVendorBySlug);
router.put("/:slug",     updateVendor);
router.delete("/:slug",  deleteVendor);

module.exports = router;
