const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");
const { fixText, findBadSequences } = require("../utils/badChars");
const { normName, normLinkedin } = require("../controllers/companyQualityController");

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test("mojibake is found and repaired", () => {
  const text = "Fast â€“ reliable ðŸ’¬ support ðŸ‘‰ â€œ24/7â€ â€” CafÃ©";
  assert.deepEqual(findBadSequences(text).sort(), ["Ã©", "â€", "â€“", "â€”", "â€œ", "ðŸ‘‰", "ðŸ’¬"].sort());
  assert.equal(fixText(text), "Fast – reliable 💬 support 👉 “24/7” — Café");
  assert.equal(fixText(text, { removeEmoji: true }), "Fast – reliable support “24/7” — Café");
});

test("double-encoded text, NBSP leftovers and invisible characters are cleaned", () => {
  assert.equal(fixText("A Ã¢â‚¬â€œ B"), "A – B");
  assert.equal(fixText("Acme Â IT"), "Acme IT");
  assert.equal(fixText("Ac​me\u0000"), "Acme");
  assert.deepEqual(findBadSequences("Ac​me"), ["U+200B"]);
});

test("clean text is left alone", () => {
  const text = "São Paulo – Café 💬 “quoted”";
  assert.deepEqual(findBadSequences(text), []);
  assert.equal(fixText(text), text);
});

test("company names and LinkedIn URLs normalize for duplicate matching", () => {
  assert.equal(normName("Acme IT Solutions, LLC."), normName("acme it solutions"));
  assert.equal(normName("Smith & Co"), "smith and");
  assert.equal(normName("Group"), "group");
  assert.equal(normLinkedin("https://uk.linkedin.com/company/Acme-IT/about/?x=1"), "company/acme-it");
  assert.equal(normLinkedin("linkedin.com/company/acme-it"), "company/acme-it");
  assert.equal(normLinkedin("https://acme.com"), "");
});

test("company quality endpoints require login", async () => {
  for (const [method, url] of [
    ["GET", "/api/v1/admin/company-quality/bad-chars"],
    ["GET", "/api/v1/admin/company-quality/duplicates"],
    ["PATCH", "/api/v1/admin/company-quality/company"],
    ["POST", "/api/v1/admin/company-quality/fix"],
    ["POST", "/api/v1/admin/company-quality/delete"],
  ]) {
    const res = await srv.request(method, url, { body: {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
});
