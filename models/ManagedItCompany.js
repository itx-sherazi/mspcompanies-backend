const mongoose = require("mongoose");

const managedItCompanySchema = new mongoose.Schema(
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
    sicCodes: { type: [String], default: [] },
    naicsCodes: { type: [String], default: [] },
    description: { type: String, default: "" },
    foundedYear: { type: Number, default: null },
    // Master sheet profile fields
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
    citySlug: { type: String, default: "" },
    stateSlug: { type: String, default: "" },
    countrySlug: { type: String, default: "" },
    googleMapsUrl: { type: String, default: "" },
    // The city / state / country pages this company is listed on (set by the Master Sheet import).
    // The profile uses them for its breadcrumb and a link back to the city page.
    cityPageSlug: { type: String, default: "" },
    cityPageName: { type: String, default: "" },
    statePageSlug: { type: String, default: "" },
    statePageName: { type: String, default: "" },
    countryPageSlug: { type: String, default: "" },
    countryPageName: { type: String, default: "" },
    faqs: { type: [new mongoose.Schema({ question: { type: String, default: "" }, answer: { type: String, default: "" } }, { _id: false })], default: [] },
    image: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
    /** Sponsored in the dashboard: its copy on every city, state and country page it belongs to is marked sponsored. */
    isSponsored: { type: Boolean, default: false },
    /** Came from an approved Get Listed request. Every Master Sheet import keeps these. */
    fromListing: { type: Boolean, default: false, index: true },
    listingRequestId: { type: String, default: "" },
  },
  { timestamps: true }
);

managedItCompanySchema.index({ companyName: "text", description: "text", keywords: "text" });
managedItCompanySchema.index({ isPublished: 1, companyName: 1 });
managedItCompanySchema.index({ isPublished: 1, companyState: 1 });
managedItCompanySchema.index({ isPublished: 1, companyCity: 1 });
managedItCompanySchema.index({ isPublished: 1, companyCountry: 1 });
managedItCompanySchema.index({ isPublished: 1, industry: 1 });
managedItCompanySchema.index({ isPublished: 1, companyCountry: 1, companyState: 1, companyCity: 1 });
managedItCompanySchema.index({ website: 1 });

const ManagedItCompany = mongoose.model("ManagedItCompany", managedItCompanySchema);
module.exports = ManagedItCompany;
