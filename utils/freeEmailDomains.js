/**
 * Free / personal / throw-away email providers. A claim must come from a business address, so these
 * are refused. A company's own domain (name@acme-it.com) is not in this list.
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.ca", "yahoo.com.au", "yahoo.in", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it", "ymail.com", "rocketmail.com",
  "outlook.com", "outlook.co.uk", "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.es", "live.com", "live.co.uk", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.net", "gmx.de", "web.de", "mail.com", "email.com", "inbox.com", "fastmail.com",
  "yandex.com", "yandex.ru", "mail.ru", "zoho.com", "tutanota.com", "tuta.io", "hushmail.com",
  "qq.com", "163.com", "126.com", "sina.com", "naver.com", "daum.net", "rediffmail.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net", "earthlink.net",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "bigpond.com", "optusnet.com.au", "shaw.ca", "rogers.com", "sympatico.ca",
  // throw-away inboxes
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
]);

function emailDomain(email) {
  return String(email || "").trim().toLowerCase().split("@")[1] || "";
}

function isFreeEmail(email) {
  const d = emailDomain(email);
  return FREE_EMAIL_DOMAINS.has(d);
}

/** acme-it.com for http://www.acme-it.com/contact */
function siteDomain(url) {
  return String(url || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}

/** Same domain or a subdomain of it: it@mail.acme.com belongs to acme.com. */
function sameCompanyDomain(email, website) {
  const e = emailDomain(email);
  const w = siteDomain(website);
  if (!e || !w) return false;
  return e === w || e.endsWith("." + w) || w.endsWith("." + e);
}

module.exports = { FREE_EMAIL_DOMAINS, isFreeEmail, emailDomain, siteDomain, sameCompanyDomain };
