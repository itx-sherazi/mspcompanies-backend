const { Resend } = require("resend");
const Review = require("../models/Review");
const publicCache = require("../utils/memoryCache");
const { escapeHtml, cleanSubject, isValidEmail, firstTooLong } = require("../utils/emailSafety");
const { isFreeEmail, sameCompanyDomain } = require("../utils/freeEmailDomains");
const { escapeRegex } = require("../utils/escapeRegex");
const { DIRECTORIES } = require("../utils/blogCompany");

// A review is saved as "pending" and mailed to the editor inbox. It shows on the profile only after it is approved
// in the Reviews tab of the dashboard. The reviewer gets no email.
const EDITOR_EMAIL = process.env.QUOTE_EMAIL || process.env.CLAIM_EMAIL || "editor@mspcompanies.us";
const FROM_EMAIL = `MSP Companies <${EDITOR_EMAIL}>`;
const STATUSES = ["pending", "approved", "rejected"];

// The choices of the form. Anything else is refused, so the dashboard and the page only ever show these texts.
const ROLES = ["Owner or executive", "IT manager or director", "IT staff or engineer", "Consultant or partner", "Other"];
const SIZES = ["1 to 10", "11 to 50", "51 to 200", "201 to 1000", "More than 1000"];
const TIMES = ["Less than 6 months", "6 to 12 months", "1 to 2 years", "More than 2 years"];
const RATING_KEYS = ["quality", "communication", "support", "value", "ease", "features"];

const clean = (v) => String(v || "").trim();
// "constructor" or "__proto__" must not pass as a directory name.
const isType = (t) => Object.prototype.hasOwnProperty.call(DIRECTORIES, t);
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

/** One shared object for the form on the website, so the choices are written in one place. */
exports.OPTIONS = { ROLES, SIZES, TIMES };

