import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import type { LocalMailMessage } from '../utils/localMailDb';

export interface MailSearchGroundingDrawerProps {
  isOpen: boolean;
  lang: Language;
  initialSenderEmail?: string;
  initialSenderName?: string;
  initialSubject?: string;
  allMessages: LocalMailMessage[];
  onClose: () => void;
  onSelectMessage?: (msg: LocalMailMessage) => void;
}

interface DnsVerificationResult {
  domain: string;
  loading: boolean;
  error: string | null;
  mxRecords: string[];
  spfRecord: string | null;
  spfPolicy: 'strict (-all)' | 'softfail (~all)' | 'neutral/open' | 'missing';
  dmarcRecord: string | null;
  dmarcPolicy: 'reject' | 'quarantine' | 'none' | 'missing';
  checkedAt: string | null;
}

interface RdapResult {
  domain: string;
  loading: boolean;
  error: string | null;
  registeredAt: string | null;
  expiresAt: string | null;
  ageDays: number | null;
  registrar: string | null;
  statuses: string[];
}

interface VzSearchResultItem {
  title: string;
  url: string;
  description: string;
  siteName: string;
  favicon: string | null;
  age: string;
}

interface DohJsonResponse {
  Status?: number;
  Answer?: Array<{
    name?: string;
    type?: number;
    TTL?: number;
    data?: string;
  }>;
}

function extractDomainFromInput(raw: string): {
  email: string;
  domain: string;
  registrableDomain: string;
} {
  const trimmed = raw.trim().toLowerCase();
  let email = '';
  let domain = '';

  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    email = trimmed;
    domain = (parts[parts.length - 1] || '').replace(/[^a-z0-9.-]/g, '');
  } else {
    domain = trimmed
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .replace(/[^a-z0-9.-]/g, '');
  }

  const labels = domain.split('.').filter(Boolean);
  let registrableDomain = domain;
  if (labels.length > 2) {
    const lastTwo = labels.slice(-2).join('.');
    const multiPartTlds = new Set([
      'co.id',
      'ac.id',
      'or.id',
      'go.id',
      'web.id',
      'my.id',
      'biz.id',
      'co.uk',
      'org.uk',
      'com.au',
      'co.jp',
      'com.sg',
    ]);
    if (multiPartTlds.has(lastTwo) && labels.length >= 3) {
      registrableDomain = labels.slice(-3).join('.');
    } else {
      registrableDomain = lastTwo;
    }
  }

  return { email, domain, registrableDomain };
}

function stripTxtQuotes(raw: string): string {
  return raw
    .replace(/^"+|"+$/g, '')
    .replace(/"\s+"/g, '')
    .trim();
}

