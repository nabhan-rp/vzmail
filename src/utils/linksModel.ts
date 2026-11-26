import { sanitizeHandle } from './mailIdentity.ts';
import { isValidEmailAddress, sanitizeExternalUrl, sanitizeSlug } from './mailSecurity.ts';

export type SocialPlatformId =
  | 'instagram'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'facebook'
  | 'linkedin'
  | 'github'
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'spotify'
  | 'twitch'
  | 'dribbble'
  | 'website'
  | 'email';

export interface SocialPlatformMeta {
  id: SocialPlatformId;
  label: string;
  placeholder: string;
  allowMailto?: boolean;
}

export const SOCIAL_PLATFORMS: readonly SocialPlatformMeta[] = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/username' },
  { id: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/username' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@username' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@channel' },
  { id: 'threads', label: 'Threads', placeholder: 'https://threads.net/@username' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/username' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
  { id: 'github', label: 'GitHub', placeholder: 'https://github.com/username' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/6281234567890' },
  { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/username' },
  { id: 'discord', label: 'Discord', placeholder: 'https://discord.gg/invite' },
  { id: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/...' },
  { id: 'twitch', label: 'Twitch', placeholder: 'https://twitch.tv/username' },
  { id: 'dribbble', label: 'Dribbble / Portfolio', placeholder: 'https://dribbble.com/username' },
  { id: 'website', label: 'Website', placeholder: 'https://yourdomain.com' },
  { id: 'email', label: 'Email', placeholder: 'mailto:you@imy.li', allowMailto: true },
] as const;

export type BioThemeId =
  | 'clean_light'
  | 'midnight_slate'
  | 'cobalt_ocean'
  | 'violet_studio'
  | 'emerald_forest'
  | 'warm_sand';

export type BioButtonStyle = 'rounded' | 'sharp' | 'outline';

export interface BioThemeDefinition {
  id: BioThemeId;
  name: string;
  swatchHex: string;
  pageBgClass: string;
  cardClass: string;
  titleClass: string;
  bodyClass: string;
  mutedClass: string;
  avatarClass: string;
  socialBtnClass: string;
  linkSolidClass: string;
  linkOutlineClass: string;
  dividerClass: string;
}

export const BIO_THEMES: Record<BioThemeId, BioThemeDefinition> = {
  clean_light: {
    id: 'clean_light',
    name: 'Clean Light',
    swatchHex: '#F8FAFC',
    pageBgClass: 'bg-slate-50 text-slate-900',
    cardClass: 'bg-white border-slate-200 text-slate-900',
    titleClass: 'text-slate-900',
    bodyClass: 'text-slate-600',
    mutedClass: 'text-slate-500',
    avatarClass: 'bg-slate-900 text-white',
    socialBtnClass:
      'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200',
    linkSolidClass:
      'bg-slate-900 hover:bg-slate-800 text-white border-slate-900',
    linkOutlineClass:
      'bg-white hover:bg-slate-50 text-slate-900 border-slate-300',
    dividerClass: 'border-slate-200',
  },
  midnight_slate: {
    id: 'midnight_slate',
    name: 'Midnight Slate',
    swatchHex: '#0F172A',
    pageBgClass: 'bg-[#0B0D11] text-slate-100',
    cardClass: 'bg-[#13161D] border-[#232834] text-slate-100',
    titleClass: 'text-white',
    bodyClass: 'text-slate-300',
    mutedClass: 'text-slate-400',
    avatarClass: 'bg-slate-800 text-white border border-slate-700',
    socialBtnClass:
      'bg-[#1B202B] hover:bg-[#252C3B] text-slate-100 border-[#2A3142]',
    linkSolidClass:
      'bg-[#1B202B] hover:bg-[#242B3A] text-white border-[#2C3446]',
    linkOutlineClass:
      'bg-transparent hover:bg-[#191E28] text-slate-100 border-slate-600',
    dividerClass: 'border-[#232834]',
  },
  cobalt_ocean: {
    id: 'cobalt_ocean',
    name: 'Cobalt Ocean',
    swatchHex: '#2563EB',
    pageBgClass: 'bg-[#091224] text-slate-100',
    cardClass: 'bg-[#0F1B33] border-[#1E335A] text-slate-100',
    titleClass: 'text-white',
    bodyClass: 'text-blue-100/80',
    mutedClass: 'text-blue-200/60',
    avatarClass: 'bg-blue-600 text-white',
    socialBtnClass:
      'bg-blue-950/80 hover:bg-blue-900 text-blue-100 border-blue-800/70',
    linkSolidClass:
      'bg-blue-600 hover:bg-blue-500 text-white border-blue-500',
    linkOutlineClass:
      'bg-transparent hover:bg-blue-950/70 text-blue-100 border-blue-400/50',
    dividerClass: 'border-blue-900/60',
  },
  violet_studio: {
    id: 'violet_studio',
    name: 'Violet Studio',
    swatchHex: '#7C3AED',
    pageBgClass: 'bg-[#120D1F] text-slate-100',
    cardClass: 'bg-[#1A132B] border-[#2E224B] text-slate-100',
    titleClass: 'text-white',
    bodyClass: 'text-violet-100/80',
    mutedClass: 'text-violet-200/60',
    avatarClass: 'bg-violet-600 text-white',
    socialBtnClass:
      'bg-violet-950/80 hover:bg-violet-900 text-violet-100 border-violet-800/70',
    linkSolidClass:
      'bg-violet-600 hover:bg-violet-500 text-white border-violet-500',
    linkOutlineClass:
      'bg-transparent hover:bg-violet-950/70 text-violet-100 border-violet-400/50',
    dividerClass: 'border-violet-900/60',
  },
  emerald_forest: {
    id: 'emerald_forest',
    name: 'Emerald Forest',
    swatchHex: '#059669',
    pageBgClass: 'bg-[#081712] text-emerald-50',
    cardClass: 'bg-[#0E231C] border-[#1A3D31] text-emerald-50',
    titleClass: 'text-white',
    bodyClass: 'text-emerald-100/80',
    mutedClass: 'text-emerald-200/60',
    avatarClass: 'bg-emerald-600 text-white',
    socialBtnClass:
      'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-100 border-emerald-800/70',
    linkSolidClass:
      'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500',
    linkOutlineClass:
      'bg-transparent hover:bg-emerald-950/70 text-emerald-100 border-emerald-400/50',
    dividerClass: 'border-emerald-900/60',
  },
  warm_sand: {
    id: 'warm_sand',
    name: 'Warm Sand',
    swatchHex: '#D97706',
    pageBgClass: 'bg-[#FAF6F0] text-stone-900',
    cardClass: 'bg-[#FFFDF9] border-stone-200 text-stone-900',
    titleClass: 'text-stone-900',
    bodyClass: 'text-stone-600',
    mutedClass: 'text-stone-500',
    avatarClass: 'bg-amber-700 text-white',
    socialBtnClass:
      'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-200',
    linkSolidClass:
      'bg-stone-900 hover:bg-stone-800 text-amber-50 border-stone-900',
    linkOutlineClass:
      'bg-transparent hover:bg-stone-100 text-stone-900 border-stone-400',
    dividerClass: 'border-stone-200',
  },
};

export type QrDotStyle = 'square' | 'rounded' | 'dots' | 'classy';
export type QrCornerStyle = 'square' | 'rounded' | 'dot';
export type QrFrameStyle = 'none' | 'bottom_bar' | 'card';
export type QrCenterLogoMode = 'none' | 'bio_avatar' | 'monogram';

export interface BioQrDesignConfig {
  fgColor: string;
  bgColor: string;
  dotStyle: QrDotStyle;
  cornerStyle: QrCornerStyle;
  frameStyle: QrFrameStyle;
  frameText: string;
  frameColor: string;
  frameTextColor: string;
  centerLogoMode: QrCenterLogoMode;
}

export interface BioQrPreset {
  id: string;
  name: string;
  design: Omit<BioQrDesignConfig, 'frameText' | 'centerLogoMode'>;
}

export const DEFAULT_BIO_QR_DESIGN: BioQrDesignConfig = {
  fgColor: '#0F172A',
  bgColor: '#FFFFFF',
  dotStyle: 'rounded',
  cornerStyle: 'rounded',
  frameStyle: 'bottom_bar',
  frameText: 'SCAN TO OPEN',
  frameColor: '#0F172A',
  frameTextColor: '#FFFFFF',
  centerLogoMode: 'bio_avatar',
};

export const BIO_QR_PRESETS: readonly BioQrPreset[] = [
  {
    id: 'classic_ink',
    name: 'Classic Ink',
    design: {
      fgColor: '#0F172A',
      bgColor: '#FFFFFF',
      dotStyle: 'rounded',
      cornerStyle: 'rounded',
      frameStyle: 'bottom_bar',
      frameColor: '#0F172A',
      frameTextColor: '#FFFFFF',
    },
  },
  {
    id: 'cobalt_pulse',
    name: 'Cobalt Pulse',
    design: {
      fgColor: '#1D4ED8',
      bgColor: '#FFFFFF',
      dotStyle: 'dots',
      cornerStyle: 'rounded',
      frameStyle: 'bottom_bar',
      frameColor: '#1D4ED8',
      frameTextColor: '#FFFFFF',
    },
  },
  {
    id: 'violet_studio',
    name: 'Violet Studio',
    design: {
      fgColor: '#5B21B6',
      bgColor: '#FAF5FF',
      dotStyle: 'classy',
      cornerStyle: 'dot',
      frameStyle: 'card',
      frameColor: '#5B21B6',
      frameTextColor: '#FFFFFF',
    },
  },
  {
    id: 'emerald_mint',
    name: 'Emerald Mint',
    design: {
      fgColor: '#065F46',
      bgColor: '#FFFFFF',
      dotStyle: 'rounded',
      cornerStyle: 'dot',
      frameStyle: 'bottom_bar',
      frameColor: '#065F46',
      frameTextColor: '#FFFFFF',
    },
  },
  {
    id: 'warm_espresso',
    name: 'Warm Espresso',
    design: {
      fgColor: '#451A03',
      bgColor: '#FFFBEB',
      dotStyle: 'classy',
      cornerStyle: 'rounded',
      frameStyle: 'card',
      frameColor: '#78350F',
      frameTextColor: '#FEF3C7',
    },
  },
  {
    id: 'obsidian_dark',
    name: 'Obsidian Dark',
    design: {
      fgColor: '#F8FAFC',
      bgColor: '#0F172A',
      dotStyle: 'square',
      cornerStyle: 'square',
      frameStyle: 'bottom_bar',
      frameColor: '#1E293B',
      frameTextColor: '#F8FAFC',
    },
  },
] as const;

export function getDefaultQrDesignForTheme(
  themeId: BioThemeId,
  defaultLabel = 'SCAN TO OPEN'
): BioQrDesignConfig {
  const safeLabel = defaultLabel.trim().slice(0, 42) || 'SCAN TO OPEN';
  switch (themeId) {
    case 'cobalt_ocean':
      return {
        ...DEFAULT_BIO_QR_DESIGN,
        ...BIO_QR_PRESETS[1].design,
        frameText: safeLabel,
      };
    case 'violet_studio':
      return {
        ...DEFAULT_BIO_QR_DESIGN,
        ...BIO_QR_PRESETS[2].design,
        frameText: safeLabel,
      };
    case 'emerald_forest':
      return {
        ...DEFAULT_BIO_QR_DESIGN,
        ...BIO_QR_PRESETS[3].design,
        frameText: safeLabel,
      };
    case 'warm_sand':
      return {
        ...DEFAULT_BIO_QR_DESIGN,
        ...BIO_QR_PRESETS[4].design,
        frameText: safeLabel,
      };
    case 'clean_light':
    case 'midnight_slate':
    default:
      return {
        ...DEFAULT_BIO_QR_DESIGN,
        frameText: safeLabel,
      };
  }
}

export function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function sanitizeBioQrDesign(
  raw: unknown,
  fallback: BioQrDesignConfig = DEFAULT_BIO_QR_DESIGN
): BioQrDesignConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }
  const obj = raw as Record<string, unknown>;
  const dotStyle: QrDotStyle =
    obj.dotStyle === 'square' ||
    obj.dotStyle === 'rounded' ||
    obj.dotStyle === 'dots' ||
    obj.dotStyle === 'classy'
      ? obj.dotStyle
      : fallback.dotStyle;

  const cornerStyle: QrCornerStyle =
    obj.cornerStyle === 'square' ||
    obj.cornerStyle === 'rounded' ||
    obj.cornerStyle === 'dot'
      ? obj.cornerStyle
      : fallback.cornerStyle;

  const frameStyle: QrFrameStyle =
    obj.frameStyle === 'none' ||
    obj.frameStyle === 'bottom_bar' ||
    obj.frameStyle === 'card'
      ? obj.frameStyle
      : fallback.frameStyle;

  const centerLogoMode: QrCenterLogoMode =
    obj.centerLogoMode === 'none' ||
    obj.centerLogoMode === 'bio_avatar' ||
    obj.centerLogoMode === 'monogram'
      ? obj.centerLogoMode
      : fallback.centerLogoMode;

  const rawText =
    typeof obj.frameText === 'string'
      ? obj.frameText.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 42)
      : fallback.frameText;

  return {
    fgColor: sanitizeHexColor(obj.fgColor, fallback.fgColor),
    bgColor: sanitizeHexColor(obj.bgColor, fallback.bgColor),
    dotStyle,
    cornerStyle,
    frameStyle,
    frameText: rawText,
    frameColor: sanitizeHexColor(obj.frameColor, fallback.frameColor),
    frameTextColor: sanitizeHexColor(obj.frameTextColor, fallback.frameTextColor),
    centerLogoMode,
  };
}

export interface BioLinkItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  sortOrder: number;
  enabled: boolean;
  clicks: number;
}

