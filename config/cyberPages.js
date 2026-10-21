/**
 * Which pages the cybersecurity directory gets: /cybersecurity-companies-in-{slug}. A country, state or city gets a page
 * when it has at least MIN companies in the sheet. A smaller place stays on its country page and in the directory.
 */
const MIN = 10;

module.exports = { MIN };
