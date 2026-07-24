const Category       = require("../models/Category");
const ParentCategory = require("../models/ParentCategory");

function normalizeFaqs(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((f) => ({
      question: String(f?.question ?? "").trim(),
      answer:   String(f?.answer   ?? "").trim(),
    }))
    .filter((f) => f.question || f.answer);
}

async function revalidateFrontend(paths = []) {
  try {
    const base   = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const secret = process.env.REVALIDATE_SECRET || "";
    await fetch(`${base}/api/revalidate?secret=${secret}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ paths }),
    });
  } catch (_) {}
}

// POST /api/v1/categories  create new category (slug auto from title)
exports.createCategory = async (req, res) => {
  try {
    const { title, slug: rawSlug, group = "", metaTitle = "", metaDescription = "" } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: "title required" });

    const base = rawSlug
      ? String(rawSlug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
      : String(title).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    let slug = base;
    let suffix = 1;
    while (await Category.findOne({ slug })) { slug = `${base}-${suffix++}`; }

    const category = await Category.create({
      slug, title: String(title).trim(),
      group: String(group).trim(),
      meta: { title: String(metaTitle).trim(), description: String(metaDescription).trim() },
      status: "To Do",
    });

    res.status(201).json({ ok: true, data: category });
  } catch (err) {
    console.error("createCategory error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// DELETE /api/v1/categories/:slug  delete category
exports.deleteCategory = async (req, res) => {
  try {
    const result = await Category.findOneAndDelete({ slug: req.params.slug });
    if (!result) return res.status(404).json({ ok: false, error: "Category not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteCategory error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// GET /api/v1/categories  all categories (for /best hub page)
exports.getCategories = async (req, res) => {
  try {
    const { group, status } = req.query;
    const filter = {};
    if (group)  filter.group  = group;
    if (status) filter.status = status;

    const categories = await Category.find(filter)
      .sort({ title: 1 })
      .select("slug title group meta.title status")
      .lean();

    res.json({ ok: true, data: categories });
  } catch (err) {
    console.error("getCategories error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// GET /api/v1/categories/:slug  single category with vendorRankings
exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug }).lean();
    if (!category) return res.status(404).json({ ok: false, error: "Category not found" });
    res.json({ ok: true, data: category });
  } catch (err) {
    console.error("getCategoryBySlug error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// PUT /api/v1/categories/:slug  update SEO content from dashboard
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) return res.status(404).json({ ok: false, error: "Category not found" });

    const allowed = ["title", "heading", "group", "status", "relatedCategories"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) category[key] = req.body[key];
    }
    if (req.body.slug !== undefined) {
      const newSlug = String(req.body.slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (newSlug && newSlug !== category.slug) {
        const exists = await Category.findOne({ slug: newSlug });
        if (exists) return res.status(400).json({ ok: false, error: "Slug already in use" });
        const oldSlug = category.slug;
        category.slug = newSlug;
        // Update any parent category that references the old slug
        await ParentCategory.updateMany(
          { subcategories: oldSlug },
          { $set: { "subcategories.$[el]": newSlug } },
          { arrayFilters: [{ el: oldSlug }] }
        );
      }
    }
    if (req.body.metaTitle       !== undefined) category.meta.title       = String(req.body.metaTitle).trim();
    if (req.body.metaDescription !== undefined) category.meta.description = String(req.body.metaDescription).trim();
    if (req.body.contentHtml     !== undefined) category.contentHtml      = typeof req.body.contentHtml === "string" ? req.body.contentHtml : "";
    if (req.body.faqs            !== undefined) category.faqs             = normalizeFaqs(req.body.faqs);

    if (req.body.status === "published" && !category.publishedAt) {
      category.publishedAt = new Date();
    }

    await category.save();
    revalidateFrontend(["/best", `/best/${category.slug}`]);
    res.json({ ok: true, data: category });
  } catch (err) {
    console.error("updateCategory error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// PUT /api/v1/categories/:slug/rankings  update vendorRankings order
exports.updateCategoryRankings = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) return res.status(404).json({ ok: false, error: "Category not found" });

    const rankings = req.body.vendorRankings;
    if (!Array.isArray(rankings)) {
      return res.status(400).json({ ok: false, error: "vendorRankings must be an array" });
    }

    category.vendorRankings = rankings.map((r, i) => ({
      vendorSlug: String(r.vendorSlug || "").trim(),
      rank:       Number(r.rank) || i + 1,
      featured:   Boolean(r.featured),
    })).filter((r) => r.vendorSlug);

    await category.save();
    revalidateFrontend(["/best", `/best/${category.slug}`]);
    res.json({ ok: true, data: category.vendorRankings });
  } catch (err) {
    console.error("updateCategoryRankings error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};