// POST /api/v1/reviews (public)
exports.submitReview = async (req, res) => {
  const b = req.body || {};
  // Honeypot: a hidden field that real visitors never fill. Pretend it worked so bots do not retry.
  if (b.hp) return res.json({ ok: true, message: "Review received" });

  const type = clean(b.targetType);
  const slug = clean(b.targetSlug).toLowerCase();
  const pagePath = clean(b.pagePath);
  const rating = Number(b.rating);
  const title = clean(b.title);
  const pros = clean(b.pros);
  const cons = clean(b.cons);
  const name = clean(b.name);
  const email = clean(b.email).toLowerCase();
  const role = clean(b.role);
  const companySize = clean(b.companySize);
  const timeUsing = clean(b.timeUsing);
  const hideName = b.hideName === true || b.hideName === "true";

  if (!isType(type) || !slug) return res.status(400).json({ ok: false, message: "We could not tell which profile this review is for." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ ok: false, message: "Please choose an overall rating from 1 to 5 stars." });
  if (title.length < 3) return res.status(400).json({ ok: false, message: "Please add a short review title." });
  if (pros.length < 20) return res.status(400).json({ ok: false, message: "Please tell us a little more about what you like (at least 20 characters)." });
  if (cons.length < 10) return res.status(400).json({ ok: false, message: "Please tell us what could be better (at least 10 characters)." });
  if (name.length < 2) return res.status(400).json({ ok: false, message: "Please enter your name." });
  if (!email) return res.status(400).json({ ok: false, message: "Please enter your business email." });
  if (firstTooLong(b, { title: 120, pros: 1500, cons: 1500, name: 80, email: 254, targetSlug: 200, pagePath: 500 })) {
    return res.status(400).json({ ok: false, message: "One or more fields are too long." });
  }
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
  // Only a business email is accepted: Gmail, Yahoo, Outlook and other personal inboxes are refused.
  if (isFreeEmail(email)) {
    return res.status(400).json({
      ok: false,
      code: "FREE_EMAIL",
      message: "Please use your business email (for example name@yourcompany.com). Gmail, Yahoo, Outlook and other personal addresses are not accepted.",
    });
  }
  if (role && !ROLES.includes(role)) return res.status(400).json({ ok: false, message: "Please choose your role from the list." });
  if (companySize && !SIZES.includes(companySize)) return res.status(400).json({ ok: false, message: "Please choose your company size from the list." });
  if (timeUsing && !TIMES.includes(timeUsing)) return res.status(400).json({ ok: false, message: "Please choose the time from the list." });
  if (pagePath && !/^\/[A-Za-z0-9\-_\/]*$/.test(pagePath)) return res.status(400).json({ ok: false, message: "Invalid page." });

  // Optional detail ratings: only the known keys, each a whole number from 1 to 5.
  const ratings = {};
  if (b.ratings && typeof b.ratings === "object") {
    for (const k of RATING_KEYS) {
      const n = Number(b.ratings[k]);
      if (Number.isInteger(n) && n >= 1 && n <= 5) ratings[k] = n;
    }
  }

  try {
    const dir = DIRECTORIES[type];
    const isVendor = type === "vendor";
    const target = await dir.model.findOne({ slug }).select(isVendor ? "slug name website" : "slug companyName website isPublished").lean();
    if (!target || target.isPublished === false) return res.status(404).json({ ok: false, message: "We could not find this profile." });
    const targetName = isVendor ? target.name : target.companyName;

    // Nobody reviews their own company: the email domain must not be the domain of the company.
    if (sameCompanyDomain(email, target.website)) {
      return res.status(400).json({ ok: false, message: `Reviews from a ${targetName} email address are not accepted. Please ask a customer or a partner to write one.` });
    }
    // One review per person and profile (a rejected one does not block a new try).
    const already = await Review.findOne({ targetType: type, targetSlug: slug, email, status: { $in: ["pending", "approved"] } }).select("_id status").lean();
    if (already) {
      return res.status(409).json({
        ok: false,
        message: already.status === "approved" ? "You have already reviewed this profile. Thank you." : "Your review is already waiting for approval. Thank you.",
      });
    }

    // Saved first, so the review is in the dashboard even when the email cannot be sent.
    const saved = await Review.create({
      targetType: type, targetSlug: slug, targetName, pagePath, rating, ratings, title, pros, cons,
      role, companySize, timeUsing, name, hideName, email,
    });

    // The reviewer gets the answer as soon as the review is saved. The email to the editor goes out after that,
    // so a slow mail service never makes the visitor wait.
    res.json({ ok: true, message: "Review sent" });
    if (!process.env.RESEND_API_KEY) {
      console.warn("review saved but RESEND_API_KEY is not set, no email sent");
      return;
    }
    try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const row = (label, value, shaded) =>
      `<tr${shaded ? ' style="background:#f9f9f9"' : ""}><td style="padding:8px;font-weight:bold;color:#555;width:150px;vertical-align:top">${label}</td><td style="padding:8px">${value}</td></tr>`;
    const base = (process.env.FRONTEND_URL || "https://mspcompanies.us").replace(/\/$/, "");
    const profile = pagePath ? `${base}${pagePath}` : "";
    const html = `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222">
  <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New review waiting for approval</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${row("Reviewed", `<strong>${escapeHtml(targetName)}</strong> (${escapeHtml(dir.label)})`)}
    ${row("Rating", `<span style="color:#F5A623;font-size:16px">${stars(rating)}</span> ${rating} of 5`, true)}
    ${row("Title", escapeHtml(title))}
    ${row("What they like", escapeHtml(pros).replace(/\n/g, "<br>"), true)}
    ${row("Could be better", escapeHtml(cons).replace(/\n/g, "<br>"))}
    ${row("Reviewer", `${escapeHtml(name)}${hideName ? " (name hidden on the site)" : ""}`, true)}
    ${row("Business email", `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`)}
    ${role || companySize || timeUsing ? row("About them", escapeHtml([role, companySize && `${companySize} employees`, timeUsing].filter(Boolean).join(", ")), true) : ""}
    ${profile ? row("Profile", `<a href="${escapeHtml(profile)}">${escapeHtml(profile)}</a>`) : ""}
  </table>
  <p style="color:#777;font-size:12px;margin-top:16px">Open the Reviews tab of the dashboard to approve or reject it. It is not on the website until you approve it.</p>
</div>`;
    const sent = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: email,
      to: EDITOR_EMAIL,
      subject: cleanSubject(`Review to approve: ${targetName} (${rating} stars, ${name})`),
      html,
    });
    if (sent?.error) console.error("review email failed:", sent.error);
    else await Review.updateOne({ _id: saved._id }, { $set: { mailSent: true } });
    } catch (mailErr) {
      console.error("review email failed:", mailErr);
    }
  } catch (err) {
    console.error("submitReview:", err);
    res.status(500).json({ ok: false, message: "Something went wrong. Please try again." });
  }
};

