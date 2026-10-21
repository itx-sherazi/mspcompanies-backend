const CyberSecurityCompany = require("../models/CyberSecurityCompany");
const CyberPage = require("../models/CyberPage");
const { planCyber } = require("./cyberSheet");
const { createDirectoryImport } = require("./directoryImport");

const { run, buildReportWorkbook } = createDirectoryImport({
  Company: CyberSecurityCompany,
  Page: CyberPage,
  plan: planCyber,
  pageUrl: (slug) => `/cybersecurity-companies-in-${slug}`,
  profileUrl: (slug) => `/cybersecurity-companies/${slug}`,
  revalidate: ["/cybersecurity-companies"],
});

module.exports = { runCyberImport: run, buildReportWorkbook };
