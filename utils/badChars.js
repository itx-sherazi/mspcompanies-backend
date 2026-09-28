// Finds and repairs "mojibake": UTF-8 text that was decoded as Windows-1252 somewhere in an
// import (e.g. "â€“" instead of "–", "ðŸ’¬" instead of "💬"). Also flags invisible/control
// characters and leftovers that can't be repaired automatically, so they can be fixed by hand.

// Windows-1252 characters that stand for bytes 0x80-0x9F.
const CP1252_TO_BYTE = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

// A UTF-8 continuation byte (0x80-0xBF) as it looks after the bad decode.
const CONT = `[\\u0080-\\u00BF${Object.keys(CP1252_TO_BYTE).join("")}]`;
// Lead byte + the right number of continuation bytes.
const MOJIBAKE_RE = new RegExp(
  `[\\u00C2-\\u00DF]${CONT}|[\\u00E0-\\u00EF]${CONT}{2}|[\\u00F0-\\u00F4]${CONT}{3}`,
  "g",
);
// Pieces of mojibake that survive when a byte was dropped (can't be decoded back).
const BROKEN_RE = /â€|Ã[\u0080-¿]|Â[\u0080-¿]|ðŸ|ï¿½|�/g;
// Control characters (except tab/newline) and zero-width characters.
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‍⁠﻿]/g;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu;

const utf8 = new TextDecoder("utf-8", { fatal: true });

function toByte(ch) {
  if (CP1252_TO_BYTE[ch] !== undefined) return CP1252_TO_BYTE[ch];
  const code = ch.charCodeAt(0);
  return code <= 0xff ? code : null;
}

function decodeRun(run) {
  const bytes = [];
  for (const ch of run) {
    const b = toByte(ch);
    if (b === null) return null;
    bytes.push(b);
  }
  try {
    return utf8.decode(Uint8Array.from(bytes));
  } catch (_) {
    return null;
  }
}

/** Repair mojibake (runs twice for double-encoded text) and drop invisible characters. */
function fixText(text, { removeEmoji = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(MOJIBAKE_RE, (m) => decodeRun(m) ?? m);
    if (next === out) break;
    out = next;
  }
  out = out
    // "â€" + byte 0x9D, which Windows-1252 can't show and so gets dropped, is a closing quote.
    .replace(/â€(?![\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ])/g, "”")
    // "Â" left over from a non-breaking space whose second byte became a plain space.
    .replace(/Â(?=\s)/g, "")
    .replace(INVISIBLE_RE, "")
    .replace(/ /g, " ");
  if (removeEmoji) out = out.replace(EMOJI_RE, "");
  if (out !== text) out = out.replace(/ {2,}/g, " ").trim();
  return out;
}

/** The distinct bad sequences in a string, e.g. ["â€“", "ðŸ’¬"]. */
function findBadSequences(text) {
  if (typeof text !== "string" || !text) return [];
  const found = new Set();
  for (const m of text.match(MOJIBAKE_RE) || []) if (decodeRun(m) !== null) found.add(m);
  for (const m of text.match(/â€(?![\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ])|Â(?=\s)/g) || []) found.add(m);
  // Look for unrepairable leftovers only in what auto-fix can't clean up.
  for (const m of fixText(text).match(BROKEN_RE) || []) found.add(m);
  for (const m of text.match(INVISIBLE_RE) || []) {
    found.add(`U+${m.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
  }
  return [...found];
}

module.exports = { fixText, findBadSequences };
