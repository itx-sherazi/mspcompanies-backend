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
