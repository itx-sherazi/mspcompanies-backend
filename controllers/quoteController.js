const { Resend } = require("resend");
const QuoteRequest = require("../models/QuoteRequest");
const { escapeHtml, cleanSubject, isValidEmail, firstTooLong } = require("../utils/emailSafety");
const { isFreeEmail } = require("../utils/freeEmailDomains");
const { escapeRegex } = require("../utils/escapeRegex");
const { directoryFor } = require("./claimController");

// A quote request is saved (the Quote Requests tab of the dashboard) and mailed to the editor inbox.
// The visitor gets no confirmation email.
const EDITOR_EMAIL = process.env.QUOTE_EMAIL || process.env.CLAIM_EMAIL || "editor@mspcompanies.us";
const FROM_EMAIL = `MSP Companies <${EDITOR_EMAIL}>`;
const STATUSES = ["new", "contacted", "closed"];

const clean = (v) => String(v || "").trim();

// POST /api/v1/quote-request (public)
exports.submitQuote = async (req, res) => {
  const b = req.body || {};
  // Honeypot: a hidden field that real visitors never fill. Pretend it worked so bots do not retry.
  if (b.hp) return res.json({ ok: true, message: "Request received" });

  const firstName = clean(b.firstName);
  const lastName = clean(b.lastName);
  const company = clean(b.company);
  const email = clean(b.email).toLowerCase();
  const phone = clean(b.phone);
  const comments = clean(b.comments);
  const companySlug = clean(b.companySlug).toLowerCase();
  const pagePath = clean(b.pagePath);

  if (!firstName || !lastName || !company || !email || !companySlug) {
    return res.status(400).json({ ok: false, message: "Please fill in your name, company and work email." });
  }
  if (firstTooLong(b, { firstName: 80, lastName: 80, company: 200, email: 254, phone: 40, comments: 3000, companySlug: 200, pagePath: 500 })) {
    return res.status(400).json({ ok: false, message: "One or more fields are too long." });
  }
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
  // The form needs a business email: Gmail, Yahoo, Outlook and other personal inboxes are refused.
  if (isFreeEmail(email)) {
    return res.status(400).json({
      ok: false,
      code: "FREE_EMAIL",
      message: "Please use your business email (for example name@yourcompany.com). Gmail, Yahoo, Outlook and other personal addresses are not accepted.",
    });
  }
  if (phone && !/^[0-9+()\-.\s]{5,40}$/.test(phone)) return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
  if (pagePath && !/^\/[A-Za-z0-9\-_\/]*$/.test(pagePath)) return res.status(400).json({ ok: false, message: "Invalid page." });

  try {
    // The company name always comes from our own data.
    const target = await directoryFor(pagePath).findOne({ slug: companySlug }).select("companyName").lean();
    if (!target) return res.status(404).json({ ok: false, message: "We could not find this company profile." });

    // Saved first, so the request is in the dashboard even when the email cannot be sent.
    const saved = await QuoteRequest.create({
      companySlug, companyName: target.companyName, pagePath, firstName, lastName, company, email, phone, comments,
    });

    if (!process.env.RESEND_API_KEY) {
      console.warn("quote saved but RESEND_API_KEY is not set, no email sent");
      return res.json({ ok: true, message: "Request sent" });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const row = (label, value, shaded) =>
      `<tr${shaded ? ' style="background:#f9f9f9"' : ""}><td style="padding:8px;font-weight:bold;color:#555;width:150px;vertical-align:top">${label}</td><td style="padding:8px">${value}</td></tr>`;
    const base = (process.env.FRONTEND_URL || "https://mspcompanies.us").replace(/\/$/, "");
    const profile = pagePath ? `${base}${pagePath}` : "";
    const html = `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222">
  <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New quote request</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${row("Quote from", `<strong>${escapeHtml(target.companyName)}</strong>`)}
    ${row("Name", escapeHtml(`${firstName} ${lastName}`), true)}
    ${row("Company", escapeHtml(company))}
    ${row("Work email", `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`, true)}
    ${row("Phone", phone ? escapeHtml(phone) : "Not given")}
    ${row("Comments", comments ? escapeHtml(comments).replace(/\n/g, "<br>") : "None", true)}
    ${profile ? row("Profile", `<a href="${escapeHtml(profile)}">${escapeHtml(profile)}</a>`) : ""}
  </table>
  <p style="color:#777;font-size:12px;margin-top:16px">Reply to this email to answer the visitor directly. It is also listed under Quote Requests in the dashboard.</p>
</div>`;
    const sent = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: email,
      to: EDITOR_EMAIL,
      subject: cleanSubject(`Quote request: ${target.companyName} (${firstName} ${lastName}, ${company})`),
      html,
    });
    if (sent?.error) console.error("quote email failed:", sent.error);
    else await QuoteRequest.updateOne({ _id: saved._id }, { $set: { mailSent: true } });
    res.json({ ok: true, message: "Request sent" });
  } catch (err) {
    console.error("submitQuote:", err);
    res.status(500).json({ ok: false, message: "Something went wrong. Please try again." });
  }
};

// ─── Admin ──────────────────────────────────────────────────────────────────

// GET /api/v1/quote-requests?status=&q=&page=&limit=
exports.getQuotes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ companyName: re }, { firstName: re }, { lastName: re }, { company: re }, { email: re }];
    }
    const [total, data, counts] = await Promise.all([
      QuoteRequest.countDocuments(filter),
      QuoteRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      QuoteRequest.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    counts.forEach((c) => { byStatus[c._id] = c.n; });
    res.json({ ok: true, data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), counts: byStatus });
  } catch (err) {
    console.error("getQuotes:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// PATCH /api/v1/quote-requests/:id  { status?, adminNote? }
exports.updateQuote = async (req, res) => {
  try {
    const set = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ ok: false, message: "Invalid status" });
      set.status = req.body.status;
    }
    if (req.body.adminNote !== undefined) set.adminNote = String(req.body.adminNote).slice(0, 2000);
    const doc = await QuoteRequest.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Quote request not found" });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("updateQuote:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// DELETE /api/v1/quote-requests/:id
exports.deleteQuote = async (req, res) => {
  try {
    const doc = await QuoteRequest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, message: "Quote request not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteQuote:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
