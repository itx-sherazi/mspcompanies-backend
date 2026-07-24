const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    website: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    founded: { type: Number, default: null },
    hq: { type: String, default: "" },
    companySize: { type: String, default: "" },
    description: { type: String, default: "" },
    // company info (from sheet import)
    employees:   { type: String, default: "" },
    industry:    { type: String, default: "" },
    phone:       { type: String, default: "" },
    // location
    street:      { type: String, default: "" },
    city:        { type: String, default: "" },
    state:       { type: String, default: "" },
    country:     { type: String, default: "" },
    postalCode:  { type: String, default: "" },
    address:     { type: String, default: "" },
    // social
    linkedinUrl: { type: String, default: "" },
    facebookUrl: { type: String, default: "" },
    twitterUrl:  { type: String, default: "" },
    // taxonomy / tech
    keywords:     { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    sicCodes:     { type: String, default: "" },
    naicsCodes:   { type: String, default: "" },
    // MSP-specific
    keyFeatures: { type: [String], default: [] },
    pricingModel: { type: String, default: "" },
    pricingNotes: { type: String, default: "" },
    mspPartnerProgram: { type: Boolean, default: false },
    mspPartnerProgramNotes: { type: String, default: "" },
    integrations: { type: [String], default: [] },
    bestFor: { type: String, default: "" },
    pros: { type: [String], default: [] },
    cons: { type: [String], default: [] },
    categories: { type: [String], default: [], index: true },
    groups: { type: [String], default: [] },
    pageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);