export interface BioPageRecord {
  id: string;
  pageSlug: string; // "" for root ($USERNAME.imy.li), or e.g. "promo" ($USERNAME.imy.li/promo)
  title: string;
  description: string;
  avatarUrl: string; // Optional per-subpage override ("": inherit main bio avatar)
  themeId: BioThemeId;
  buttonStyle: BioButtonStyle;
  showSocials: boolean;
  isPublished: boolean;
  qrDesign?: BioQrDesignConfig;
  links: BioLinkItem[];
  updatedAt: string;
}

export interface BioWorkspaceData {
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  socials: Partial<Record<SocialPlatformId, string>>;
  pages: BioPageRecord[];
  isDeactivated?: boolean;
  deactivatedAt?: string | null;
  updatedAt: string;
  configured: boolean;
}

export interface BioDeleteCooldownInfo {
  active: boolean;
  deletedAt: string | null;
  unlockAt: string | null;
  remainingMs: number;
}

export type RecycleBinItemType = 'bio_link' | 'bio_page' | 'shortlink';

export interface RecycleBinRecord {
  id: string;
  ownerUser: string;
  itemType: RecycleBinItemType;
  label: string;
  summary: string;
  payload: Record<string, unknown>;
  deletedAt: string;
  expiresAt: string;
}

