const express = require("express");
const multer = require("multer");
const {
  getVendors, getVendorBySlug, getVendorsBySlugs,
  createVendor, updateVendor, deleteVendor, importVendors, deleteAllVendors,
  uploadVendorLogo,
} = require("../controllers/vendorController");

const router = express.Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

router.get("/by-slugs",  getVendorsBySlugs);
router.post("/import",   importVendors);
router.delete("/all",    deleteAllVendors);
router.post("/upload-logo", logoUpload.single("logo"), uploadVendorLogo);
router.get("/",          getVendors);
router.post("/",         createVendor);
router.get("/:slug",     getVendorBySlug);
router.put("/:slug",     updateVendor);
router.delete("/:slug",  deleteVendor);

module.exports = router;
