// Test harness: loads the real Express app with every external service stubbed.
// No database connection is made and no email is ever sent.
const path = require("path");

// Fixed test values (dotenv never overrides variables that are already set).
process.env.JWT_SECRET = "test-jwt-secret";
process.env.RESEND_API_KEY = "test";
process.env.REVALIDATE_SECRET = "test-revalidate-secret";
process.env.FRONTEND_URL = "http://127.0.0.1:9"; // unroutable: revalidation calls fail fast and are ignored

// Capture emails instead of sending them.
const sentEmails = [];
function stubModule(name, exports) {
  require.cache[require.resolve(name)] = { id: name, filename: name, loaded: true, exports };
}
stubModule("resend", {
  Resend: class {
    constructor() {
      this.emails = { send: async (msg) => { sentEmails.push(msg); return { id: "test" }; } };
    }
  },
});
const nodemailer = require("nodemailer");
nodemailer.createTransport = () => ({ sendMail: async (msg) => { sentEmails.push(msg); return {}; } });

const models = {
  AdminUser: require("../models/AdminUser"),
  DataRequest: require("../models/DataRequest"),
  ManagedItCompany: require("../models/ManagedItCompany"),
};
// Default: DB-backed calls resolve empty so nothing ever waits on a real connection.
models.AdminUser.findOne = () => ({ select: async () => null, then: (r) => r(null) });
models.DataRequest.create = async () => ({});

const app = require(path.join(__dirname, "..", "app"));

async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => new Promise((r) => server.close(r)),
    request: (method, url, { body, headers = {} } = {}) => {
      if (method === "GET" || method === "HEAD") body = undefined;
      return fetch(base + url, {
        method,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
    },
  };
}

// Make AdminUser lookups (auth middleware + login) return this user.
function mockAdminUser(user) {
  const result = user ? { _id: "u1", ...user } : null;
  models.AdminUser.findOne = () => {
    const p = Promise.resolve(result);
    p.select = async () => result;
    return p;
  };
}

function tokenFor(email, role = "admin") {
  return require("jsonwebtoken").sign({ userId: "u1", email, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

module.exports = { startServer, sentEmails, models, mockAdminUser, tokenFor };
