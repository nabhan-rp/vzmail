export interface EdgeDnsVerificationPayload {
  domain: string;
  mxRecords: string[];
  spfRecord: string | null;
  spfPolicy: 'strict (-all)' | 'softfail (~all)' | 'neutral/open' | 'missing';
  dmarcRecord: string | null;
  dmarcPolicy: 'reject' | 'quarantine' | 'none' | 'missing';
  dkimSelectors: string[];
  checkedAt: string;
  error: string | null;
}

export interface EdgeRdapVerificationPayload {
  domain: string;
  available: boolean;
  registeredAt: string | null;
  expiresAt: string | null;
  ageDays: number | null;
  registrar: string | null;
  statuses: string[];
  unavailableReason: string | null;
}

export interface EdgeDomainVerificationResponse {
  ok: boolean;
  domain: string;
  registrableDomain: string;
  dns: EdgeDnsVerificationPayload;
  rdap: EdgeRdapVerificationPayload;
}

interface DohAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface DohJsonResponse {
  Status?: number;
  Answer?: DohAnswer[];
}

const MULTI_PART_TLDS = new Set([
  'co.id',
  'ac.id',
  'or.id',
  'go.id',
  'web.id',
  'my.id',
  'biz.id',
  'sch.id',
  'co.uk',
  'org.uk',
  'com.au',
  'co.jp',
  'com.sg',
]);

// Fast direct authoritative RDAP endpoints for common TLDs (avoids rdap.org bot challenges)
const KNOWN_RDAP_ENDPOINTS: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  dev: 'https://pubapi.registry.google/rdap/domain/',
  app: 'https://pubapi.registry.google/rdap/domain/',
  page: 'https://pubapi.registry.google/rdap/domain/',
  gay: 'https://rdap.nic.gay/domain/',
  io: 'https://rdap.nic.io/domain/',
  ai: 'https://rdap.nic.ai/domain/',
  me: 'https://rdap.identitydigital.services/rdap/domain/',
  xyz: 'https://rdap.centralnic.com/xyz/domain/',
  li: 'https://rdap.nic.li/domain/',
  ch: 'https://rdap.nic.ch/domain/',
  id: 'https://rdap.pandi.id/rdap/domain/',
};

const COMMON_DKIM_SELECTORS = [
  'brevo1',
  'brevo2',
  'google',
  'default',
  'selector1',
  's1',
  'mail',
] as const;

export function sanitizeDomainForVerification(raw: string): {
  domain: string;
  registrableDomain: string;
} | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split('@')
    .pop()
    ?.replace(/\.$/, '') || '';

  if (
    !cleaned ||
    cleaned.length > 253 ||
    !cleaned.includes('.') ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      cleaned
    )
  ) {
    return null;
  }

  // Block localhost / reserved local domains
  if (
    cleaned === 'localhost' ||
    cleaned.endsWith('.local') ||
    cleaned.endsWith('.internal') ||
    cleaned.endsWith('.localhost')
  ) {
    return null;
  }

  const labels = cleaned.split('.').filter(Boolean);
  let registrableDomain = cleaned;
  if (labels.length > 2) {
    const lastTwo = labels.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(lastTwo) && labels.length >= 3) {
      registrableDomain = labels.slice(-3).join('.');
    } else {
      registrableDomain = lastTwo;
    }
  }

  return { domain: cleaned, registrableDomain };
}

function stripTxtQuotes(raw: string): string {
  return raw
    .replace(/^"+|"+$/g, '')
    .replace(/"\s+"/g, '')
    .trim();
}

async function queryDoh(name: string, type: 'MX' | 'TXT'): Promise<DohJsonResponse | null> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/dns-json',
        },
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as DohJsonResponse | null;
      if (data && typeof data === 'object') {
        return data;
      }
    } catch {
      // Try next DoH resolver
    }
  }
  return null;
}

async function queryRdap(registrableDomain: string): Promise<EdgeRdapVerificationPayload> {
  const labels = registrableDomain.split('.');
  const tld = labels[labels.length - 1] || '';
  const candidateUrls: string[] = [];

  if (tld && KNOWN_RDAP_ENDPOINTS[tld]) {
    candidateUrls.push(`${KNOWN_RDAP_ENDPOINTS[tld]}${encodeURIComponent(registrableDomain)}`);
  }
  candidateUrls.push(`https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`);

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/rdap+json, application/json',
          'User-Agent': 'VZMail-DomainVerifier/1.0 (+https://mail.vz.gay)',
        },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('json')) continue;

      const data = (await res.json().catch(() => null)) as {
        events?: Array<{ eventAction?: string; eventDate?: string }>;
        status?: string[];
        entities?: Array<{
          roles?: string[];
          vcardArray?: unknown[];
          handle?: string;
        }>;
      } | null;

      if (!data || typeof data !== 'object') continue;

      const events = Array.isArray(data.events) ? data.events : [];
      const regEvent = events.find(
        (e) => e.eventAction === 'registration' || e.eventAction === 'registered'
      );
      const expEvent = events.find((e) => e.eventAction === 'expiration');

      const registeredAt = regEvent?.eventDate || null;
      const expiresAt = expEvent?.eventDate || null;

      let ageDays: number | null = null;
      if (registeredAt) {
        const parsedMs = Date.parse(registeredAt);
        if (!Number.isNaN(parsedMs)) {
          ageDays = Math.max(0, Math.floor((Date.now() - parsedMs) / (1000 * 60 * 60 * 24)));
        }
      }

      let registrar: string | null = null;
      const registrarEntity = (data.entities || []).find(
        (ent) => Array.isArray(ent.roles) && ent.roles.includes('registrar')
      );
      if (registrarEntity) {
        const vcard = registrarEntity.vcardArray;
        if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
          const fnEntry = (vcard[1] as unknown[]).find(
            (row) => Array.isArray(row) && row[0] === 'fn'
          ) as [string, unknown, string, string] | undefined;
          if (fnEntry && typeof fnEntry[3] === 'string') {
            registrar = fnEntry[3];
          }
        }
        if (!registrar && registrarEntity.handle) {
          registrar = registrarEntity.handle;
        }
      }

      return {
        domain: registrableDomain,
        available: true,
        registeredAt,
        expiresAt,
        ageDays,
        registrar,
        statuses: Array.isArray(data.status) ? data.status.slice(0, 6) : [],
        unavailableReason: null,
      };
    } catch {
      // Try fallback RDAP endpoint
    }
  }

  return {
    domain: registrableDomain,
    available: false,
    registeredAt: null,
    expiresAt: null,
    ageDays: null,
    registrar: null,
    statuses: [],
    unavailableReason: `Registri TLD .${tld || 'domain'} tidak menyediakan endpoint RDAP publik terbuka untuk ${registrableDomain}.`,
  };
}

