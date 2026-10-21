const mongoose = require("mongoose");

// One document per row of the cybersecurity master sheet. Same columns as the MSP and MSSP master sheets.
const cyberSecurityCompanySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },
    employees: { type: String, default: "" },
    revenueSize: { type: String, default: "" },
    industry: { type: String, default: "" },
    website: { type: String, default: "" },
    companyServices: { type: [String], default: [] },
    companyPartners: { type: [String], default: [] },
    linkedinUrl: { type: String, default: "" },
    facebookUrl: { type: String, default: "" },
    twitterUrl: { type: String, default: "" },
    companyStreet: { type: String, default: "" },
    companyCity: { type: String, default: "" },
    companyState: { type: String, default: "" },
    companyCountry: { type: String, default: "" },
    companyPostalCode: { type: String, default: "" },
    address: { type: String, default: "" },
    keywords: { type: [String], default: [] },
    phone: { type: String, default: "" },
    technologies: { type: [String], default: [] },
    description: { type: String, default: "" },
    foundedYear: { type: Number, default: null },
    profileSummary: { type: String, default: "" },
    tagline: { type: String, default: "" },
    industriesServed: { type: [String], default: [] },
    serviceArea: { type: String, default: "" },
    certifications: { type: [String], default: [] },
    supportHours: { type: String, default: "" },
    /** Only profiles with indexEligible === true are indexable by Google. */
    indexEligible: { type: Boolean, default: false },
    clientSizeFocus: { type: String, default: "" },
    specialization: { type: String, default: "" },
    complianceFrameworks: { type: [String], default: [] },
    bookingUrl: { type: String, default: "" },
    googleMapsUrl: { type: String, default: "" },
    // The location pages this company is listed on (set by the import). Empty when the place is too small for a page.
    cityPageSlug: { type: String, default: "" },
    statePageSlug: { type: String, default: "" },
    countryPageSlug: { type: String, default: "" },
    faqs: { type: [new mongoose.Schema({ question: { type: String, default: "" }, answer: { type: String, default: "" } }, { _id: false })], default: [] },
    image: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

cyberSecurityCompanySchema.index({ companyName: "text", description: "text", keywords: "text" });
cyberSecurityCompanySchema.index({ isPublished: 1, companyName: 1 });
cyberSecurityCompanySchema.index({ isPublished: 1, cityPageSlug: 1 });
cyberSecurityCompanySchema.index({ isPublished: 1, statePageSlug: 1 });
cyberSecurityCompanySchema.index({ isPublished: 1, countryPageSlug: 1 });
cyberSecurityCompanySchema.index({ isPublished: 1, companyCountry: 1, companyState: 1, companyCity: 1 });

module.exports = mongoose.model("CyberSecurityCompany", cyberSecurityCompanySchema);
