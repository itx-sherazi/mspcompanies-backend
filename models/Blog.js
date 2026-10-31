const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    body: { type: String, default: "" },
    image: { type: String, default: "" },
    category: { type: String, default: "General", trim: true },
    tags: { type: [String], default: [] },
    author: { type: String, default: "MSP Companies Team", trim: true },
    metaTitle: { type: String, default: "", trim: true },
    metaDescription: { type: String, default: "", trim: true },
    faqs: { type: [faqSchema], default: [] },
    published: { type: Boolean, default: false },
    // A blog written for a listed company: shown with the company card beside it and a byline at the end.
    companySlug: { type: String, default: "", trim: true, lowercase: true },
    publishedBy: { type: String, default: "", trim: true },
    // Where the blog first appeared, when it was published on the company's own site. Becomes the canonical link.
    originalUrl: { type: String, default: "", trim: true },
    // A paid placement: the page says so and the company links carry rel="sponsored".
    isSponsored: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "date", updatedAt: "updatedAt" } }
);

module.exports = mongoose.model("Blog", blogSchema);
