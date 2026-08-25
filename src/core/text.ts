const MOJIBAKE = /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/;
const ESCAPED_UNICODE = /\\u([0-9a-fA-F]{4})/g;
const NUMERIC_ENTITY = /&#(x?[0-9a-fA-F]+);/gi;
const NAMED: Record<string, string> = {
  "&ccedil;": "ç",
  "&Ccedil;": "Ç",
  "&atilde;": "ã",
  "&Atilde;": "Ã",
  "&otilde;": "õ",
  "&Otilde;": "Õ",
  "&aacute;": "á",
  "&Aacute;": "Á",
  "&eacute;": "é",
  "&Eacute;": "É",
  "&iacute;": "í",
  "&Iacute;": "Í",
  "&oacute;": "ó",
  "&Oacute;": "Ó",
  "&uacute;": "ú",
  "&Uacute;": "Ú",
  "&agrave;": "à",
  "&Agrave;": "À",
  "&acirc;": "â",
  "&ecirc;": "ê",
  "&ocirc;": "ô",
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};

function fixMojibake(text: string): string {
  if (!MOJIBAKE.test(text)) return text;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  const fixed = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (fixed.includes("\uFFFD")) return text;
  return fixed;
}

export function decodeBytes(buffer: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("latin1").decode(buffer);
}

export function normalizeText(value: string): string {
  let text = value.replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");
  text = unescapeUnicode(text);
  text = decodeEntities(text);
  text = fixMojibake(text);
  try {
    text = text.normalize("NFC");
  } catch {
    // ignore
  }
  return text;
}

export function clipText(value: string, max: number): string {
  const text = normalizeText(value).replace(/\s+/g, " ").trim();
  const chars = [...graphemes(text)];
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}

function unescapeUnicode(text: string): string {
  if (!text.includes("\\u")) return text;
  return text.replace(ESCAPED_UNICODE, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  let out = text;
  for (const [entity, ch] of Object.entries(NAMED)) {
    if (out.includes(entity)) out = out.split(entity).join(ch);
  }
  return out.replace(NUMERIC_ENTITY, (_, raw: string) => {
    const code = raw.toLowerCase().startsWith("x") ? Number.parseInt(raw.slice(1), 16) : Number.parseInt(raw, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
}

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("pt", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}
