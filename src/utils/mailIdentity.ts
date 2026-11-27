export interface MailDomainOption {
  domain: string;
  tld: string;
  status: 'active' | 'ready_to_add' | 'coming_soon';
  isPrimaryDefault: boolean;
  registryLabel: string;
  deliverabilityNote: {
    id: string;
    en: string;
  };
  supportsBioSubdomain: boolean;
  supportsShortlinkPath: boolean;
  addedAt: string;
}

export interface ResolvedEmailIdentity {
  rawInput: string;
  isValid: boolean;
  localPart: string;
  baseUsername: string;
  canonicalUsername: string;
  plusTag: string | null;
  dotCount: number;
  domain: string;
  canonicalEmail: string;
  pairedBioDomain: string;
  shortlinkPrefix: string;
  isSupportedDomain: boolean;
}

export const DEFAULT_SUPPORTED_DOMAINS = [
  'imy.li',
  'vz.gay',
  'mail.vz.gay',
  'imy.pw',
] as const;

export const INITIAL_MAIL_DOMAINS: MailDomainOption[] = [
  {
    domain: 'imy.li',
    tld: '.li',
    status: 'active',
    isPrimaryDefault: true,
    registryLabel: 'SWITCH Registry (Liechtenstein ccTLD)',
    deliverabilityNote: {
      id: 'Domain utama produksi saat ini. Reputasi bersih, mendukung $USERNAME@imy.li, bio $USERNAME.imy.li, dan shortlink imy.li/s/$URL.',
      en: 'Active primary production domain. Clean deliverability supporting $USERNAME@imy.li, $USERNAME.imy.li bio, and imy.li/s/$URL shortlinks.',
    },
    supportsBioSubdomain: true,
    supportsShortlinkPath: true,
    addedAt: '2026-11-24',
  },
  {
    domain: 'vz.gay',
    tld: '.gay',
    status: 'ready_to_add',
    isPrimaryDefault: false,
    registryLabel: 'Ecosystem Root Domain (vz.gay)',
    deliverabilityNote: {
      id: 'Siap diaktifkan sewaktu-waktu dari konsol Worker seiring ekspansi kapasitas produksi.',
      en: 'Ready to enable anytime from the Worker console as production capacity expands.',
    },
    supportsBioSubdomain: false,
    supportsShortlinkPath: false,
    addedAt: '2026-11-24',
  },
  {
    domain: 'mail.vz.gay',
    tld: '.vz.gay',
    status: 'ready_to_add',
    isPrimaryDefault: false,
    registryLabel: 'VZ Mail Dedicated Subdomain',
    deliverabilityNote: {
      id: 'Subdomain khusus infrastruktur webmail & relay worker.',
      en: 'Dedicated webmail infrastructure and worker relay subdomain.',
    },
    supportsBioSubdomain: false,
    supportsShortlinkPath: false,
    addedAt: '2026-11-24',
  },
  {
    domain: 'imy.pw',
    tld: '.pw',
    status: 'ready_to_add',
    isPrimaryDefault: false,
    registryLabel: 'Optional Secondary Alias Domain (.pw)',
    deliverabilityNote: {
      id: 'Cadangan domain pendek 5 huruf untuk ekspansi alias masa depan dengan DMARC p=reject.',
      en: 'Optional 5-letter short alias domain reserved for future expansion with strict DMARC p=reject.',
    },
    supportsBioSubdomain: true,
    supportsShortlinkPath: true,
    addedAt: '2026-11-24',
  },
];

/**
 * Normalizes a handle to lowercase DNS-safe alphanumeric characters (max 63 chars).
 */
export function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 63);
  return cleaned || 'fadhil';
}

/**
 * Validates a domain name (e.g. imy.li, brand.pm).
 */
export function sanitizeDomain(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

  if (
    !cleaned ||
    cleaned.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      cleaned
    )
  ) {
    return null;
  }
  return cleaned;
}

/**
 * Resolves any Gmail-style `.` or `+` variation on @imy.li (or other active domains)
 * into its single canonical mailbox owner (`$USERNAME@imy.li`).
 *
 * Examples:
 * - `fadhil@imy.li` -> canonical `fadhil@imy.li`, plusTag: null
 * - `fa.dhil@imy.li` -> canonical `fadhil@imy.li`, dotCount: 1
 * - `f.a.d.h.i.l+github@imy.li` -> canonical `fadhil@imy.li`, plusTag: 'github', dotCount: 5
 */
