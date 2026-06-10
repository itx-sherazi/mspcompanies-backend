const mongoose = require("mongoose");

const managedItCompanySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },
    employees: { type: String, default: "" },
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
    image: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

managedItCompanySchema.index({ companyName: "text", description: "text", keywords: "text" });
managedItCompanySchema.index({ companyState: 1 });
managedItCompanySchema.index({ companyCity: 1 });
managedItCompanySchema.index({ industry: 1 });

const ManagedItCompany = mongoose.model("ManagedItCompany", managedItCompanySchema);
module.exports = ManagedItCompany;