export const BIO_DELETE_COOLDOWN_DAYS = 3;
export const BIO_DELETE_COOLDOWN_SECONDS = BIO_DELETE_COOLDOWN_DAYS * 24 * 60 * 60;
export const BIO_DELETE_COOLDOWN_MS = BIO_DELETE_COOLDOWN_SECONDS * 1000;

export const RECYCLE_BIN_RETENTION_DAYS = 14;
export const RECYCLE_BIN_TTL_SECONDS = RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60;
export const RECYCLE_BIN_RETENTION_MS = RECYCLE_BIN_TTL_SECONDS * 1000;

export interface ShortlinkRecord {
  slug: string;
  ownerUser: string | null;
  title: string;
  targetUrl: string;
  isCustomSlug: boolean;
  clicks: number;
  createdAt: string;
  lastClickedAt: string | null;
}

export const RESERVED_PAGE_SLUGS = new Set([
  'api',
  's',
  'assets',
  'icons',
  'links',
  'mail',
  'auth',
  'admin',
  'login',
  'logout',
  'terms',
  'privacy',
  'legal',
  'sw.js',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'manifest.webmanifest',
]);

export function isValidBioThemeId(val: unknown): val is BioThemeId {
  return typeof val === 'string' && val in BIO_THEMES;
}

