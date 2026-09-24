const express = require("express");
const {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryRankings,
} = require("../controllers/categoryController");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.get("/",               getCategories);
router.post("/",              adminAuthMiddleware, createCategory);
router.get("/:slug",          getCategoryBySlug);
router.put("/:slug",          adminAuthMiddleware, updateCategory);
router.delete("/:slug",       adminAuthMiddleware, deleteCategory);
router.put("/:slug/rankings", adminAuthMiddleware, updateCategoryRankings);

module.exports = router;
