const mongoose = require("mongoose");

const companyTeamSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
  description: { type: String },
  employees: { type: String },
  website: { type: String },
  slug: { type: String, unique: true, required: true },
  linkedinUrl: { type: String },
  facebookUrl: { type: String },
  twitterUrl: { type: String },
  vars: { type: String },
  companyStreet: { type: String },
  companyCity: { type: String },
  companyState: { type: String },
  companyCountry: { type: String },
  companyPostalCode: { type: String },
  address: { type: String },
  keywords: [{ type: String }],
  companyPartners: [{ type: String }],
  companyServices: [{ type: String }],
  phone: { type: String },
  technologies: [{ type: String }],
  sicCodes: [{ type: String }],
  naicsCodes: [{ type: String }],
  industryTags: [{ type: String }],
  foundedYear: { type: Number },
  image: { type: String },
}, { timestamps: true });

companyTeamSchema.index({ companyName: 1 });
companyTeamSchema.index({ companyName: "text" });

module.exports = mongoose.model("companyTeam", companyTeamSchema);
