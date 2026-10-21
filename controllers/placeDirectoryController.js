const { createDirectoryController } = require("./directoryController");

/**
 * Everything a directory with location pages needs (MSSP, cybersecurity): the company handlers of the shared
 * directory controller, the page handlers, and the master sheet upload.
 */
function createPlaceDirectoryController({ Company, Page, importer, reportName }) {
  // Verified profiles lead every list.
  const c = createDirectoryController(Company, { sort: { indexEligible: -1, companyName: 1 }, placeSlugs: true });

  /** GET /pages  every published page (country, state, city) with its company count */
  c.listPages = async (req, res) => {
    try {
      const pages = await Page.find({ isPublished: true, companyCount: { $gt: 0 } })
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

  /** GET /pages/:slug */
  c.getPage = async (req, res) => {
    try {
      const page = await Page.findOne({ slug: String(req.params.slug).toLowerCase(), isPublished: true }).lean();
      if (!page) return res.status(404).json({ ok: false, message: "Page not found" });
      res.json({ ok: true, data: page });
    } catch (err) {
      console.error("getPage:", err);
      res.status(500).json({ ok: false, message: "Server error" });
    }
  };

  /**
   * POST /admin/.../upload   (multipart: file, mode=preview|report|apply)
   *
   * preview = reads the sheet and shows exactly what would happen. Nothing is written.
   * report  = same as preview, but the answer is an Excel file (every page and the page each company goes on).
   * apply   = writes the directory and every country / state / city page.
   */
  c.uploadSheet = async (req, res) => {
    try {
      const buffer = req.files?.file?.[0]?.buffer;
      if (!buffer) return res.status(400).json({ ok: false, message: "Excel file (field: file) is required." });

      const mode = String(req.body.mode || "preview").toLowerCase();
      const result = await importer.run({ buffer, apply: mode === "apply", withPlan: mode === "report" });
      if (mode === "report") {
        res.set({
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${reportName}"`,
          "Access-Control-Expose-Headers": "Content-Disposition",
        });
        return res.send(Buffer.from(importer.buildReportWorkbook(result)));
      }
      res.json(result);
    } catch (err) {
      console.error("uploadSheet:", err);
      const status = err.status || (err.detail ? 400 : 500);
      res.status(status).json({ ok: false, message: err.message || "Server error", detail: err.detail });
    }
  };

  return c;
}

module.exports = { createPlaceDirectoryController };
