const express = require("express");
const csvUpload = require("../middleware/csvUpload");
const { adminAuthMiddleware, requireRole } = require("../middleware/adminAuthMiddleware");
const { uploadMaster } = require("../controllers/masterController");

const router = express.Router();

router.post(
  "/admin/master/upload",
  adminAuthMiddleware,
  requireRole("admin"),
  csvUpload.fields([{ name: "file", maxCount: 1 }]),
  uploadMaster,
);

module.exports = router;
