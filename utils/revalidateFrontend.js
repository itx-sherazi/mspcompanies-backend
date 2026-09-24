// Ask the public Next.js site to rebuild cached pages after admin changes.
// The secret goes in a header (not the URL) so it never shows up in access logs.
// Failures are swallowed: revalidation must never break the API response.
async function revalidateFrontend(paths = []) {
  try {
    const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": process.env.REVALIDATE_SECRET || "",
      },
      body: JSON.stringify({ paths }),
    });
  } catch (_) {}
}

module.exports = { revalidateFrontend };
