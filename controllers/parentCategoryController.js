const ParentCategory = require("../models/ParentCategory");
const Category       = require("../models/Category");

// GET /api/v1/parent-categories  all parent cats with their subcategory details
exports.getParentCategories = async (req, res) => {
  try {
    const parents = await ParentCategory.find().sort({ displayOrder: 1, title: 1 }).lean();

    const allSlugs = [...new Set(parents.flatMap((p) => p.subcategories))];
    const cats = await Category.find({ slug: { $in: allSlugs } })
      .select("slug title group status meta.title")
      .lean();
    const catMap = Object.fromEntries(cats.map((c) => [c.slug, c]));
    const validSlugs = new Set(cats.map((c) => c.slug));

    // Auto-clean orphaned slugs from each parent
    const cleanupOps = [];
    for (const p of parents) {
      const cleanSubs = p.subcategories.filter((s) => validSlugs.has(s));
      if (cleanSubs.length !== p.subcategories.length) {
        cleanupOps.push(
          ParentCategory.findByIdAndUpdate(p._id, { subcategories: cleanSubs })
        );
        p.subcategories = cleanSubs;
      }
    }
    if (cleanupOps.length) await Promise.all(cleanupOps);

    const data = parents.map((p) => ({
      ...p,
      subcategoryDetails: p.subcategories.map((s) => catMap[s]),
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error("getParentCategories:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// GET /api/v1/parent-categories/:slug  single parent with subcategory details
exports.getParentCategoryBySlug = async (req, res) => {
  try {
    const parent = await ParentCategory.findOne({ slug: req.params.slug }).lean();
    if (!parent) return res.status(404).json({ ok: false, error: "Not found" });

    const cats = await Category.find({ slug: { $in: parent.subcategories } })
      .select("slug title group status meta.title")
      .lean();
    const catMap = Object.fromEntries(cats.map((c) => [c.slug, c]));

    res.json({
      ok: true,
      data: {
        ...parent,
        subcategoryDetails: parent.subcategories.map((s) => catMap[s] || { slug: s, title: s }),
      },
    });
  } catch (err) {
    console.error("getParentCategoryBySlug:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// POST /api/v1/parent-categories  create (slug auto-generated from title)
exports.createParentCategory = async (req, res) => {
  try {
    const { title, description = "", subcategories = [], displayOrder = 0 } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: "title required" });

    const base = String(title).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    // ensure unique slug
    let safeSlug = base;
    let suffix = 1;
    while (await ParentCategory.findOne({ slug: safeSlug })) {
      safeSlug = `${base}-${suffix++}`;
    }

    const parent = await ParentCategory.create({
      slug: safeSlug,
      title: String(title).trim(),
      description: String(description).trim(),
      subcategories: Array.isArray(subcategories) ? subcategories : [],
      displayOrder: Number(displayOrder) || 0,
    });

    res.status(201).json({ ok: true, data: parent });
  } catch (err) {
    console.error("createParentCategory:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// PUT /api/v1/parent-categories/:id  update
exports.updateParentCategory = async (req, res) => {
  try {
    const parent = await ParentCategory.findById(req.params.id);
    if (!parent) return res.status(404).json({ ok: false, error: "Not found" });

    if (req.body.title        !== undefined) parent.title        = String(req.body.title).trim();
    if (req.body.description  !== undefined) parent.description  = String(req.body.description).trim();
    if (req.body.displayOrder !== undefined) parent.displayOrder = Number(req.body.displayOrder) || 0;
    if (Array.isArray(req.body.subcategories)) parent.subcategories = req.body.subcategories;

    await parent.save();
    res.json({ ok: true, data: parent });
  } catch (err) {
    console.error("updateParentCategory:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

// DELETE /api/v1/parent-categories/:id  delete
exports.deleteParentCategory = async (req, res) => {
  try {
    const result = await ParentCategory.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteParentCategory:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};
