/**
 * Shared pure security & validation utilities used by:
 * - Browser SPA (src/)
 * - Cloudflare Worker (cloudflare/worker-mail-links.ts)
 * - Local Express dev server (server.ts)
 *
 * Zero DOM or Node-only dependencies so it runs identically everywhere.
 */

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;
const HEADER_BREAK_RE = /[\r\n]+/g;
const EMAIL_BASIC_RE = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']{2,}$/;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
]);

function fillFallbackRandomBytes(bytes: Uint8Array): void {
  const now = Date.now();
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = ((Math.floor(Math.random() * 256) ^ ((now >>> ((i % 4) * 8)) & 0xff)) + i * 31) & 0xff;
  }
}

/**
 * Checks whether a parsed URL hostname points to localhost, link-local, RFC1918,
 * CGNAT (100.64.0.0/10), 0.0.0.0/8, or private/mapped IPv6 ranges.
 */
export function isPrivateOrLocalHostname(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase();
  if (!host) return true;
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }

  // IPv4 private / reserved ranges
  if (
    /^0\./.test(host) ||
    /^10\./.test(host) ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
  ) {
    return true;
  }

  // IPv6 literals (wrapped in [...] by WHATWG URL parser or bare)
  const ipv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (ipv6.includes(':')) {
    const cleanV6 = ipv6.split('%')[0]; // Strip zone index if present
    if (
      cleanV6 === '::' ||
      cleanV6 === '::1' ||
      /^0*:0*:0*:0*:0*:0*:0*:[01]$/.test(cleanV6) ||
      /^fe[89ab][0-9a-f]:/i.test(cleanV6) || // Link-local fe80::/10
      /^f[cd][0-9a-f]{2}:/i.test(cleanV6) || // Unique local fc00::/7
      /^::ffff:/i.test(cleanV6) // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 / ::ffff:7f00:1)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Generates a cryptographically strong identifier using Web Crypto.
 */
export function generateSecureId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    fillFallbackRandomBytes(bytes);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
}

/**
 * Generates a short URL-safe random slug using Web Crypto.
 */
export function generateRandomSlug(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    fillFallbackRandomBytes(bytes);
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Strips CR/LF and ASCII control characters to prevent RFC 5322 / HTTP header injection.
 */
export function stripHeaderInjection(value: string, maxLength = 512): string {
  return value
    .replace(HEADER_BREAK_RE, ' ')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes an email display name for safe RFC 5322 quoting.
 */
export function sanitizeDisplayName(name: string, fallback = 'user'): string {
  const cleaned = stripHeaderInjection(name, 128).replace(/["\\<>]/g, '').trim();
  return cleaned || fallback;
}

/**
 * Validates basic email address syntax and enforces RFC 5321 max length (254).
 */
export function isValidEmailAddress(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (HEADER_BREAK_RE.test(trimmed) || CONTROL_CHARS_RE.test(trimmed)) return false;
  return EMAIL_BASIC_RE.test(trimmed);
}

/**
 * Sanitizes a shortlink slug (`imy.li/s/$SLUG`).
 */
export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 64);
}

/**
 * Escapes plain text for safe HTML rendering (e.g., text -> HTML email part).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts plain text into a clean, safe HTML email body so outbound emails always
 * include both `text` and `html` representations (recommended by Cloudflare Email Service).
 */
export function plainTextToSafeEmailHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.6;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;font-size:14px;">${paragraphs}</body></html>`;
}

/**
 * Strictly validates external URLs for Bio links and Shortlink redirects.
 * Rejects javascript:, data:, vbscript:, file:, embedded credentials, control chars,
 * and localhost / link-local metadata endpoints to prevent XSS & SSRF/open-redirect abuse.
 */
export function sanitizeExternalUrl(
  raw: string,
  options: { allowMailto?: boolean; blockPrivateHosts?: boolean } = {}
): string | null {
  const { allowMailto = false, blockPrivateHosts = false } = options;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if (CONTROL_CHARS_RE.test(trimmed) || HEADER_BREAK_RE.test(trimmed)) return null;

  // Handle mailto explicitly before auto-prefixing https://
  if (/^mailto:/i.test(trimmed)) {
    if (!allowMailto) return null;
    const addrPart = trimmed.slice(7).split('?')[0].trim();
    if (!isValidEmailAddress(addrPart)) return null;
    return `mailto:${addrPart.toLowerCase()}`;
  }

  // Reject explicit disallowed schemes immediately (e.g. javascript:, data:, vbscript:, file:)
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return null;
    }
  }

  const candidate = schemeMatch ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (!host) {
      return null;
    }
    if (blockPrivateHosts && isPrivateOrLocalHostname(host)) {
      return null;
    }
    if (!host.includes('.')) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Strips prototype-pollution keys when validating untrusted JSON imports.
 */
export function isSafePlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
