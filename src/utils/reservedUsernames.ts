export type ReservedCategory =
  | 'mail_rfc'
  | 'support_ops'
  | 'infrastructure'
  | 'legal_brand';

export interface ReservedUsernameCheck {
  isReserved: boolean;
  canonical: string;
  matchedTerm: string | null;
  category: ReservedCategory | null;
}

export const RESERVED_USERNAMES_BY_CATEGORY: Record<
  ReservedCategory,
  readonly string[]
> = {
  mail_rfc: [
    'admin',
    'administrator',
    'postmaster',
    'hostmaster',
    'webmaster',
    'abuse',
    'noc',
    'security',
    'sec',
    'mailerdaemon',
    'noreply',
    'donotreply',
    'bounce',
    'bounces',
    'newsletter',
    'news',
    'marketing',
    'notifications',
    'notify',
    'alerts',
    'alert',
    'info',
    'contact',
    'hello',
    'sales',
    'billing',
    'invoice',
    'invoices',
    'payments',
    'finance',
    'hr',
    'jobs',
    'careers',
    'press',
    'media',
    'pr',
  ],
  support_ops: [
    'cs',
    'customerservice',
    'customercare',
    'help',
    'helpdesk',
    'support',
    'service',
    'services',
    'care',
    'feedback',
    'complaints',
    'trust',
    'safety',
    'verify',
    'verification',
    'official',
    'staff',
    'team',
    'owner',
    'founder',
    'ceo',
    'cto',
    'mod',
    'moderator',
    'sysadmin',
    'operator',
    'root',
    'system',
    'bot',
    'daemon',
    'guest',
    'anonymous',
    'nobody',
    'null',
    'undefined',
    'test',
    'demo',
    'example',
  ],
  infrastructure: [
    'web',
    'www',
    'mail',
    'email',
    'webmail',
    'smtp',
    'imap',
    'pop',
    'pop3',
    'mx',
    'dns',
    'ns',
    'ns1',
    'ns2',
    'ftp',
    'sftp',
    'ssh',
    'vpn',
    'proxy',
    'relay',
    'api',
    'app',
    'apps',
    'auth',
    'oauth',
    'sso',
    'login',
    'logout',
    'signin',
    'signup',
    'register',
    'account',
    'accounts',
    'myaccount',
    'profile',
    'settings',
    'dashboard',
    'console',
    'panel',
    'portal',
    'cpanel',
    'whm',
    'cdn',
    'static',
    'assets',
    'img',
    'images',
    'files',
    'download',
    'downloads',
    'upload',
    'uploads',
    'status',
    'health',
    'metrics',
    'docs',
    'doc',
    'blog',
    'forum',
    'community',
    'chat',
    'links',
    'link',
    'bio',
    'short',
    'shortlink',
    's',
    'r',
    'go',
    'redirect',
    'dev',
    'staging',
    'prod',
    'beta',
    'alpha',
    'localhost',
    'internal',
    'private',
    'public',
  ],
  legal_brand: [
    'legal',
    'privacy',
    'terms',
    'tos',
    'policy',
    'policies',
    'dmca',
    'copyright',
    'trademark',
    'compliance',
    'gdpr',
    'dpo',
    'law',
    'vz',
    'vzgay',
    'vzmail',
    'vzlinks',
    'vzchat',
    'vzfiles',
    'imy',
    'imyli',
    'galbay',
    'switch',
    'nic',
    'registry',
    'whois',
    'cloudflare',
    'auth0',
  ],
};

const RESERVED_LOOKUP = new Map<string, ReservedCategory>();
for (const [category, words] of Object.entries(RESERVED_USERNAMES_BY_CATEGORY) as [
  ReservedCategory,
  readonly string[],
][]) {
  for (const w of words) {
    RESERVED_LOOKUP.set(w, category);
  }
}

export const ALL_RESERVED_USERNAMES: readonly string[] = Array.from(
  RESERVED_LOOKUP.keys()
).sort();

/**
 * Strips email domain, +subaddress tags, dots, hyphens, underscores, and spaces
 * so variations like `ad.min`, `no-reply+test@imy.li`, or `web_master` normalize
 * to their exact canonical root before reserved-name checking.
 */
export function normalizeReservedCandidate(raw: string): string {
  const lowered = String(raw || '').trim().toLowerCase();
  const localPart = lowered.includes('@')
    ? lowered.slice(0, lowered.indexOf('@'))
    : lowered;
  const beforePlus = localPart.includes('+')
    ? localPart.slice(0, localPart.indexOf('+'))
    : localPart;
  return beforePlus.replace(/[^a-z0-9]/g, '').slice(0, 63);
}

