const ListingRequest = require("../models/ListingRequest");
const cloudinary = require("../config/cloudinary");
const nodemailer = require("nodemailer");

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val].filter(Boolean);
}

function row(label, value) {
  return `<p style="margin:0 0 8px;font-size:13px;color:#374151;"><span style="display:inline-block;min-width:160px;font-weight:600;color:#0F1C36;">${label}:</span> ${value}</p>`;
}
function summaryRow(label, value) {
  return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;width:140px;">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0F1C36;">${value}</td></tr>`;
}
function nextStep(num, color, title, desc) {
  return `<tr><td style="padding:6px 0;vertical-align:top;width:32px;"><div style="width:24px;height:24px;background:${color};color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">${num}</div></td><td style="padding:6px 0 6px 10px;"><strong style="font-size:13px;color:#0F1C36;">${title}</strong><br/><span style="font-size:12px;color:#64748b;">${desc}</span></td></tr>`;
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.CONTACT_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.CONTACT_SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.CONTACT_SMTP_USER,
      pass: process.env.CONTACT_SMTP_PASS,
    },
  });
}

// PUBLIC: Submit listing request
exports.submitListingRequest = async (req, res) => {
  try {
    const {
      companyName, companyDescription, website, linkedinUrl, phone,
      foundedYear, companySize, mainOfficeAddress, requestedCity,
      contactEmail, personOfContact, jobTitle, fullName, note,
      agreedToPrivacy, certifications, verticalFocus, partners, services, heardFrom,
    } = req.body;

    if (!companyName?.trim()) {
      return res.status(400).json({ ok: false, message: "Company name is required" });
    }
    if (!contactEmail?.trim()) {
      return res.status(400).json({ ok: false, message: "Contact email is required" });
    }
    const agreed = agreedToPrivacy === true || agreedToPrivacy === "true";
    if (!agreed) {
      return res.status(400).json({ ok: false, message: "You must agree to the Privacy Policy" });
    }

    let logoUrl = "";
    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "msp-listings", resource_type: "image" },
            (err, res) => (err ? reject(err) : resolve(res))
          );
          stream.end(req.file.buffer);
        });
        logoUrl = result.secure_url;
      } catch (uploadErr) {
        console.error("Cloudinary upload error:", uploadErr.message);
        return res.status(500).json({ ok: false, message: "Image upload failed. Please try again." });
      }
    }

    const listing = await ListingRequest.create({
      companyName: companyName.trim(),
      companyDescription: companyDescription?.trim() || "",
      website: website?.trim() || "",
      linkedinUrl: linkedinUrl?.trim() || "",
      phone: phone?.trim() || "",
      foundedYear: foundedYear?.trim() || "",
      companySize: companySize?.trim() || "",
      mainOfficeAddress: mainOfficeAddress?.trim() || "",
      requestedCity: requestedCity?.trim() || "",
      logoUrl,
      contactEmail: contactEmail.trim().toLowerCase(),
      personOfContact: personOfContact?.trim() || "",
      jobTitle: jobTitle?.trim() || "",
      fullName: fullName?.trim() || "",
      note: note?.trim() || "",
      agreedToPrivacy: agreed,
      certifications: toArray(certifications),
      verticalFocus: verticalFocus?.trim() || "",
      partners: toArray(partners),
      services: toArray(services),
      heardFrom: heardFrom?.trim() || "",
    });

    // Respond immediately emails fire in background
    res.status(201).json({ ok: true, message: "Listing request submitted successfully" });

    try {
      const transporter = getTransporter();
      const submittedAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });

      // ── Admin notification ──
      transporter.sendMail({
        from: `"MSP Companies" <${process.env.CONTACT_SMTP_USER}>`,
        to: process.env.CONTACT_TO_EMAIL || process.env.CONTACT_SMTP_USER,
        subject: `🆕 New Listing Request: ${listing.companyName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:30px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;">

        <!-- Header -->
        <tr>
          <td style="background:#0356A6;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">MSP Companies</h1>
            <p style="margin:4px 0 0;color:#a8c8f0;font-size:13px;">New Listing Request Received</p>
          </td>
        </tr>

        <!-- Alert bar -->
        <tr>
          <td style="background:#fff8e1;border-bottom:2px solid #f59e0b;padding:12px 32px;">
            <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">⏳ Pending Review Submitted on ${submittedAt} (ET)</p>
          </td>
        </tr>

        <!-- Company Info -->
        <tr>
          <td style="padding:24px 32px 8px;">
            <h2 style="margin:0 0 16px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">🏢 Company Information</h2>
            ${listing.logoUrl ? `<p style="margin:0 0 12px;"><img src="${listing.logoUrl}" alt="logo" style="max-height:60px;max-width:160px;border:1px solid #e2e8f0;padding:4px;" /></p>` : ""}
            ${row("Company Name", listing.companyName)}
            ${row("Website", listing.website ? `<a href="${listing.website}" style="color:#0356A6;">${listing.website}</a>` : "N/A")}
            ${row("LinkedIn", listing.linkedinUrl ? `<a href="${listing.linkedinUrl}" style="color:#0356A6;">${listing.linkedinUrl}</a>` : "N/A")}
            ${row("Founded Year", listing.foundedYear || "N/A")}
            ${row("Company Size", listing.companySize || "N/A")}
            ${row("Phone", listing.phone || "N/A")}
            ${row("Main Office Address", listing.mainOfficeAddress || "N/A")}
            ${row("Requested City", `<strong style="color:#0356A6;">${listing.requestedCity || "N/A"}</strong>`)}
            ${row("Vertical Focus", listing.verticalFocus || "N/A")}
          </td>
        </tr>

        ${listing.companyDescription ? `
        <tr><td style="padding:0 32px 8px;">
          <h2 style="margin:0 0 8px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">📝 Description</h2>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">${listing.companyDescription}</p>
        </td></tr>` : ""}

        <!-- Certifications -->
        ${listing.certifications?.length > 0 ? `
        <tr><td style="padding:0 32px 8px;">
          <h2 style="margin:16px 0 8px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">🏅 Certifications</h2>
          <p style="margin:0;color:#374151;font-size:13px;">${listing.certifications.join(" &nbsp;•&nbsp; ")}</p>
        </td></tr>` : ""}

        <!-- Services -->
        ${listing.services?.length > 0 ? `
        <tr><td style="padding:0 32px 8px;">
          <h2 style="margin:16px 0 8px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">⚙️ Services</h2>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.8;">${listing.services.map(s => `<span style="background:#eff6ff;border:1px solid #bfdbfe;padding:2px 8px;margin:2px;display:inline-block;font-size:12px;color:#1d4ed8;">${s}</span>`).join(" ")}</p>
        </td></tr>` : ""}

        <!-- Partners -->
        ${listing.partners?.length > 0 ? `
        <tr><td style="padding:0 32px 8px;">
          <h2 style="margin:16px 0 8px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">🤝 Partners</h2>
          <p style="margin:0;color:#374151;font-size:13px;line-height:1.8;">${listing.partners.map(p => `<span style="background:#f1f5f9;border:1px solid #e2e8f0;padding:2px 8px;margin:2px;display:inline-block;font-size:12px;color:#475569;">${p}</span>`).join(" ")}</p>
        </td></tr>` : ""}

        <!-- Contact Person -->
        <tr><td style="padding:0 32px 8px;">
          <h2 style="margin:16px 0 8px;color:#0F1C36;font-size:16px;border-bottom:2px solid #0356A6;padding-bottom:8px;">👤 Contact Person (Private)</h2>
          ${row("Full Name", listing.fullName || "N/A")}
          ${row("Person of Contact", listing.personOfContact || "N/A")}
          ${row("Job Title", listing.jobTitle || "N/A")}
          ${row("Email", `<a href="mailto:${listing.contactEmail}" style="color:#0356A6;">${listing.contactEmail}</a>`)}
          ${listing.note ? row("Note", listing.note) : ""}
        </td></tr>

        <!-- CTA -->
        <tr>
          <td style="padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;background:#f8fafc;">
            <a href="https://dashboard.mspcompanies.us" style="display:inline-block;background:#0356A6;color:#ffffff;padding:12px 32px;font-size:14px;font-weight:700;text-decoration:none;">
              Review in Dashboard →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#0F1C36;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">MSP Companies · <a href="https://mspcompanies.us" style="color:#60a5fa;">mspcompanies.us</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }).catch(err => console.error("Admin email error:", err.message));

      // ── Confirmation to submitter ──
      const contactName = listing.personOfContact || listing.fullName || "there";
      transporter.sendMail({
        from: `"MSP Companies" <${process.env.CONTACT_SMTP_USER}>`,
        to: listing.contactEmail,
        subject: `Action Required: Your MSP Companies listing next steps`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Listing Request Received  MSP Companies</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,sans-serif;color:#333333;width:100% !important;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;width:100%;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border:1px solid #eaeaea;border-radius:12px;overflow:hidden;background-color:#ffffff;">

          <!-- Welcome / Success -->
          <tr>
            <td style="padding:40px 30px 20px;text-align:center;">
              <h2 style="margin:0 0 10px;font-size:22px;color:#111827;">Request Received Successfully!</h2>
              <p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6;">
                Hi <strong>${contactName}</strong>,<br/>
                We have received your listing request for <strong>${listing.companyName}</strong>. Our team will review your submission within 1-2 business days.
              </p>
            </td>
          </tr>

          <!-- Plans Section -->
          <tr>
            <td style="padding:20px 30px;">
              <h3 style="margin:0 0 15px;font-size:18px;color:#1f2937;text-align:center;">Our Listing Plans</h3>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <!-- Free Plan -->
                  <td width="48%" valign="top" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;">
                    <h4 style="margin:0 0 10px;font-size:16px;color:#111827;">Free Listing</h4>
                    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                      The free plan includes your standard company profile and a <strong>No-Follow link</strong> to your website. No additional features are included.
                    </p>
                  </td>
                  <td width="4%"></td>
                  <!-- Paid Plan -->
                  <td width="48%" valign="top" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;">
                    <h4 style="margin:0 0 10px;font-size:16px;color:#0356A6;">Premium Plan</h4>
                    <p style="margin:0 0 10px;font-size:14px;color:#1e3a8a;line-height:1.6;">
                      Upgrade to our paid plan to maximize your visibility. Premium features include:
                    </p>
                    <ul style="margin:0;padding:0 0 0 16px;font-size:14px;color:#1e3a8a;line-height:1.6;">
                      <li style="margin-bottom:5px;"><strong>Do-Follow Link</strong> for SEO</li>
                      <li style="margin-bottom:5px;"><strong>Sponsored Placement</strong></li>
                      <li style="margin-bottom:5px;"><strong>Verified Badge</strong></li>
                      <li><strong>Homepage Placement</strong></li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Premium Benefits -->
              <div style="background-color:#f8fafc;border-left:4px solid #0356A6;padding:15px 20px;margin-bottom:20px;">
                <h4 style="margin:0 0 8px;font-size:15px;color:#0f172a;">Why Choose Premium?</h4>
                <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
                  A Premium Listing dramatically increases your brand's trust and visibility. The <strong>Do-Follow link</strong> directly boosts your website's domain authority and Google search rankings. <strong>Sponsored and Homepage placement</strong> ensures you appear at the top of search results, driving more high-quality leads and potential clients directly to your business.
                </p>
              </div>

              <p style="margin:0;font-size:15px;color:#4b5563;text-align:center;line-height:1.5;">
                <strong>Interested in the Premium Plan?</strong><br/>
                Simply reply to this email, and our team will get you set up immediately.
              </p>
            </td>
          </tr>


          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:30px 20px;text-align:center;border-top:1px solid #eaeaea;">
              <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">
                If you have any questions, just reply to this email or reach us at <a href="mailto:info@mspcompanies.us" style="color:#0356A6;text-decoration:none;">info@mspcompanies.us</a>
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${new Date().getFullYear()} MSP Companies. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`,
      }).catch(err => console.error("Submitter email error:", err.message));
    } catch (emailErr) {
      console.error("Listing request email error:", emailErr.message);
    }
  } catch (err) {
    console.error("submitListingRequest:", err);
    res.status(500).json({ ok: false, message: "Server error. Please try again." });
  }
};

// ADMIN: Get all listing requests
exports.getAllListingRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      ListingRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      ListingRequest.countDocuments(filter),
    ]);
    res.json({ ok: true, data: requests, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error("getAllListingRequests:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ADMIN: Update status
exports.updateListingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status" });
    }
    const listing = await ListingRequest.findByIdAndUpdate(
      id,
      { status, adminNote: adminNote?.trim() || "" },
      { new: true }
    );
    if (!listing) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, data: listing });
  } catch (err) {
    console.error("updateListingStatus:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// ADMIN: Delete
exports.deleteListingRequest = async (req, res) => {
  try {
    const { id } = req.params;
    await ListingRequest.findByIdAndDelete(id);
    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteListingRequest:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
