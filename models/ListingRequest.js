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
    requestedCitySlug: { type: String, trim: true, lowercase: true, default: "" },
    requestedCountry: { type: String, trim: true, default: "" },
    requestedCountrySlug: { type: String, trim: true, lowercase: true, default: "" },
    publishedCitySlug: { type: String, trim: true, lowercase: true, default: "" },
    publishedCompanySlug: { type: String, trim: true, lowercase: true, default: "" },
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

    // Listing plan selection
    listingType: { type: String, enum: ["free", "fast"], default: "free" },
    featuredAddon: { type: Boolean, default: false },

    // Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, trim: true, default: "" },

    // The deal with the company, kept apart from the listing status above: who pays and when, who is not interested,
    // who gives a link in exchange. Filled in by hand in the dashboard.
    deal: { type: String, enum: ["new", "following_up", "paid", "link_exchange", "not_interested"], default: "new", index: true },
    dealUpdatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paidAmount: { type: Number, default: null },
    linkExchangeUrl: { type: String, trim: true, default: "" },
    // Ticked by hand when the company has been written to.
    mailSent: { type: Boolean, default: false, index: true },
    mailSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ListingRequest", listingRequestSchema);
