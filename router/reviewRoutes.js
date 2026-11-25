const express = require("express");
const { formLimiter } = require("../middleware/rateLimits");
const { adminAuthMiddleware: adminAuth, requireRole } = require("../middleware/adminAuthMiddleware");
const { submitReview, getReviews, getReviewsAdmin, updateReview, deleteReview } = require("../controllers/reviewController");

const router = express.Router();

// Public: a visitor with a business email writes a review (saved as pending), and the profile page reads the approved ones.
router.post("/reviews", formLimiter(), submitReview);
router.get("/reviews", getReviews);

// Admin: the Reviews tab of the dashboard
router.get("/admin/reviews", adminAuth, requireRole("admin"), getReviewsAdmin);
router.patch("/admin/reviews/:id", adminAuth, requireRole("admin"), updateReview);
router.delete("/admin/reviews/:id", adminAuth, requireRole("admin"), deleteReview);

module.exports = router;
