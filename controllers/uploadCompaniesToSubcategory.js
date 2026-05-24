


export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper function to create safe slugs
export function createSafeSlug(companyName) {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

// New comprehensive data cleaning function
export function cleanCompanyData(companyData) {
  // Helper functions for cleaning
  const trimValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  };

  const cleanArray = (value, delimiter = ",") => {
    if (!value || value === "") return [];
    
    // Check if value is a JSON string array
    if (typeof value === 'string' && value.trim().startsWith('[') && value.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return [...new Set(
            parsed
              .map(item => String(item).trim().replace(/[\u200B-\u200D\uFEFF]/g, ''))
              .filter(item => item.length > 0)
          )];
        }
      } catch (e) {
        // If JSON parse fails, fall back to delimiter splitting
      }
    }

    // Split by delimiter (comma or pipe)
    let items = [];
    if (delimiter === "|") {
      items = String(value).split("|");
    } else {
      // Try comma first, then pipe if no commas found
      const stringValue = String(value);
      if (stringValue.includes(",")) {
        items = stringValue.split(",");
      } else if (stringValue.includes("|")) {
        items = stringValue.split("|");
      } else {
        items = [stringValue];
      }
    }
    
    // Process items: trim, remove empties, remove duplicates
    return [...new Set(
      items
        .map(item => item.trim().replace(/[\u200B-\u200D\uFEFF]/g, ''))
        .filter(item => item.length > 0)
    )];
  };

  const cleanUrl = (url) => {
    if (!url || url === "") return "";
    let cleanedUrl = url.trim();
    // Allow relative paths starting with /
    if (cleanedUrl && !/^https?:\/\//i.test(cleanedUrl) && !cleanedUrl.startsWith('/')) {
      cleanedUrl = "https://" + cleanedUrl;
    }
    return cleanedUrl;
  };

  const cleanPhone = (phone) => {
    if (!phone || phone === "") return "";
    // Keep only digits, +, and spaces
    return String(phone).replace(/[^0-9+\s]/g, "");
  };

  const cleanFoundedYear = (year) => {
    if (!year || year === "") return null;
    const num = parseInt(year, 10);
    return isNaN(num) ? null : num;
  };

  // Clean all fields according to specifications
  // Clean all fields according to specifications with fallbacks for camelCase keys
  const cleanedData = {
    companyName: trimValue(companyData["Company Name"] ?? companyData["companyName"]),
    description: trimValue(companyData["Short Description"] ?? companyData["description"]),
    address: trimValue(companyData["Company Address"] ?? companyData["address"]),
    companyStreet: trimValue(companyData["Company Street"] ?? companyData["companyStreet"]),
    companyCity: trimValue(companyData["Company City"] ?? companyData["companyCity"]),
    companyState: trimValue(companyData["Company State"] ?? companyData["companyState"]),
    companyCountry: trimValue(companyData["Company Country"] ?? companyData["companyCountry"]),
    companyPostalCode: trimValue(companyData["Company Postal Code"] ?? companyData["companyPostalCode"]),
    companyServices: cleanArray(companyData["Company Services"] ?? companyData["companyServices"]),
    companyPartners: cleanArray(companyData["Company Partners"] ?? companyData["companyPartners"]),
    industryTags: cleanArray(companyData["Industry"] ?? companyData["industryTags"]),
    keywords: cleanArray(companyData["Keywords"] ?? companyData["keywords"]),
    employees: trimValue(companyData["# Employees"] ?? companyData["employees"]),
    foundedYear: cleanFoundedYear(companyData["Founded Year"] ?? companyData["foundedYear"]),
    phone: cleanPhone(companyData["Company Phone"] ?? companyData["phone"]),
    image: cleanUrl(companyData["Logo Url"] ?? companyData["image"]),
    website: cleanUrl(companyData["Website"] ?? companyData["website"]),
    linkedinUrl: cleanUrl(companyData["Company Linkedin Url"] ?? companyData["linkedinUrl"]),
    facebookUrl: cleanUrl(companyData["Facebook Url"] ?? companyData["facebookUrl"]),
    twitterUrl: cleanUrl(companyData["Twitter Url"] ?? companyData["twitterUrl"]),
    naicsCodes: cleanArray(companyData["NAICS Codes"] ?? companyData["naicsCodes"]),
    sicCodes: cleanArray(companyData["SIC Codes"] ?? companyData["sicCodes"]),
    technologies: cleanArray(companyData["Technologies"] ?? companyData["technologies"]),
    slug: createSafeSlug(trimValue(companyData["Company Name"] ?? companyData["companyName"])),
    vars: trimValue(companyData["VARS"] ?? companyData["vars"]), // Keep as single string, don't split
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return cleanedData;
}
