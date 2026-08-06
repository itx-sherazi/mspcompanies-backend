const express = require("express");
const router = express.Router();
const { adminAuthMiddleware: adminAuth } = require("../middleware/adminAuthMiddleware");
const { getAllData, deleteRequest } = require("../controllers/dataRequestController");

// Admin
router.get("/AllData", adminAuth, getAllData);
router.delete("/deleterequest/:id", adminAuth, deleteRequest);

module.exports = router;
