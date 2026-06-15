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
  },
  { timestamps: { createdAt: "date", updatedAt: "updatedAt" } }
);

module.exports = mongoose.model("Blog", blogSchema);
