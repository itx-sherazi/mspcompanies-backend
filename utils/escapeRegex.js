// Escape user input so it is matched literally inside a RegExp (prevents ReDoS / regex injection).
function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Query params can arrive as arrays (?a=1&a=2); always work with a single trimmed string.
function queryString(value) {
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

module.exports = { escapeRegex, queryString };
