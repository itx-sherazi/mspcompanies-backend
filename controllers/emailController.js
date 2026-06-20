const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.CONTACT_TO_EMAIL || "info@mspcompanies.us";
const FROM_EMAIL  = "MSP Companies <info@mspcompanies.us>";

// ─── POST /api/v1/lead-popup ───────────────────────────────────────────────
exports.leadPopup = async (req, res) => {
  const { email, pagePath, pageTitle, leadChannel, ctaLabel, referenceDetail } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  try {
    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `New Lead: ${email} ${pagePath || "/"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Lead Popup Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px">${email}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Page:</td><td style="padding:8px">${pagePath || "/"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Page Title:</td><td style="padding:8px">${pageTitle || "N/A"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Channel:</td><td style="padding:8px">${leadChannel || "auto_popup"}</td></tr>
            ${ctaLabel ? `<tr><td style="padding:8px;font-weight:bold;color:#555">CTA:</td><td style="padding:8px">${ctaLabel}</td></tr>` : ""}
            ${referenceDetail ? `<tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Reference:</td><td style="padding:8px">${referenceDetail}</td></tr>` : ""}
          </table>
        </div>
      `,
    });

    // Plain text to user — better inbox delivery
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "Re: Your Free MSP Data Sample",
      text: `Hi,

You are one reply away from receiving your free MSP data sample. Just reply with the COUNTRY you need sample from and we'll send your sample within 12 hours.

What's in your free sample:
- Verified MSP company records
- Decision maker contacts (CEO, CTO, IT Director)
- Email, phone, LinkedIn & full firmographic data
- Ready-to-use Excel format

Just hit Reply to this email to get your sample.

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

  try {
    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Contact Form: ${subject || "New Enquiry"} - ${firstName} ${lastName || ""}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:140px">Name:</td><td style="padding:8px">${firstName} ${lastName || ""}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Phone:</td><td style="padding:8px">${phone || "Not provided"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Service:</td><td style="padding:8px">${service || "Not specified"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Subject:</td><td style="padding:8px">${subject || "N/A"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message:</td><td style="padding:8px;white-space:pre-wrap">${message}</td></tr>
          </table>
        </div>
      `,
    });

    // Confirmation to user — plain text
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: ADMIN_EMAIL,
      to: email,
      subject: "We received your message - MSP Companies",
      text: `Hi ${firstName},

Thank you for contacting MSP Companies. We have received your message and will respond within 12 hours.

You can also share which region's data you need and any other requirements — our team will get back to you within 12 hours.

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

// ─── POST /api/v1/email-list ───────────────────────────────────────────────
exports.emailListForm = async (req, res) => {
  const { firstName, lastName, email, phone, service, subject, message } = req.body;

  if (!firstName || !email || !message) {
    return res.status(400).json({ error: "First name, email and message are required" });
  }

  try {
    // Email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Email List Request: ${subject || "New Request"} - ${firstName} ${lastName || ""}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#0356A6;border-bottom:2px solid #0356A6;padding-bottom:8px">New Email List Request</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:bold;color:#555;width:140px">Name:</td><td style="padding:8px">${firstName} ${lastName || ""}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Email:</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Phone:</td><td style="padding:8px">${phone || "Not provided"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555">Service:</td><td style="padding:8px">${service || "Not specified"}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Subject:</td><td style="padding:8px">${subject || "N/A"}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message:</td><td style="padding:8px;white-space:pre-wrap">${message}</td></tr>
          </table>
        </div>
      `,
    });

    // Confirmation to user — plain text
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

Our team will prepare a customized sample based on your needs.

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