export function isValidButtonStyle(val: unknown): val is BioButtonStyle {
  return val === 'rounded' || val === 'sharp' || val === 'outline';
}

export function sanitizePageSlug(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-_]/g, '');
  if (!cleaned) return '';
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (RESERVED_PAGE_SLUGS.has(cleaned)) return null;
  return cleaned;
}

export function normalizeSocialUrl(
  platform: SocialPlatformId,
  rawValue: string
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (platform === 'email') {
    const cleanEmail = trimmed.replace(/^mailto:/i, '').trim().toLowerCase();
    if (isValidEmailAddress(cleanEmail)) {
      return `mailto:${cleanEmail}`;
    }
    return null;
  }

  const withProtocol =
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  return sanitizeExternalUrl(withProtocol, {
    allowMailto: false,
    blockPrivateHosts: true,
  });
}

export function sanitizeSocialsMap(
  raw: unknown
): Partial<Record<SocialPlatformId, string>> {
  const result: Partial<Record<SocialPlatformId, string>> = {};
  if (!raw || typeof raw !== 'object') return result;

  for (const platform of SOCIAL_PLATFORMS) {
    const val = (raw as Record<string, unknown>)[platform.id];
    if (typeof val === 'string' && val.trim()) {
      const normalized = normalizeSocialUrl(platform.id, val);
      if (normalized) {
        result[platform.id] = normalized;
      }
    }
  }
  return result;
}

