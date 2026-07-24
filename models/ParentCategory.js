const mongoose = require("mongoose");

const parentCategorySchema = new mongoose.Schema(
  {
    slug:           { type: String, required: true, unique: true, trim: true, lowercase: true }, // auto-generated from title
    title:          { type: String, required: true, trim: true },
    description:    { type: String, default: "" },
    subcategories:  { type: [String], default: [] },
    displayOrder:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParentCategory", parentCategorySchema);
