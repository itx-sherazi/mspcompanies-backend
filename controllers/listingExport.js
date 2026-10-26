/**
 * TEMPORARY. Exports every listing request to one Excel file: the company details and the contact details of the person who
 * submitted it. To remove it later: delete this file, the "listing-requests/export" line in router/listingRequestRoutes.js,
 * and the button file ListingExportButton.js of the dashboard (with its two lines in ListingRequests.js).
 */
const xlsx = require("xlsx");
const ListingRequest = require("../models/ListingRequest");

const COLUMNS = [
  ["Submitted on", (r) => r.createdAt],
  ["Company name", (r) => r.companyName],
  ["Website", (r) => r.website],
  ["LinkedIn", (r) => r.linkedinUrl],
  ["Company phone", (r) => r.phone],
  ["Founded", (r) => r.foundedYear],
  ["Company size", (r) => r.companySize],
  ["Main office address", (r) => r.mainOfficeAddress],
  ["Requested city", (r) => r.requestedCity],
  ["Requested country", (r) => r.requestedCountry],
  ["Description", (r) => r.companyDescription],
  ["Services", (r) => (r.services || []).join(", ")],
  ["Partners", (r) => (r.partners || []).join(", ")],
  ["Certifications", (r) => (r.certifications || []).join(", ")],
  ["Vertical focus", (r) => r.verticalFocus],
  ["Logo link", (r) => r.logoUrl],
  ["Contact email", (r) => r.contactEmail],
  ["Contact person", (r) => r.personOfContact],
  ["Contact job title", (r) => r.jobTitle],
  ["Contact full name", (r) => r.fullName],
  ["Note from the submitter", (r) => r.note],
  ["Agreed to privacy", (r) => (r.agreedToPrivacy ? "Yes" : "No")],
  ["Heard from", (r) => r.heardFrom],
  ["Listing type", (r) => r.listingType],
  ["Featured add-on", (r) => (r.featuredAddon ? "Yes" : "No")],
  ["Listing status", (r) => r.status],
  ["Deal", (r) => r.deal || "new"],
  ["Paid on", (r) => r.paidAt],
  ["Paid amount", (r) => r.paidAmount],
  ["Link exchange page", (r) => r.linkExchangeUrl],
  ["Mail sent", (r) => (r.mailSent ? "Yes" : "No")],
  ["Mail sent on", (r) => r.mailSentAt],
  ["Admin note", (r) => r.adminNote],
  ["Published company", (r) => r.publishedCompanySlug],
  ["Published city", (r) => r.publishedCitySlug],
];

// Text typed by a visitor can start with = + - or @, which Excel would run as a formula. A quote in front keeps it text.
const safe = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  const s = String(v ?? "");
  // A phone number (+1 555 0100) is not a formula and is left as it is.
  if (/^\+?[\d\s().-]+$/.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

exports.exportListingRequests = async (req, res) => {
  try {
    const requests = await ListingRequest.find({}).sort({ createdAt: -1 }).limit(20000).lean();
    const rows = requests.map((r) => Object.fromEntries(COLUMNS.map(([name, get]) => [name, safe(get(r))])));
    const sheet = xlsx.utils.json_to_sheet(rows, { header: COLUMNS.map(([name]) => name), cellDates: true });
    sheet["!cols"] = COLUMNS.map(([name]) => ({ wch: Math.min(40, Math.max(14, name.length + 2)) }));
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, "Listing requests");
    const buffer = xlsx.write(book, { type: "buffer", bookType: "xlsx", cellDates: true });
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="listing-requests-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    });
    res.send(buffer);
  } catch (err) {
    console.error("exportListingRequests:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
