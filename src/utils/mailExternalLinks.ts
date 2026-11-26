/**
 * Shared pure utilities for external file links, direct inline media previews
 * (Imgur, direct images), and VZ Files (https://files.vz.gay) integration.
 *
 * Runs identically in Browser SPA, Cloudflare Worker, and Express dev server.
 */

import { escapeHtml, generateSecureId, sanitizeExternalUrl } from './mailSecurity.ts';

export type MailExternalLinkProvider =
  | 'vzfiles'
  | 'gdrive'
  | 'dropbox'
  | 'onedrive'
  | 'mega'
  | 'imgur'
  | 'direct_image'
  | 'direct_media'
  | 'generic';

export interface MailExternalLink {
  id: string;
  url: string;
  label: string;
  provider: MailExternalLinkProvider;
  /** Whether to render an inline <img> preview in email HTML & VZ Mail reader */
  renderInline: boolean;
  /** Direct image URL used for <img> preview when renderInline is true */
  directMediaUrl?: string;
  /** Optional human-readable file size badge (e.g. "24.8 MB") */
  sizeLabel?: string;
}

export const MAIL_EXTERNAL_LINKS_MAX_COUNT = 10;

const DIRECT_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
const DIRECT_MEDIA_EXT_RE =
  /\.(mp4|webm|mov|m4v|mp3|wav|ogg|pdf|zip|rar|7z|tar|gz|docx?|xlsx?|pptx?|csv|apk|dmg|iso)$/i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')]+/gi;

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export function buildVzFilesShareUrl(hash: string): string {
  const cleanHash = String(hash || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return cleanHash ? `https://files.vz.gay/?f=${encodeURIComponent(cleanHash)}` : 'https://files.vz.gay';
}

export function getExternalProviderDisplayName(provider: MailExternalLinkProvider): string {
  switch (provider) {
    case 'vzfiles':
      return 'VZ Files';
    case 'gdrive':
      return 'Google Drive';
    case 'dropbox':
      return 'Dropbox';
    case 'onedrive':
      return 'OneDrive';
    case 'mega':
      return 'MEGA';
    case 'imgur':
      return 'Imgur';
    case 'direct_image':
      return 'Direct Image';
    case 'direct_media':
      return 'Direct File';
    default:
      return 'External Link';
  }
}

function extractReadableFilenameFromUrl(parsed: URL, provider: MailExternalLinkProvider): string {
  const host = parsed.hostname.toLowerCase();
  if (provider === 'vzfiles') {
    const fParam = parsed.searchParams.get('f');
    if (fParam) return `VZ Files (${fParam.slice(0, 12)})`;
    const seg = parsed.pathname.split('/').filter(Boolean).pop();
    if (seg) return `VZ Files (${seg.slice(0, 12)})`;
    return 'VZ Files Share';
  }
  if (provider === 'gdrive') {
    return 'Google Drive File';
  }
  if (provider === 'dropbox') {
    const seg = parsed.pathname.split('/').filter(Boolean).pop();
    if (seg && seg.includes('.')) {
      try {
        return decodeURIComponent(seg).slice(0, 100);
      } catch {
        return seg.slice(0, 100);
      }
    }
    return 'Dropbox File';
  }
  if (provider === 'onedrive') {
    return 'OneDrive File';
  }
  if (provider === 'mega') {
    return 'MEGA File';
  }

  const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
  if (lastSegment) {
    try {
      const decoded = decodeURIComponent(lastSegment).trim();
      if (decoded && decoded.length <= 120) {
        return decoded;
      }
    } catch {
      // fallback to hostname
    }
  }
  return host;
}

/**
 * Validates, normalizes, and classifies an external file or direct media link.
 * Rejects dangerous URL schemes and private/internal hosts.
 */
export function normalizeAndClassifyExternalLink(
  rawUrl: string,
  options: {
    id?: string;
    label?: string;
    sizeLabel?: string;
    renderInlineOverride?: boolean;
  } = {}
): MailExternalLink | null {
  const safeUrl = sanitizeExternalUrl(rawUrl, {
    allowMailto: false,
    blockPrivateHosts: true,
  });
  if (!safeUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(safeUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  let provider: MailExternalLinkProvider = 'generic';
  let renderInline = false;
  let directMediaUrl: string | undefined;

  if (
    host === 'files.vz.gay' ||
    host === 'file.vz.gay' ||
    host === 'vikingfile.com' ||
    host.endsWith('.vikingfile.com')
  ) {
    provider = 'vzfiles';
  } else if (host === 'i.imgur.com' || host.endsWith('.imgur.com')) {
    provider = 'imgur';
    if (DIRECT_IMAGE_EXT_RE.test(pathname)) {
      renderInline = true;
      directMediaUrl = safeUrl;
    }
  } else if (host === 'imgur.com' || host === 'www.imgur.com') {
    provider = 'imgur';
    // Single-image Imgur page like https://imgur.com/AbCdEfG -> direct image preview hint
    const singleIdMatch = pathname.match(/^\/([a-zA-Z0-9]{5,10})\/?$/);
    if (singleIdMatch) {
      renderInline = true;
      directMediaUrl = `https://i.imgur.com/${singleIdMatch[1]}.png`;
    }
  } else if (DIRECT_IMAGE_EXT_RE.test(pathname)) {
    provider = 'direct_image';
    renderInline = true;
    directMediaUrl = safeUrl;
  } else if (
    host === 'drive.google.com' ||
    host === 'docs.google.com'
  ) {
    provider = 'gdrive';
  } else if (
    host === 'dropbox.com' ||
    host === 'www.dropbox.com' ||
    host === 'dl.dropboxusercontent.com'
  ) {
    provider = 'dropbox';
  } else if (
    host === 'onedrive.live.com' ||
    host === '1drv.ms' ||
    host.endsWith('.sharepoint.com')
  ) {
    provider = 'onedrive';
  } else if (host === 'mega.nz' || host === 'www.mega.nz') {
    provider = 'mega';
  } else if (DIRECT_MEDIA_EXT_RE.test(pathname)) {
    provider = 'direct_media';
  }

  if (typeof options.renderInlineOverride === 'boolean') {
    renderInline = Boolean(options.renderInlineOverride && directMediaUrl);
  }

  const cleanLabel = (options.label || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 140);

  const cleanSizeLabel = (options.sizeLabel || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 32);

  return {
    id:
      options.id && /^[a-zA-Z0-9_-]{3,64}$/.test(options.id)
        ? options.id
        : generateSecureId('ext'),
    url: safeUrl,
    label: cleanLabel || extractReadableFilenameFromUrl(parsed, provider),
    provider,
    renderInline,
    ...(directMediaUrl ? { directMediaUrl } : {}),
    ...(cleanSizeLabel ? { sizeLabel: cleanSizeLabel } : {}),
  };
}

/**
 * Sanitizes an untrusted array of external links (e.g., from API JSON payload or IndexedDB).
 */
export function sanitizeExternalLinksArray(raw: unknown): MailExternalLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: MailExternalLink[] = [];

  for (const item of raw) {
    if (result.length >= MAIL_EXTERNAL_LINKS_MAX_COUNT) break;
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.url !== 'string') continue;

    const normalized = normalizeAndClassifyExternalLink(obj.url, {
      id: typeof obj.id === 'string' ? obj.id : undefined,
      label: typeof obj.label === 'string' ? obj.label : undefined,
      sizeLabel: typeof obj.sizeLabel === 'string' ? obj.sizeLabel : undefined,
      renderInlineOverride:
        typeof obj.renderInline === 'boolean' ? obj.renderInline : undefined,
    });
    if (!normalized) continue;
    if (seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    result.push(normalized);
  }

  return result;
}

/**
 * Extracts direct image links (e.g., Imgur or direct .png/.jpg/.webp/.gif/.avif URLs)
 * mentioned inside a plain-text email body so VZ Mail can preview them inline automatically.
 */
export function extractInlineMediaLinksFromText(
  bodyText: string,
  existingLinks: readonly MailExternalLink[] = []
): MailExternalLink[] {
  if (!bodyText) return [];
  const existingUrls = new Set(existingLinks.map((l) => l.url));
  const found: MailExternalLink[] = [];
  const seen = new Set<string>();

  const matches = bodyText.match(URL_IN_TEXT_RE) || [];
  for (const rawMatch of matches) {
    if (found.length >= 6) break;
    // Strip trailing punctuation like .,;!)
    const cleaned = rawMatch.replace(/[.,;:!?)\]]+$/, '');
    const classified = normalizeAndClassifyExternalLink(cleaned);
    if (!classified || !classified.renderInline || !classified.directMediaUrl) {
      continue;
    }
    if (existingUrls.has(classified.url) || seen.has(classified.url)) {
      continue;
    }
    seen.add(classified.url);
    found.push(classified);
  }

  return found;
}

