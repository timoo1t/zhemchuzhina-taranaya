export function sanitizePlainText(input, { maxLen = 5000, allowNewlines = true } = {}) {
  if (input == null) return '';
  let s = String(input);
  s = s.replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed)\b[^>]*>/gi, '');
  s = s.replace(/<[^>]*>/g, '');
  const controlPattern = allowNewlines
    ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
    : /[\x00-\x1F\x7F]/g;
  s = s.replace(controlPattern, '');
  if (allowNewlines) {
    s = s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  }
  s = s.replace(/[ \t]{2,}/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizeSingleLine(input, { maxLen = 200 } = {}) {
  return sanitizePlainText(input, { maxLen, allowNewlines: false });
}

export function sanitizeUrl(input, { protocols = ['https:', 'http:', 'mailto:', 'tel:'] } = {}) {
  if (input == null) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!protocols.includes(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}
