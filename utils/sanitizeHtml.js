// Sanitizes admin-authored rich HTML (blog body, city/service/category content) before it is stored.
// Keeps everything the editors (TinyMCE/Jodit) produce for formatting; strips scripts, event
// handlers (onclick=...), javascript: URLs and non-whitelisted iframes.
const sanitizeHtml = require("sanitize-html");

const OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img", "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "section", "article",
    "figure", "figcaption", "iframe", "u", "s", "sup", "sub", "mark", "video", "source",
  ]),
  allowedAttributes: {
    "*": ["id", "class", "style", "title", "align", "dir", "lang"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "srcset", "sizes", "alt", "width", "height", "loading"],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "loading", "referrerpolicy"],
    video: ["src", "controls", "width", "height", "poster", "preload"],
    source: ["src", "type"],
    td: ["colspan", "rowspan", "width", "valign"],
    th: ["colspan", "rowspan", "width", "valign", "scope"],
    table: ["border", "cellpadding", "cellspacing", "width"],
    col: ["span", "width"],
    ol: ["start", "type", "reversed"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedIframeHostnames: ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.loom.com"],
  allowProtocolRelative: false,
};

function cleanHtml(html) {
  if (typeof html !== "string" || !html) return html;
  return sanitizeHtml(html, OPTIONS);
}

module.exports = { cleanHtml };
