const { Resend } = require("resend");
  const DataRequest = require("../models/DataRequest");
const { escapeHtml, cleanSubject, isValidEmail, firstTooLong } = require("../utils/emailSafety");

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.CONTACT_TO_EMAIL || "info@mspcompanies.us";
const FROM_EMAIL  = "MSP Companies <info@mspcompanies.us>";

// ─── POST /api/v1/lead-popup ───────────────────────────────────────────────
exports.leadPopup = async (req, res) => {
  const { email, pagePath, pageTitle, leadChannel, ctaLabel, referenceDetail } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (firstTooLong(req.body, { pagePath: 500, pageTitle: 300, leadChannel: 100, ctaLabel: 200, referenceDetail: 500 })) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    // Save to Database
    try {
      await DataRequest.create({
        fullName: email.split("@")[0],
        email: email,
        phone: "",
        contactCount: 0,
        price: 0,
        message: `Lead Popup - Page: ${pagePath || "/"} | Title: ${pageTitle || "N/A"}${leadChannel ? ` | Channel: ${leadChannel}` : ""}${ctaLabel ? ` | CTA: ${ctaLabel}` : ""}${referenceDetail ? ` | Ref: ${referenceDetail}` : ""}`,
      });
    } catch (dbErr) {
      console.error("Failed to save leadPopup lead to database:", dbErr);
    }

    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: cleanSubject(`New Lead: ${email} ${pagePath || "/"}`),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Lead Popup Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px">${escapeHtml(email)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Page:</td><td style="padding:8px">${escapeHtml(pagePath || "/")}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Page Title:</td><td style="padding:8px">${escapeHtml(pageTitle || "N/A")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Channel:</td><td style="padding:8px">${escapeHtml(leadChannel || "auto_popup")}</td></tr>
            ${ctaLabel ? `<tr><td style="padding:8px;font-weight:bold;color:#555">CTA:</td><td style="padding:8px">${escapeHtml(ctaLabel)}</td></tr>` : ""}
            ${referenceDetail ? `<tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Reference:</td><td style="padding:8px">${escapeHtml(referenceDetail)}</td></tr>` : ""}
          </table>
        </div>
      `,
    });

    // Plain text to user  better inbox delivery
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "Re: Your MSP Company Data Request",
      text: `Hi,

You are one reply away from receiving your MSP company data. Just reply with the COUNTRY you need data from and we'll send your data within 12 hours.

What's included in your MSP data:
- Verified MSP company records
- Decision maker contacts (CEO, CTO, IT Director)
- Email, phone, LinkedIn & full firmographic data
- Ready-to-use Excel format

Just hit Reply to this email to get your data.

Best regards,
MSP Companies Team
info@mspcompanies.us
mspcompanies.us`,
    });

    res.json({ success: true, message: "Request submitted successfully" });
  } catch (error) {
    console.error("leadPopup email error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};

// ─── POST /api/v1/contact ──────────────────────────────────────────────────
exports.contactForm = async (req, res) => {
  const { firstName, lastName, email, phone, service, subject, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ error: "First name, email and message are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (firstTooLong(req.body, { firstName: 100, lastName: 100, phone: 50, service: 200, subject: 200, message: 5000 })) {
    return res.status(400).json({ error: "One or more fields are too long" });
  }

  try {
    // Save to Database
    try {
      await DataRequest.create({
        fullName: `${firstName} ${lastName || ""}`.trim(),
        email,
        phone: phone || "",
        contactCount: 0,
        price: 0,
        message: `Contact Form - Subject: ${subject || "N/A"} | Service: ${service || "N/A"} | Message: ${message}`,
      });
    } catch (dbErr) {
      console.error("Failed to save contactForm to DB:", dbErr);
    }

    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: cleanSubject(`Contact Form: ${subject || "New Enquiry"} - ${firstName} ${lastName || ""}`),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:140px">Name:</td><td style="padding:8px">${escapeHtml(firstName)} ${escapeHtml(lastName || "")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Phone:</td><td style="padding:8px">${escapeHtml(phone || "Not provided")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Service:</td><td style="padding:8px">${escapeHtml(service || "Not specified")}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Subject:</td><td style="padding:8px">${escapeHtml(subject || "N/A")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message:</td><td style="padding:8px;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
          </table>
        </div>
      `,
    });

    // Confirmation to user  plain text
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "We received your message - MSP Companies",
      text: `Hi ${firstName},

Thank you for contacting MSP Companies. We have received your message and will respond within 12 hours.

You can also share which region's data you need and any other requirements  our team will get back to you within 12 hours.

Your request summary:
- Service: ${service || "Not specified"}
- Subject: ${subject || "N/A"}

Just reply to this email with your requirements.

Best regards,
MSP Companies Team
info@mspcompanies.us
mspcompanies.us`,
    });

    res.json({ success: true, message: "Message sent successfully" });
  } catch (error) {
    console.error("contactForm email error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};

// ─── POST /api/v1/book-a-call ─────────────────────────────────────────────
exports.bookACall = async (req, res) => {
  const { firstName, lastName, email, phone, service, message } = req.body;

  if (!firstName || !email) {
    return res.status(400).json({ error: "First name and email are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (firstTooLong(req.body, { firstName: 100, lastName: 100, phone: 50, service: 200, subject: 200, message: 5000 })) {
    return res.status(400).json({ error: "One or more fields are too long" });
  }

  const fullName = `${firstName} ${lastName || ""}`.trim();

  try {
    // Save to Database
    try {
      await DataRequest.create({
        fullName,
        email,
        phone: phone || "",
        contactCount: 0,
        price: 0,
        message: `Book a Call - Service: ${service || "Not specified"} | Message: ${message || "No message provided"}`,
      });
    } catch (dbErr) {
      console.error("Failed to save bookACall to DB:", dbErr);
    }

    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: cleanSubject(`Book a Call Request: ${service || "MSP Services"} ${fullName}`),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Book a Call Request services-for-msps</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:140px">Name:</td><td style="padding:8px">${escapeHtml(fullName)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Phone:</td><td style="padding:8px">${escapeHtml(phone || "Not provided")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Service:</td><td style="padding:8px">${escapeHtml(service || "Not specified")}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message:</td><td style="padding:8px;white-space:pre-wrap">${escapeHtml(message || "No message provided")}</td></tr>
          </table>
        </div>
      `,
    });

    // Confirmation to user MSP growth services focused
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "Your Consultation Request MSP Companies",
      text: `Hi ${firstName},

Thank you for requesting a consultation with MSP Companies!

We've received your request for: ${service || "MSP Growth Services"}

Our team will reach out within 12 hours to schedule your free 30-minute consultation call.

On the call, we'll cover:
- Which service best fits your MSP goals
- Realistic timelines and what to expect
- Pricing options and packages
- Next steps to get started

In the meantime, feel free to explore our resources:
- MSP List (180,000+ companies): https://mspcompanies.us/msp-list
- MSP Near Me Directory: https://mspcompanies.us/msp-near-me
- Cybersecurity MSP Database: https://mspcompanies.us/cybersecurity-msp-database

If you have any questions before your call, just reply to this email.

Best regards,
MSP Companies Team
info@mspcompanies.us
https://mspcompanies.us`,
    });

    res.json({ success: true, message: "Consultation request submitted successfully" });
  } catch (error) {
    console.error("bookACall email error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};

// ─── POST /api/v1/email-list ───────────────────────────────────────────────
exports.emailListForm = async (req, res) => {
  const { firstName, lastName, email, phone, service, subject, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ error: "First name, email and message are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (firstTooLong(req.body, { firstName: 100, lastName: 100, phone: 50, service: 200, subject: 200, message: 5000 })) {
    return res.status(400).json({ error: "One or more fields are too long" });
  }

  try {
    // Save to Database
    try {
      await DataRequest.create({
        fullName: `${firstName} ${lastName || ""}`.trim(),
        email,
        phone: phone || "",
        contactCount: 0,
        price: 0,
        message: `Email List Request - Subject: ${subject || "N/A"} | Service: ${service || "N/A"} | Message: ${message}`,
      });
    } catch (dbErr) {
      console.error("Failed to save emailListForm to DB:", dbErr);
    }

    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: cleanSubject(`Email List Request: ${subject || "New Request"} - ${firstName} ${lastName || ""}`),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Email List Request</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:140px">Name:</td><td style="padding:8px">${escapeHtml(firstName)} ${escapeHtml(lastName || "")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Phone:</td><td style="padding:8px">${escapeHtml(phone || "Not provided")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Service:</td><td style="padding:8px">${escapeHtml(service || "Not specified")}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Subject:</td><td style="padding:8px">${escapeHtml(subject || "N/A")}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message:</td><td style="padding:8px;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
          </table>
        </div>
      `,
    });

    // Confirmation to user  plain text
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "MSP Email List Request Received - MSP Companies",
      text: `Hi ${firstName},

Thank you for requesting our MSP Email List. We have received your request and will get back to you within 12 hours.

Please reply to this email with your requirements:
- Target region or country
- Company size or revenue range
- Specific job titles needed
- Number of records required

Our team will prepare a customized data list based on your needs.

Best regards,
MSP Companies Team
info@mspcompanies.us
mspcompanies.us`,
    });

    res.json({ success: true, message: "Request submitted successfully" });
  } catch (error) {
    console.error("emailListForm email error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};
