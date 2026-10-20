const mongoose = require("mongoose");

/** Someone says "this company profile is mine" and asks to claim or update it. */
const claimRequestSchema = new mongoose.Schema(
  {
    // The profile being claimed
    companySlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    companyName: { type: String, required: true, trim: true },
    companyWebsite: { type: String, trim: true, default: "" },
    /** Page the visitor was on, for example /managed-it-services/acme or /msp/houston/acme. */
    pagePath: { type: String, trim: true, default: "" },

    // The person claiming it
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    notes: { type: String, trim: true, default: "" },

    // Does the email address belong to the company's own website? (Helps the admin verify the claim.)
    emailDomain: { type: String, trim: true, lowercase: true, default: "" },
    domainMatch: { type: Boolean, default: false },

    // Follow up by the admin
    status: { type: String, enum: ["new", "contacted", "verified", "rejected"], default: "new", index: true },
    adminNote: { type: String, trim: true, default: "" },

    // Which emails went out
    adminEmailSent: { type: Boolean, default: false },
    userEmailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

claimRequestSchema.index({ createdAt: -1 });
claimRequestSchema.index({ email: 1, companySlug: 1, createdAt: -1 });

module.exports = mongoose.model("ClaimRequest", claimRequestSchema);
