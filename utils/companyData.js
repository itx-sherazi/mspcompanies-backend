/**
 * Turns one row of the master sheet (or a Get Listed request) into the fields of a company, and reads the
 * FAQ cell. Used by the Master Sheet import, Get Listed publishing and the cybersecurity upload.
 */

function createSafeSlug(companyName) {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * "Company FAQ" cell -> [{ question, answer }]. Accepted formats:
 *   Q: What services do you offer? A: Managed IT, security and backup. || Q: Where are you? A: Albany, NY.
 *   Q: ...  A: ...   (one pair per line)
 *   What services do you offer? :: Managed IT, security and backup. || Where are you? :: Albany, NY.
 *   [{"question":"...","answer":"..."}]  (JSON, also what the dashboard form sends)
 * Pairs with an empty question or answer are dropped. At most 10 pairs are kept.
 */
function parseFaqs(value) {
  const clean = (q, a) => ({
    question: String(q || "").replace(/\s+/g, " ").trim(),
    answer: String(a || "").replace(/\s+/g, " ").trim(),
  });
  const finish = (list) => list.filter((f) => f.question && f.answer).slice(0, 10);
  if (Array.isArray(value)) return finish(value.map((f) => clean(f?.question, f?.answer)));
  const text = String(value ?? "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return finish(parsed.map((f) => clean(f?.question, f?.answer)));
    } catch (_) {}
  }
  const out = [];
  const qa = /(?:^|\n|\|\|)\s*(?:Q|Question)\s*[:.)]\s*([\s\S]*?)\s*(?:A|Answer)\s*[:.)]\s*([\s\S]*?)(?=(?:\n|\|\|)\s*(?:Q|Question)\s*[:.)]|$)/gi;
  let m;
  while ((m = qa.exec(text))) out.push(clean(m[1], m[2]));
  if (out.length) return finish(out);
  // "question :: answer || question :: answer"
  for (const part of text.split("||")) {
    const [q, ...rest] = part.split("::");
    if (rest.length) out.push(clean(q, rest.join("::")));
  }
  return finish(out);
}

