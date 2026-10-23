const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");

/**
 * True when the request comes from a logged in admin (Bearer token or the admin cookie). For public endpoints that
 * show more to the dashboard than to visitors, for example draft categories.
 */
async function isAdminRequest(req) {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith("Bearer ") ? header.split(" ")[1] : req.cookies?.adminToken;
    if (!token) return false;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return Boolean(await AdminUser.exists({ email: decoded.email }));
  } catch {
    return false;
  }
}

module.exports = { isAdminRequest };
