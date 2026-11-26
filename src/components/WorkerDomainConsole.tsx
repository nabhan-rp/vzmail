import {
  Activity,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Globe,
  Inbox,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import { getOrSeedDomains, saveDomainOption } from '../utils/localMailDb';
import { sanitizeDomain, type MailDomainOption } from '../utils/mailIdentity';
import {
  ALL_RESERVED_USERNAMES,
  RESERVED_USERNAMES_BY_CATEGORY,
  checkReservedUsername,
  generateAuth0PostLoginAction,
  generateAuth0PreUserRegistrationAction,
  getReservedCategoryLabel,
  type ReservedCategory,
} from '../utils/reservedUsernames';

interface WorkerDomainConsoleProps {
  lang: Language;
  username: string;
}

interface HealthSnapshot {
  ok: boolean;
  service: string;
  primaryDomain?: string;
  outboundProviderMode?: string;
  activeOutboundProvider?: string;
  brevoKeyFormat?:
    | 'v3_ready'
    | 'mcp_base64_extracted'
    | 'mcp_token_warning'
    | 'missing';
  linksStorageEngine?: string;
  mediaStorageEngine?: string;
  bindings?: {
    mailTransitKv?: boolean;
    linksKv?: boolean;
    linksDb?: boolean;
    linksMediaR2?: boolean;
    imagesBinding?: boolean;
    sendEmail?: boolean;
    cpanelRelay?: boolean;
    resendApi?: boolean;
    brevoApi?: boolean;
    assets?: boolean;
    relayAuthProtected?: boolean;
  };
  timestamp?: string;
}

type SetupGuideTab =
  | 'inbound'
  | 'cpanel'
  | 'api_cloudflare'
  | 'd1_upgrade'
  | 'reserved_auth0';

const CPANEL_SECRET_FILE_SNIPPET = `<?php
// Simpan DI LUAR public_html, misal: /home/<username_cpanel>/.vz_relay_secret.php
// Ubah izin file (chmod) menjadi 0600
return [
  'secret' => 'GANTI_DENGAN_TOKEN_ACAK_MINIMAL_32_KARAKTER_YANG_SAMA_DI_WRANGLER',
];`;

const CPANEL_WRANGLER_SECRETS_CMD = `# 1. Set URL relay HTTPS di server cPanel karya.kreasi.org
npx wrangler secret put CPANEL_RELAY_URL
# Contoh isi: https://relay.karya.kreasi.org/cloudflare_imy_mail_links_relay.php

# 2. Set token rahasia yang SAMA persis dengan .vz_relay_secret.php
npx wrangler secret put CPANEL_RELAY_SECRET

# 3. Build (otomatis rename *.php.txt -> *.php di dist/) & deploy Worker
npm run cf:deploy`;

const API_WRANGLER_SECRETS_CMD = `# Opsi B1 — Resend Gratis (3.000 email/bulan, 100/hari):
npx wrangler secret put RESEND_API_KEY

# Opsi B2 — Brevo Gratis (300 email/hari):
npx wrangler secret put BREVO_API_KEY

# Opsi B3 — Cloudflare Email Sending (Workers Paid $5/bln):
# Uncomment [[send_email]] di wrangler.toml lalu jalankan:
npm run cf:deploy`;

const D1_UPGRADE_CLI_CMD = `# 1. Buat database Cloudflare D1 gratis (5 GB storage, 5M read/hari)
npx wrangler d1 create vzlinks-db
# -> Salin "database_id" dari output perintah di atas

# 2. Terapkan tabel Multi-Page Bio, Shortlink, Recycle Bin 14h & Cooldown 3h
npx wrangler d1 execute vzlinks-db --remote --file=cloudflare/schema.sql

# (Jika D1 sudah ada sebelumnya, tambahkan kolom deactivate pada bio_profiles):
npx wrangler d1 execute vzlinks-db --remote --command "ALTER TABLE bio_profiles ADD COLUMN is_deactivated INTEGER NOT NULL DEFAULT 0; ALTER TABLE bio_profiles ADD COLUMN deactivated_at TEXT;"

# 3. Uncomment blok [[d1_databases]] di wrangler.toml & tempel database_id Anda,
#    lalu deploy ulang Worker:
npm run cf:deploy`;

const D1_WRANGLER_BLOCK_SNIPPET = `[[d1_databases]]
binding = "LINKS_DB"
database_name = "vzlinks-db"
database_id = "TEMPEL_DATABASE_ID_DARI_WRANGLER_D1_CREATE"`;

const R2_UPGRADE_CLI_CMD = `# 1. Buat bucket Cloudflare R2 gratis (10 GB storage, 0 biaya egress)
npx wrangler r2 bucket create vzlinks-media

# 2. Uncomment blok [[r2_buckets]] di wrangler.toml, lalu deploy ulang Worker:
npm run cf:deploy`;

const R2_WRANGLER_BLOCK_SNIPPET = `[[r2_buckets]]
binding = "LINKS_MEDIA_R2"
bucket_name = "vzlinks-media"`;

const WRANGLER_ROUTES_SNIPPET = `name = "vzmail"
main = "cloudflare/worker-mail-links.ts"
compatibility_date = "2026-11-19"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = [
  "/*",
  "!/assets/*",
  "!/icons/*",
  "!/favicon.svg",
  "!/cloudflare_imy_mail_links_relay.php"
]

routes = [
  { pattern = "mail.vz.gay/*", zone_name = "vz.gay" },
  { pattern = "links.vz.gay/*", zone_name = "vz.gay" },
  { pattern = "imy.li/*", zone_name = "imy.li" },
  { pattern = "*.imy.li/*", zone_name = "imy.li" }
]

[vars]
PRIMARY_MAIL_DOMAIN = "imy.li"
DAILY_OUTBOUND_LIMIT = "25"
OUTBOUND_PROVIDER = "auto"

[[kv_namespaces]]
binding = "MAIL_TRANSIT_KV"
id = "b330955476094cc2820053732cbb4471"

[[kv_namespaces]]
binding = "LINKS_KV"
id = "9fb255e46c7b4501922aa6881c806493"`;

export function WorkerDomainConsole({
  lang,
  username,
}: WorkerDomainConsoleProps) {
  const [domains, setDomains] = useState<MailDomainOption[]>([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState<SetupGuideTab>('cpanel');
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [reservedTestInput, setReservedTestInput] = useState('ad.min@imy.li');
  const timerRef = useRef<number | null>(null);

  const auth0PreRegScript = useMemo(
    () => generateAuth0PreUserRegistrationAction(),
    []
  );
  const auth0PostLoginScript = useMemo(
    () => generateAuth0PostLoginAction(),
    []
  );
  const reservedTestResult = useMemo(
    () => checkReservedUsername(reservedTestInput),
    [reservedTestInput]
  );

  const loadDomains = useCallback(async () => {
    const list = await getOrSeedDomains();
    setDomains(list);
  }, []);

  const fetchLiveHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as HealthSnapshot;
      setHealth(data);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Gagal menghubungi /api/health'
      );
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomains();
    void fetchLiveHealth();
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [loadDomains, fetchLiveHealth]);

  const flashCopied = (text: string) => {
    setCopiedMsg(text);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setCopiedMsg(null), 3200);
  };

  const handleToggleDomainStatus = async (item: MailDomainOption) => {
    if (item.isPrimaryDefault) return;
    const nextStatus =
      item.status === 'active' ? 'ready_to_add' : 'active';
    await saveDomainOption({ ...item, status: nextStatus });
    await loadDomains();
    flashCopied(
      `${item.domain} -> ${nextStatus === 'active' ? 'Active in Production Registry' : 'Paused'}`
    );
  };

  const handleAddFutureDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeDomain(newDomainInput);
    if (!cleaned) {
      flashCopied(
        lang === 'id'
          ? 'Format domain tidak valid (contoh: domainbaru.pm).'
          : 'Invalid domain format (e.g. newdomain.pm).'
      );
      return;
    }

    const tld = '.' + cleaned.split('.').slice(-1)[0];
    const opt: MailDomainOption = {
      domain: cleaned,
      tld,
      status: 'ready_to_add',
      isPrimaryDefault: false,
      registryLabel: `Custom Production Expansion (${tld})`,
      deliverabilityNote: {
        id: 'Domain tambahan yang didaftarkan siap dihubungkan ke Cloudflare Email Routing & Workers.',
        en: 'Additional domain registered for Cloudflare Email Routing & Workers expansion.',
      },
      supportsBioSubdomain: true,
      supportsShortlinkPath: true,
      addedAt: new Date().toISOString().slice(0, 10),
    };
    await saveDomainOption(opt);
    setNewDomainInput('');
    await loadDomains();
    flashCopied(`Domain ${cleaned} ditambahkan ke registry.`);
  };

  const handleCopy = (label: string, code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    flashCopied(
      lang === 'id'
        ? `${label} disalin ke clipboard.`
        : `${label} copied to clipboard.`
    );
  };

  const dnsBlueprintRows = [
    {
      type: 'MX',
      host: 'imy.li',
      value: 'route1.mx.cloudflare.net (prio 10) · route2/route3',
      copyValue: 'route1.mx.cloudflare.net',
      note:
        lang === 'id'
          ? 'Email MASUK 100% ke Cloudflare Worker `email()` (0 byte di cPanel)'
          : 'Inbound email 100% routed to Cloudflare Worker `email()` (0 bytes on cPanel)',
      accent: 'blue',
    },
    {
      type: 'TXT (SPF)',
      host: 'imy.li',
      value: 'v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all',
      copyValue: 'v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all',
      note:
        lang === 'id'
          ? 'Ganti v=spf1 -all menjadi record ini agar Brevo & Cloudflare lolos filter Spam Gmail (tambahkan a:karya.kreasi.org jika memakai cPanel)'
          : 'Replace v=spf1 -all with this record so Brevo & Cloudflare pass Gmail Spam filters (add a:karya.kreasi.org if using cPanel)',
      accent: 'blue',
    },
    {
      type: 'TXT (DKIM)',
      host: 'default._domainkey.imy.li',
      value: 'v=DKIM1; k=rsa; p=<SALIN_PUBLIC_KEY_DARI_CPANEL_EMAIL_DELIVERABILITY>',
      copyValue: 'default._domainkey',
      note:
        lang === 'id'
          ? 'Ambil dari cPanel > Email Deliverability > Manage imy.li agar lolos inbox Gmail'
          : 'Copy from cPanel > Email Deliverability > Manage imy.li for Gmail DKIM PASS',
      accent: 'blue',
    },
    {
      type: 'TXT (DMARC)',
      host: '_dmarc.imy.li',
      value: 'v=DMARC1; p=quarantine; adkim=r; aspf=r;',
      copyValue: 'v=DMARC1; p=quarantine; adkim=r; aspf=r;',
      note:
        lang === 'id'
          ? 'Mulai p=quarantine saat uji kirim, naikkan ke p=reject setelah DKIM/SPF PASS'
          : 'Start with p=quarantine during testing, tighten to p=reject after DKIM/SPF PASS',
      accent: 'blue',
    },
    {
      type: 'CNAME',
      host: '*.imy.li & imy.li',
      value: 'vzmail.workers.dev (Proxied Orange Cloud)',
      copyValue: 'vzmail.workers.dev',
      note:
        lang === 'id'
          ? 'Trafik web, bio & shortlink 100% di Cloudflare Worker (tidak menyentuh cPanel)'
          : 'Web, bio & shortlinks 100% handled on Cloudflare Worker (never hits cPanel)',
      accent: 'emerald',
    },
  ];

  const activeProviderBadge = (() => {
    const p = health?.activeOutboundProvider || 'none';
    if (p === 'cpanel_relay') return 'cPanel Relay (karya.kreasi.org)';
    if (p === 'resend') return 'Resend API';
    if (p === 'brevo') return 'Brevo API';
    if (p === 'cloudflare') return 'Cloudflare SEND_EMAIL';
    return lang === 'id' ? 'Belum Dikonfigurasi (Simulasi)' : 'Not Configured (Simulation)';
  })();

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {copiedMsg && (
        <div className="bg-slate-900 dark:bg-blue-950 text-white border border-slate-700 dark:border-blue-800 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{copiedMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-slate-500">
          <span>Admin Console</span>
          <span aria-hidden="true"> · </span>
          <span>mail.vz.gay + links.vz.gay + *.imy.li</span>
          <span aria-hidden="true"> · </span>
          <span>Hybrid Zero-Storage Architecture</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-display">
          {lang === 'id'
            ? 'Konsol Domain @imy.li, Setup Email Produksi & Cloudflare Worker'
            : '@imy.li Domain Registry, Production Email Setup & Cloudflare Worker'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[78ch]">
          {lang === 'id'
            ? 'Panduan & diagnostik khusus administrator untuk menjalankan email @imy.li secara nyata: email masuk & web/links 100% di Cloudflare Worker, sedangkan pengiriman keluar mendukung cPanel/WHM karya.kreasi.org ($0 & 0 MB storage), Resend/Brevo gratis, atau Cloudflare Email Sending.'
            : 'Administrator diagnostics and setup console for live @imy.li email: inbound mail and web/links run 100% on Cloudflare Workers, while outbound delivery supports cPanel/WHM karya.kreasi.org ($0 & 0 MB storage), free Resend/Brevo APIs, or Cloudflare Email Sending.'}
        </p>
      </div>

      {/* Section 0: Live Worker Health & Provider Diagnostics (/api/health) */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Status Live Binding & Provider Email (/api/health)'
                : 'Live Worker Bindings & Email Provider Status (/api/health)'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void fetchLiveHealth()}
            disabled={healthLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`}
            />
            <span>{lang === 'id' ? 'Uji Status Live' : 'Check Live Status'}</span>
          </button>
        </div>

        {healthError ? (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-mono">
            Error: {healthError}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
              <div className="text-[11px] text-slate-500">Inbound Transit KV</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                MAIL_TRANSIT_KV
              </div>
              <div
                className={`text-[11px] font-mono font-semibold ${
                  health?.bindings?.mailTransitKv
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {health?.bindings?.mailTransitKv ? 'Connected' : 'Not Bound'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
              <div className="text-[11px] text-slate-500">Links Storage (D1 / KV)</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                {health?.bindings?.linksDb ? 'LINKS_DB (D1)' : 'LINKS_KV (Fallback)'}
              </div>
              <div
                className={`text-[11px] font-mono font-semibold ${
                  health?.bindings?.linksDb || health?.bindings?.linksKv
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {health?.bindings?.linksDb
                  ? 'Cloudflare D1 Active'
                  : health?.bindings?.linksKv
                    ? 'KV Active · D1 Ready'
                    : 'Not Bound'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
              <div className="text-[11px] text-slate-500">
                R2 Media &amp; Server AVIF Converter
              </div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                {health?.bindings?.linksMediaR2
                  ? 'LINKS_MEDIA_R2 (R2)'
                  : health?.bindings?.linksDb
                    ? 'LINKS_DB (D1 Fallback)'
                    : 'LINKS_KV (Fallback)'}
              </div>
              <div className="text-[11px] font-mono flex flex-wrap items-center gap-1.5">
                <span
                  className={`font-semibold ${
                    health?.bindings?.linksMediaR2
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {health?.bindings?.linksMediaR2
                    ? 'R2 Active'
                    : 'R2 Standby'}
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span
                  className={`font-semibold ${
                    health?.bindings?.imagesBinding
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {health?.bindings?.imagesBinding
                    ? 'IMAGES→AVIF Active'
                    : 'IMAGES Not Bound'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
              <div className="text-[11px] text-slate-500">cPanel Relay ($0)</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                karya.kreasi.org
              </div>
              <div
                className={`text-[11px] font-mono font-semibold ${
                  health?.bindings?.cpanelRelay
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500'
                }`}
              >
                {health?.bindings?.cpanelRelay ? 'Secret Active' : 'Standby'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
              <div className="text-[11px] text-slate-500">API / CF Sending</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                Resend · Brevo · CF
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                {health?.bindings?.resendApi
                  ? 'Resend Active'
                  : health?.bindings?.brevoApi
                    ? health?.brevoKeyFormat === 'mcp_token_warning'
                      ? 'Brevo Set (MCP Key Warning)'
                      : health?.brevoKeyFormat === 'mcp_base64_extracted'
                        ? 'Brevo Active (MCP→v3 OK)'
                        : 'Brevo v3 Active'
                    : health?.bindings?.sendEmail
                      ? 'CF SEND_EMAIL Active'
                      : 'Standby'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-1">
              <div className="text-[11px] text-blue-700 dark:text-blue-300">
                Jalur Kirim Aktif ({health?.outboundProviderMode || 'auto'})
              </div>
              <div className="font-mono font-bold text-blue-900 dark:text-blue-200 truncate">
                {activeProviderBadge}
              </div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {health?.service || 'vzmail'}
              </div>
            </div>
          </div>
        )}

        {health?.brevoKeyFormat === 'mcp_token_warning' && (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>
                {lang === 'id'
                  ? 'Perhatian Kunci BREVO_API_KEY (Format MCP Terdeteksi):'
                  : 'BREVO_API_KEY Format Warning (MCP Token Detected):'}
              </strong>{' '}
              {lang === 'id'
                ? 'Secret BREVO_API_KEY yang terpasang tampak bukan kunci API v3 standar (awalan xkeysib-...), melainkan token MCP. Jika pengiriman email ditolak Brevo (HTTP 401), buat kunci baru bertipe API Key (v3) di Brevo → Settings → SMTP & API → API keys (xkeysib-...) lalu perbarui secret BREVO_API_KEY di panel Cloudflare Workers.'
                : 'Your BREVO_API_KEY secret does not start with xkeysib- and looks like an MCP token. If Brevo rejects sending with HTTP 401, generate a standard API v3 key (xkeysib-...) in Brevo → Settings → SMTP & API → API keys and update BREVO_API_KEY in Cloudflare Workers Secrets.'}
            </div>
          </div>
        )}

        {health?.bindings?.brevoApi && (
          <div className="p-3.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-950 dark:text-emerald-200 space-y-2 leading-relaxed">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-bold inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {lang === 'id'
                    ? 'Tips Lolos Kotak Masuk Utama Gmail (Brevo + imy.li)'
                    : 'Gmail Primary Inbox Checklist (Brevo + imy.li)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    'SPF Record Brevo + Cloudflare',
                    'v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all'
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-[#131922] text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-md hover:bg-emerald-100/60 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Copy TXT SPF</span>
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] sm:text-xs">
              <li>
                <strong>Ganti record SPF `imy.li`:</strong> Jika DNS Anda masih berisi{' '}
                <code className="font-mono px-1 rounded bg-white/80 dark:bg-black/30">v=spf1 -all</code>,
                ubah menjadi{' '}
                <code className="font-mono px-1 rounded bg-white/80 dark:bg-black/30">
                  v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
                </code>{' '}
                agar Gmail tidak menandai domain sebagai penolak semua pengirim.
              </li>
              <li>
                <strong>Pemanasan Domain Baru:</strong> Klik{' '}
                <strong>&ldquo;Laporkan bukan spam&rdquo;</strong> pada email uji pertama di Gmail dan hindari isi uji terlalu singkat (1–2 kata) saat awal mengirim dari domain baru.
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* Section 1: Step-by-Step Interactive Setup Guide (Inbound + cPanel Hybrid + API/CF) */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                {lang === 'id'
                  ? 'Panduan Step-by-Step Aktivasi Email Produksi (@imy.li)'
                  : 'Step-by-Step Production Email Setup Guide (@imy.li)'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? 'Semua link, bio & email masuk 100% di Cloudflare Worker. Kirim keluar bebas pilih $0 via cPanel karya.kreasi.org atau Resend/Brevo gratis.'
                : 'Web, bio, shortlinks & inbound mail stay 100% on Cloudflare Worker. Outbound works $0 via cPanel karya.kreasi.org or free Resend/Brevo.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveGuideTab('inbound')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeGuideTab === 'inbound'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252C3B]'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>1. Email Masuk (CF)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGuideTab('cpanel')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeGuideTab === 'cpanel'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252C3B]'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>2. Kirim via cPanel ($0)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGuideTab('api_cloudflare')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeGuideTab === 'api_cloudflare'
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252C3B]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>3. Resend / Brevo / CF Paid</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGuideTab('d1_upgrade')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeGuideTab === 'd1_upgrade'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252C3B]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>4. D1, R2 &amp; Route imy.li/*</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGuideTab('reserved_auth0')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeGuideTab === 'reserved_auth0'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252C3B]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>5. Reserved &amp; Auth0 Sync</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {activeGuideTab === 'inbound' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <strong>Gratis 100% Tanpa Batas Alamat:</strong> Email masuk ke{' '}
                <span className="font-mono">*@imy.li</span> (termasuk semua alias{' '}
                <span className="font-mono">.</span> dan{' '}
                <span className="font-mono">+</span>) diterima langsung oleh
                Cloudflare Email Routing → Worker{' '}
                <span className="font-mono font-bold">vzmail</span> →{' '}
                <span className="font-mono">MAIL_TRANSIT_KV</span> (TTL 72 jam) →
                langsung terhapus saat browser menarik pesan.
              </div>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
                <li>
                  Buka Cloudflare Dashboard → menu kiri{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Email Service → Email Routing
                  </strong>{' '}
                  → klik tombol biru{' '}
                  <strong className="text-blue-600 dark:text-blue-400">
                    + Onboard Domain
                  </strong>{' '}
                  dan pilih domain <span className="font-mono font-semibold">imy.li</span>.
                </li>
                <li>
                  Setujui penambahan otomatis record{' '}
                  <span className="font-mono font-semibold">MX</span> (
                  <span className="font-mono">route1/2/3.mx.cloudflare.net</span>)
                  dan <span className="font-mono font-semibold">SPF</span> oleh
                  Cloudflare.
                </li>
                <li>
                  Masuk ke tab{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Routing rules → Catch-All Address
                  </strong>
                  , ubah status ke <strong>Active</strong>, pilih Action:{' '}
                  <strong className="text-blue-600 dark:text-blue-400">
                    Send to a Worker
                  </strong>
                  , lalu pilih Worker{' '}
                  <span className="font-mono font-bold">vzmail</span>.
                </li>
                <li>
                  Selesai! Kirim tes email dari Gmail ke{' '}
                  <span className="font-mono font-semibold">
                    {username}+test@imy.li
                  </span>{' '}
                  lalu klik <strong>Tarik &amp; Hapus dari Server</strong> di VZ Mail.
                </li>
              </ol>
            </div>
          )}

          {activeGuideTab === 'cpanel' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                <strong>Hybrid Zero-Storage (`karya.kreasi.org` + Cloudflare):</strong>{' '}
                Ya, domain <span className="font-mono font-semibold">imy.li</span>{' '}
                bisa ditambahkan di WHM/cPanel Anda (
                <span className="font-mono">karya.kreasi.org:2087 / :2083</span>)
                khusus sebagai <strong>mesin pengirim Exim + penanda tangan DKIM</strong>.
                Karena MX &amp; trafik web tetap di Cloudflare dan relay PHP bersifat{' '}
                <em>send-only</em> tanpa IMAP/Sent folder,{' '}
                <strong>0 MB storage klien jajanserver.com akan terpakai</strong>.
              </div>

              <ol className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
                <li>
                  <strong>Tambahkan Domain `imy.li` di WHM / cPanel:</strong>{' '}
                  Login ke <span className="font-mono">https://karya.kreasi.org:2083</span>{' '}
                  (atau buat akun kecil di WHM <span className="font-mono">:2087</span>),
                  tambahkan <span className="font-mono font-semibold">imy.li</span>{' '}
                  sebagai Addon Domain. <em>Jangan</em> ubah DNS A/CNAME `imy.li` di
                  Cloudflare agar web/bio/shortlink tetap 100% di Cloudflare Worker.
                </li>
                <li>
                  <strong>WAJIB Set Remote Mail Exchanger:</strong> Di cPanel →{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Email Routing
                  </strong>{' '}
                  → pilih domain <span className="font-mono font-semibold">imy.li</span> →
                  pilih{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    Remote Mail Exchanger
                  </strong>{' '}
                  lalu simpan. Ini mencegah Exim cPanel menyimpan email lokal.
                </li>
                <li>
                  <strong>Salin Kunci DKIM cPanel ke Cloudflare DNS:</strong> Di
                  cPanel →{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Email Deliverability
                  </strong>{' '}
                  → klik <strong>Manage</strong> pada <span className="font-mono">imy.li</span>{' '}
                  → salin record <span className="font-mono">default._domainkey</span>{' '}
                  lalu tempel sebagai <strong>TXT</strong> di DNS Cloudflare `imy.li`, dan
                  pastikan SPF mencantumkan{' '}
                  <span className="font-mono">a:karya.kreasi.org</span>.
                </li>
                <li>
                  <strong>Pasang Token Rahasia &amp; Skrip Relay PHP:</strong> Buat
                  file rahasia di luar <span className="font-mono">public_html</span>{' '}
                  (lihat kotak kode kiri), lalu unggah file{' '}
                  <span className="font-mono font-semibold">
                    cloudflare_imy_mail_links_relay.php
                  </span>{' '}
                  (otomatis ter-rename dari <span className="font-mono">.php.txt</span>{' '}
                  saat <span className="font-mono">npm run build</span>) ke subdomain/folder
                  HTTPS di cPanel Anda (misal{' '}
                  <span className="font-mono">relay.karya.kreasi.org</span>).
                </li>
                <li>
                  <strong>Hubungkan Worker ke Relay:</strong> Jalankan perintah{' '}
                  <span className="font-mono">wrangler secret put</span> di bawah, lalu
                  deploy ulang.
                </li>
              </ol>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>/home/&lt;user&gt;/.vz_relay_secret.php</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy('.vz_relay_secret.php', CPANEL_SECRET_FILE_SNIPPET)
                      }
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                    {CPANEL_SECRET_FILE_SNIPPET}
                  </pre>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <Terminal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Wrangler Secrets (cPanel Relay)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy('Wrangler cPanel Secrets', CPANEL_WRANGLER_SECRETS_CMD)
                      }
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                    {CPANEL_WRANGLER_SECRETS_CMD}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeGuideTab === 'api_cloudflare' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Resend API (Gratis)
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-mono">
                    3.000 email/bulan · 100/hari
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Verifikasi domain <span className="font-mono">imy.li</span> di
                    Resend, tambahkan DNS DKIM-nya, lalu set{' '}
                    <span className="font-mono">RESEND_API_KEY</span>.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Brevo API (Gratis)
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-mono">
                    300 email/hari (~9.000/bulan)
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Verifikasi domain <span className="font-mono">imy.li</span> di
                    Brevo (termasuk ubah TXT SPF dari <span className="font-mono">v=spf1 -all</span> ke{' '}
                    <span className="font-mono">include:spf.brevo.com ~all</span> agar lolos Spam Gmail),
                    lalu pasang secret <span className="font-mono">BREVO_API_KEY</span> (kunci v3 maupun
                    kunci MCP Base64 otomatis diekstrak).
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Cloudflare Email Sending
                  </div>
                  <div className="text-amber-600 dark:text-amber-400 font-mono">
                    Free: verified only · Paid: $5/bln
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Onboard <span className="font-mono">imy.li</span> di{' '}
                    <strong>Email Sending</strong> lalu uncomment{' '}
                    <span className="font-mono">[[send_email]]</span> di{' '}
                    <span className="font-mono">wrangler.toml</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                    <Terminal className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    <span>Perintah CLI Secret (Resend / Brevo / Cloudflare)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('CLI API Secrets', API_WRANGLER_SECRETS_CMD)}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                  {API_WRANGLER_SECRETS_CMD}
                </pre>
              </div>
            </div>
          )}

          {activeGuideTab === 'd1_upgrade' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <strong>Dual-Storage Otomatis (Cloudflare D1 Utama + LINKS_KV Fallback):</strong>{' '}
                Saat ini Multi-Page Bio (<span className="font-mono">$USER.imy.li/$PAGE</span>)
                dan Shortlink (<span className="font-mono">imy.li/s/$RANDOM</span>) sudah langsung
                berfungsi memakai <span className="font-mono font-semibold">LINKS_KV</span>.
                Kapan pun siap beralih ke database SQL penuh (klik atomik, ribuan tautan &amp;
                halaman, gratis hingga 5 GB / 5 juta baca per hari), aktifkan binding{' '}
                <span className="font-mono font-semibold">LINKS_DB</span> dengan 3 langkah di bawah.
              </div>

              <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
                <li>
                  <strong>Aktifkan Route Apex <span className="font-mono">imy.li/*</span>:</strong>{' '}
                  Di Cloudflare Dashboard → zona <span className="font-mono">imy.li</span> →{' '}
                  <strong>DNS</strong>, pastikan record apex <span className="font-mono">@</span>{' '}
                  berstatus <strong>Proxied (Orange Cloud)</strong> dan Worker{' '}
                  <span className="font-mono">vzmail</span> memiliki route{' '}
                  <span className="font-mono font-semibold">imy.li/*</span> (selain{' '}
                  <span className="font-mono">*.imy.li/*</span>) agar{' '}
                  <span className="font-mono">https://imy.li/s/$CODE</span> langsung diarahkan ke
                  Worker.
                </li>
                <li>
                  <strong>Buat Database D1 &amp; Migrasi Skema:</strong> Jalankan perintah CLI di
                  kiri menggunakan skema yang sudah tersedia di{' '}
                  <span className="font-mono font-semibold">cloudflare/schema.sql</span>.
                </li>
                <li>
                  <strong>Bind <span className="font-mono">LINKS_DB</span> di{' '}
                  <span className="font-mono">wrangler.toml</span> &amp; Deploy:</strong> Uncomment
                  blok <span className="font-mono">[[d1_databases]]</span> lalu jalankan{' '}
                  <span className="font-mono">npm run cf:deploy</span>. Worker otomatis mendeteksi{' '}
                  <span className="font-mono">LINKS_DB</span> tanpa perlu mengubah kode apa pun.
                </li>
              </ol>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <Terminal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Wrangler D1 Setup &amp; Migration CLI</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('D1 Setup CLI', D1_UPGRADE_CLI_CMD)}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                    {D1_UPGRADE_CLI_CMD}
                  </pre>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>wrangler.toml — [[d1_databases]]</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('D1 wrangler.toml block', D1_WRANGLER_BLOCK_SNIPPET)}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                    {D1_WRANGLER_BLOCK_SNIPPET}
                  </pre>
                </div>
              </div>

              {/* Cloudflare R2 Object Storage for AVIF Bio Profile Photos */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-4">
                <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                  <strong>Cloudflare R2 untuk Foto Profil Bio (AVIF 256×256):</strong>{' '}
                  Foto profil Bio otomatis dikompres ke format <strong>AVIF</strong> (±5–20 KB) dan
                  disajikan melalui endpoint biner{' '}
                  <span className="font-mono">/api/links/avatar/:username</span> dengan cache{' '}
                  <span className="font-mono">immutable</span>. Tanpa R2, foto otomatis tersimpan di{' '}
                  <span className="font-mono">LINKS_DB</span> (D1) atau{' '}
                  <span className="font-mono">LINKS_KV</span>. Aktifkan bucket{' '}
                  <span className="font-mono font-semibold">LINKS_MEDIA_R2</span> kapan saja untuk
                  kuota gratis 10 GB dan 0 biaya egress—foto lama di D1/KV tetap terbaca otomatis.
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        <Terminal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Wrangler R2 Bucket CLI (LINKS_MEDIA_R2)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy('R2 Setup CLI', R2_UPGRADE_CLI_CMD)}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                      {R2_UPGRADE_CLI_CMD}
                    </pre>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>wrangler.toml — [[r2_buckets]]</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy('R2 wrangler.toml block', R2_WRANGLER_BLOCK_SNIPPET)
                        }
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                      {R2_WRANGLER_BLOCK_SNIPPET}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeGuideTab === 'reserved_auth0' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                <strong>Sinkronisasi Perlindungan Username Sistem (App + Worker + Auth0):</strong>{' '}
                Daftar <span className="font-mono font-semibold">{ALL_RESERVED_USERNAMES.length}</span>{' '}
                username sistem (seperti <span className="font-mono">admin</span>,{' '}
                <span className="font-mono">webmaster</span>,{' '}
                <span className="font-mono">noreply</span>,{' '}
                <span className="font-mono">newsletter</span>,{' '}
                <span className="font-mono">cs</span>,{' '}
                <span className="font-mono">help</span>,{' '}
                <span className="font-mono">support</span>) sudah aktif diblokir di Cloudflare Worker
                dan UI aplikasi. Pasang kedua skrip <strong>Auth0 Action</strong> di bawah agar
                pendaftaran akun SSO baru di <span className="font-mono">accounts.vz.gay</span> ikut
                menolak username sistem dan variasi titik/strip (<span className="font-mono">ad.min</span>,{' '}
                <span className="font-mono">no-reply</span>) sejak awal.
              </div>

              {/* Interactive Reserved Username Canonical Tester */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Uji Normalisasi Kanonik Username Sistem'
                    : 'Test Canonical Reserved Username Normalization'}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <input
                    type="text"
                    value={reservedTestInput}
                    onChange={(e) => setReservedTestInput(e.target.value)}
                    placeholder="Contoh: ad.min, no-reply@imy.li, webmaster, cs"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <div
                    className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold border shrink-0 ${
                      reservedTestResult.isReserved
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {reservedTestResult.isReserved
                      ? `BLOCKED (${reservedTestResult.canonical})`
                      : `ALLOWED (${reservedTestResult.canonical || '—'})`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {['ad.min@imy.li', 'no-reply', 'web.master', 'newsletter', 'cs', 'support', 'fadhil'].map(
                    (sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setReservedTestInput(sample)}
                        className="px-2 py-1 font-mono bg-slate-100 dark:bg-[#191E28] hover:bg-slate-200 dark:hover:bg-[#232A38] text-slate-700 dark:text-slate-300 rounded cursor-pointer"
                      >
                        {sample}
                      </button>
                    )
                  )}
                </div>
                {reservedTestResult.isReserved && reservedTestResult.category && (
                  <div className="text-[11px] text-rose-600 dark:text-rose-400">
                    {lang === 'id' ? 'Kategori terdeteksi:' : 'Matched category:'}{' '}
                    <strong>{getReservedCategoryLabel(reservedTestResult.category, lang)}</strong>{' '}
                    (<span className="font-mono">{reservedTestResult.matchedTerm}</span>)
                  </div>
                )}
              </div>

              {/* Categorized Reserved List Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(RESERVED_USERNAMES_BY_CATEGORY) as ReservedCategory[]).map(
                  (cat) => (
                    <div
                      key={cat}
                      className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-between gap-2">
                        <span>{getReservedCategoryLabel(cat, lang)}</span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {RESERVED_USERNAMES_BY_CATEGORY[cat].length}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                        {RESERVED_USERNAMES_BY_CATEGORY[cat].join(', ')}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Step-by-step Auth0 Deployment Instructions */}
              <ol className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
                <li>
                  Buka <strong>Auth0 Dashboard</strong> → menu kiri{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Actions → Flows → Pre User Registration
                  </strong>{' '}
                  → klik <strong>+ Create Action (Build from scratch)</strong> → tempel skrip{' '}
                  <span className="font-mono">vz-block-reserved-usernames</span> di kiri, Deploy,
                  lalu drag ke Flow.
                </li>
                <li>
                  Buka{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Actions → Flows → Login (Post-Login)
                  </strong>{' '}
                  → tambahkan skrip kedua di kanan untuk menandai klaim token{' '}
                  <span className="font-mono">https://vz.gay/reserved_username</span> bagi akun
                  sosial (Google/GitHub) yang kebetulan memiliki prefix email sistem.
                </li>
              </ol>

              {/* Copyable Auth0 Action Scripts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Auth0 Action 1: Pre-User Registration</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy('Auth0 Pre-User Registration Action', auth0PreRegScript)
                      }
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto max-h-80 leading-relaxed">
                    {auth0PreRegScript}
                  </pre>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-[#232732] overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0D1016] border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Auth0 Action 2: Post-Login Guard</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy('Auth0 Post-Login Action', auth0PostLoginScript)
                      }
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-800 dark:text-slate-200 overflow-x-auto max-h-80 leading-relaxed">
                    {auth0PostLoginScript}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: DNS Records & Deliverability Checklist for imy.li */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            DNS &amp; Deliverability Blueprint (`imy.li` + `karya.kreasi.org` + `vz.gay`)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232732] text-slate-500 font-sans">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 px-4">Host / Name</th>
                <th className="py-2 px-4">Target / Value</th>
                <th className="py-2 px-4">Fungsi</th>
                <th className="py-2 pl-4 text-right">Salin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232732] text-[11px]">
              {dnsBlueprintRows.map((row) => (
                <tr key={`${row.type}-${row.host}`} className="h-11">
                  <td
                    className={`py-2.5 pr-4 font-bold whitespace-nowrap ${
                      row.accent === 'emerald'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {row.type}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">{row.host}</td>
                  <td className="py-2.5 px-4 break-all max-w-md">{row.value}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-500">
                    {row.note}
                  </td>
                  <td className="py-2.5 pl-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleCopy(row.type, row.copyValue)}
                      className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Extensible Live Domain Registry */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Registry Domain Email & Identitas (Ekspansi Bertahap)'
                : 'Email & Identity Domain Registry (Grow-As-You-Go)'}
            </h2>
          </div>

          <form
            onSubmit={handleAddFutureDomain}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newDomainInput}
              onChange={(e) => setNewDomainInput(e.target.value)}
              placeholder="domainbaru.pm / brand.id"
              className="px-3 py-1.5 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Tambah Domain' : 'Add Domain'}</span>
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232732] text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Domain</th>
                <th className="py-2.5 px-4 font-medium">Registry &amp; Catatan</th>
                <th className="py-2.5 px-4 font-medium">Identitas &amp; Rute</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 pl-4 text-right font-medium">Kontrol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232732]">
              {domains.map((item) => (
                <tr key={item.domain} className="h-12">
                  <td className="py-3 pr-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    @{item.domain}
                    {item.isPrimaryDefault && (
                      <div className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        Primary Launch Domain
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {item.registryLabel}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {item.deliverabilityNote[lang]}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div>
                      {username}@{item.domain}
                    </div>
                    {item.supportsBioSubdomain && (
                      <div>
                        {username}.{item.domain} · {item.domain}/s/*
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono whitespace-nowrap">
                    {item.status === 'active' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="text-slate-500">Ready to Enable</span>
                    )}
                  </td>
                  <td className="py-3 pl-4 text-right whitespace-nowrap">
                    {item.isPrimaryDefault ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        Locked Default
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleDomainStatus(item)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {item.status === 'active' ? 'Pause' : 'Enable Now'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Wrangler Config & Auto-Renamed PHP Relay Download */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>wrangler.toml (Active Multi-Route + Multi-Provider)</span>
            </span>
            <button
              type="button"
              onClick={() =>
                handleCopy('wrangler.toml', WRANGLER_ROUTES_SNIPPET)
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
          <pre className="p-4 text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-x-auto leading-relaxed">
            {WRANGLER_ROUTES_SNIPPET}
          </pre>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2.5">
            <div className="text-sm font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Skrip Relay Outbound cPanel/WHM (Otomatis Rename Saat Build)'
                : 'cPanel/WHM Outbound Relay Script (Auto-Renamed on Build)'}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? 'Di GitHub dan workspace AI Studio, berkas ini tetap disimpan sebagai .php.txt. Saat npm run build berjalan, plugin Vite otomatis mengganti namanya di folder dist/ menjadi .php agar siap langsung diunggah ke cPanel karya.kreasi.org tanpa rename manual.'
                : 'Stored safely as .php.txt in GitHub and AI Studio. Running npm run build automatically renames it inside dist/ to .php so it is ready to upload to cPanel karya.kreasi.org.'}
            </p>
            <div className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-[11px] font-mono space-y-1">
              <div className="text-slate-500">
                Source Repo: <span className="text-slate-800 dark:text-slate-200">public/cloudflare_imy_mail_links_relay.php.txt</span>
              </div>
              <div className="text-slate-500">
                Build Output: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">dist/cloudflare_imy_mail_links_relay.php</span>
              </div>
            </div>
          </div>

          <a
            href="/cloudflare_imy_mail_links_relay.php"
            download="cloudflare_imy_mail_links_relay.php"
            className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>
              {lang === 'id'
                ? 'Unduh cloudflare_imy_mail_links_relay.php'
                : 'Download cloudflare_imy_mail_links_relay.php'}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