export function generateShortlinkCode(length = 6): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export function sanitizeShortlinkSlugInput(raw: string): string | null {
  const cleaned = sanitizeSlug(raw);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 48) return null;
  if (RESERVED_PAGE_SLUGS.has(cleaned)) return null;
  return cleaned;
}

export const AVATAR_MAX_BYTES = 128 * 1024; // 128 KB strict ceiling for 256x256 AVIF/WebP avatars

/**
 * Validates binary magic bytes strictly for AVIF (ISO BMFF ftyp box with avif/avis brand)
 * or WebP (RIFF....WEBP) so SVG, HTML, or arbitrary uploads are always rejected.
 */
export function detectValidatedAvatarMime(
  bytes: Uint8Array
): 'image/avif' | 'image/webp' | null {
  if (!bytes || bytes.byteLength < 12 || bytes.byteLength > AVATAR_MAX_BYTES) {
    return null;
  }

  // Check WebP: "RIFF" (0..3) and "WEBP" (8..11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // Check AVIF: ISO BMFF box size (0..3) + "ftyp" (4..7) + brand containing "avif" or "avis"
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const boxSize = Math.min(
      bytes.byteLength,
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0 || 64
    );
    const scanEnd = Math.min(bytes.byteLength, Math.max(16, Math.min(boxSize, 128)));
    let ascii = '';
    for (let i = 8; i < scanEnd; i += 1) {
      ascii += String.fromCharCode(bytes[i]);
    }
    if (ascii.includes('avif') || ascii.includes('avis')) {
      return 'image/avif';
    }
  }

  return null;
}

/**
 * Allows either our own `/api/links/avatar/...` binary URL or a validated public https:// image URL.
 */
export function sanitizeBioAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^\/api\/links\/avatar\/[a-z0-9._-]+(?:\/[a-z0-9_-]+)?(?:\?v=[a-zA-Z0-9_-]+)?$/i.test(trimmed)) {
    return trimmed;
  }
  return (
    sanitizeExternalUrl(trimmed, {
      allowMailto: false,
      blockPrivateHosts: true,
    }) || ''
  );
}

export function createEmptyBioWorkspace(
  rawUsername: string,
  defaults?: { displayName?: string }
): BioWorkspaceData {
  const username = sanitizeHandle(rawUsername);
  const now = new Date().toISOString();
  return {
    username,
    displayName: defaults?.displayName?.trim() || username,
    headline: '',
    bio: '',
    avatarUrl: '', // Dedicated Bio avatar only — never auto-copied from SSO account picture
    socials: {},
    pages: [
      {
        id: `page-${username}-root`,
        pageSlug: '',
        title: defaults?.displayName?.trim() || username,
        description: '',
        avatarUrl: '',
        themeId: 'midnight_slate',
        buttonStyle: 'rounded',
        showSocials: true,
        isPublished: true,
        links: [],
        updatedAt: now,
      },
    ],
    isDeactivated: false,
    deactivatedAt: null,
    updatedAt: now,
    configured: false,
  };
}