function cleanCompanyData(companyData) {
  const trimValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  };

  const cleanArray = (value, delimiter = ",") => {
    if (!value || value === "") return [];
    if (typeof value === "string" && value.trim().startsWith("[") && value.trim().endsWith("]")) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return [...new Set(parsed.map((item) => String(item).trim().replace(/[​-‍﻿]/g, "")).filter((item) => item.length > 0))];
        }
      } catch (_) {}
    }
    let items = [];
    if (delimiter === "|") {
      items = String(value).split("|");
    } else {
      const s = String(value);
      // Some sheet rows separate list items with semicolons ("Dell; Microsoft; Cisco"), which would otherwise stay one long item.
      if (s.includes(";")) items = s.split(";");
      else if (s.includes(",")) items = s.split(",");
      else if (s.includes("|")) items = s.split("|");
      else items = [s];
    }
    return [...new Set(items.map((item) => item.trim().replace(/[​-‍﻿]/g, "")).filter((item) => item.length > 0))];
  };

  const cleanUrl = (url) => {
    if (!url || url === "") return "";
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u) && !u.startsWith("/")) u = "https://" + u;
    return u;
  };

  const cleanPhone = (phone) => {
    if (!phone || phone === "") return "";
    return String(phone).replace(/[^0-9+\s().-]/g, "").trim();
  };

  const cleanFoundedYear = (year) => {
    if (!year || year === "") return null;
    const num = parseInt(year, 10);
    return isNaN(num) ? null : num;
  };

  const cleanBool = (value) => /^(y|yes|true|1)$/i.test(trimValue(value));

  const name = trimValue(companyData["Company Name"] ?? companyData["companyName"]);
  return {
    companyName: name,
    description: trimValue(companyData["Short Description"] ?? companyData["description"]),
    address: trimValue(companyData["Company Address"] ?? companyData["address"]),
    companyStreet: trimValue(companyData["Company Street"] ?? companyData["companyStreet"]),
    companyCity: trimValue(companyData["Company City"] ?? companyData["companyCity"]),
    companyState: trimValue(companyData["Company State"] ?? companyData["companyState"]),
    companyCountry: trimValue(companyData["Country"] ?? companyData["Company Country"] ?? companyData["companyCountry"]),
    companyPostalCode: trimValue(companyData["ZIP Code"] ?? companyData["Company Postal Code"] ?? companyData["companyPostalCode"]),
    revenueSize: trimValue(companyData["Revenue"] ?? companyData["Revenue Size"] ?? companyData["revenueSize"]),
    companyServices: cleanArray(companyData["Services"] ?? companyData["Company Services"] ?? companyData["companyServices"]),
    companyPartners: cleanArray(companyData["Company Partners"] ?? companyData["companyPartners"]),
    industryTags: cleanArray(companyData["Industry"] ?? companyData["industryTags"]),
    keywords: cleanArray(companyData["Keywords"] ?? companyData["keywords"]),
    employees: trimValue(companyData["Employees Size"] ?? companyData["# Employees"] ?? companyData["employees"]),
    foundedYear: cleanFoundedYear(companyData["Founded Year"] ?? companyData["foundedYear"]),
    phone: cleanPhone(companyData["Phone Number"] ?? companyData["Company Phone"] ?? companyData["phone"]),
    image: cleanUrl(companyData["LOGO"] ?? companyData["Logo Url"] ?? companyData["image"]),
    website: cleanUrl(companyData["Website"] ?? companyData["website"]),
    linkedinUrl: cleanUrl(companyData["Company Linkedin Url"] ?? companyData["linkedinUrl"]),
    facebookUrl: cleanUrl(companyData["FaceBook URL"] ?? companyData["Facebook Url"] ?? companyData["facebookUrl"]),
    twitterUrl: cleanUrl(companyData["Twitter URL"] ?? companyData["Twitter Url"] ?? companyData["twitterUrl"]),
    naicsCodes: cleanArray(companyData["NAICS Codes"] ?? companyData["naicsCodes"]),
    sicCodes: cleanArray(companyData["SIC Codes"] ?? companyData["sicCodes"]),
    technologies: cleanArray(companyData["Technologies"] ?? companyData["technologies"]),
    slug: createSafeSlug(name),
    vars: trimValue(companyData["VARS"] ?? companyData["vars"]),
    // Master sheet profile fields (all optional)
    profileSummary: trimValue(companyData["Profile Summary"] ?? companyData["profileSummary"]),
    tagline: trimValue(companyData["Tagline"] ?? companyData["tagline"]),
    industriesServed: cleanArray(companyData["Industries Served"] ?? companyData["industriesServed"]),
    serviceArea: trimValue(companyData["Service Area"] ?? companyData["serviceArea"]),
    certifications: cleanArray(companyData["Certifications"] ?? companyData["certifications"]),
    supportHours: trimValue(companyData["Support Hours"] ?? companyData["supportHours"]),
    indexEligible: cleanBool(companyData["Index Eligible"] ?? companyData["indexEligible"]),
    clientSizeFocus: trimValue(companyData["Client Size Focus"] ?? companyData["clientSizeFocus"]),
    specialization: trimValue(companyData["Specialization"] ?? companyData["specialization"]),
    complianceFrameworks: cleanArray(companyData["Compliance Frameworks"] ?? companyData["complianceFrameworks"]),
    bookingUrl: cleanUrl(trimValue(companyData["Booking/Contact URL"] ?? companyData["bookingUrl"])),
    citySlug: trimValue(companyData["City Slug"] ?? companyData["citySlug"]).toLowerCase(),
    stateSlug: trimValue(companyData["State Slug"] ?? companyData["stateSlug"]).toLowerCase(),
    countrySlug: trimValue(companyData["Country Slug"] ?? companyData["countrySlug"]).toLowerCase(),
    googleMapsUrl: cleanUrl(trimValue(companyData["Google Maps URL"] ?? companyData["googleMapsUrl"])),
    faqs: parseFaqs(companyData["Company FAQ"] ?? companyData["FAQs"] ?? companyData["faqs"]),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

module.exports = { cleanCompanyData, parseFaqs, createSafeSlug };