export function resolveCanonicalEmail(
  rawEmail: string,
  activeDomains: readonly string[] = ['imy.li']
): ResolvedEmailIdentity {
  const angleMatch = rawEmail.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const extracted = angleMatch ? angleMatch[1] : rawEmail;
  const trimmed = extracted.trim().replace(/^<+|>+$/g, '').toLowerCase().slice(0, 254);
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    const fallbackUser = sanitizeHandle(trimmed || 'fadhil');
    return {
      rawInput: rawEmail,
      isValid: false,
      localPart: trimmed,
      baseUsername: fallbackUser,
      canonicalUsername: fallbackUser,
      plusTag: null,
      dotCount: 0,
      domain: 'imy.li',
      canonicalEmail: `${fallbackUser}@imy.li`,
      pairedBioDomain: `${fallbackUser}.imy.li`,
      shortlinkPrefix: 'imy.li/s/',
      isSupportedDomain: false,
    };
  }

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  const plusIndex = localPart.indexOf('+');
  const baseUsername = plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
  const plusTagRaw = plusIndex >= 0 ? localPart.slice(plusIndex + 1) : null;
  const plusTag = plusTagRaw
    ? plusTagRaw.replace(/[^a-z0-9._-]/g, '').slice(0, 48)
    : null;

  const dotMatches = baseUsername.match(/\./g);
  const dotCount = dotMatches ? dotMatches.length : 0;

  const canonicalUsername = baseUsername
    .replace(/\./g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 63);
  const isValidLocal =
    canonicalUsername.length >= 2 &&
    !baseUsername.startsWith('.') &&
    !baseUsername.endsWith('.') &&
    !baseUsername.includes('..');

  const safeDomain = sanitizeDomain(domain);
  const normalizedDomainList = activeDomains.map((d) => d.toLowerCase());
  const isSupportedDomain = Boolean(
    safeDomain && normalizedDomainList.includes(safeDomain)
  );
  const effectiveUser = canonicalUsername || 'fadhil';
  const effectiveDomain = safeDomain || 'imy.li';

  return {
    rawInput: rawEmail,
    isValid: Boolean(isValidLocal && safeDomain),
    localPart,
    baseUsername,
    canonicalUsername: effectiveUser,
    plusTag: plusTag && plusTag.length > 0 ? plusTag : null,
    dotCount,
    domain: effectiveDomain,
    canonicalEmail: `${effectiveUser}@${effectiveDomain}`,
    pairedBioDomain: `${effectiveUser}.imy.li`,
    shortlinkPrefix: 'imy.li/s/',
    isSupportedDomain,
  };
}

/**
 * Generates sample Gmail-style `.` and `+` aliases for a canonical handle
 * so the user can copy or test them directly.
 */
export function generateAliasExamples(
  username: string,
  domain = 'imy.li'
): {
  label: { id: string; en: string };
  address: string;
  rule: string;
}[] {
  const clean = sanitizeHandle(username);
  const mid = Math.max(1, Math.floor(clean.length / 2));
  const dotted =
    clean.length > 2 ? `${clean.slice(0, mid)}.${clean.slice(mid)}` : `${clean}.id`;
  const multiDotted =
    clean.length >= 4
      ? `${clean[0]}.${clean.slice(1, -1)}.${clean[clean.length - 1]}`
      : dotted;

  return [
    {
      label: { id: 'Alias Titik (Dot Normalization)', en: 'Dot-Normalized Alias' },
      address: `${dotted}@${domain}`,
      rule: 'Dots (.) ignored before @',
    },
    {
      label: { id: 'Alias Plus Newsletter', en: 'Newsletter Plus Subaddress' },
      address: `${clean}+news@${domain}`,
      rule: 'Auto-tagged as +news',
    },
    {
      label: { id: 'Alias Plus Belanja / Transaksi', en: 'Shopping / Billing Plus Alias' },
      address: `${clean}+billing@${domain}`,
      rule: 'Auto-tagged as +billing',
    },
    {
      label: { id: 'Kombinasi Titik + Plus Tag', en: 'Combined Dot + Plus Alias' },
      address: `${multiDotted}+github@${domain}`,
      rule: 'Resolves to primary inbox +github',
    },
  ];
}
