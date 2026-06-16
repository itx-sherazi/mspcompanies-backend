const Service = require("../models/Service");
const CompanyTeamData = require("../models/TeamCompany");
const cloudinary = require("../config/cloudinary");

// slugify inline 150,000 no external dependency needed
function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

exports.createService = async (req, res) => {
  try {
    const { name, description, metaTitle, metaDescription, metaKeywords, filterConfig, content, faqs, providerCount } = req.body;
    if (!name) return res.status(400).json({ message: "Service name is required." });

    const slug = slugify(name);
    const existing = await Service.findOne({ slug });
    if (existing) return res.status(400).json({ message: "Service already exists." });

    const service = await Service.create({
      name, slug, description,
      metaTitle: metaTitle || "",
      metaDescription: metaDescription || "",
      metaKeywords: metaKeywords || "",
      filterConfig: filterConfig || [],
      content: content || "",
      faqs: faqs || [],
      providerCount: providerCount !== undefined ? providerCount : 500,
    });

    res.status(201).json({ message: "Service created successfully", service });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find({}).lean();
    res.status(200).json({ ok: true, data: services });
  } catch (err) {
    res.status(500).json({ message: "Error fetching services", error: err.message });
  }
};

exports.getServiceBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const service = await Service.findOne({ slug: { $regex: new RegExp(`^${escapeRegex(slug)}$`, "i") } }).lean();
    if (!service) return res.status(404).json({ message: "Service not found." });
    res.status(200).json({ ok: true, data: service });
  } catch (err) {
    res.status(500).json({ message: "Error fetching service", error: err.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, metaTitle, metaDescription, metaKeywords, filterConfig, content, faqs, providerCount } = req.body;

    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: "Service not found." });

    if (name) {
      const slug = slugify(name);
      const existing = await Service.findOne({ slug });
      if (existing && existing._id.toString() !== id) {
        return res.status(400).json({ message: `Service "${name}" already exists.` });
      }
      service.name = name;
      service.slug = slug;
    }
    if (description !== undefined) service.description = description;
    if (content !== undefined) service.content = content;
    if (metaTitle !== undefined) service.metaTitle = metaTitle;
    if (metaDescription !== undefined) service.metaDescription = metaDescription;
    if (metaKeywords !== undefined) service.metaKeywords = metaKeywords;
    if (filterConfig !== undefined) service.filterConfig = filterConfig;
    if (faqs !== undefined) service.faqs = faqs;
    if (providerCount !== undefined) service.providerCount = providerCount;

    await service.save();
    res.status(200).json({ message: "Service updated successfully", service });
  } catch (err) {
    res.status(500).json({ message: "Error updating service", error: err.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: "Service not found." });

    const companies = await CompanyTeamData.find({ service: service._id });
    for (const comp of companies) {
      if (comp.image && comp.image.includes("res.cloudinary.com")) {
        const publicId = getCloudinaryPublicId(comp.image);
        if (publicId) {
          try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
        }
      }
    }

    await CompanyTeamData.deleteMany({ service: service._id });
    await service.deleteOne();
    res.status(200).json({ message: "Service and associated companies deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Error deleting service", error: err.message });
  }
};

exports.updateServiceFilters = async (req, res) => {
  try {
    const { id } = req.params;
    const { filterConfig } = req.body;
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: "Service not found." });
    service.filterConfig = filterConfig || [];
    await service.save();
    res.status(200).json({ message: "Service filters updated successfully", service });
  } catch (err) {
    res.status(500).json({ message: "Error updating service filters", error: err.message });
  }
};

exports.getServiceFilters = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ message: "Service slug is required." });
    const service = await Service.findOne({ slug }).select("filterConfig").lean();
    if (!service) return res.status(404).json({ message: "Service not found." });
    res.status(200).json({ ok: true, data: service.filterConfig || [] });
  } catch (err) {
    res.status(500).json({ message: "Error fetching service filters", error: err.message });
  }
};

