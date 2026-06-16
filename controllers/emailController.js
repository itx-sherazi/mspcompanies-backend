const nodemailer = require("nodemailer");

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.CONTACT_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.CONTACT_SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.CONTACT_SMTP_USER,
      pass: process.env.CONTACT_SMTP_PASS,
    },
  });
}

const ADMIN_EMAIL = process.env.CONTACT_TO_EMAIL || "info@mspcompanies.us";
const FROM_EMAIL = `"MSP Companies" <${process.env.CONTACT_SMTP_USER}>`;

// ─── POST /api/v1/lead-popup ───────────────────────────────────────────────
exports.leadPopup = async (req, res) => {
  const { email, pagePath, pageTitle, leadChannel, ctaLabel, referenceDetail } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  try {
    const transporter = createTransporter();

    // Email to admin
    await transporter.sendMail({
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

    // Confirmation email to user
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "⚠️ One Step Left 150,000 Reply to Get Your Free MSP Data",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">

          <!-- Header -->
          <div style="background:#0356A6;padding:28px 24px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px;letter-spacing:0.5px">MSP Companies</h1>
          </div>

          <!-- Body -->
          <div style="padding:36px 32px;background:#f9fafb">

            <p style="font-size:15px;color:#555;margin:0 0 8px">You are one reply away from receiving your free MSP data sample.</p>

            <h2 style="color:#0F1C36;font-size:24px;margin:0 0 20px;line-height:1.3">
              Just <span style="color:#e53e3e">reply with the COUNTRY</span> you need sample from and we'll send your sample within <span style="color:#0356A6">12 hours.</span>
            </h2>

            <!-- Big Reply Button -->
            <div style="text-align:center;margin:0 0 28px">
              <a href="mailto:info@mspcompanies.us?subject=Re: Free MSP Data Sample Request&body=Hi, I would like to receive my free MSP data sample. My requirements: "
                style="display:inline-block;background:#0356A6;color:white;text-decoration:none;font-size:16px;font-weight:bold;padding:16px 40px;border-radius:10px;letter-spacing:0.3px">
                → Reply &amp; Get My Free Sample
              </a>
            </div>

            <!-- Urgency -->
            <div style="background:#fff8e1;border:1px solid #f6c90e;border-radius:8px;padding:14px 18px;margin:0 0 28px;text-align:center">
              <p style="margin:0;color:#856404;font-size:13px;font-weight:bold">
                We hold your sample for <span style="color:#c0392b">48 hours</span> 150,000 reply before it expires.
              </p>
            </div>

            <!-- What you get -->
            <div style="background:#e8f0fe;border-radius:8px;padding:18px 20px;margin:0 0 8px">
              <p style="margin:0 0 10px;color:#0356A6;font-weight:bold;font-size:13px;"> What's in your free sample:</p>
              <p style="margin:4px 0;color:#333;font-size:13px;">✔ Verified MSP company records</p>
              <p style="margin:4px 0;color:#333;font-size:13px;">✔ Decision maker contacts (CEO, CTO, IT Director)</p>
              <p style="margin:4px 0;color:#333;font-size:13px;">✔ Email, phone, LinkedIn & full firmographic data</p>
              <p style="margin:4px 0;color:#333;font-size:13px;">✔ Ready-to-use Excel format</p>
            </div>

          </div>

          <!-- Footer -->
          <div style="padding:18px 24px;text-align:center;background:#0F1C36">
            <p style="color:#aaa;font-size:12px;margin:0">© 2026 MSP Companies · <a href="https://mspcompanies.us" style="color:#aaa">mspcompanies.us</a></p>
          </div>

        </div>
      `,
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
    const transporter = createTransporter();

    // Email to admin
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Contact Form: ${subject || "New Enquiry"} ${firstName} ${lastName || ""}`,
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

    // Confirmation email to user
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "We received your message MSP Companies",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0356A6;padding:24px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">MSP Companies</h1>
          </div>
          <div style="padding:32px;background:#f9fafb">
            <h2 style="color:#0F1C36">Hi ${firstName}, we got your message!</h2>
            <p style="color:#555;line-height:1.7">Thank you for contacting MSP Companies. Our team will review your enquiry and respond within <strong>12 hours</strong>.</p>
            <div style="margin:24px 0;padding:16px;background:white;border-left:4px solid #0356A6;border-radius:4px">
              <p style="margin:0;font-weight:bold;color:#0F1C36">Your request summary:</p>
              <p style="margin:8px 0 0;color:#555"><strong>Service:</strong> ${service || "Not specified"}</p>
              <p style="margin:4px 0 0;color:#555"><strong>Subject:</strong> ${subject || "N/A"}</p>
            </div>
            <p style="color:#555;line-height:1.7">If you need immediate assistance, email us directly at <a href="mailto:info@mspcompanies.us" style="color:#0356A6">info@mspcompanies.us</a></p>
          </div>
          <div style="padding:16px;text-align:center;background:#0F1C36">
            <p style="color:#999;font-size:12px;margin:0">© 2026 MSP Companies · mspcompanies.us</p>
          </div>
        </div>
      `,
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
    const transporter = createTransporter();

    // Email to admin
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Email List Request: ${subject || "New Request"} ${firstName} ${lastName || ""}`,
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

    // Confirmation to user
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "MSP Email List Request Received MSP Companies",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0356A6;padding:24px;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">MSP Companies</h1>
          </div>
          <div style="padding:32px;background:#f9fafb">
            <h2 style="color:#0F1C36">Hi ${firstName}, your request is received!</h2>
            <p style="color:#555;line-height:1.7">Thank you for requesting our MSP Email List. Our team will prepare a customized sample and reach out within <strong>12 hours</strong>.</p>
            <p style="color:#555;line-height:1.7">Please reply to this email with any additional requirements:</p>
            <ul style="color:#555;line-height:2">
              <li>Target region or country</li>
              <li>Company size or revenue range</li>
              <li>Specific job titles needed</li>
              <li>Number of records required</li>
            </ul>
            <div style="margin-top:24px;padding:16px;background:#e8f0fe;border-radius:8px">
              <p style="margin:0;color:#0356A6;font-weight:bold">Direct contact:</p>
              <p style="margin:4px 0 0;color:#0356A6">info@mspcompanies.us</p>
            </div>
          </div>
          <div style="padding:16px;text-align:center;background:#0F1C36">
            <p style="color:#999;font-size:12px;margin:0">© 2026 MSP Companies · mspcompanies.us</p>
          </div>
        </div>
      `,
    });

    res.json({ success: true, message: "Request submitted successfully" });
  } catch (error) {
    console.error("emailListForm email error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};
