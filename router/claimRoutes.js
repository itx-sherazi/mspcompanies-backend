const express = require("express");
const { formLimiter } = require("../middleware/rateLimits");
const { adminAuthMiddleware: adminAuth, requireRole } = require("../middleware/adminAuthMiddleware");
const { submitClaim, getClaims, updateClaim, deleteClaim } = require("../controllers/claimController");

const router = express.Router();

// Public: someone claims a company profile
router.post("/claim-profile", formLimiter(), submitClaim);

// Admin
router.get("/claim-requests", adminAuth, requireRole("admin"), getClaims);
router.patch("/claim-requests/:id", adminAuth, requireRole("admin"), updateClaim);
router.delete("/claim-requests/:id", adminAuth, requireRole("admin"), deleteClaim);

module.exports = router;
