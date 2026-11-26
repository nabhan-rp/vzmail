/**
 * Client-side payload builders and WCAG contrast helpers for VZ Links & VZ Mail QR Codes.
 * Pure client-side — zero external API calls.
 */

export function buildMailtoPayload(params: {
  email: string;
  subject?: string;
  body?: string;
}): string {
  const cleanEmail = params.email.trim();
  const queryParts: string[] = [];
  const subj = (params.subject || '').trim();
  const body = (params.body || '').trim();
  if (subj) {
    queryParts.push(`subject=${encodeURIComponent(subj)}`);
  }
  if (body) {
    queryParts.push(`body=${encodeURIComponent(body)}`);
  }
  return queryParts.length > 0
    ? `mailto:${cleanEmail}?${queryParts.join('&')}`
    : `mailto:${cleanEmail}`;
}

function escapeVCardText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

export function buildVCardPayload(params: {
  fullName: string;
  email: string;
  bioUrl?: string;
  note?: string;
}): string {
  const safeName = escapeVCardText(params.fullName || params.email.split('@')[0] || 'VZ Contact');
  const safeEmail = params.email.trim();
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${safeName}`,
    `N:;${safeName};;;`,
    `EMAIL;TYPE=INTERNET:${safeEmail}`,
  ];
  const safeUrl = (params.bioUrl || '').trim();
  if (safeUrl && /^https?:\/\//i.test(safeUrl)) {
    lines.push(`URL:${safeUrl}`);
  }
  const safeNote = escapeVCardText(params.note || '');
  if (safeNote) {
    lines.push(`NOTE:${safeNote}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(normalized, 16);
  if (Number.isNaN(num)) return [15, 23, 42];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getQrContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function sanitizeDownloadFilename(raw: string, ext: 'png' | 'svg'): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${cleaned || 'vz-qr-code'}.${ext}`;
}
