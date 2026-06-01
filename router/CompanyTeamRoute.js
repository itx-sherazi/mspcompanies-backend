const express = require("express");
const { uploadCompaniesToSubcategory, getAllCompanies, updateCompanyBySlug, deleteCompanyById } = require("../controllers/uploadCompaniesToSubcategory");
const csvUpload = require("../middleware/csvUpload");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/companies/upload-to-subcategory", adminAuthMiddleware, csvUpload.fields([{ name: "file", maxCount: 1 }]), uploadCompaniesToSubcategory);
router.get("/companies/all", adminAuthMiddleware, getAllCompanies);
router.put("/updateCompanyTeamBySlug/:slug", adminAuthMiddleware, upload.single("image"), updateCompanyBySlug);
router.delete("/deleteCompanyTeam/:id", adminAuthMiddleware, deleteCompanyById);

module.exports = router;
