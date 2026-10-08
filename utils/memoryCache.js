// Tiny in-process TTL cache for hot public reads (city pages load a ~170 KB document from Atlas).
// Entries expire after ttlMs (60s by default, same freshness the website already accepts) and the
// whole cache is cleared whenever a City document changes (see models/City.js), so admin edits show up
// immediately on the next request. Per-process only: with several API instances each has its own copy.
const store = new Map();
const MAX_ENTRIES = 500;

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function set(key, value, ttlMs = 60 * 1000) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear };
