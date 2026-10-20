const { Resend } = require("resend");
const ClaimRequest = require("../models/ClaimRequest");
const ManagedItCompany = require("../models/ManagedItCompany");
const { escapeHtml, cleanSubject, isValidEmail, firstTooLong } = require("../utils/emailSafety");
const { isFreeEmail, emailDomain, sameCompanyDomain } = require("../utils/freeEmailDomains");

// Claims are handled by the editor team: the confirmation comes from the editor address, the notification goes to it,
// and a reply to the confirmation lands there too. (CLAIM_EMAIL can override it in .env.)
const EDITOR_EMAIL = process.env.CLAIM_EMAIL || "editor@mspcompanies.us";
const ADMIN_EMAIL = EDITOR_EMAIL;
const FROM_EMAIL = `MSP Companies <${EDITOR_EMAIL}>`;
const STATUSES = ["new", "contacted", "verified", "rejected"];

function mailer() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function siteUrl(path) {
  const base = (process.env.FRONTEND_URL || "https://mspcompanies.us").replace(/\/$/, "");
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}

function adminHtml(c) {
  const row = (label, value, shaded) =>
    `<tr${shaded ? ' style="background:#f9f9f9"' : ""}><td style="padding:8px;font-weight:bold;color:#555;width:150px;vertical-align:top">${label}</td><td style="padding:8px">${value}</td></tr>`;
  const profile = c.pagePath ? siteUrl(c.pagePath) : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New profile claim</h2>
      <table style="width:100%;border-collapse:collapse">
        ${row("Company:", escapeHtml(c.companyName), false)}
        ${row("Profile:", profile ? `<a href="${escapeHtml(profile)}">${escapeHtml(profile)}</a>` : "N/A", true)}
        ${row("Company website:", escapeHtml(c.companyWebsite || "N/A"), false)}
        ${row("Name:", escapeHtml(c.name), true)}
        ${row("Email:", `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`, false)}
        ${row("Email matches website:", c.domainMatch ? '<span style="color:#15803d;font-weight:bold">Yes, same domain</span>' : '<span style="color:#b45309;font-weight:bold">No, different domain. Verify before approving.</span>', true)}
        ${row("Notes:", `<span style="white-space:pre-wrap">${escapeHtml(c.notes || "None")}</span>`, false)}
      </table>
      <p style="color:#777;font-size:12px;margin-top:16px">Reply to this email to answer the claimant directly. It is also listed under Claim Requests in the dashboard.</p>
    </div>`;
}

function userText(c) {
  const first = String(c.name || "").trim().split(/\s+/)[0] || "there";
  return `Hi ${first},

Thanks for wanting to claim the ${c.companyName} profile on MSP Companies. We got your message.

To finish, just reply to this email with your job title at ${c.companyName} and what you would like us to add or change on the profile (services, contact details, logo or certifications).

Once we hear back from you, we will go over the details and update the profile, usually within 2 business days.

Best regards,
MSPCompanies Team`;
}

// ─── POST /api/v1/claim-profile (public) ────────────────────────────────────
exports.submitClaim = async (req, res) => {
  const body = req.body || {};
  // Honeypot: a hidden field that real visitors never fill. Pretend it worked so bots do not retry.
  if (body.hp) return res.json({ ok: true, message: "Request received" });

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const notes = String(body.notes || "").trim();
  const companySlug = String(body.companySlug || "").trim().toLowerCase();
  const companyName = String(body.companyName || "").trim();
  const pagePath = String(body.pagePath || "").trim();

  if (!name || !email || !companySlug || !companyName) {
    return res.status(400).json({ ok: false, message: "Please fill in your name and business email." });
  }
  if (firstTooLong(body, { name: 100, email: 254, notes: 2000, companySlug: 200, companyName: 200, pagePath: 500 })) {
    return res.status(400).json({ ok: false, message: "One or more fields are too long." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
  }
  if (isFreeEmail(email)) {
    return res.status(400).json({
      ok: false,
      code: "FREE_EMAIL",
      message: "Please use your business email (for example name@yourcompany.com). Gmail, Yahoo, Outlook and other personal addresses are not accepted.",
    });
  }

  try {
    // The company's own website, to check that the email belongs to it.
    const company = await ManagedItCompany.findOne({ slug: companySlug }).select("website companyName").lean();
    const companyWebsite = company?.website || "";
    const domainMatch = sameCompanyDomain(email, companyWebsite);

    // The same person claiming the same profile again within a day: do not duplicate or email twice.
    const recent = await ClaimRequest.findOne({
      email,
      companySlug,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).select("_id").lean();
    if (recent) return res.json({ ok: true, message: "We already have your request for this profile. We will be in touch soon." });

    const claim = await ClaimRequest.create({
      companySlug,
      companyName: company?.companyName || companyName,
      companyWebsite,
      pagePath,
      name,
      email,
      notes,
      emailDomain: emailDomain(email),
      domainMatch,
    });

    // Both emails go out together. The claim is already saved, so a failed email must not show the visitor
    // an error. The dashboard shows whether each email was sent.
    const resend = mailer();
    if (resend) {
      const plain = claim.toObject();
      const [adminRes, userRes] = await Promise.allSettled([
        resend.emails.send({
          from: FROM_EMAIL,
          replyTo: email,
          to: ADMIN_EMAIL,
          subject: cleanSubject(`Profile claim: ${plain.companyName} (${name})`),
          html: adminHtml(plain),
        }),
        resend.emails.send({
          from: FROM_EMAIL,
          replyTo: ADMIN_EMAIL,
          to: email,
          subject: cleanSubject(`We received your claim for ${plain.companyName}`),
          text: userText(plain),
        }),
      ]);
      const ok = (r) => r.status === "fulfilled" && !r.value?.error;
      if (!ok(adminRes)) console.error("claim admin email failed:", adminRes.reason || adminRes.value?.error);
      if (!ok(userRes)) console.error("claim user email failed:", userRes.reason || userRes.value?.error);
      await ClaimRequest.updateOne({ _id: claim._id }, { $set: { adminEmailSent: ok(adminRes), userEmailSent: ok(userRes) } });
    } else {
      console.warn("claim saved but RESEND_API_KEY is not set, no email sent");
    }

    res.json({ ok: true, message: "Request received. Check your inbox for a confirmation email." });
  } catch (err) {
    console.error("submitClaim:", err);
    res.status(500).json({ ok: false, message: "Something went wrong. Please try again." });
  }
};

// ─── Admin ──────────────────────────────────────────────────────────────────

/** GET /api/v1/claim-requests?status=&q=&page=&limit= */
exports.getClaims = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const q = String(req.query.q || "").trim();
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ companyName: re }, { name: re }, { email: re }];
    }
    const [total, data, counts] = await Promise.all([
      ClaimRequest.countDocuments(filter),
      ClaimRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ClaimRequest.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    counts.forEach((c) => { byStatus[c._id] = c.n; });
    res.json({ ok: true, data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), counts: byStatus });
  } catch (err) {
    console.error("getClaims:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** PATCH /api/v1/claim-requests/:id  { status?, adminNote? } */
exports.updateClaim = async (req, res) => {
  try {
    const set = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ ok: false, message: "Invalid status" });
      set.status = req.body.status;
    }
    if (req.body.adminNote !== undefined) set.adminNote = String(req.body.adminNote).slice(0, 2000);
    const doc = await ClaimRequest.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Claim not found" });
    res.json({ ok: true, data: doc });
  } catch (err) {
    console.error("updateClaim:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/** DELETE /api/v1/claim-requests/:id */
exports.deleteClaim = async (req, res) => {
  try {
    const doc = await ClaimRequest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, message: "Claim not found" });
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteClaim:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
