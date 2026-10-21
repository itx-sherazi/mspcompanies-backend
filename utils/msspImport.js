const MsspCompany = require("../models/MsspCompany");
const MsspPage = require("../models/MsspPage");
const { parseMssp, buildMssp } = require("./msspSheet");
const { createDirectoryImport } = require("./directoryImport");

const { run, buildReportWorkbook } = createDirectoryImport({
  Company: MsspCompany,
  Page: MsspPage,
  parse: parseMssp,
  build: buildMssp,
  pageUrl: (slug) => `/mssp/${slug}`,
  profileUrl: (slug) => `/managed-security-service-providers/${slug}`,
  revalidate: ["/managed-security-service-providers", "/mssp"],
});

module.exports = { runMsspImport: run, buildReportWorkbook };
