const ManagedItCompany = require("../models/ManagedItCompany");
const MsspCompany = require("../models/MsspCompany");
const CyberSecurityCompany = require("../models/CyberSecurityCompany");

const MODELS = { mit: ManagedItCompany, mssp: MsspCompany, cyber: CyberSecurityCompany };

// GET /api/v1/company-moved/:directory/:slug (public)
// A profile whose link was changed in the dashboard: the old link answers with the new slug, so the website can redirect.
exports.getMoved = async (req, res) => {
  try {
    const Model = MODELS[req.params.directory];
    const slug = String(req.params.slug || "").toLowerCase();
    if (!Model || !/^[a-z0-9-]{1,120}$/.test(slug)) return res.json({ ok: true, movedTo: null });
    // a company that uses the link now is not "moved"
    if (await Model.exists({ slug })) return res.json({ ok: true, movedTo: null });
    const doc = await Model.findOne({ oldSlugs: slug, isPublished: { $ne: false } }).select("slug").lean();
    res.json({ ok: true, movedTo: doc ? doc.slug : null });
  } catch (err) {
    console.error("getMoved:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