function linkifyEscapedTextSegment(segment: string): string {
  // Split while preserving http(s) URLs so each piece is safely escaped
  const parts: string[] = [];
  let lastIndex = 0;
  URL_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_IN_TEXT_RE.exec(segment)) !== null) {
    const rawUrl = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push(escapeHtml(segment.slice(lastIndex, start)));
    }
    const trimmedUrl = rawUrl.replace(/[.,;:!?)\]]+$/, '');
    const trailing = rawUrl.slice(trimmedUrl.length);
    const safeHref = sanitizeExternalUrl(trimmedUrl, {
      allowMailto: false,
      blockPrivateHosts: true,
    });
    if (safeHref) {
      parts.push(
        `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${escapeHtml(trimmedUrl)}</a>${escapeHtml(trailing)}`
      );
    } else {
      parts.push(escapeHtml(rawUrl));
    }
    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < segment.length) {
    parts.push(escapeHtml(segment.slice(lastIndex)));
  }

  return parts.join('');
}

/**
 * Builds clean, deliverability-friendly `textContent` and `htmlContent` for outbound email
 * (Brevo / Resend / cPanel / Cloudflare SEND_EMAIL), embedding direct image links inline
 * and rendering crisp clickable cards for VZ Files, Google Drive, Dropbox, and other links.
 */