/**
 * Performs server-side DNS-over-HTTPS (MX, SPF, DMARC, common DKIM selectors)
 * and authoritative RDAP lookup so strict browser CSP and RDAP CORS never break verification.
 */
export async function verifyDomainAtEdge(
  rawDomain: string
): Promise<EdgeDomainVerificationResponse | null> {
  const parsed = sanitizeDomainForVerification(rawDomain);
  if (!parsed) return null;

  const { domain, registrableDomain } = parsed;

  const [mxRes, txtRes, dmarcRes, dkimResults, rdap] = await Promise.all([
    queryDoh(domain, 'MX'),
    queryDoh(domain, 'TXT'),
    queryDoh(`_dmarc.${domain}`, 'TXT'),
    Promise.all(
      COMMON_DKIM_SELECTORS.map(async (sel) => {
        const res = await queryDoh(`${sel}._domainkey.${domain}`, 'TXT');
        const answers = res?.Answer || [];
        const hasDkim = answers.some((a) => {
          if (a.type === 16 && typeof a.data === 'string') {
            const cleaned = stripTxtQuotes(a.data).toLowerCase();
            return cleaned.includes('v=dkim1') || cleaned.includes('p=');
          }
          if (a.type === 5 && typeof a.data === 'string') {
            return a.data.toLowerCase().includes('dkim');
          }
          return false;
        });
        return hasDkim ? sel : null;
      })
    ),
    queryRdap(registrableDomain),
  ]);

  const dnsUnavailable = !mxRes && !txtRes && !dmarcRes;

  const mxRecords = (mxRes?.Answer || [])
    .filter((a) => a.type === 15 && typeof a.data === 'string')
    .map((a) => String(a.data).replace(/\.$/, '').trim())
    .filter(Boolean);

  const txtStrings = (txtRes?.Answer || [])
    .filter((a) => a.type === 16 && typeof a.data === 'string')
    .map((a) => stripTxtQuotes(String(a.data)));

  const spfRecord =
    txtStrings.find((t) => t.toLowerCase().startsWith('v=spf1')) || null;

  let spfPolicy: EdgeDnsVerificationPayload['spfPolicy'] = 'missing';
  if (spfRecord) {
    const lowerSpf = spfRecord.toLowerCase();
    if (lowerSpf.includes('-all')) {
      spfPolicy = 'strict (-all)';
    } else if (lowerSpf.includes('~all')) {
      spfPolicy = 'softfail (~all)';
    } else {
      spfPolicy = 'neutral/open';
    }
  }

  const dmarcStrings = (dmarcRes?.Answer || [])
    .filter((a) => a.type === 16 && typeof a.data === 'string')
    .map((a) => stripTxtQuotes(String(a.data)));

  const dmarcRecord =
    dmarcStrings.find((t) => t.toLowerCase().startsWith('v=dmarc1')) || null;

  let dmarcPolicy: EdgeDnsVerificationPayload['dmarcPolicy'] = 'missing';
  if (dmarcRecord) {
    const match = dmarcRecord.match(/(?:^|;\s*)p\s*=\s*([a-zA-Z]+)/i);
    const policyVal = (match?.[1] || '').toLowerCase();
    if (policyVal === 'reject') dmarcPolicy = 'reject';
    else if (policyVal === 'quarantine') dmarcPolicy = 'quarantine';
    else if (policyVal === 'none') dmarcPolicy = 'none';
  }

  const dkimSelectors: string[] = dkimResults.filter(
    (s): s is NonNullable<typeof s> => s !== null
  );

  return {
    ok: true,
    domain,
    registrableDomain,
    dns: {
      domain,
      mxRecords,
      spfRecord,
      spfPolicy,
      dmarcRecord,
      dmarcPolicy,
      dkimSelectors,
      checkedAt: new Date().toISOString(),
      error: dnsUnavailable
        ? 'Resolver DNS-over-HTTPS tidak merespons saat ini.'
        : null,
    },
    rdap,
  };
}
