const express = require("express");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");
const {
  getSources,
  listPages,
  listBadChars,
  listDuplicates,
  updateCompany,
  autoFix,
  deleteCompanies,
} = require("../controllers/companyQualityController");

const router = express.Router();

router.get("/admin/company-quality/sources", adminAuthMiddleware, getSources);
router.get("/admin/company-quality/pages", adminAuthMiddleware, listPages);
router.get("/admin/company-quality/bad-chars", adminAuthMiddleware, listBadChars);
router.get("/admin/company-quality/duplicates", adminAuthMiddleware, listDuplicates);
router.patch("/admin/company-quality/company", adminAuthMiddleware, updateCompany);
router.post("/admin/company-quality/fix", adminAuthMiddleware, autoFix);
router.post("/admin/company-quality/delete", adminAuthMiddleware, deleteCompanies);

module.exports = router;
