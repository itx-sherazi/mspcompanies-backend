const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    group: { type: String, required: true, index: true },
    meta: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
    },
    // ordered vendor rankings  source of truth for Top 10 order
    vendorRankings: [
      {
        vendorSlug: { type: String, required: true },
        rank: { type: Number, required: true },
        featured: { type: Boolean, default: false },
      },
    ],
    relatedCategories: { type: [String], default: [] },
    // Dashboard-managed fields (same pattern as City)
    heading:     { type: String, default: "" },   // public page H1
    contentHtml: { type: String, default: "" },   // rich HTML body shown below vendor list
    faqs: [
      {
        question: { type: String, default: "" },
        answer:   { type: String, default: "" },
      },
    ],
    // Legacy structured content (kept for backward compat)
    content: {
      intro:    { type: String, default: "" },
      sections: [{ heading: String, body: String }],
      faq:      [{ q: String, a: String }],
    },
    status: { type: String, enum: ["draft", "published", "To Do"], default: "To Do" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
