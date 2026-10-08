const { rateLimit } = require("express-rate-limit");

function limiter({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Frontend forms read either `error` or `message`, so send both.
    handler: (req, res) => res.status(429).json({ ok: false, error: message, message }),
  });
}

// Public forms that send email / create records: 5 submissions per 15 min per IP, per form.
exports.formLimiter = () =>
  limiter({ windowMinutes: 15, max: 5, message: "Too many requests, please try again later." });

// Login brute-force protection: 10 attempts per 15 min per IP.
exports.loginLimiter = limiter({
  windowMinutes: 15,
  max: 10,
  message: "Too many login attempts, please try again in 15 minutes.",
});

// ---- Public data API (anti-scraping) ----
// The Next.js server renders every page by calling this API from ONE IP, so a per-IP limit would
// throttle the site itself (and Googlebot crawls). Server-side requests therefore send
// `x-internal-key` (= INTERNAL_API_KEY, set on both the website and this API) and skip the limit.
// If INTERNAL_API_KEY is not set here the limiter stays OFF, so deploying this code alone cannot
// break the site.
const crypto = require("crypto");

function isInternalRequest(req) {
  const secret = process.env.INTERNAL_API_KEY;
  const sent = req.get("x-internal-key");
  if (!secret || !sent) return false;
  const a = Buffer.from(String(sent));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The dashboard also reads some of these endpoints (e.g. /vendors) while an admin is logged in.
// A valid admin JWT (Bearer or cookie) is never throttled; scrapers do not have one.
function isAdminRequest(req) {
  try {
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : req.cookies && req.cookies.adminToken;
    if (!token || !process.env.JWT_SECRET) return false;
    require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
    return true;
  } catch (_) {
    return false;
  }
}

function publicLimiter({ windowMinutes, max }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Off until INTERNAL_API_KEY is configured; internal (SSR) traffic is never counted.
    skip: (req) => req.method !== "GET" || !process.env.INTERNAL_API_KEY || isInternalRequest(req) || isAdminRequest(req),
    handler: (req, res) =>
      res.status(429).json({ ok: false, error: "Too many requests", message: "Too many requests, please slow down." }),
  });
}

// Per IP: burst limit (1 min) plus an hourly cap. Real visitors browse server-rendered pages, so
// they rarely call the API directly; a scraper pulling 50 rows per request hits the cap quickly.
exports.publicApiBurstLimiter = publicLimiter({ windowMinutes: 1, max: 60 });
exports.publicApiHourlyLimiter = publicLimiter({ windowMinutes: 60, max: 600 });