exports.getCompaniesByServiceSlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ message: "Service slug is required" });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const createRegexIn = (param) => {
      let values = Array.isArray(param) ? param : typeof param === "string" ? param.split(",") : [];
      values = values.map((v) => v.trim()).filter(Boolean);
      if (!values.length) return undefined;
      return { $in: values.map((v) => new RegExp(escapeRegex(v), "i")) };
    };

    const service = await Service.findOne({ slug: { $regex: new RegExp(`^${escapeRegex(slug)}$`, "i") } }).lean();
    if (!service) return res.status(404).json({ message: "Service not found" });

    const filters = {};
    if (req.query.companyName) filters.companyName = { $regex: escapeRegex(req.query.companyName), $options: "i" };

    const kwFilter = createRegexIn(req.query.keywords);
    if (kwFilter) filters.keywords = kwFilter;

    const techFilter = createRegexIn(req.query.technologies);
    if (techFilter) filters.technologies = techFilter;

    const countryFilter = createRegexIn(req.query.companyCountry || req.query.country);
    if (countryFilter) filters.companyCountry = countryFilter;

    const servicesFilter = createRegexIn(req.query.companyServices || req.query.services);
    if (servicesFilter) filters.companyServices = servicesFilter;

    const partnersFilter = createRegexIn(req.query.companyPartners || req.query.partners);
    if (partnersFilter) filters.companyPartners = partnersFilter;

    if (req.query.employees) {
      const empParam = req.query.employees;
      if (typeof empParam === "string" && empParam.includes("-")) {
        const parts = empParam.split("-");
        const filterMin = parseInt(parts[0]);
        const filterMax = parseInt(parts[1]);
        if (!isNaN(filterMin) && !isNaN(filterMax)) {
          filters.$expr = {
            $cond: {
              if: { $eq: [{ $type: "$employees" }, "string"] },
              then: {
                $let: {
                  vars: { empParts: { $split: ["$employees", "-"] } },
                  in: {
                    $let: {
                      vars: {
                        rawMin: { $trim: { input: { $arrayElemAt: ["$$empParts", 0] } } },
                        rawMax: { $cond: { if: { $gt: [{ $size: "$$empParts" }, 1] }, then: { $trim: { input: { $arrayElemAt: ["$$empParts", 1] } } }, else: null } },
                      },
                      in: {
                        $let: {
                          vars: {
                            cMin: { $convert: { input: { $rtrim: { input: "$$rawMin", chars: "+" } }, to: "int", onError: 0, onNull: 0 } },
                            cMax: { $cond: { if: { $ne: ["$$rawMax", null] }, then: { $convert: { input: "$$rawMax", to: "int", onError: 0, onNull: 0 } }, else: { $cond: { if: { $regexMatch: { input: "$$rawMin", regex: /\+$/ } }, then: 1000000, else: { $convert: { input: { $rtrim: { input: "$$rawMin", chars: "+" } }, to: "int", onError: 0, onNull: 0 } } } } } },
                          },
                          in: { $and: [{ $lte: [{ $avg: ["$$cMin", "$$cMax"] }, filterMax] }, { $gte: [{ $avg: ["$$cMin", "$$cMax"] }, filterMin] }] },
                        },
                      },
                    },
                  },
                },
              },
              else: false,
            },
          };
        } else {
          filters.employees = empParam;
        }
      } else {
        filters.employees = empParam;
      }
    }

    if (req.query.vars) {
      const varsParam = req.query.vars;
      if (Array.isArray(varsParam)) filters.vars = { $in: varsParam };
      else if (typeof varsParam === "string" && varsParam.includes(",")) filters.vars = { $in: varsParam.split(",") };
      else filters.vars = varsParam;
    }

    const query = { service: service._id, ...filters };
    const totalCompanies = await CompanyTeamData.countDocuments(query);
    const totalPages = Math.ceil(totalCompanies / limit);

    const companies = await CompanyTeamData.find(query)
      .select("companyName service employees website slug linkedinUrl facebookUrl twitterUrl companyCountry address keywords phone technologies foundedYear image teamLeads industryTags createdAt updatedAt vars companyStreet companyCity companyState companyPostalCode sicCodes naicsCodes companyServices companyPartners")
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      ok: true,
      data: companies,
      serviceName: service.name,
      providerCount: service.providerCount || 500,
      metaDescription: service.metaDescription || "",
      filterConfig: service.filterConfig || [],
      pagination: { currentPage: page, totalPages, totalCompanies, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getCompanyBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ ok: false, message: "Company slug is required" });

    const company = await CompanyTeamData.findOne({ slug })
      .populate("service", "name slug")
      .select("companyName service description employees website slug linkedinUrl facebookUrl twitterUrl companyCountry address keywords phone technologies foundedYear image teamLeads industryTags createdAt updatedAt vars companyStreet companyCity companyState companyPostalCode sicCodes naicsCodes companyServices companyPartners")
      .lean();

    if (!company) return res.status(404).json({ ok: false, message: "Company not found" });

    res.status(200).json({
      ok: true,
      data: {
        ...company,
        employees: company.employees || null,
        foundedYear: company.foundedYear || null,
        industryTags: Array.isArray(company.industryTags) ? company.industryTags : [],
        teamLeads: Array.isArray(company.teamLeads) ? company.teamLeads : [],
        image: company.image || "",
        website: company.website || "#",
        description: company.description || "",
        companyCountry: company.companyCountry || "",
        address: company.address || "",
        keywords: company.keywords || "",
        phone: company.phone || "",
        technologies: Array.isArray(company.technologies) ? company.technologies : [],
        sicCodes: Array.isArray(company.sicCodes) ? company.sicCodes : [],
        naicsCodes: Array.isArray(company.naicsCodes) ? company.naicsCodes : [],
        vars: company.vars || "",
        companyStreet: company.companyStreet || "",
        companyCity: company.companyCity || "",
        companyState: company.companyState || "",
        companyPostalCode: company.companyPostalCode || "",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
};

exports.getAllCompaniesSitemap = async (req, res) => {
  try {
    const companies = await CompanyTeamData.find()
      .select("slug updatedAt createdAt service")
      .populate("service", "slug")
      .sort({ createdAt: -1 })
      .lean();

    if (!companies.length) return res.status(404).json({ success: false, message: "No companies found for sitemap" });

    res.status(200).json({
      success: true,
      data: companies.map((c) => ({ ...c, serviceSlug: c.service?.slug || null, lastModified: c.updatedAt || c.createdAt })),
      total: companies.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

exports.deleteAllCompaniesByService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ message: "Service not found." });

    const companies = await CompanyTeamData.find({ service: service._id });
    for (const comp of companies) {
      if (comp.image && comp.image.includes("res.cloudinary.com")) {
        const publicId = getCloudinaryPublicId(comp.image);
        if (publicId) {
          try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
        }
      }
    }

    const result = await CompanyTeamData.deleteMany({ service: service._id });
    service.providerCount = 0;
    await service.save();
    res.status(200).json({ message: `Successfully deleted ${result.deletedCount} companies from service.`, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: "Error deleting companies from service", error: err.message });
  }
};

exports.getAllServicesSitemap = async (req, res) => {
  try {
    const services = await Service.find().select("name slug createdAt updatedAt providerCount").sort({ createdAt: -1 }).lean();
    if (!services.length) return res.status(404).json({ success: false, message: "No services found for sitemap" });
    res.status(200).json({ success: true, data: services, total: services.length });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

exports.getCompaniesSitemapByService = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ message: "Service slug is required" });

    const service = await Service.findOne({ slug }).lean();
    if (!service) return res.status(404).json({ message: "Service not found" });

    const companies = await CompanyTeamData.find({ service: service._id })
      .select("slug updatedAt createdAt service")
      .populate("service", "slug")
      .sort({ createdAt: -1 })
      .lean();

    if (!companies.length) return res.status(404).json({ success: false, message: "No companies found for sitemap" });

    res.status(200).json({
      success: true,
      data: companies.map((c) => ({ ...c, serviceSlug: c.service?.slug || null, lastModified: c.updatedAt || c.createdAt })),
      total: companies.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
