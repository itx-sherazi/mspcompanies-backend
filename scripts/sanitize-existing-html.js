/**
 * One-time migration: run already-stored rich HTML through the same sanitizer used on save.
 * New saves are sanitized automatically; this cleans content saved before that change.
 *
 *   node scripts/sanitize-existing-html.js          # dry run, lists documents that would change
 *   node scripts/sanitize-existing-html.js --apply  # writes the cleaned HTML
 *
 * Only documents where something is actually removed are reported/updated
 * (pure formatting differences such as <br> vs <br /> are ignored).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const sanitizeHtml = require("sanitize-html");
const { cleanHtml } = require("../utils/sanitizeHtml");
const Blog = require("../models/Blog");
const City = require("../models/City");
const Service = require("../models/Service");
const Category = require("../models/Category");

const TARGETS = [
  { model: Blog, field: "body", label: "slug" },
  { model: City, field: "content", label: "slug" },
  { model: Service, field: "content", label: "slug" },
  { model: Category, field: "contentHtml", label: "slug" },
];

// Same serializer, nothing removed used to ignore formatting-only differences.
const normalize = (html) =>
  sanitizeHtml(html, { allowedTags: false, allowedAttributes: false, allowVulnerableTags: true });

const RISKY = [/<script/gi, /\son\w+\s*=/gi, /javascript:/gi, /<iframe/gi, /<form/gi, /<object|<embed/gi];

(async () => {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  let total = 0;

  for (const { model, field, label } of TARGETS) {
    const docs = await model.find({ [field]: { $type: "string", $ne: "" } }).select(`${field} ${label}`).lean();
    let changed = 0;
    for (const doc of docs) {
      const original = doc[field];
      const cleaned = cleanHtml(original);
      if (cleaned === normalize(original)) continue;
      changed++;
      const hints = RISKY.map((re) => (original.match(re) || []).length ? `${re.source.replace(/\\s|\\/g, "")}×${original.match(re).length}` : null).filter(Boolean);
      console.log(`  ${model.modelName} ${doc[label] || doc._id}: ${hints.join(", ") || "non-whitelisted tags/attributes"}`);
      if (apply) await model.updateOne({ _id: doc._id }, { $set: { [field]: cleaned } });
    }
    console.log(`${model.modelName}.${field}: ${docs.length} checked, ${changed} ${apply ? "cleaned" : "would change"}`);
    total += changed;
  }

  if (!apply && total) console.log("Dry run only. Review the list above, then re-run with --apply.");
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
