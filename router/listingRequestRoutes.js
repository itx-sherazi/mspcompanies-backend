const express = require("express");
const multer = require("multer");
const router = express.Router();
const { formLimiter } = require("../middleware/rateLimits");
const { adminAuthMiddleware: adminAuth, requireRole } = require("../middleware/adminAuthMiddleware");
const {
  submitListingRequest,
  checkCompanyName,
  getAllListingRequests,
  updateListingStatus,
  updateListingDeal,
  updateListingMail,
  deleteListingRequest,
} = require("../controllers/listingRequestController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only jpg, png, webp allowed"));
  },
});

// Public
router.get("/listing-request/check", checkCompanyName);
router.post("/listing-request", formLimiter(), upload.single("logo"), submitListingRequest);

// Admin
router.get("/listing-requests", adminAuth, requireRole("admin"), getAllListingRequests);
router.patch("/listing-requests/:id/status", adminAuth, requireRole("admin"), updateListingStatus);
router.patch("/listing-requests/:id/deal", adminAuth, requireRole("admin"), updateListingDeal);
router.patch("/listing-requests/:id/mail", adminAuth, requireRole("admin"), updateListingMail);
router.delete("/listing-requests/:id", adminAuth, requireRole("admin"), deleteListingRequest);

module.exports = router;
