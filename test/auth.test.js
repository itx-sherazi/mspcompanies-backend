const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startServer, mockAdminUser, tokenFor } = require("./helpers");

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const PROTECTED = [
  ["POST", "/api/v1/signin"],
  ["GET", "/api/v1/getuser"],
  ["DELETE", "/api/v1/users/x"],
  ["GET", "/api/v1/AllData"],
  ["GET", "/api/v1/listing-requests"],
  ["POST", "/api/v1/admin/wipe-listing-companies"],
  ["POST", "/api/v1/vendors"],
  ["PUT", "/api/v1/vendors/x"],
  ["DELETE", "/api/v1/vendors/x"],
  ["DELETE", "/api/v1/vendors/all"],
  ["POST", "/api/v1/vendors/import"],
  ["POST", "/api/v1/vendors/upload-logo"],
  ["POST", "/api/v1/categories"],
  ["PUT", "/api/v1/categories/x"],
  ["DELETE", "/api/v1/categories/x"],
  ["PUT", "/api/v1/categories/x/rankings"],
  ["POST", "/api/v1/parent-categories"],
  ["PUT", "/api/v1/parent-categories/x"],
  ["DELETE", "/api/v1/parent-categories/x"],
];

test("admin write routes reject requests without a token", async () => {
  for (const [method, url] of PROTECTED) {
    const res = await srv.request(method, url, { body: {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
});

test("a forged token is rejected", async () => {
  const res = await srv.request("DELETE", "/api/v1/vendors/all", {
    headers: { authorization: "Bearer forged.token.value" },
  });
  assert.equal(res.status, 401);
});

test("an expired token returns 401, not 500", async () => {
  const expired = require("jsonwebtoken").sign({ email: "a@b.com" }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await srv.request("GET", "/api/v1/getuser", { headers: { authorization: `Bearer ${expired}` } });
  assert.equal(res.status, 401);
});

test("seo role is blocked from admin-only routes", async () => {
  mockAdminUser({ email: "seo@x.com", role: "seo" });
  const auth = { authorization: `Bearer ${tokenFor("seo@x.com", "seo")}` };
  for (const [method, url] of [
    ["POST", "/api/v1/signin"],
    ["GET", "/api/v1/getuser"],
    ["GET", "/api/v1/AllData"],
    ["GET", "/api/v1/listing-requests"],
    ["POST", "/api/v1/admin/wipe-listing-companies"],
  ]) {
    const res = await srv.request(method, url, { body: {}, headers: auth });
    assert.equal(res.status, 403, `${method} ${url}`);
  }
});

test("role is read from the database, not trusted from the token", async () => {
  // Token claims admin, but the stored user is seo.
  mockAdminUser({ email: "seo@x.com", role: "seo" });
  const res = await srv.request("GET", "/api/v1/getuser", {
    headers: { authorization: `Bearer ${tokenFor("seo@x.com", "admin")}` },
  });
  assert.equal(res.status, 403);
});

test("login accepts the correct bcrypt password", async () => {
  mockAdminUser({ email: "a@b.com", role: "admin", password: await bcrypt.hash("correct-password", 4) });
  const res = await srv.request("POST", "/api/v1/login", {
    body: { email: "a@b.com", password: "correct-password" },
    headers: { "x-forwarded-for": "10.0.0.1" },
  });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).token);
});

test("login no longer accepts a plaintext stored password or the hash itself", async () => {
  mockAdminUser({ email: "a@b.com", role: "admin", password: "plaintext-pass" });
  let res = await srv.request("POST", "/api/v1/login", {
    body: { email: "a@b.com", password: "plaintext-pass" },
    headers: { "x-forwarded-for": "10.0.0.2" },
  });
  assert.equal(res.status, 400);

  const hash = await bcrypt.hash("secret", 4);
  mockAdminUser({ email: "a@b.com", role: "admin", password: hash });
  res = await srv.request("POST", "/api/v1/login", {
    body: { email: "a@b.com", password: hash },
    headers: { "x-forwarded-for": "10.0.0.2" },
  });
  assert.equal(res.status, 400);
});

test("login rejects NoSQL operator objects", async () => {
  const res = await srv.request("POST", "/api/v1/login", {
    body: { email: { $ne: null }, password: { $ne: null } },
    headers: { "x-forwarded-for": "10.0.0.3" },
  });
  assert.equal(res.status, 400);
});

test("login is rate limited after 10 attempts per IP", async () => {
  mockAdminUser(null);
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await srv.request("POST", "/api/v1/login", {
      body: { email: "x@y.com", password: "wrong" },
      headers: { "x-forwarded-for": "10.0.0.99" },
    });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(400));
  assert.equal(statuses[10], 429);
});
