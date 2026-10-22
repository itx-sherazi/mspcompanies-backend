const { createDirectoryController } = require("./directoryController");
const publicCache = require("../utils/memoryCache");
const { cleanHtml } = require("../utils/sanitizeHtml");
const { revalidateFrontend } = require("../utils/revalidateFrontend");

/**
 * Everything a directory with location pages needs (MSSP, cybersecurity): the company handlers of the shared
 * directory controller, the page handlers, and the master sheet upload.
 */
function createPlaceDirectoryController({ Company, Page, importer, reportName, pagePath, indexPaths = [] }) {
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

  /** GET /admin/.../pages  every page, published or not, for the dashboard (no text, only what the list shows) */
  c.listPagesAdmin = async (req, res) => {
    try {
      const pages = await Page.find({})
        .select("slug type name stateName stateSlug countryName countrySlug companyCount isPublished heading metaTitle metaDescription updatedAt")
        .sort({ countryName: 1, type: 1, name: 1 })
        .lean();
      res.json({ ok: true, data: pages.map(({ heading, metaTitle, metaDescription, ...p }) => ({ ...p, hasMeta: Boolean(heading || metaTitle || metaDescription) })) });
    } catch (err) {
      console.error("listPagesAdmin:", err);
      res.status(500).json({ ok: false, message: "Server error" });
    }
  };

  /** GET /admin/.../pages/:slug  one page with its text and questions */
  c.getPageAdmin = async (req, res) => {
    try {
      const page = await Page.findOne({ slug: String(req.params.slug).toLowerCase() }).lean();
      if (!page) return res.status(404).json({ ok: false, message: "Page not found" });
      res.json({ ok: true, data: page });
    } catch (err) {
      console.error("getPageAdmin:", err);
      res.status(500).json({ ok: false, message: "Server error" });
    }
  };

  /**
   * PUT /admin/.../pages/:slug  heading, meta title and description, text, questions and published. The slug, the type and
   * the places never change here: they come from the companies, and the next sheet import would put them back.
   */
  c.updatePageAdmin = async (req, res) => {
    try {
      const b = req.body || {};
      const set = {};
      for (const k of ["heading", "metaTitle", "metaDescription"]) {
        if (b[k] !== undefined) set[k] = String(b[k] || "").trim().slice(0, 400);
      }
      if (b.content !== undefined) set.content = typeof b.content === "string" ? cleanHtml(b.content) : "";
      if (b.isPublished !== undefined) set.isPublished = Boolean(b.isPublished);
      if (b.faqs !== undefined) {
        if (!Array.isArray(b.faqs)) return res.status(400).json({ ok: false, message: "faqs must be a list" });
        set.faqs = b.faqs
          .slice(0, 50)
          .map((f) => ({ question: String((f && f.question) || "").trim().slice(0, 500), answer: String((f && f.answer) || "").trim().slice(0, 4000) }))
          .filter((f) => f.question && f.answer);
      }
      const page = await Page.findOneAndUpdate({ slug: String(req.params.slug).toLowerCase() }, { $set: set }, { returnDocument: "after" }).lean();
      if (!page) return res.status(404).json({ ok: false, message: "Page not found" });
      publicCache.clear();
      // A local database must never poke the live website.
      if (!/localhost|127.0.0.1/.test(process.env.MONGO_URI || "")) await revalidateFrontend([pagePath(page.slug), ...indexPaths]).catch(() => {});
      res.json({ ok: true, data: page });
    } catch (err) {
      console.error("updatePageAdmin:", err);
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