export function sanitizeBioWorkspaceInput(
  rawUsername: string,
  input: unknown,
  existingClicksByLinkId?: Map<string, number>
): BioWorkspaceData {
  const username = sanitizeHandle(rawUsername);
  const now = new Date().toISOString();
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  const displayName = String(obj.displayName || username).trim().slice(0, 80) || username;
  const headline = String(obj.headline || '').trim().slice(0, 120);
  const bio = String(obj.bio || '').trim().slice(0, 400);
  const safeAvatar = sanitizeBioAvatarUrl(obj.avatarUrl);
  const socials = sanitizeSocialsMap(obj.socials);

  const rawPages = Array.isArray(obj.pages) ? obj.pages : [];
  const seenSlugs = new Set<string>();
  const cleanPages: BioPageRecord[] = [];

  for (const rawPage of rawPages.slice(0, 25)) {
    if (!rawPage || typeof rawPage !== 'object') continue;
    const p = rawPage as Record<string, unknown>;
    const normalizedSlug = sanitizePageSlug(String(p.pageSlug || ''));
    if (normalizedSlug === null || seenSlugs.has(normalizedSlug)) continue;
    seenSlugs.add(normalizedSlug);

    const pageId =
      typeof p.id === 'string' && p.id.trim()
        ? p.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
        : `page-${username}-${normalizedSlug || 'root'}`;

    const rawLinks = Array.isArray(p.links) ? p.links : [];
    const cleanLinks: BioLinkItem[] = [];
    for (let idx = 0; idx < rawLinks.length && cleanLinks.length < 50; idx += 1) {
      const l = rawLinks[idx];
      if (!l || typeof l !== 'object') continue;
      const item = l as Record<string, unknown>;
      const rawUrl = String(item.url || '').trim();
      const safeUrl = sanitizeExternalUrl(
        /^https?:\/\/|^mailto:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
        { allowMailto: true, blockPrivateHosts: true }
      );
      const title = String(item.title || '').trim().slice(0, 100);
      if (!title || !safeUrl) continue;
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
          : `lnk-${idx}-${Date.now().toString(36)}`;
      const preservedClicks = existingClicksByLinkId?.get(id);
      cleanLinks.push({
        id,
        title,
        subtitle: String(item.subtitle || '').trim().slice(0, 140),
        url: safeUrl,
        sortOrder: cleanLinks.length,
        enabled: item.enabled !== false,
        clicks:
          typeof preservedClicks === 'number'
            ? preservedClicks
            : Math.max(0, Number(item.clicks) || 0),
      });
    }

    const themeId: BioThemeId = isValidBioThemeId(p.themeId) ? p.themeId : 'midnight_slate';
    const rawQrDesign = p.qrDesign && typeof p.qrDesign === 'object' ? p.qrDesign : null;
    const sanitizedQrDesign = rawQrDesign
      ? sanitizeBioQrDesign(
          rawQrDesign,
          getDefaultQrDesignForTheme(
            themeId,
            normalizedSlug ? `${username}.imy.li/${normalizedSlug}` : `${username}.imy.li`
          )
        )
      : undefined;

    cleanPages.push({
      id: pageId,
      pageSlug: normalizedSlug,
      title: String(p.title || (normalizedSlug ? `/${normalizedSlug}` : displayName))
        .trim()
        .slice(0, 80),
      description: String(p.description || '').trim().slice(0, 260),
      avatarUrl: normalizedSlug === '' ? '' : sanitizeBioAvatarUrl(p.avatarUrl),
      themeId,
      buttonStyle: isValidButtonStyle(p.buttonStyle) ? p.buttonStyle : 'rounded',
      showSocials: p.showSocials !== false,
      isPublished: p.isPublished !== false,
      ...(sanitizedQrDesign ? { qrDesign: sanitizedQrDesign } : {}),
      links: cleanLinks,
      updatedAt: now,
    });
  }

  // Always guarantee root page ("") exists first
  if (!seenSlugs.has('')) {
    cleanPages.unshift({
      id: `page-${username}-root`,
      pageSlug: '',
      title: displayName,
      description: '',
      avatarUrl: '',
      themeId: 'midnight_slate',
      buttonStyle: 'rounded',
      showSocials: true,
      isPublished: true,
      links: [],
      updatedAt: now,
    });
  } else {
    cleanPages.sort((a, b) => (a.pageSlug === '' ? -1 : b.pageSlug === '' ? 1 : 0));
  }

  const isDeactivated = obj.isDeactivated === true;
  const deactivatedAt =
    isDeactivated && typeof obj.deactivatedAt === 'string' && obj.deactivatedAt.trim()
      ? obj.deactivatedAt.trim().slice(0, 64)
      : isDeactivated
        ? now
        : null;

  return {
    username,
    displayName,
    headline,
    bio,
    avatarUrl: safeAvatar,
    socials,
    pages: cleanPages,
    isDeactivated,
    deactivatedAt,
    updatedAt: now,
    configured: true,
  };
}
