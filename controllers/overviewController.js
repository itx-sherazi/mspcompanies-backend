// Dashboard home: headline counts (companies, pages, leads) and recently updated pages.
// Only counts and small lists, so it stays fast; data-quality numbers come from
// companyQualityController's own endpoints.
const City = require("../models/City.js");
const ManagedItCompany = require("../models/ManagedItCompany.js");
const CyberSecurityCompany = require("../models/CyberSecurityCompany.js");
const Vendor = require("../models/Vendor.js");
const Category = require("../models/Category.js");
const Blog = require("../models/Blog.js");
const DataRequest = require("../models/DataRequest.js");
const ListingRequest = require("../models/ListingRequest.js");

// hubSlug -> dashboard tab, public base path and label.
const HUBS = {
  "managed-service-providers": { tab: "CityHub", path: "/msp", label: "MSP city page" },
  "top-msps": { tab: "CountryHub", path: "/top-msps", label: "Top MSPs country page" },
  "top-mssp": { tab: "MsspCountryHub", path: "/top-mssp", label: "Top MSSP country page" },
};

const LEAD_TYPES = [
  ["Lead Popup", "^Lead Popup"],
  ["Contact Form", "^Contact Form"],
  ["Book a Call", "^Book a Call"],
  ["Email List", "^Email List"],
];

const DAY = 24 * 60 * 60 * 1000;

async function hubStats() {
  const rows = await City.aggregate([
    {
      $group: {
        _id: "$hubSlug",
        pages: { $sum: 1 },
        published: { $sum: { $cond: ["$isPublished", 1, 0] } },
        companies: { $sum: { $size: { $ifNull: ["$hubCompanies", []] } } },
      },
    },
  ]);
  const byHub = Object.fromEntries(rows.map((r) => [r._id, r]));
  return Object.fromEntries(
    Object.keys(HUBS).map((h) => [h, {
      pages: byHub[h]?.pages || 0,
      published: byHub[h]?.published || 0,
      companies: byHub[h]?.companies || 0,
    }]),
  );
}

async function leadStats() {
  const now = Date.now();
  const typeExpr = {
    $switch: {
      branches: LEAD_TYPES.map(([label, re]) => ({
        case: { $regexMatch: { input: { $ifNull: ["$message", ""] }, regex: re } },
        then: label,
      })),
      default: "Other",
    },
  };
  const [byType, recent, listing, recentListings] = await Promise.all([
    DataRequest.aggregate([
      {
        $group: {
          _id: typeExpr,
          total: { $sum: 1 },
          last7: { $sum: { $cond: [{ $gte: ["$createdAt", new Date(now - 7 * DAY)] }, 1, 0] } },
          last30: { $sum: { $cond: [{ $gte: ["$createdAt", new Date(now - 30 * DAY)] }, 1, 0] } },
        },
      },
    ]),
    DataRequest.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 6 },
      { $project: { _id: 0, fullName: 1, email: 1, createdAt: 1, type: typeExpr } },
    ]),
    ListingRequest.aggregate([
      {
        $group: {
          _id: "$status",
          total: { $sum: 1 },
          last30: { $sum: { $cond: [{ $gte: ["$createdAt", new Date(now - 30 * DAY)] }, 1, 0] } },
        },
      },
    ]),
    ListingRequest.find().sort({ createdAt: -1 }).limit(4).select("companyName status createdAt -_id").lean(),
  ]);

  const sum = (list, k) => list.reduce((n, r) => n + r[k], 0);
  const listingBy = Object.fromEntries(listing.map((r) => [r._id, r.total]));
  return {
    total: sum(byType, "total"),
    last7: sum(byType, "last7"),
    last30: sum(byType, "last30"),
    byType: [...LEAD_TYPES.map(([l]) => l), "Other"]
      .map((type) => {
        const r = byType.find((x) => x._id === type);
        return { type, total: r?.total || 0, last30: r?.last30 || 0 };
      })
      .filter((r) => r.total > 0 || r.type !== "Other"),
    recent,
    listingRequests: {
      total: sum(listing, "total"),
      last30: sum(listing, "last30"),
      pending: listingBy.pending || 0,
      approved: listingBy.approved || 0,
      rejected: listingBy.rejected || 0,
      recent: recentListings,
    },
  };
}

