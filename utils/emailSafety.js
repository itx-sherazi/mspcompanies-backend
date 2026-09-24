// Helpers for building emails from user-submitted form data.

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Escape a value for safe insertion into email HTML (text or attribute).
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Escape every string (and string array) field of a plain object.
function escapeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === "string") out[k] = escapeHtml(v);
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? escapeHtml(x) : x));
    else out[k] = v;
  }
  return out;
}

// Only http(s) URLs may become clickable links; anything else (javascript:, data:) returns "".
function safeUrl(value) {
  const s = String(value ?? "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

// Subject lines: no line breaks, bounded length.
function cleanSubject(value, max = 150) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

// Returns the name of the first field that is not a string or exceeds its max length, else null.
// e.g. firstTooLong(req.body, { firstName: 100, message: 5000 })
function firstTooLong(body, limits) {
  for (const [field, max] of Object.entries(limits)) {
    const v = body?.[field];
    if (v == null || v === "") continue;
    if (typeof v !== "string" || v.length > max) return field;
  }
  return null;
}

module.exports = { escapeHtml, escapeFields, safeUrl, cleanSubject, isValidEmail, firstTooLong };
