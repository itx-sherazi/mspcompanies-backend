const express = require("express");
const multer = require("multer");
const router = express.Router();
const { adminAuthMiddleware: adminAuth } = require("../middleware/adminAuthMiddleware");
const {
  submitListingRequest,
  getAllListingRequests,
  updateListingStatus,
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
router.post("/listing-request", upload.single("logo"), submitListingRequest);

// Admin
router.get("/listing-requests", adminAuth, getAllListingRequests);
router.patch("/listing-requests/:id/status", adminAuth, updateListingStatus);
router.delete("/listing-requests/:id", adminAuth, deleteListingRequest);

module.exports = router;
