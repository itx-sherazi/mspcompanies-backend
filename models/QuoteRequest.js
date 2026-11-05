const mongoose = require("mongoose");

/** A visitor asks a listed company for a quote, from the profile page. The editor inbox gets the same request by email. */
const quoteRequestSchema = new mongoose.Schema(
  {
    // The company the quote is asked from
    companySlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    companyName: { type: String, required: true, trim: true },
    /** Page the visitor was on, for example /managed-it-services/acme. */
    pagePath: { type: String, trim: true, default: "" },

    // The visitor
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },

    // Follow up by the editor
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new", index: true },
    adminNote: { type: String, trim: true, default: "" },

    /** Did the email to the editor inbox go out? */
    mailSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

quoteRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("QuoteRequest", quoteRequestSchema);
