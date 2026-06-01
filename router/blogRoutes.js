const express = require("express");
const multer = require("multer");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");
const {
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogs,
  getBlogBySlug,
  getLatestPosts,
  getBlogsSitemap,
} = require("../controllers/blogController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Public
router.get("/get", getBlogs);
router.get("/getById/:slug", getBlogBySlug);
router.get("/latest-posts", getLatestPosts);
router.get("/get-sitemapblog", getBlogsSitemap);

// Admin
router.post("/create", adminAuthMiddleware, upload.single("image"), createBlog);
router.put("/update/:id", adminAuthMiddleware, upload.single("image"), updateBlog);
router.delete("/blogdelete/:id", adminAuthMiddleware, deleteBlog);

module.exports = router;
