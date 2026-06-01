const xlsx = require("xlsx");
const CompanyTeamData = require("../models/TeamCompany");
const Service = require("../models/Service");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const cloudinary = require("../config/cloudinary");

const getCloudinaryPublicId = (url) => {
  if (!url || !url.includes("res.cloudinary.com")) return null;
  const parts = url.split("/");
  const uploadIndex = parts.indexOf("upload");
  if (uploadIndex === -1) return null;
  let startIndex = uploadIndex + 1;
  if (parts[startIndex].match(/^v\d+$/)) startIndex++;
  const publicIdWithExt = parts.slice(startIndex).join("/");
  return publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf("."));
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSafeSlug(companyName) {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
      if (s.includes(",")) items = s.split(",");
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
    return String(phone).replace(/[^0-9+\s]/g, "");
  };

  const cleanFoundedYear = (year) => {
    if (!year || year === "") return null;
    const num = parseInt(year, 10);
    return isNaN(num) ? null : num;
  };

  const name = trimValue(companyData["Company Name"] ?? companyData["companyName"]);
  return {
    companyName: name,
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
    slug: createSafeSlug(name),
    vars: trimValue(companyData["VARS"] ?? companyData["vars"]),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

exports.cleanCompanyData = cleanCompanyData;
exports.escapeRegex = escapeRegex;
exports.createSafeSlug = createSafeSlug;

exports.uploadCompaniesToSubcategory = async (req, res) => {
  try {
    const subcategoryName = req.body.subcategoryName?.trim() || req.body.serviceId?.trim();
    const fileBuffer = req.files?.file?.[0]?.buffer;

    if (!subcategoryName || !fileBuffer) {
      return res.status(400).json({ message: "subcategoryName (or serviceId) and Excel file are required." });
    }
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return res.status(400).json({ message: "Invalid file buffer. Please try uploading again." });
    }

    const startTime = Date.now();

    let service;
    if (mongoose.Types.ObjectId.isValid(subcategoryName)) {
      service = await Service.findById(subcategoryName);
    }
    if (!service) {
      try {
        service = await Service.findOne({ name: new RegExp(`^${escapeRegex(subcategoryName)}$`, "i") });
      } catch (_) {
        service = await Service.findOne({ name: { $regex: subcategoryName, $options: "i" } });
      }
    }
    if (!service) return res.status(404).json({ message: "Service not found." });

    let workbook;
    let parseAttempts = 0;
    while (parseAttempts < 3) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        workbook = xlsx.read(fileBuffer, { type: "buffer", cellText: false, cellNF: false, raw: false });
        break;
      } catch (parseError) {
        parseAttempts++;
        if (parseAttempts === 3) {
          return res.status(400).json({ message: "Failed to parse Excel file.", error: parseError.message });
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!workbook.Sheets["Companies"]) {
      return res.status(400).json({ message: "Excel file must contain 'Companies' sheet." });
    }

    let companiesSheet;
    try {
      companiesSheet = xlsx.utils.sheet_to_json(workbook.Sheets["Companies"]);
    } catch (sheetError) {
      return res.status(400).json({ message: "Error processing Excel sheets.", error: sheetError.message });
    }

    if (!companiesSheet.length) return res.status(400).json({ message: "No company data found in Excel file." });

    const validCompanies = [];
    const duplicateTracker = new Set();

    for (const row of companiesSheet) {
      const companyName = String(row["Company Name"] ?? "").trim();
      if (!companyName) continue;
      const normalizedName = companyName.toLowerCase();
      if (duplicateTracker.has(normalizedName)) continue;
      duplicateTracker.add(normalizedName);
      const slug = createSafeSlug(companyName);
      if (!slug) continue;
      validCompanies.push({ ...row, "Company Name": companyName, slug, normalizedName });
    }

    const BATCH_SIZE = 100;
    const existingCompanies = new Map();
    const allSlugs = validCompanies.map((c) => c.slug);
    const allNames = validCompanies.map((c) => c.normalizedName);

    for (let i = 0; i < allSlugs.length; i += BATCH_SIZE) {
      const slugBatch = allSlugs.slice(i, i + BATCH_SIZE);
      const nameBatch = allNames.slice(i, i + BATCH_SIZE);
      const batchResult = await CompanyTeamData.find({
        $or: [
          { slug: { $in: slugBatch } },
          { companyName: { $in: nameBatch.map((name) => new RegExp(`^${escapeRegex(name)}$`, "i")) } },
        ],
      }).select("slug _id companyName");
      batchResult.forEach((company) => {
        existingCompanies.set(company.slug, company._id);
        existingCompanies.set(company.companyName.toLowerCase().trim(), company._id);
      });
    }

    const bulkCompanyOps = [];
    const companyMap = {};

    for (const companyData of validCompanies) {
      const slug = companyData.slug;
      const normalizedName = companyData.normalizedName;
      const existingId = existingCompanies.get(slug) || existingCompanies.get(normalizedName);

      if (existingId) {
        companyMap[normalizedName] = existingId;
        continue;
      }

      const newObjectId = new mongoose.Types.ObjectId();
      const cleanedData = cleanCompanyData(companyData);
      const fullAddress = [cleanedData.companyStreet, cleanedData.companyCity, cleanedData.companyState, cleanedData.companyCountry, cleanedData.companyPostalCode]
        .filter(Boolean)
        .join(", ");

      bulkCompanyOps.push({
        insertOne: {
          document: {
            _id: newObjectId,
            companyName: cleanedData.companyName,
            employees: cleanedData.employees,
            website: cleanedData.website,
            description: cleanedData.description,
            linkedinUrl: cleanedData.linkedinUrl,
            facebookUrl: cleanedData.facebookUrl,
            twitterUrl: cleanedData.twitterUrl,
            vars: cleanedData.vars,
            companyStreet: cleanedData.companyStreet,
            companyCity: cleanedData.companyCity,
            companyState: cleanedData.companyState,
            companyCountry: cleanedData.companyCountry,
            companyPostalCode: cleanedData.companyPostalCode,
            address: cleanedData.address || fullAddress || null,
            keywords: cleanedData.keywords,
            phone: cleanedData.phone,
            technologies: cleanedData.technologies,
            sicCodes: cleanedData.sicCodes,
            naicsCodes: cleanedData.naicsCodes,
            industryTags: cleanedData.industryTags,
            foundedYear: cleanedData.foundedYear,
            image: cleanedData.image,
            companyServices: cleanedData.companyServices,
            companyPartners: cleanedData.companyPartners,
            slug: cleanedData.slug,
            service: service._id,
            submittedThroughListingForm: false,
            createdAt: cleanedData.createdAt,
            updatedAt: cleanedData.updatedAt,
          },
        },
      });
      companyMap[normalizedName] = newObjectId;
    }

    let insertedCount = 0;
    if (bulkCompanyOps.length > 0) {
      try {
        const bulkWriteResult = await CompanyTeamData.bulkWrite(bulkCompanyOps, { ordered: false });
        insertedCount = bulkWriteResult.insertedCount || bulkWriteResult.nInserted || 0;
      } catch (bulkError) {
        insertedCount = bulkError?.result?.insertedCount || bulkError?.result?.nInserted || 0;
      }
    }

    const allCompanyIds = [...new Set(Object.values(companyMap))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (allCompanyIds.length > 0) {
      await Service.updateOne({ _id: service._id }, { $addToSet: { companies: { $each: allCompanyIds } } });
    }

    const existingCompanyIds = [...new Set(existingCompanies.values())];
    if (existingCompanyIds.length > 0) {
      for (const companyData of validCompanies) {
        const companyId = existingCompanies.get(companyData.normalizedName);
        if (companyId) {
          const cleanedData = cleanCompanyData(companyData);
          await CompanyTeamData.updateOne(
            { _id: companyId },
            { $set: { service: service._id, companyServices: cleanedData.companyServices, companyPartners: cleanedData.companyPartners, vars: cleanedData.vars, updatedAt: new Date() } }
          );
        }
      }
      await Service.updateOne({ _id: service._id }, { $addToSet: { companies: { $each: existingCompanyIds } } });
    }

    const updatedSubcategory = await Service.findById(service._id).populate({
      path: "companies",
      select: "companyName slug industryTags website employees foundedYear image description companyServices companyPartners",
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    res.status(201).json({
      success: true,
      message: `✅ ${validCompanies.length} companies processed\n✅ ${insertedCount} new added\n🕒 Took ${processingTime} seconds`,
      subcategory: updatedSubcategory,
      stats: {
        totalCompaniesInFile: companiesSheet.length,
        validCompanies: validCompanies.length,
        newCompaniesInserted: insertedCount,
        existingCompaniesFound: validCompanies.length - bulkCompanyOps.length,
        processingTime: `${processingTime} seconds`,
      },
    });
  } catch (err) {
    console.error("Error in uploadCompaniesToSubcategory:", err);
    let errorMessage = "Server error occurred while uploading companies";
    if (err.name === "ValidationError") errorMessage = "Validation error: " + Object.values(err.errors).map((e) => e.message).join(", ");
    else if (err.name === "CastError") errorMessage = "Invalid data format: " + err.message;
    else if (err.code === 11000) errorMessage = "Duplicate key error: " + Object.keys(err.keyPattern).join(", ") + " already exists";
    else if (err.message) errorMessage = err.message;
    res.status(500).json({ success: false, message: "Server error occurred. Please try again.", error: process.env.NODE_ENV === "development" ? errorMessage : "Internal server error" });
  }
};

exports.getAllCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";
    const searchType = req.query.searchType || "company";
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      const escapedSearch = escapeRegex(search);
      if (searchType === "company") query.companyName = { $regex: escapedSearch, $options: "i" };
      else if (searchType === "employees") query.employees = { $regex: escapedSearch, $options: "i" };
    }

    const totalCompanies = await CompanyTeamData.countDocuments(query);
    const totalPages = Math.ceil(totalCompanies / limit);
    let companies;

    if (search && searchType === "company") {
      const escapedSearch = escapeRegex(search);
      companies = await CompanyTeamData.aggregate([
        { $match: query },
        { $addFields: { matchScore: { $switch: { branches: [{ case: { $regexMatch: { input: "$companyName", regex: `^${escapedSearch}$`, options: "i" } }, then: 100 }, { case: { $regexMatch: { input: "$companyName", regex: `^${escapedSearch}`, options: "i" } }, then: 50 }], default: 10 } } } },
        { $sort: { matchScore: -1, companyName: 1 } },
        { $skip: skip },
        { $limit: limit },
        { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceData" } },
        { $addFields: { service: { $arrayElemAt: ["$serviceData", 0] } } },
        { $project: { serviceData: 0, matchScore: 0 } },
      ]);
    } else {
      companies = await CompanyTeamData.find(query).populate("service", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }

    res.status(200).json({ ok: true, companies, pagination: { currentPage: page, totalPages, totalCompanies, hasNextPage: page < totalPages, hasPrevPage: page > 1 } });
  } catch (error) {
    console.error("Error in getAllCompanies:", error);
    res.status(500).json({ ok: false, message: "Server error", error: error.message });
  }
};

exports.updateCompanyBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const updates = req.body;

    if (req.file) {
      const existingCompany = await CompanyTeamData.findOne({ slug });
      if (existingCompany?.image?.includes("res.cloudinary.com")) {
        const publicId = getCloudinaryPublicId(existingCompany.image);
        if (publicId) {
          try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
        }
      }
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "company", timeout: 120000 });
        updates.image = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error("Cloudinary company update image error:", err);
      }
    }

    const companyData = { ...updates };
    if (!companyData["Company Name"] && updates.companyName) companyData["Company Name"] = updates.companyName;
    const cleanedData = cleanCompanyData(companyData);

    const cleanUpdates = Object.fromEntries(
      Object.entries({
        companyName: cleanedData.companyName, description: cleanedData.description,
        address: cleanedData.address, companyStreet: cleanedData.companyStreet,
        companyCity: cleanedData.companyCity, companyState: cleanedData.companyState,
        companyCountry: cleanedData.companyCountry, companyPostalCode: cleanedData.companyPostalCode,
        companyServices: cleanedData.companyServices, companyPartners: cleanedData.companyPartners,
        industryTags: cleanedData.industryTags, keywords: cleanedData.keywords,
        employees: cleanedData.employees, foundedYear: cleanedData.foundedYear,
        phone: cleanedData.phone, website: cleanedData.website,
        linkedinUrl: cleanedData.linkedinUrl, facebookUrl: cleanedData.facebookUrl,
        twitterUrl: cleanedData.twitterUrl, naicsCodes: cleanedData.naicsCodes,
        sicCodes: cleanedData.sicCodes, technologies: cleanedData.technologies,
        slug: cleanedData.slug, vars: cleanedData.vars, updatedAt: new Date(),
      }).filter(([, v]) => v !== undefined && v !== null)
    );

    if (!req.file && updates.image === undefined && updates["Logo Url"] === undefined) delete cleanUpdates.image;
    else if (updates.image) cleanUpdates.image = updates.image;

    const updatedCompany = await CompanyTeamData.findOneAndUpdate({ slug }, { $set: cleanUpdates }, { new: true, runValidators: true });
    if (!updatedCompany) return res.status(404).json({ success: false, message: "Company not found" });

    res.status(200).json({ success: true, message: "Company updated successfully", company: updatedCompany });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({ success: false, message: "Server error", error: process.env.NODE_ENV === "development" ? error.message : "Internal server error" });
  }
};

exports.deleteCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    const existingCompany = await CompanyTeamData.findById(id);
    if (!existingCompany) return res.status(404).json({ success: false, message: "Company not found" });

    if (existingCompany.image?.includes("res.cloudinary.com")) {
      const publicId = getCloudinaryPublicId(existingCompany.image);
      if (publicId) {
        try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
      }
    }

    await CompanyTeamData.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Company deleted successfully" });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({ success: false, message: "Server error", error: process.env.NODE_ENV === "development" ? error.message : "Internal server error" });
  }
};
