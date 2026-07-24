const express = require("express");
const {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryRankings,
} = require("../controllers/categoryController");

const router = express.Router();

router.get("/",               getCategories);
router.post("/",              createCategory);
router.get("/:slug",          getCategoryBySlug);
router.put("/:slug",          updateCategory);
router.delete("/:slug",       deleteCategory);
router.put("/:slug/rankings", updateCategoryRankings);

module.exports = router;
