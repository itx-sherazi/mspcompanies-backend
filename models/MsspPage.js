const mongoose = require("mongoose");

// A /mssp/{slug} page. Built by the MSSP sheet import: one per country, plus the states and cities that
// have enough companies. The companies of a page are looked up in MsspCompany by cityPageSlug /
// statePageSlug / countryPageSlug, so nothing is copied onto the page.
const msspPageSchema = new mongoose.Schema(
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
  },
  { timestamps: true },
);

msspPageSchema.index({ isPublished: 1, type: 1, countrySlug: 1 });

module.exports = mongoose.model("MsspPage", msspPageSchema);