export function buildOutboundEmailPayload(
  bodyText: string,
  rawExternalLinks: readonly MailExternalLink[] = []
): { textContent: string; htmlContent: string } {
  const externalLinks = sanitizeExternalLinksArray(rawExternalLinks);
  const autoInlineMedia = extractInlineMediaLinksFromText(bodyText, externalLinks);

  // 1. Plain-text version (mirrors links cleanly without duplication)
  const missingLinksInBody = externalLinks.filter((link) => !bodyText.includes(link.url));
  let textContent = bodyText.trim();
  if (missingLinksInBody.length > 0) {
    const lines = missingLinksInBody.map((link) => {
      const providerTag = getExternalProviderDisplayName(link.provider);
      const sizePart = link.sizeLabel ? ` (${link.sizeLabel})` : '';
      return `- [${providerTag}] ${link.label}${sizePart}: ${link.url}`;
    });
    textContent = `${textContent}\n\n---\nLampiran Tautan / File Eksternal:\n${lines.join('\n')}`;
  }

  // 2. Clean HTML paragraphs with auto-linked URLs
  const normalizedBody = bodyText.replace(/\r\n/g, '\n').trim();
  const paragraphsHtml = normalizedBody
    .split(/\n{2,}/)
    .map((para) => {
      const linesHtml = para
        .split('\n')
        .map((line) => linkifyEscapedTextSegment(line))
        .join('<br />');
      return `<p style="margin:0 0 14px 0;line-height:1.65;color:#0f172a;">${linesHtml}</p>`;
    })
    .join('');

  // 3. Inline Direct Images (from attached externalLinks + direct image URLs found in bodyText)
  const inlineImages = [
    ...externalLinks.filter((l) => l.renderInline && l.directMediaUrl),
    ...autoInlineMedia,
  ];
  const cardLinks = externalLinks.filter((l) => !(l.renderInline && l.directMediaUrl));

  const inlineImagesHtml =
    inlineImages.length > 0
      ? `<div style="margin:18px 0 12px 0;">${inlineImages
          .map((img) => {
            const safeSrc = escapeHtml(img.directMediaUrl || img.url);
            const safeHref = escapeHtml(img.url);
            const safeLabel = escapeHtml(img.label);
            const safeBadge = escapeHtml(getExternalProviderDisplayName(img.provider));
            return `<div style="margin:0 0 14px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#f8fafc;">
  <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
    <img src="${safeSrc}" alt="${safeLabel}" style="display:block;max-width:100%;height:auto;max-height:480px;margin:0 auto;" />
  </a>
  <div style="padding:8px 12px;font-size:12px;color:#475569;border-top:1px solid #e2e8f0;background:#ffffff;">
    <strong style="color:#0f172a;">${safeLabel}</strong> &middot; ${safeBadge} &middot; <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">Buka gambar penuh</a>
  </div>
</div>`;
          })
          .join('')}</div>`
      : '';

  const cardsHtml =
    cardLinks.length > 0
      ? `<div style="margin:18px 0 8px 0;padding-top:14px;border-top:1px solid #e2e8f0;">
  <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.04em;">Tautan File &amp; Cloud</div>
  ${cardLinks
    .map((link) => {
      const safeHref = escapeHtml(link.url);
      const safeLabel = escapeHtml(link.label);
      const safeProvider = escapeHtml(getExternalProviderDisplayName(link.provider));
      const sizeSuffix = link.sizeLabel ? ` &middot; ${escapeHtml(link.sizeLabel)}` : '';
      const accentBg = link.provider === 'vzfiles' ? '#eff6ff' : '#f8fafc';
      const accentBorder = link.provider === 'vzfiles' ? '#bfdbfe' : '#e2e8f0';
      const ctaText =
        link.provider === 'vzfiles'
          ? 'Unduh di VZ Files'
          : link.provider === 'gdrive'
            ? 'Buka di Google Drive'
            : 'Buka Tautan';
      return `<div style="margin:0 0 10px 0;padding:12px 14px;border:1px solid ${accentBorder};border-radius:10px;background:${accentBg};">
    <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px;">${safeLabel}</div>
    <div style="font-size:11px;color:#64748b;margin-bottom:8px;word-break:break-all;">${safeProvider}${sizeSuffix} &middot; ${safeHref}</div>
    <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:6px 12px;background:#2563eb;color:#ffffff;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;">${ctaText} &rarr;</a>
  </div>`;
    })
    .join('')}
</div>`
      : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:20px 16px;">
    ${paragraphsHtml}
    ${inlineImagesHtml}
    ${cardsHtml}
  </div>
</body>
</html>`;

  return { textContent, htmlContent };
}

/**
 * Strict allowlist validators for the VZ Files (VikingFile) same-origin proxy
 * to prevent SSRF attacks (mirrors nabhan-rp/vzfiles security model).
 */
export function isAllowedVikingServerUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'vikingfile.com' ||
        parsed.hostname.endsWith('.vikingfile.com'))
    );
  } catch {
    return false;
  }
}

export function isAllowedVikingPartUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    if (
      host === 'vikingfile.com' ||
      host.endsWith('.vikingfile.com') ||
      host.endsWith('.io.cloud.ovh.net')
    ) {
      return true;
    }
    return (
      parsed.searchParams.has('X-Amz-Signature') &&
      parsed.searchParams.has('uploadId') &&
      parsed.searchParams.has('partNumber')
    );
  } catch {
    return false;
  }
}
