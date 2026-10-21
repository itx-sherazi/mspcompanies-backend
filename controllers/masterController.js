const { runMasterImport, buildReportWorkbook } = require("../utils/masterImport");

/**
 * POST /api/v1/admin/master/upload   (multipart: file, mode=preview|apply|report, metro=0|1, createPages=0|1)
 *
 * preview  = reads the sheet and shows exactly what would happen. Nothing is written.
 * report   = same as preview, but the answer is an Excel file with every company and the page it goes on.
 * apply    = writes the main directory and every city / state / country page.
 */
exports.uploadMaster = async (req, res) => {
  try {
    const buffer = req.files?.file?.[0]?.buffer;
    if (!buffer) return res.status(400).json({ ok: false, message: "Excel file (field: file) is required." });

    const mode = String(req.body.mode || "preview").toLowerCase();
    const apply = mode === "apply";
    const flag = (v, fallback) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v)));
    const result = await runMasterImport({
      buffer,
      apply,
      metro: flag(req.body.metro, undefined),
      createPages: flag(req.body.createPages, true),
      withPlan: mode === "report",
    });
    // mode=report: nothing is saved, the answer is an Excel file (which company goes on which page).
    if (mode === "report") {
      const file = buildReportWorkbook(result);
      res.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="master-import-report.xlsx"',
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      return res.send(Buffer.from(file));
    }
    res.json(result);
  } catch (err) {
    console.error("uploadMaster:", err);
    const status = err.status || (err.detail ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message || "Server error", detail: err.detail });
  }
};