// GET /api/v1/reviews?type=msp&slug=acme (public). Approved reviews only, never the email.
exports.getReviews = async (req, res) => {
  const type = clean(req.query.type);
  const slug = clean(req.query.slug).toLowerCase();
  if (!isType(type) || !slug || slug.length > 200) return res.status(400).json({ ok: false, message: "Invalid profile" });
  try {
    const cacheKey = `reviews|${type}|${slug}`;
    let payload = publicCache.get(cacheKey);
    if (!payload) {
      const rows = await Review.find({ targetType: type, targetSlug: slug, status: "approved" })
        .sort({ approvedAt: -1, createdAt: -1 })
        .limit(100)
        .select("rating ratings title pros cons role companySize timeUsing name hideName createdAt approvedAt")
        .lean();
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      rows.forEach((r) => { dist[r.rating] += 1; });
      const count = rows.length;
      const average = count ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : 0;
      payload = {
        ok: true,
        summary: { count, average, distribution: dist },
        data: rows.map((r) => ({
          id: String(r._id),
          rating: r.rating,
          ratings: r.ratings || {},
          title: r.title,
          pros: r.pros,
          cons: r.cons,
          role: r.role || "",
          companySize: r.companySize || "",
          timeUsing: r.timeUsing || "",
          name: r.hideName ? "Business customer" : r.name,
          date: r.approvedAt || r.createdAt,
        })),
      };
      publicCache.set(cacheKey, payload, 5 * 60 * 1000);
    }
    res.set("Cache-Control", "public, max-age=60, s-maxage=300");
    res.json(payload);
  } catch (err) {
    console.error("getReviews:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ─── Admin ──────────────────────────────────────────────────────────────────

// GET /api/v1/admin/reviews?status=&q=&page=&limit=
exports.getReviewsAdmin = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "15"), 10) || 15));
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ targetName: re }, { name: re }, { email: re }, { title: re }];
    }
    const [total, data, counts] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Review.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    counts.forEach((c) => { byStatus[c._id] = c.n; });
    res.json({ ok: true, data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), counts: byStatus });
  } catch (err) {
    console.error("getReviewsAdmin:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// PATCH /api/v1/admin/reviews/:id  { status?, adminNote? }
exports.updateReview = async (req, res) => {
  try {
    const set = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ ok: false, message: "Invalid status" });
      set.status = req.body.status;
      set.approvedAt = req.body.status === "approved" ? new Date() : null;
    }
    if (req.body.adminNote !== undefined) set.adminNote = String(req.body.adminNote).slice(0, 2000);
    const doc = await Review.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: "after" }).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Review not found" });
    // The public list is cached for a few minutes. An approval or a rejection must show at once.
    publicCache.clear();
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("updateReview:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// DELETE /api/v1/admin/reviews/:id
exports.deleteReview = async (req, res) => {
  try {
    const doc = await Review.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, message: "Review not found" });
    publicCache.clear();
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteReview:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
