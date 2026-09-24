const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, sentEmails } = require("./helpers");

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => { sentEmails.length = 0; });

// Each test uses its own IP so the per-IP form rate limit does not leak between tests.
let ip = 0;
const fromNewIp = () => ({ "x-forwarded-for": `10.1.0.${++ip}` });

test("user input is HTML-escaped in the admin email", async () => {
  const res = await srv.request("POST", "/api/v1/contact", {
    headers: fromNewIp(),
    body: {
      firstName: "Ali",
      email: "a@b.com",
      message: '<a href="https://evil.com">Account suspended</a><script>x()</script>',
    },
  });
  assert.equal(res.status, 200);
  const adminEmail = sentEmails.find((m) => m.html);
  assert.ok(adminEmail, "admin email was sent");
  assert.ok(!adminEmail.html.includes('<a href="https://evil.com"'), "raw link must not appear");
  assert.ok(!adminEmail.html.includes("<script>"), "raw script must not appear");
  assert.ok(adminEmail.html.includes("&lt;a href=&quot;https://evil.com&quot;&gt;"), "escaped text appears");
});

test("line breaks cannot be injected into the subject", async () => {
  await srv.request("POST", "/api/v1/contact", {
    headers: fromNewIp(),
    body: { firstName: "Ali\r\nBcc: x@y.com", email: "a@b.com", message: "hi" },
  });
  const adminEmail = sentEmails.find((m) => m.html);
  assert.ok(!/[\r\n]/.test(adminEmail.subject));
});

test("invalid email, over-long fields and non-string fields are rejected", async () => {
  const cases = [
    { firstName: "A", email: "not-an-email", message: "hi" },
    { firstName: "A", email: "a@b.com", message: "x".repeat(5001) },
    { firstName: { $gt: "" }, email: "a@b.com", message: "hi" },
  ];
  for (const body of cases) {
    const res = await srv.request("POST", "/api/v1/contact", { headers: fromNewIp(), body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(sentEmails.length, 0, "no email sent for rejected input");
});

test("each form allows 5 submissions per IP per 15 minutes", async () => {
  const headers = fromNewIp();
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await srv.request("POST", "/api/v1/lead-popup", { headers, body: { email: `t${i}@x.com` } });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);

  // A different form from the same IP is counted separately.
  const other = await srv.request("POST", "/api/v1/book-a-call", {
    headers,
    body: { firstName: "A", email: "a@b.com" },
  });
  assert.equal(other.status, 200);
});
