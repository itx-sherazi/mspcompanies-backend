const mongoose = require("mongoose");

// A /cybersecurity-companies-in-{slug} page. Built by the cybersecurity sheet import: one per country, state or city
// that has enough companies. The companies of a page are looked up in CyberSecurityCompany by cityPageSlug /
// statePageSlug / countryPageSlug, so nothing is copied onto the page.
const cyberPageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    type: { type: String, enum: ["country", "state", "city"], required: true },
    name: { type: String, required: true, trim: true },
    stateName: { type: String, default: "" },
    stateSlug: { type: String, default: "" },
    countryName: { type: String, default: "" },
    countrySlug: { type: String, default: "" },
    companyCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    // Written in the dashboard. The sheet import never touches these.
    heading: { type: String, default: "", trim: true },
    metaTitle: { type: String, default: "", trim: true },
    metaDescription: { type: String, default: "", trim: true },
    content: { type: String, default: "" },
    faqs: [{ _id: false, question: { type: String, trim: true }, answer: { type: String, trim: true } }],
    /** When the page was last edited by hand in the dashboard. A sheet import never changes it. */
    editedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

cyberPageSchema.index({ isPublished: 1, type: 1, countrySlug: 1 });

module.exports = mongoose.model("CyberPage", cyberPageSchema);
