const mongoose = require("mongoose");

/**
 * Companies uploaded for a city hub live ONLY here not in CompanyTeamData / Service.
 * Same Excel columns as service upload; parsed with cleanCompanyData on the controller.
 */
const hubCompanySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    companyName: { type: String, required: true },
    description: { type: String, default: "" },
    address: { type: String, default: "" },
    companyStreet: { type: String, default: "" },
    companyCity: { type: String, default: "" },
    companyPostalCode: { type: String, default: "" },
    companyServices: { type: [String], default: [] },
    companyPartners: { type: [String], default: [] },
    industryTags: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    employees: { type: String, default: "" },
    foundedYear: { type: Number, default: null },
    phone: { type: String, default: "" },
    image: { type: String, default: "" },
    website: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    facebookUrl: { type: String, default: "" },
    twitterUrl: { type: String, default: "" },
    naicsCodes: { type: [String], default: [] },
    sicCodes: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    vars: { type: String, default: "" },
    isSponsored: { type: Boolean, default: false },
  },
  { _id: false },
);

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    hubSlug: {
      type: String,
      default: "managed-service-providers",
      index: true,
    },
    isPublished: { type: Boolean, default: false },
    /** Visible H1 on the public city page (not the same as meta title). */
    heading: { type: String, default: "" },
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    /** Rich HTML below directory (H2/H3 for TOC), same pattern as Service.content */
    content: { type: String, default: "" },
    faqs: [
      {
        question: { type: String, default: "" },
        answer: { type: String, default: "" },
      },
    ],
    hubCompanies: { type: [hubCompanySchema], default: [] },
  },
  { timestamps: true },
);

const City = mongoose.model("City", citySchema);
module.exports = City;
