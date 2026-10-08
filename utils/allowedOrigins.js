// Browser origins allowed to call the API with credentials (CORS) and to send cookie-authenticated writes (CSRF check).
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3005",
  "https://mspcompanies.us",
  "https://mspcompanies-dashboard.vercel.app",
  "https://www.mspcompanies-dashboard.vercel.app",
];
// Any https subdomain of mspcompanies.us (www, dashboard, api, ...)
const MSP_SUBDOMAIN = /^https:\/\/([a-z0-9-]+\.)+mspcompanies\.us$/;

function isAllowedOrigin(origin) {
  return !!origin && (allowedOrigins.includes(origin) || MSP_SUBDOMAIN.test(origin));
}

module.exports = { allowedOrigins, MSP_SUBDOMAIN, isAllowedOrigin };
