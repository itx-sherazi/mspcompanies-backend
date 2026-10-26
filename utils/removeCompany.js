/**
 * Removing a company completely: its entry in the directory, its copy on every city, state and country page, and its
 * pictures on Cloudinary (a picture that another company or request still uses is kept).
 */
const City = require("../models/City");
const ManagedItCompany = require("../models/ManagedItCompany");
const ListingRequest = require("../models/ListingRequest");
const cloudinary = require("../config/cloudinary");
const publicCache = require("./memoryCache");
const { revalidateFrontend } = require("./revalidateFrontend");

const isCloudinary = (url) => /^https:\/\/res\.cloudinary\.com\//i.test(String(url || ""));

/** "https://res.cloudinary.com/x/image/upload/v123/hub-company/abc.png" -> "hub-company/abc" */
function publicIdFromUrl(url) {
  const parts = String(url || "").split("?")[0].split("/");
  const at = parts.indexOf("upload");
  if (at === -1) return null;
  let start = at + 1;
  if (/^v\d+$/.test(parts[start] || "")) start += 1;
  const id = parts.slice(start).join("/");
  const dot = id.lastIndexOf(".");
  return decodeURIComponent(dot === -1 ? id : id.slice(0, dot)) || null;
}

/** Is the picture still used by a company, a page copy or a listing request? */
async function pictureInUse(url) {
  const [a, b, c] = await Promise.all([
    ManagedItCompany.exists({ image: url }),
    City.exists({ "hubCompanies.image": url }),
    ListingRequest.exists({ logoUrl: url }),
  ]);
  return Boolean(a || b || c);
}

/** Deletes the pictures of a company from Cloudinary, except the ones still in use. Returns how many were deleted. */
async function deletePictures(urls, { alsoCheck } = {}) {
  let deleted = 0;
  for (const url of [...new Set(urls.filter(isCloudinary))]) {
    try {
      if (await pictureInUse(url)) continue;
      if (alsoCheck && (await alsoCheck(url))) continue;
      const id = publicIdFromUrl(url);
      if (!id) continue;
      const r = await cloudinary.uploader.destroy(id);
      if (r.result === "ok") deleted += 1;
    } catch (err) {
      console.error("deletePictures:", err?.message || err);
    }
  }
  return deleted;
}

/**
 * Takes a Managed IT company out of the directory and off every page, then deletes its pictures.
 * @returns { found, pages: [{ name, path }], pictures }
 */
async function removeManagedItCompany(slug) {
  const company = await ManagedItCompany.findOne({ slug }).select("image").lean();
  const copies = await City.find({ "hubCompanies.slug": slug }).select({ name: 1, slug: 1, hubSlug: 1, hubCompanies: { $elemMatch: { slug } } }).lean();
  if (!company && copies.length === 0) return { found: false, pages: [], pictures: 0 };

  const urls = [company?.image, ...copies.flatMap((p) => (p.hubCompanies || []).map((c) => c.image))].filter(Boolean);
  await ManagedItCompany.deleteOne({ slug });
  await City.updateMany({ "hubCompanies.slug": slug }, { $pull: { hubCompanies: { slug } } });
  const pictures = await deletePictures(urls);

  const pages = copies.map((p) => ({ name: p.name, path: p.hubSlug === "top-msps" ? `/top-msps/${p.slug}` : `/msp/${p.slug}` }));
  publicCache.clear();
  if (!/localhost|127.0.0.1/.test(process.env.MONGO_URI || "")) revalidateFrontend([...pages.map((p) => p.path), "/managed-it-services"]).catch(() => {});
  return { found: true, pages, pictures };
}

module.exports = { removeManagedItCompany, deletePictures, publicIdFromUrl, isCloudinary };
