const MsspCompany = require("../models/MsspCompany");
const MsspPage = require("../models/MsspPage");
const { createPlaceDirectoryController } = require("./placeDirectoryController");
const { runMsspImport, buildReportWorkbook } = require("../utils/msspImport");

module.exports = createPlaceDirectoryController({
  Company: MsspCompany,
  Page: MsspPage,
  importer: { run: runMsspImport, buildReportWorkbook },
  reportName: "mssp-import-report.xlsx", pagePath: (slug) => `/mssp/${slug}`, indexPaths: ["/managed-security-service-providers", "/mssp", "/sitemaps/mssp-sitemap"],
});
