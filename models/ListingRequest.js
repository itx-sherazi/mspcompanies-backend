const mongoose = require("mongoose");

const listingRequestSchema = new mongoose.Schema(
  {
    // Company info
    companyName: { type: String, required: true, trim: true },
    companyDescription: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    linkedinUrl: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    foundedYear: { type: String, trim: true, default: "" },
    companySize: { type: String, trim: true, default: "" },
    mainOfficeAddress: { type: String, trim: true, default: "" },
    requestedCity: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },

    // Contact person (not published)
    contactEmail: { type: String, required: true, trim: true },
    personOfContact: { type: String, trim: true, default: "" },
    jobTitle: { type: String, trim: true, default: "" },
    fullName: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    agreedToPrivacy: { type: Boolean, default: false },

    // Certifications
    certifications: { type: [String], default: [] },

    // Vertical focus
    verticalFocus: { type: String, trim: true, default: "" },

    // Partners & Services
    partners: { type: [String], default: [] },
    services: { type: [String], default: [] },

    // Marketing
    heardFrom: { type: String, trim: true, default: "" },

    // Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ListingRequest", listingRequestSchema);
