const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const CyberPage = require("../models/CyberPage");
const { parseCyber, buildCyber } = require("./cyberSheet");
const { createDirectoryImport } = require("./directoryImport");

const { run, buildReportWorkbook, relink } = createDirectoryImport({
  Company: CyberSecurityCompany,
  Page: CyberPage,
  parse: parseCyber,
  build: buildCyber,
  pageUrl: (slug) => `/cybersecurity-companies-in-${slug}`,
  profileUrl: (slug) => `/cybersecurity-companies/${slug}`,
  revalidate: ["/cybersecurity-companies"],
});

module.exports = { runCyberImport: run, buildReportWorkbook, relinkCyber: relink };
