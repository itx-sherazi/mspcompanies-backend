const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, unique: true, required: true },
  description: { type: String, default: "" },
  companies: [{ type: mongoose.Schema.Types.ObjectId, ref: "companyTeam" }],
  filterConfig: {
    type: [{
      fieldName: { type: String, required: true },
      displayName: { type: String, required: true },
      fieldType: { type: String, enum: ["text", "number", "select"], default: "text" },
      options: { type: [String], default: [] },
    }],
    default: [],
  },
  metaTitle: { type: String, default: "" },
  metaDescription: { type: String, default: "" },
  metaKeywords: { type: String, default: "" },
  content: { type: String, default: "" },
  faqs: [{ question: String, answer: String }],
  providerCount: { type: Number, default: 500 },
}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);
