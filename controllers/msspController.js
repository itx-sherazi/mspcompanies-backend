const MsspCompany = require("../models/MsspCompany");
const MsspPage = require("../models/MsspPage");
const { createDirectoryController } = require("./directoryController");
const { runMsspImport, buildReportWorkbook } = require("../utils/msspImport");

// Verified profiles lead every list.
const directory = createDirectoryController(MsspCompany, { sort: { indexEligible: -1, companyName: 1 }, placeSlugs: true });
module.exports = { ...directory };

/** GET /api/v1/mssp-pages  every published page (country, state, city) with its company count */
module.exports.listPages = async (req, res) => {
  try {
    const pages = await MsspPage.find({ isPublished: true, companyCount: { $gt: 0 } })
      .select("slug type name stateName stateSlug countryName countrySlug companyCount")
      .sort({ countryName: 1, type: 1, name: 1 })
      .lean();
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
    res.json({ ok: true, data: pages });
  } catch (err) {
    console.error("listPages:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** GET /api/v1/mssp-pages/:slug */
module.exports.getPage = async (req, res) => {
  try {
    const page = await MsspPage.findOne({ slug: String(req.params.slug).toLowerCase(), isPublished: true }).lean();
    if (!page) return res.status(404).json({ ok: false, message: "Page not found" });
    res.json({ ok: true, data: page });
  } catch (err) {
    console.error("getPage:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/**
 * POST /api/v1/admin/mssp/upload   (multipart: file, mode=preview|report|apply)
 *
 * preview = reads the sheet and shows exactly what would happen. Nothing is written.
 * report  = same as preview, but the answer is an Excel file (every page and the page each company goes on).
 * apply   = writes the directory and every country / state / city page.
 */
module.exports.uploadMssp = async (req, res) => {
  try {
    const buffer = req.files?.file?.[0]?.buffer;
    if (!buffer) return res.status(400).json({ ok: false, message: "Excel file (field: file) is required." });

    const mode = String(req.body.mode || "preview").toLowerCase();
    const result = await runMsspImport({
      buffer,
      apply: mode === "apply",
      withPlan: mode === "report",
    });
    if (mode === "report") {
      res.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="mssp-import-report.xlsx"',
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      return res.send(Buffer.from(buildReportWorkbook(result)));
    }
    res.json(result);
  } catch (err) {
    console.error("uploadMssp:", err);
    const status = err.status || (err.detail ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message || "Server error", detail: err.detail });
  }
};
