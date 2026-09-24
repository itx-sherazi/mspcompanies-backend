// Express app setup (routes, security middleware). index.js connects the DB and starts the server;
// tests import this file directly.
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { loginLimiter } = require("./middleware/rateLimits");

dotenv.config();

const app = express();

// Runs behind the nginx reverse proxy: trust its X-Forwarded-For so rate limits see the real client IP.
app.set("trust proxy", 1);

// API only serves JSON, so allow cross-origin reads of responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

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

const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header = server-to-server (Next.js SSR, curl); allowed.
    // Unknown origins get no CORS headers, so the browser blocks them (no 500 error).
    callback(null, !origin || allowedOrigins.includes(origin) || MSP_SUBDOMAIN.test(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));

// Vendor import posts a whole spreadsheet as JSON; everything else stays small.
app.use("/api/v1/vendors/import", express.json({ limit: "25mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

app.use("/api/v1/login", loginLimiter);

app.get("/", (req, res) => {
  res.send("MSP Companies API v1.0 - Running");
});

app.use("/api/v1", require("./router/userRoutes"));
app.use("/api/v1", require("./router/cityRoutes"));
app.use("/api/v1", require("./router/blogRoutes"));
app.use("/api/v1", require("./router/emailRoutes"));
app.use("/api/v1", require("./router/dataRequestRoutes"));
app.use("/api/v1", require("./router/listingRequestRoutes"));
app.use("/api/v1", require("./router/ServiceRoute"));
app.use("/api/v1", require("./router/CompanyTeamRoute"));
app.use("/api/v1", require("./router/managedItRoutes"));
app.use("/api/v1", require("./router/cyberSecurityRoutes"));
app.use("/api/v1/vendors",          require("./router/vendorRoutes"));
app.use("/api/v1/categories",       require("./router/categoryRoutes"));
app.use("/api/v1/parent-categories", require("./router/parentCategoryRoutes"));

module.exports = app;
