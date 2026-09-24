const express = require("express");
const router = express.Router();
const { adminAuthMiddleware: adminAuth, requireRole } = require("../middleware/adminAuthMiddleware");
const { getAllData, deleteRequest } = require("../controllers/dataRequestController");

// Admin
router.get("/AllData", adminAuth, requireRole("admin"), getAllData);
router.delete("/deleterequest/:id", adminAuth, requireRole("admin"), deleteRequest);

module.exports = router;
