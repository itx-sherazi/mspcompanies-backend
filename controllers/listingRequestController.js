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

function getListingTransporter() {
  return nodemailer.createTransport({
    host: process.env.LISTING_SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.LISTING_SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.LISTING_SMTP_USER,
      pass: process.env.LISTING_SMTP_PASS,
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
      listingType, featuredAddon,
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
      listingType: listingType === "fast" ? "fast" : "free",
      featuredAddon: featuredAddon === true || featuredAddon === "true",
    });

    // Respond immediately emails fire in background
    res.status(201).json({ ok: true, message: "Listing request submitted successfully" });

    try {
      const transporter = getListingTransporter();
      const submittedAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });

      // ── Admin notification ──
      transporter.sendMail({
        from: `"MSP Companies" <${process.env.CONTACT_SMTP_USER}>`,
        to: "editor@mspcompanies.us",
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

        <!-- Plan selection -->
        <tr>
          <td style="background:${listing.listingType === "fast" ? "#f0fdf4" : "#eff6ff"};border-bottom:2px solid ${listing.listingType === "fast" ? "#059669" : "#0356A6"};padding:12px 32px;">
            <p style="margin:0;color:${listing.listingType === "fast" ? "#065f46" : "#1e3a8a"};font-size:13px;font-weight:700;">
              ${listing.listingType === "fast" ? "🚀 Fast Approval ($100)" : "🆓 Free Listing ($0)"}
              ${listing.featuredAddon ? " &nbsp;·&nbsp; ⭐ Featured Listing Add-on requested" : ""}
            </p>
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