async function recentUpdates(limit = 10) {
  const [cities, blogs, vendors, categories, mit, cyber] = await Promise.all([
    City.find().sort({ updatedAt: -1 }).limit(limit).select("name slug hubSlug isPublished updatedAt").lean(),
    Blog.find().sort({ updatedAt: -1 }).limit(limit).select("title slug published updatedAt").lean(),
    Vendor.find().sort({ updatedAt: -1 }).limit(limit).select("name slug updatedAt").lean(),
    Category.find().sort({ updatedAt: -1 }).limit(limit).select("title slug status updatedAt").lean(),
    ManagedItCompany.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean(),
    CyberSecurityCompany.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean(),
  ]);

  const items = [
    ...cities.map((c) => {
      const hub = HUBS[c.hubSlug] || HUBS["managed-service-providers"];
      return { kind: hub.label, name: c.name, path: `${hub.path}/${c.slug}`, tab: hub.tab, published: c.isPublished, updatedAt: c.updatedAt };
    }),
    ...blogs.map((b) => ({ kind: "Blog", name: b.title, path: `/blog/${b.slug}`, tab: "blog", published: b.published, updatedAt: b.updatedAt })),
    ...vendors.map((v) => ({ kind: "Vendor", name: v.name, path: `/tools/${v.slug}`, tab: "VendorDirectory", published: true, updatedAt: v.updatedAt })),
    ...categories.map((c) => ({ kind: "Vendor category", name: c.title, path: `/best/${c.slug}`, tab: "VendorDirectory", published: c.status === "published", updatedAt: c.updatedAt })),
    ...(mit ? [{ kind: "Directory", name: "Managed IT Services", path: "/managed-it-services", tab: "ManagedIT", published: true, updatedAt: mit.updatedAt }] : []),
    ...(cyber ? [{ kind: "Directory", name: "Cybersecurity Companies", path: "/cybersecurity-companies", tab: "CyberSecurity", published: true, updatedAt: cyber.updatedAt }] : []),
  ];
  return items
    .filter((i) => i.updatedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

/** GET /api/v1/admin/overview  (leads only for the admin role) */
exports.getOverview = async (req, res) => {
  try {
    const isAdmin = req.user?.role === "admin";
    const [hubs, mitCount, cyberCount, vendorCount, blogTotal, blogPublished, catTotal, catPublished, leads, updates] =
      await Promise.all([
        hubStats(),
        ManagedItCompany.countDocuments(),
        CyberSecurityCompany.countDocuments(),
        Vendor.countDocuments(),
        Blog.countDocuments(),
        Blog.countDocuments({ published: true }),
        Category.countDocuments(),
        Category.countDocuments({ status: "published" }),
        isAdmin ? leadStats() : null,
        recentUpdates(),
      ]);

    const city = hubs["managed-service-providers"];
    const topMsps = hubs["top-msps"];
    const topMssp = hubs["top-mssp"];

    res.json({
      ok: true,
      companies: {
        total: city.companies + topMsps.companies + topMssp.companies + mitCount + cyberCount,
        breakdown: [
          { key: "city", label: "MSP city pages", count: city.companies, tab: "CityHub" },
          { key: "topMsps", label: "Top MSPs countries", count: topMsps.companies, tab: "CountryHub" },
          { key: "topMssp", label: "Top MSSP countries", count: topMssp.companies, tab: "MsspCountryHub" },
          { key: "mit", label: "Managed IT directory", count: mitCount, tab: "ManagedIT" },
          { key: "cyber", label: "Cybersecurity directory", count: cyberCount, tab: "CyberSecurity" },
        ],
        vendors: vendorCount,
      },
      pages: {
        city: { total: city.pages, published: city.published },
        topMsps: { total: topMsps.pages, published: topMsps.published },
        topMssp: { total: topMssp.pages, published: topMssp.published },
        blogs: { total: blogTotal, published: blogPublished },
        categories: { total: catTotal, published: catPublished },
      },
      leads,
      recentUpdates: updates,
    });
  } catch (err) {
    console.error("getOverview:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
