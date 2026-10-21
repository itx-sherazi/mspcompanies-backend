const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const CyberPage = require("../models/CyberPage");
const { createPlaceDirectoryController } = require("./placeDirectoryController");
const { runCyberImport, buildReportWorkbook } = require("../utils/cyberImport");

module.exports = createPlaceDirectoryController({
  Company: CyberSecurityCompany,
  Page: CyberPage,
  importer: { run: runCyberImport, buildReportWorkbook },
  reportName: "cybersecurity-import-report.xlsx",
});
