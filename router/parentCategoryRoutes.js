const express = require("express");
const {
  getParentCategories,
  getParentCategoryBySlug,
  createParentCategory,
  updateParentCategory,
  deleteParentCategory,
} = require("../controllers/parentCategoryController");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.get("/",     getParentCategories);
router.get("/:slug", getParentCategoryBySlug);
router.post("/",    adminAuthMiddleware, createParentCategory);
router.put("/:id",  adminAuthMiddleware, updateParentCategory);
router.delete("/:id", adminAuthMiddleware, deleteParentCategory);

module.exports = router;
