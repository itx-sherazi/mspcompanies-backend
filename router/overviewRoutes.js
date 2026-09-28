const express = require("express");
const { adminAuthMiddleware } = require("../middleware/adminAuthMiddleware");
const { getOverview } = require("../controllers/overviewController");

const router = express.Router();

router.get("/admin/overview", adminAuthMiddleware, getOverview);

module.exports = router;