export function MailSearchGroundingDrawer({
  isOpen,
  lang,
  initialSenderEmail = '',
  initialSenderName = '',
  initialSubject = '',
  allMessages,
  onClose,
  onSelectMessage,
}: MailSearchGroundingDrawerProps) {
  const [senderInput, setSenderInput] = useState(initialSenderEmail);
  const [activeTab, setActiveTab] = useState<'verify' | 'vz_search' | 'local_history'>('verify');

  // DNS-over-HTTPS state
  const [dnsState, setDnsState] = useState<DnsVerificationResult>({
    domain: '',
    loading: false,
    error: null,
    mxRecords: [],
    spfRecord: null,
    spfPolicy: 'missing',
    dmarcRecord: null,
    dmarcPolicy: 'missing',
    checkedAt: null,
  });

  // RDAP state
  const [rdapState, setRdapState] = useState<RdapResult>({
    domain: '',
    loading: false,
    error: null,
    registeredAt: null,
    expiresAt: null,
    ageDays: null,
    registrar: null,
    statuses: [],
  });

  // VZ Search (https://search.vz.gay/?q=...) state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<VzSearchResultItem[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [spellSuggestion, setSpellSuggestion] = useState<string | null>(null);

  const parsedTarget = useMemo(
    () => extractDomainFromInput(senderInput),
    [senderInput]
  );

  // Local IndexedDB correlation for the inspected sender / domain
  const localCorrelation = useMemo(() => {
    const targetEmail = parsedTarget.email;
    const targetDomain = parsedTarget.domain;
    if (!targetEmail && !targetDomain) {
      return {
        exactMatches: [] as LocalMailMessage[],
        domainMatches: [] as LocalMailMessage[],
        targetedAliases: [] as string[],
        firstSeen: null as string | null,
        lastSeen: null as string | null,
      };
    }

    const exactMatches: LocalMailMessage[] = [];
    const domainMatches: LocalMailMessage[] = [];
    const aliasSet = new Set<string>();

    for (const msg of allMessages) {
      const fromAddr = (msg.from?.address || '').toLowerCase();
      const fromDomain = fromAddr.split('@')[1] || '';

      if (targetEmail && fromAddr === targetEmail) {
        exactMatches.push(msg);
      }
      if (targetDomain && (fromDomain === targetDomain || fromDomain.endsWith(`.${targetDomain}`))) {
        domainMatches.push(msg);
        if (msg.deliveredToAlias) {
          aliasSet.add(msg.deliveredToAlias.toLowerCase());
        }
      }
    }

    const sorted = [...domainMatches].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      exactMatches,
      domainMatches,
      targetedAliases: Array.from(aliasSet),
      firstSeen: sorted.length > 0 ? sorted[0].timestamp : null,
      lastSeen: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null,
    };
  }, [allMessages, parsedTarget.domain, parsedTarget.email]);

  // Run Live DNS-over-HTTPS (MX, SPF, DMARC) lookup
  const runDnsVerification = useCallback(async (domainToVerify: string) => {
    const cleanDomain = domainToVerify.trim().toLowerCase();
    if (!cleanDomain || !cleanDomain.includes('.')) return;

    setDnsState({
      domain: cleanDomain,
      loading: true,
      error: null,
      mxRecords: [],
      spfRecord: null,
      spfPolicy: 'missing',
      dmarcRecord: null,
      dmarcPolicy: 'missing',
      checkedAt: null,
    });

    try {
      const dohHeaders = { Accept: 'application/dns-json' };
      const [mxRes, txtRes, dmarcRes] = await Promise.all([
        fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=MX`,
          { headers: dohHeaders }
        ).then((r) => r.json() as Promise<DohJsonResponse>),
        fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=TXT`,
          { headers: dohHeaders }
        ).then((r) => r.json() as Promise<DohJsonResponse>),
        fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`_dmarc.${cleanDomain}`)}&type=TXT`,
          { headers: dohHeaders }
        ).then((r) => r.json() as Promise<DohJsonResponse>),
      ]);

      const mxRecords = (mxRes.Answer || [])
        .filter((a) => a.type === 15 && typeof a.data === 'string')
        .map((a) => String(a.data).replace(/\.$/, '').trim())
        .filter(Boolean);

      const txtStrings = (txtRes.Answer || [])
        .filter((a) => a.type === 16 && typeof a.data === 'string')
        .map((a) => stripTxtQuotes(String(a.data)));

      const spfRecord =
        txtStrings.find((t) => t.toLowerCase().startsWith('v=spf1')) || null;

      let spfPolicy: DnsVerificationResult['spfPolicy'] = 'missing';
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

      const dmarcStrings = (dmarcRes.Answer || [])
        .filter((a) => a.type === 16 && typeof a.data === 'string')
        .map((a) => stripTxtQuotes(String(a.data)));

      const dmarcRecord =
        dmarcStrings.find((t) => t.toLowerCase().startsWith('v=dmarc1')) || null;

      let dmarcPolicy: DnsVerificationResult['dmarcPolicy'] = 'missing';
      if (dmarcRecord) {
        const match = dmarcRecord.match(/(?:^|;\s*)p\s*=\s*([a-zA-Z]+)/i);
        const policyVal = (match?.[1] || '').toLowerCase();
        if (policyVal === 'reject') dmarcPolicy = 'reject';
        else if (policyVal === 'quarantine') dmarcPolicy = 'quarantine';
        else if (policyVal === 'none') dmarcPolicy = 'none';
      }

      setDnsState({
        domain: cleanDomain,
        loading: false,
        error: null,
        mxRecords,
        spfRecord,
        spfPolicy,
        dmarcRecord,
        dmarcPolicy,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      setDnsState((prev) => ({
        ...prev,
        loading: false,
        error:
          lang === 'id'
            ? 'Gagal memuat record DNS-over-HTTPS.'
            : 'Failed to query DNS-over-HTTPS records.',
      }));
    }
  }, [lang]);

  // Run Public RDAP Registration & Domain Age lookup
  const runRdapVerification = useCallback(async (registrableDomain: string) => {
    const cleanDomain = registrableDomain.trim().toLowerCase();
    if (!cleanDomain || !cleanDomain.includes('.')) return;

    setRdapState({
      domain: cleanDomain,
      loading: true,
      error: null,
      registeredAt: null,
      expiresAt: null,
      ageDays: null,
      registrar: null,
      statuses: [],
    });

    try {
      const res = await fetch(
        `https://rdap.org/domain/${encodeURIComponent(cleanDomain)}`,
        {
          headers: { Accept: 'application/rdap+json, application/json' },
        }
      );

      if (!res.ok) {
        setRdapState({
          domain: cleanDomain,
          loading: false,
          error:
            lang === 'id'
              ? `Registri TLD untuk ${cleanDomain} tidak menyediakan endpoint RDAP publik terbuka.`
              : `TLD registry for ${cleanDomain} does not expose an open public RDAP record.`,
          registeredAt: null,
          expiresAt: null,
          ageDays: null,
          registrar: null,
          statuses: [],
        });
        return;
      }

      const data = (await res.json()) as {
        events?: Array<{ eventAction?: string; eventDate?: string }>;
        status?: string[];
        entities?: Array<{
          roles?: string[];
          vcardArray?: unknown[];
          handle?: string;
        }>;
      };

      const events = Array.isArray(data.events) ? data.events : [];
      const regEvent = events.find(
        (e) =>
          e.eventAction === 'registration' ||
          e.eventAction === 'registered'
      );
      const expEvent = events.find((e) => e.eventAction === 'expiration');

      const registeredAt = regEvent?.eventDate || null;
      const expiresAt = expEvent?.eventDate || null;

      let ageDays: number | null = null;
      if (registeredAt) {
        const parsedMs = Date.parse(registeredAt);
        if (!Number.isNaN(parsedMs)) {
          ageDays = Math.max(
            0,
            Math.floor((Date.now() - parsedMs) / (1000 * 60 * 60 * 24))
          );
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

      setRdapState({
        domain: cleanDomain,
        loading: false,
        error: null,
        registeredAt,
        expiresAt,
        ageDays,
        registrar,
        statuses: Array.isArray(data.status) ? data.status.slice(0, 5) : [],
      });
    } catch {
      setRdapState({
        domain: cleanDomain,
        loading: false,
        error:
          lang === 'id'
            ? `Data RDAP untuk ${cleanDomain} tidak dapat diakses langsung dari browser.`
            : `RDAP data for ${cleanDomain} could not be fetched directly.`,
        registeredAt: null,
        expiresAt: null,
        ageDays: null,
        registrar: null,
        statuses: [],
      });
    }
  }, [lang]);

  // Run VZ Search (https://search.vz.gay/?q=...) query via backend proxy
  const executeVzSearch = useCallback(
    async (queryToRun: string, pageToRun = 1) => {
      const cleanQ = queryToRun.trim();
      if (!cleanQ) return;

      setSearchQuery(cleanQ);
      setSearchPage(pageToRun);
      setSearchLoading(true);
      setSearchError(null);

      try {
        const res = await fetch(
          `/api/mail/vz-search?q=${encodeURIComponent(cleanQ)}&page=${pageToRun}`
        );
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          results?: VzSearchResultItem[];
          hasMore?: boolean;
          spellcheckSuggestion?: string | null;
          error?: string;
        } | null;

        if (!res.ok || !data?.ok) {
          setSearchResults([]);
          setSearchHasMore(false);
          setSpellSuggestion(null);
          setSearchError(
            data?.error ||
              (lang === 'id'
                ? 'Tidak dapat mengambil hasil langsung. Gunakan tombol Buka di search.vz.gay.'
                : 'Could not load inline results. Use the Open in search.vz.gay button.')
          );
          return;
        }

        setSearchResults(Array.isArray(data.results) ? data.results : []);
        setSearchHasMore(Boolean(data.hasMore));
        setSpellSuggestion(data.spellcheckSuggestion || null);
      } catch {
        setSearchError(
          lang === 'id'
            ? 'Gagal memuat hasil dari search.vz.gay.'
            : 'Failed to fetch results from search.vz.gay.'
        );
      } finally {
        setSearchLoading(false);
      }
    },
    [lang]
  );

  // Sync initialSenderEmail whenever the drawer opens with a new sender
  useEffect(() => {
    if (!isOpen) return;
    const nextInput = initialSenderEmail.trim();
    if (nextInput) {
      setSenderInput(nextInput);
      const { domain, registrableDomain } = extractDomainFromInput(nextInput);
      if (domain) {
        void runDnsVerification(domain);
      }
      if (registrableDomain) {
        void runRdapVerification(registrableDomain);
      }
      const defaultQuery = initialSenderName
        ? `"${nextInput}" OR "${initialSenderName}"`
        : `"${nextInput}"`;
      setSearchQuery(defaultQuery);
      void executeVzSearch(defaultQuery, 1);
    } else if (initialSubject.trim()) {
      setSearchQuery(initialSubject.trim());
      void executeVzSearch(initialSubject.trim(), 1);
    }
  }, [
    isOpen,
    initialSenderEmail,
    initialSenderName,
    initialSubject,
    runDnsVerification,
    runRdapVerification,
    executeVzSearch,
  ]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { email, domain, registrableDomain } = extractDomainFromInput(senderInput);
    if (domain) {
      void runDnsVerification(domain);
    }
    if (registrableDomain) {
      void runRdapVerification(registrableDomain);
    }
    const q = email || domain || senderInput.trim();
    if (q) {
      void executeVzSearch(q, 1);
    }
  };

  // Deterministic non-AI security score calculation
  const securityVerdict = (() => {
    if (!parsedTarget.domain || dnsState.loading) return null;
    let points = 0;
    if (dnsState.mxRecords.length > 0) points += 1;
    if (dnsState.spfPolicy === 'strict (-all)') points += 2;
    else if (dnsState.spfPolicy === 'softfail (~all)') points += 1;
    if (dnsState.dmarcPolicy === 'reject') points += 2;
    else if (dnsState.dmarcPolicy === 'quarantine') points += 1.5;
    else if (dnsState.dmarcPolicy === 'none') points += 0.5;

    if (rdapState.ageDays !== null && rdapState.ageDays < 30) {
      points -= 2;
    }

    if (points >= 4) {
      return {
        tone: 'emerald' as const,
        label:
          lang === 'id'
            ? 'Autentikasi Domain Kuat (SPF + DMARC Aktif)'
            : 'Strong Domain Authentication (SPF + DMARC Active)',
      };
    }
    if (points >= 2) {
      return {
        tone: 'amber' as const,
        label:
          lang === 'id'
            ? 'Autentikasi Domain Parsial (Periksa DMARC/SPF)'
            : 'Partial Domain Authentication (Check DMARC/SPF)',
      };
    }
    return {
      tone: 'rose' as const,
      label:
        lang === 'id'
          ? 'Peringatan: Proteksi Anti-Spoofing Lemah / Domain Baru'
          : 'Warning: Weak Anti-Spoofing Protection / Newly Registered Domain',
    };
  })();

  const directVzSearchUrl = `https://search.vz.gay/?q=${encodeURIComponent(
    searchQuery.trim() || parsedTarget.email || parsedTarget.domain || ''
  )}`;

  const osintPresets = [
    ...(parsedTarget.email
      ? [
          {
            label: lang === 'id' ? 'Alamat Email Persis' : 'Exact Email Address',
            query: `"${parsedTarget.email}"`,
          },
        ]
      : []),
    ...(parsedTarget.domain
      ? [
          {
            label: lang === 'id' ? 'Reputasi & Phishing Domain' : 'Domain Reputation & Phishing',
            query: `"${parsedTarget.domain}" scam OR phishing OR official`,
          },
          {
            label: `site:${parsedTarget.domain}`,
            query: `site:${parsedTarget.domain}`,
          },
        ]
      : []),
    ...(initialSenderName.trim()
      ? [
          {
            label: `${lang === 'id' ? 'Profil' : 'Profile'}: ${initialSenderName.trim()}`,
            query: `"${initialSenderName.trim()}" ${parsedTarget.domain || ''}`.trim(),
          },
        ]
      : []),
    ...(initialSubject.trim()
      ? [
          {
            label: lang === 'id' ? 'Cari Subjek Email' : 'Search Email Subject',
            query: initialSubject.trim(),
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={
        lang === 'id'
          ? 'Search Grounding & Verifikasi Pengirim'
          : 'Search Grounding & Sender Verification'
      }
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#11141B] border-l border-slate-200 dark:border-[#232732] h-full flex flex-col shadow-2xl">
        {/* Top Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
                {lang === 'id'
                  ? 'Search Grounding & Verifikasi Pengirim'
                  : 'Search Grounding & Sender Verification'}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 dark:bg-[#1C212C] text-slate-600 dark:text-slate-300 rounded">
                Zero-AI · DoH + RDAP + search.vz.gay
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {lang === 'id'
                ? 'Verifikasi teknis DNS (SPF/DMARC/MX), umur domain RDAP, riwayat lokal, & penelusuran web search.vz.gay.'
                : 'Deterministic DNS (SPF/DMARC/MX), RDAP domain age, local history & search.vz.gay web lookup.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer"
            aria-label={lang === 'id' ? 'Tutup panel' : 'Close drawer'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Address / Domain Inspector Bar */}
        <form
          onSubmit={handleInspectSubmit}
          className="px-5 py-3.5 bg-[#FAFAFA] dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] space-y-2.5"
        >
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {lang === 'id'
              ? 'Alamat Email atau Domain Pengirim yang Diperiksa'
              : 'Sender Email Address or Domain to Verify'}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={senderInput}
                onChange={(e) => setSenderInput(e.target.value)}
                placeholder={
                  lang === 'id'
                    ? 'contoh: sender@domain.com atau domain.com'
                    : 'e.g. sender@domain.com or domain.com'
                }
                className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-white dark:bg-[#141821] border border-slate-300 dark:border-[#282E3D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              className="min-h-[34px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  dnsState.loading || rdapState.loading ? 'animate-spin' : ''
                }`}
              />
              <span>{lang === 'id' ? 'Verifikasi' : 'Verify'}</span>
            </button>
          </div>

          {securityVerdict && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                securityVerdict.tone === 'emerald'
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : securityVerdict.tone === 'amber'
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300'
                    : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {securityVerdict.tone === 'emerald' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                )}
                <span>{securityVerdict.label}</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">
                {parsedTarget.domain}
              </span>
            </div>
          )}
        </form>

        {/* Sub-navigation Tabs inside Drawer */}
        <div className="px-5 pt-2.5 border-b border-slate-200 dark:border-[#232732] flex items-center gap-2 bg-white dark:bg-[#11141B]">
          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'verify'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'id' ? '1. DNS & RDAP Domain' : '1. DNS & RDAP'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vz_search')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'vz_search'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>2. VZ Search (search.vz.gay)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('local_history')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'local_history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>
              {lang === 'id' ? '3. Riwayat Lokal' : '3. Local History'} (
              {localCorrelation.domainMatches.length})
            </span>
          </button>
        </div>

        {/* Scrollable Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'verify' && (
            <>
              {/* Live DNS-over-HTTPS Card */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732] space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {lang === 'id'
                        ? 'Verifikasi DNS-over-HTTPS (Cloudflare DoH)'
                        : 'Live DNS-over-HTTPS Verification'}
                    </h3>
                  </div>
                  {parsedTarget.domain && (
                    <span className="text-xs font-mono text-slate-500">
                      {parsedTarget.domain}
                    </span>
                  )}
                </div>

                {!parsedTarget.domain ? (
                  <p className="text-xs text-slate-500">
                    {lang === 'id'
                      ? 'Masukkan alamat email atau domain pengirim di atas untuk memeriksa MX, SPF, dan DMARC secara langsung.'
                      : 'Enter a sender email address or domain above to verify live MX, SPF, and DMARC records.'}
                  </p>
                ) : dnsState.loading ? (
                  <div className="space-y-2">
                    <div className="h-12 rounded-lg bg-slate-200 dark:bg-[#1E2430] animate-pulse" />
                    <div className="h-12 rounded-lg bg-slate-200 dark:bg-[#1E2430] animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {/*SPF*/}
                    <div className="p-3 rounded-lg bg-white dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          SPF (Sender Policy Framework)
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            dnsState.spfPolicy === 'strict (-all)' ||
                            dnsState.spfPolicy === 'softfail (~all)'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {dnsState.spfPolicy}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                        {dnsState.spfRecord ||
                          (lang === 'id'
                            ? 'Tidak ditemukan TXT v=spf1 pada domain ini.'
                            : 'No v=spf1 TXT record found on this domain.')}
                      </div>
                    </div>

                    {/*DMARC*/}
                    <div className="p-3 rounded-lg bg-white dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          DMARC (_dmarc.{parsedTarget.domain})
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            dnsState.dmarcPolicy === 'reject' ||
                            dnsState.dmarcPolicy === 'quarantine'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          p={dnsState.dmarcPolicy}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                        {dnsState.dmarcRecord ||
                          (lang === 'id'
                            ? 'Tidak ditemukan record _dmarc (rentan spoofing).'
                            : 'No _dmarc record published.')}
                      </div>
                    </div>

                    {/*MX*/}
                    <div className="p-3 rounded-lg bg-white dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          MX (Mail Exchange Servers)
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            dnsState.mxRecords.length > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {dnsState.mxRecords.length} server
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                        {dnsState.mxRecords.length > 0
                          ? dnsState.mxRecords.join(' · ')
                          : lang === 'id'
                            ? 'Domain tidak memiliki MX record aktif.'
                            : 'Domain has no active MX records.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Public RDAP / WHOIS Domain Age & Registration Card */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732] space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {lang === 'id'
                        ? 'Umur Domain & Registrasi (RDAP Publik)'
                        : 'Domain Age & Registration (Public RDAP)'}
                    </h3>
                  </div>
                  {parsedTarget.registrableDomain && (
                    <span className="text-xs font-mono text-slate-500">
                      {parsedTarget.registrableDomain}
                    </span>
                  )}
                </div>

                {rdapState.loading ? (
                  <div className="h-16 rounded-lg bg-slate-200 dark:bg-[#1E2430] animate-pulse" />
                ) : rdapState.error ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
                    <p>{rdapState.error}</p>
                    {parsedTarget.registrableDomain && (
                      <a
                        href={`https://search.vz.gay/?q=${encodeURIComponent(
                          `whois "${parsedTarget.registrableDomain}"`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        <span>
                          {lang === 'id'
                            ? `Cari info domain ${parsedTarget.registrableDomain} di search.vz.gay`
                            : `Look up ${parsedTarget.registrableDomain} on search.vz.gay`}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-lg bg-white dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732]">
                      <div className="text-[11px] text-slate-500">
                        {lang === 'id' ? 'Tanggal Terdaftar & Umur' : 'Registered & Age'}
                      </div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                        {rdapState.registeredAt
                          ? new Date(rdapState.registeredAt).toISOString().slice(0, 10)
                          : '—'}
                        {rdapState.ageDays !== null && (
                          <span
                            className={`ml-1.5 ${
                              rdapState.ageDays < 30
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            ({rdapState.ageDays}{' '}
                            {lang === 'id' ? 'hari' : 'days'})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732]">
                      <div className="text-[11px] text-slate-500">Registrar</div>
                      <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                        {rdapState.registrar || '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick OSINT & VZ Search Launchers */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {lang === 'id'
                      ? 'Pintasan OSINT & Penelusuran Web (search.vz.gay)'
                      : 'OSINT & Web Lookup Shortcuts (search.vz.gay)'}
                  </span>
                  <a
                    href={directVzSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>search.vz.gay</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex flex-wrap gap-2">
                  {osintPresets.map((preset) => (
                    <button
                      key={preset.query}
                      type="button"
                      onClick={() => {
                        setActiveTab('vz_search');
                        void executeVzSearch(preset.query, 1);
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#0E1117] hover:bg-blue-50 dark:hover:bg-blue-950/30 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#282E3D] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Search className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'vz_search' && (
            <div className="space-y-4">
              {/* VZ Search Query Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void executeVzSearch(searchQuery, 1);
                }}
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Telusuri Web via search.vz.gay (?q=...)'
                      : 'Search Web via search.vz.gay (?q=...)'}
                  </label>
                  <a
                    href={directVzSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>
                      {lang === 'id'
                        ? 'Buka Tab search.vz.gay'
                        : 'Open search.vz.gay Tab'}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        lang === 'id'
                          ? 'Ketik alamat pengirim, domain, atau topik untuk dicari di search.vz.gay...'
                          : 'Type sender address, domain, or topic to search on search.vz.gay...'
                      }
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0D1016] border border-slate-300 dark:border-[#282E3D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="min-h-[34px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
                  >
                    {lang === 'id' ? 'Cari' : 'Search'}
                  </button>
                </div>

                {osintPresets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {osintPresets.map((preset) => (
                      <button
                        key={preset.query}
                        type="button"
                        onClick={() => void executeVzSearch(preset.query, 1)}
                        className="px-2.5 py-1 text-[11px] font-mono bg-slate-100 dark:bg-[#191E28] hover:bg-slate-200 dark:hover:bg-[#232A38] text-slate-700 dark:text-slate-300 rounded cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </form>

              {spellSuggestion && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                  <span>
                    {lang === 'id' ? 'Mungkin maksud Anda:' : 'Did you mean:'}{' '}
                    <button
                      type="button"
                      onClick={() => void executeVzSearch(spellSuggestion, 1)}
                      className="font-bold underline cursor-pointer"
                    >
                      {spellSuggestion}
                    </button>
                  </span>
                </div>
              )}

              {searchLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-20 rounded-xl bg-slate-100 dark:bg-[#181C24] animate-pulse"
                    />
                  ))}
                </div>
              ) : searchError ? (
                <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                  <a
                    href={directVzSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
                  >
                    <span>
                      {lang === 'id'
                        ? `Buka "${searchQuery}" di search.vz.gay`
                        : `Open "${searchQuery}" on search.vz.gay`}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#262B38] text-center space-y-2">
                  <Search className="w-6 h-6 text-slate-400 mx-auto" />
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Tidak ada hasil langsung untuk kueri ini.'
                      : 'No inline web results found for this query.'}
                  </div>
                  <a
                    href={directVzSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>
                      {lang === 'id'
                        ? 'Telusuri langsung di search.vz.gay'
                        : 'Search directly on search.vz.gay'}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {searchResults.map((item, idx) => (
                    <article
                      key={`${item.url}-${idx}`}
                      className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732] space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {item.favicon && (
                          <img
                            src={item.favicon}
                            alt=""
                            className="w-3.5 h-3.5 rounded-xs shrink-0"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">
                          {item.siteName ? `${item.siteName} — ` : ''}
                          {item.url}
                        </span>
                        {item.age && (
                          <span className="shrink-0 text-slate-400">
                            · {item.age}
                          </span>
                        )}
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                      >
                        <span>{item.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {item.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </article>
                  ))}

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      disabled={searchPage <= 1 || searchLoading}
                      onClick={() => void executeVzSearch(searchQuery, searchPage - 1)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#232732] disabled:opacity-40 cursor-pointer"
                    >
                      ← {lang === 'id' ? 'Sebelumnya' : 'Previous'}
                    </button>
                    <span className="text-xs font-mono text-slate-500">
                      {lang === 'id' ? `Halaman ${searchPage}` : `Page ${searchPage}`}
                    </span>
                    <button
                      type="button"
                      disabled={!searchHasMore || searchLoading}
                      onClick={() => void executeVzSearch(searchQuery, searchPage + 1)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#232732] disabled:opacity-40 cursor-pointer"
                    >
                      {lang === 'id' ? 'Berikutnya' : 'Next'} →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'local_history' && (
            <div className="space-y-4">
              {/* Local IndexedDB Correlation Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732]">
                  <div className="text-[11px] text-slate-500">
                    {lang === 'id' ? 'Pesan dari Alamat Ini' : 'From Exact Address'}
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {localCorrelation.exactMatches.length}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732]">
                  <div className="text-[11px] text-slate-500">
                    {lang === 'id' ? 'Total dari Domain Sama' : 'From Same Domain'}
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {localCorrelation.domainMatches.length}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732]">
                  <div className="text-[11px] text-slate-500">
                    {lang === 'id' ? 'Alias Tujuan (+ / .)' : 'Targeted Aliases'}
                  </div>
                  <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">
                    {localCorrelation.targetedAliases.length}
                  </div>
                </div>
              </div>

              {localCorrelation.targetedAliases.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] border border-slate-200 dark:border-[#232732] space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'id'
                      ? 'Alamat Alias Anda yang Pernah Dihubungi Domain Ini:'
                      : 'Your Aliases Contacted by This Domain:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {localCorrelation.targetedAliases.map((alias) => (
                      <span
                        key={alias}
                        className="px-2 py-0.5 text-[11px] font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 rounded"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {localCorrelation.domainMatches.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#262B38] text-center space-y-1.5">
                  <Database className="w-6 h-6 text-slate-400 mx-auto" />
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Belum ada riwayat surat lokal dari pengirim/domain ini di IndexedDB.'
                      : 'No local messages from this sender/domain in IndexedDB.'}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {localCorrelation.domainMatches.map((msg) => (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => {
                        onSelectMessage?.(msg);
                        onClose();
                      }}
                      className="w-full p-3 rounded-xl bg-[#FAFAFA] dark:bg-[#151922] hover:bg-slate-100 dark:hover:bg-[#1C222E] border border-slate-200 dark:border-[#232732] text-left space-y-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                        <span className="truncate">{msg.from.address}</span>
                        <span className="shrink-0">
                          {new Date(msg.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {msg.subject || '(No Subject)'}
                      </div>
                      <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate">
                        → {msg.deliveredToAlias} ({msg.folder})
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
