const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, models } = require("./helpers");
const { escapeRegex, queryString } = require("../utils/escapeRegex");
const { cleanHtml } = require("../utils/sanitizeHtml");
const { escapeHtml, safeUrl } = require("../utils/emailSafety");

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test("CORS allows our domains and blocks look-alikes", async () => {
  const allowed = ["https://mspcompanies.us", "https://www.mspcompanies.us", "https://dashboard.mspcompanies.us"];
  const blocked = ["https://evil.com", "https://mspcompanies.us.evil.com", "https://evilmspcompanies.us"];
  for (const origin of allowed) {
    const res = await srv.request("GET", "/", { headers: { origin } });
    assert.equal(res.headers.get("access-control-allow-origin"), origin, origin);
  }
  for (const origin of blocked) {
    const res = await srv.request("GET", "/", { headers: { origin } });
    assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
  }
});

test("security headers are set", async () => {
  const res = await srv.request("GET", "/");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("strict-transport-security"));
});

test("oversized JSON bodies are rejected with 413", async () => {
  const res = await srv.request("POST", "/api/v1/contact", { body: JSON.stringify({ x: "a".repeat(11 * 1024 * 1024) }) });
  assert.equal(res.status, 413);
});

test("public filters treat user input as literal text (no regex injection)", async () => {
  let captured;
  const chain = { sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] };
  models.ManagedItCompany.countDocuments = async (filter) => { captured = filter; return 0; };
  models.ManagedItCompany.find = () => chain;

  const evil = encodeURIComponent("(a+)+$");
  const res = await srv.request("GET", `/api/v1/managed-it-services?state=${evil}&industry=${evil}&service=${evil}&q=${evil}`);
  assert.equal(res.status, 200);
  for (const re of [captured.companyState.$regex, captured.industry.$regex, captured.companyServices.$elemMatch.$regex]) {
    assert.ok(re.test("(a+)+$"), `${re} matches the literal input`);
    assert.ok(!re.test("aaaa"), `${re} is not a live pattern`);
  }
});

test("repeated query params do not crash the endpoint", async () => {
  const res = await srv.request("GET", "/api/v1/managed-it-services?state=a&state=b");
  assert.equal(res.status, 200);
});

test("escapeRegex and queryString helpers", () => {
  assert.equal(escapeRegex("a.b*c(d)"), "a\\.b\\*c\\(d\\)");
  assert.equal(escapeRegex(undefined), "");
  assert.equal(queryString(["x ", "y"]), "x");
  assert.equal(queryString(undefined), "");
});

test("cleanHtml keeps editor formatting", () => {
  const html =
    '<h2 id="intro" style="color:#0356A6">Intro</h2><p><strong>b</strong> <a href="https://mspcompanies.us" target="_blank">link</a></p>' +
    '<table border="1"><tr><td colspan="2">cell</td></tr></table><iframe src="https://www.youtube.com/embed/abc"></iframe>';
  const out = cleanHtml(html);
  for (const kept of ['id="intro"', "style=", "<strong>", 'href="https://mspcompanies.us"', 'colspan="2"', "youtube.com/embed"]) {
    assert.ok(out.includes(kept), `keeps ${kept}`);
  }
});

test("cleanHtml strips scripts, handlers, javascript: links and foreign iframes", () => {
  const out = cleanHtml(
    '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>' +
    '<img src=x onerror=alert(1)><iframe src="https://evil.com"></iframe>',
  );
  assert.ok(!/<script|onclick|onerror|javascript:|evil\.com/i.test(out), out);
});

test("email helpers escape HTML and only allow http(s) links", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(safeUrl("https://ok.com/a"), "https://ok.com/a");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl('https://x.com/"onmouseover=1'), "");
});
