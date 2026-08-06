const mongoose = require("mongoose");

const dataRequestSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    contactCount: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    message: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DataRequest", dataRequestSchema);
