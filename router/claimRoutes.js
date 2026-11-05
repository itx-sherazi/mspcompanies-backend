const express = require("express");
const { formLimiter } = require("../middleware/rateLimits");
const { adminAuthMiddleware: adminAuth, requireRole } = require("../middleware/adminAuthMiddleware");
const { submitClaim, getClaims, updateClaim, deleteClaim } = require("../controllers/claimController");

const { submitQuote, getQuotes, updateQuote, deleteQuote } = require("../controllers/quoteController");

const router = express.Router();

// Public: someone claims a company profile
router.post("/claim-profile", formLimiter(), submitClaim);

// Public: a visitor asks a company for a quote. The mail goes to the editor inbox only.
router.post("/quote-request", formLimiter(), submitQuote);
router.get("/quote-requests", adminAuth, requireRole("admin"), getQuotes);
router.patch("/quote-requests/:id", adminAuth, requireRole("admin"), updateQuote);
router.delete("/quote-requests/:id", adminAuth, requireRole("admin"), deleteQuote);

// Admin
router.get("/claim-requests", adminAuth, requireRole("admin"), getClaims);
router.patch("/claim-requests/:id", adminAuth, requireRole("admin"), updateClaim);
router.delete("/claim-requests/:id", adminAuth, requireRole("admin"), deleteClaim);

module.exports = router;