export function checkReservedUsername(raw: string): ReservedUsernameCheck {
  const canonical = normalizeReservedCandidate(raw);
  if (!canonical) {
    return {
      isReserved: false,
      canonical: '',
      matchedTerm: null,
      category: null,
    };
  }
  const category = RESERVED_LOOKUP.get(canonical) || null;
  if (category) {
    return {
      isReserved: true,
      canonical,
      matchedTerm: canonical,
      category,
    };
  }
  return {
    isReserved: false,
    canonical,
    matchedTerm: null,
    category: null,
  };
}

export function getReservedCategoryLabel(
  category: ReservedCategory | null,
  lang: 'id' | 'en'
): string {
  if (category === 'mail_rfc') {
    return lang === 'id' ? 'Alamat Sistem Email (RFC)' : 'System Mail Role (RFC)';
  }
  if (category === 'support_ops') {
    return lang === 'id' ? 'Layanan Pelanggan & Staf' : 'Support & Staff Role';
  }
  if (category === 'infrastructure') {
    return lang === 'id' ? 'Infrastruktur & Subdomain' : 'Infrastructure & Routing';
  }
  if (category === 'legal_brand') {
    return lang === 'id' ? 'Hukum & Merek Ekosistem' : 'Legal & Ecosystem Brand';
  }
  return lang === 'id' ? 'Username Sistem' : 'System Username';
}

/**
 * Generates an Auth0 Pre-User Registration Action script synced with our exact
 * canonical reserved username list so Auth0 rejects reserved usernames before
 * an account is created on accounts.vz.gay / myaccount.vz.gay.
 */
export function generateAuth0PreUserRegistrationAction(): string {
  const serializedList = JSON.stringify(ALL_RESERVED_USERNAMES);
  return `/**
 * Auth0 Action: Pre-User Registration (VZ Ecosystem — mail.vz.gay & links.vz.gay)
 * Path: Auth0 Dashboard -> Actions -> Triggers -> pre-user-registration
 *
 * Memblokir registrasi username sistem/reserved (termasuk variasi titik/tanda hubung
 * seperti ad.min, no-reply, web.master) agar sinkron dengan @imy.li & *.imy.li.
 */
const RESERVED_USERNAMES = new Set(${serializedList});

function normalizeCanonicalHandle(raw) {
  const lowered = String(raw || '').trim().toLowerCase();
  const local = lowered.includes('@') ? lowered.slice(0, lowered.indexOf('@')) : lowered;
  const base = local.includes('+') ? local.slice(0, local.indexOf('+')) : local;
  return base.replace(/[^a-z0-9]/g, '').slice(0, 63);
}

exports.onExecutePreUserRegistration = async (event, api) => {
  const candidates = [
    event.user.username,
    event.user.nickname,
    event.user.email ? event.user.email.split('@')[0] : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const canonical = normalizeCanonicalHandle(candidate);
    if (canonical && RESERVED_USERNAMES.has(canonical)) {
      api.access.deny(
        'reserved_username',
        \`Username "\${canonical}" dicadangkan untuk sistem resmi vz.gay / imy.li. Silakan pilih username lain.\`
      );
      return;
    }
  }
};`;
}

/**
 * Generates an Auth0 Post-Login Action script as defense-in-depth for social
 * logins (Google/GitHub) or legacy accounts, with an explicit admin override flag.
 */
export function generateAuth0PostLoginAction(): string {
  const serializedList = JSON.stringify(ALL_RESERVED_USERNAMES);
  return `/**
 * Auth0 Action: Post-Login Guard (VZ Ecosystem — mail.vz.gay & links.vz.gay)
 * Path: Auth0 Dashboard -> Actions -> Triggers -> post-login
 *
 * Pertahanan lapis kedua untuk login sosial / akun lama. Untuk akun resmi internal,
 * tambahkan {"vz_reserved_owner": true} di User -> app_metadata.
 */
const RESERVED_USERNAMES = new Set(${serializedList});

function normalizeCanonicalHandle(raw) {
  const lowered = String(raw || '').trim().toLowerCase();
  const local = lowered.includes('@') ? lowered.slice(0, lowered.indexOf('@')) : lowered;
  const base = local.includes('+') ? local.slice(0, local.indexOf('+')) : local;
  return base.replace(/[^a-z0-9]/g, '').slice(0, 63);
}

exports.onExecutePostLogin = async (event, api) => {
  if (event.user.app_metadata && event.user.app_metadata.vz_reserved_owner === true) {
    return;
  }

  const preferred =
    event.user.username ||
    (event.user.user_metadata && event.user.user_metadata.vz_username) ||
    event.user.nickname ||
    '';

  const canonical = normalizeCanonicalHandle(preferred);
  if (canonical && RESERVED_USERNAMES.has(canonical)) {
    api.access.deny(
      \`Handle "\${canonical}" dicadangkan untuk layanan sistem imy.li. Ubah username Anda di myaccount.vz.gay.\`
    );
  }
};`;
}
