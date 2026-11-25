const mongoose = require("mongoose");

const TYPES = ["msp", "mssp", "cyber", "vendor"];
const STATUSES = ["pending", "approved", "rejected"];

const rating = { type: Number, min: 1, max: 5 };

/**
 * A review of a listed company or a software vendor, written by a visitor with a business email.
 * It is saved as "pending" and only shows on the profile after the editor approves it in the dashboard.
 */
const reviewSchema = new mongoose.Schema(
  {
    // What is reviewed. targetType says which directory the slug belongs to (slugs can repeat across directories).
    targetType: { type: String, enum: TYPES, required: true, index: true },
    targetSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    targetName: { type: String, required: true, trim: true },
    /** Page the visitor was on, for example /tools/acme. */
    pagePath: { type: String, trim: true, default: "" },

    rating: { ...rating, required: true },
    // Optional detail ratings. Companies use quality, communication, support, value. Vendors use ease, features, support, value.
    ratings: {
      quality: rating,
      communication: rating,
      support: rating,
      value: rating,
      ease: rating,
      features: rating,
    },

    title: { type: String, required: true, trim: true },
    pros: { type: String, required: true, trim: true },
    cons: { type: String, required: true, trim: true },

    role: { type: String, trim: true, default: "" },
    companySize: { type: String, trim: true, default: "" },
    timeUsing: { type: String, trim: true, default: "" },

    // The reviewer. The email is only for the editor and is never shown on the website.
    name: { type: String, required: true, trim: true },
    hideName: { type: Boolean, default: false },
    email: { type: String, required: true, trim: true, lowercase: true },

    status: { type: String, enum: STATUSES, default: "pending", index: true },
    adminNote: { type: String, trim: true, default: "" },
    approvedAt: { type: Date, default: null },

    /** Did the email to the editor inbox go out? */
    mailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

reviewSchema.index({ targetType: 1, targetSlug: 1, status: 1, createdAt: -1 });
reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
