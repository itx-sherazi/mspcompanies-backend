const express = require("express");
const {
  getParentCategories,
  getParentCategoryBySlug,
  createParentCategory,
  updateParentCategory,
  deleteParentCategory,
} = require("../controllers/parentCategoryController");

const router = express.Router();

router.get("/",     getParentCategories);
router.get("/:slug", getParentCategoryBySlug);
router.post("/",    createParentCategory);
router.put("/:id",  updateParentCategory);
router.delete("/:id", deleteParentCategory);

module.exports = router;
