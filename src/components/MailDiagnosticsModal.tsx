import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import { apiFetch } from '../utils/apiAuthClient';
import type { EdgeDomainVerificationResponse } from '../utils/domainVerify';

export interface MailSyncErrorInfo {
  status?: number;
  message: string;
  at: string;
}

interface MailDiagnosticsPayload {
  ok: boolean;
  canonicalUser: string;
  primaryEmail: string;
  primaryDomain: string;
  kvBound: boolean;
  r2Bound: boolean;
  failClosedInboundReject: boolean;
  activeOutboundProvider: string;
  outboundProviderMode: string;
  brevoKeyFormat: string;
  pendingQueueCount: number;
  seededOnce: boolean;
  lastInboundAt: string | null;
  lastInboundFromDomain: string | null;
  outboundQuota: {
    usedToday: number;
    dailyLimit: number;
  };
  authSource: string;
  timestamp: string;
}

interface MailDiagnosticsModalProps {
  open: boolean;
  initialTab?: 'inbound' | 'dns';
  onClose: () => void;
  lang: Language;
  username: string;
  primaryDomain: string;
  lastSyncError: MailSyncErrorInfo | null;
  lastSyncedAt: string | null;
  onRetryQueueSync: () => Promise<void>;
  onPullAndPurge: () => Promise<void>;
}

export function MailDiagnosticsModal({
  open,
  initialTab = 'inbound',
  onClose,
  lang,
  username,
  primaryDomain,
  lastSyncError,
  lastSyncedAt,
  onRetryQueueSync,
  onPullAndPurge,
}: MailDiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<'inbound' | 'dns'>(initialTab);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagData, setDiagData] = useState<MailDiagnosticsPayload | null>(null);

  const [dnsDomainInput, setDnsDomainInput] = useState(primaryDomain || 'imy.li');
  const [loadingDns, setLoadingDns] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsResult, setDnsResult] = useState<EdgeDomainVerificationResponse | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setDnsDomainInput(primaryDomain || 'imy.li');
    }
  }, [open, initialTab, primaryDomain]);

  const fetchDiagnostics = useCallback(async () => {
    setLoadingDiag(true);
    setDiagError(null);
    try {
      const res = await apiFetch(
        `/api/mail/diagnostics?username=${encodeURIComponent(username)}`
      );
      const data = (await res.json().catch(() => null)) as
        | (MailDiagnosticsPayload & { error?: string })
        | null;
      if (!res.ok || !data?.ok) {
        setDiagError(
          data?.error ||
            (lang === 'id'
              ? `Gagal membaca diagnostik server (HTTP ${res.status}). Jika 401/403, silakan muat ulang atau login ulang SSO.`
              : `Failed to fetch server diagnostics (HTTP ${res.status}). If 401/403, please refresh or sign in again.`)
        );
        return;
      }
      setDiagData(data);
    } catch {
      setDiagError(
        lang === 'id'
          ? 'Tidak dapat terhubung ke endpoint diagnostik. Periksa koneksi internet Anda.'
          : 'Could not reach diagnostics endpoint. Check your internet connection.'
      );
    } finally {
      setLoadingDiag(false);
    }
  }, [username, lang]);

  const runDnsCheck = useCallback(
    async (domainOverride?: string) => {
      const target = (domainOverride ?? dnsDomainInput).trim() || primaryDomain || 'imy.li';
      setLoadingDns(true);
      setDnsError(null);
      try {
        const res = await apiFetch(
          `/api/mail/verify-domain?domain=${encodeURIComponent(target)}`
        );
        const data = (await res.json().catch(() => null)) as
          | (EdgeDomainVerificationResponse & { error?: string })
          | null;
        if (!res.ok || !data?.ok) {
          setDnsError(
            data?.error ||
              (lang === 'id'
                ? `Verifikasi DNS gagal untuk "${target}" (HTTP ${res.status}).`
                : `DNS verification failed for "${target}" (HTTP ${res.status}).`)
          );
          return;
        }
        setDnsResult(data);
      } catch {
        setDnsError(
          lang === 'id'
            ? 'Gagal menghubungi resolver DNS-over-HTTPS.'
            : 'Failed to reach DNS-over-HTTPS resolver.'
        );
      } finally {
        setLoadingDns(false);
      }
    },
    [dnsDomainInput, primaryDomain, lang]
  );

  useEffect(() => {
    if (!open) return;
    void fetchDiagnostics();
    if (initialTab === 'dns') {
      void runDnsCheck(primaryDomain || 'imy.li');
    }
  }, [open, initialTab, primaryDomain, fetchDiagnostics, runDnsCheck]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return lang === 'id' ? 'Belum tercatat' : 'Not recorded yet';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        lang === 'id'
          ? 'Diagnostik Mail & Cek SPF/DKIM/DMARC'
          : 'Mail Diagnostics & SPF/DKIM/DMARC Check'
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="w-full sm:max-w-2xl max-h-[90dvh] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
                {lang === 'id'
                  ? 'Diagnostik Inbound & Deliverability DNS'
                  : 'Inbound & DNS Deliverability Diagnostics'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                {username}@{primaryDomain}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'id' ? 'Tutup diagnostik' : 'Close diagnostics'}
            className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="px-4 sm:px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#0B0D11] border border-slate-200/80 dark:border-[#232732] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('inbound')}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'inbound'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'id' ? 'Antrean Inbound' : 'Inbound Queue'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('dns');
                if (!dnsResult && !loadingDns) {
                  void runDnsCheck();
                }
              }}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'dns'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>SPF / DKIM / DMARC</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {activeTab === 'inbound' ? (
            <>
              {/* Active Client Sync Error Banner */}
              {(lastSyncError || diagError) && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold">
                        {lang === 'id'
                          ? 'Terdeteksi Gangguan Sinkronisasi Kotak Masuk'
                          : 'Inbox Sync Issue Detected'}
                      </div>
                      <p className="leading-relaxed [overflow-wrap:anywhere]">
                        {diagError || lastSyncError?.message}
                      </p>
                      {lastSyncError?.at && (
                        <div className="text-[11px] opacity-80 font-mono tabular-nums">
                          {formatTime(lastSyncError.at)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Live Edge Status Grid */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {lang === 'id'
                      ? 'Status Edge Worker & Antrean Transit'
                      : 'Edge Worker & Transit Queue Status'}
                  </span>
                  <button
                    type="button"
                    disabled={loadingDiag}
                    onClick={() => void fetchDiagnostics()}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#1F2532] rounded-lg cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${loadingDiag ? 'animate-spin' : ''}`}
                    />
                    <span>{lang === 'id' ? 'Segarkan' : 'Refresh'}</span>
                  </button>
                </div>

                {loadingDiag && !diagData ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {lang === 'id'
                        ? 'Memeriksa koneksi Edge...'
                        : 'Checking Edge connection...'}
                    </span>
                  </div>
                ) : diagData ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Alamat Kanonikal' : 'Canonical Address'}
                      </dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white [overflow-wrap:anywhere] text-right">
                        {diagData.primaryEmail}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Antrean di Edge KV' : 'Pending in Edge KV'}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {diagData.pendingQueueCount}{' '}
                        {lang === 'id' ? 'paket' : 'packet(s)'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        MAIL_TRANSIT_KV
                      </dt>
                      <dd
                        className={`font-semibold inline-flex items-center gap-1 ${
                          diagData.kvBound
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {diagData.kvBound ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {diagData.kvBound
                            ? lang === 'id'
                              ? 'Terhubung'
                              : 'Bound'
                            : lang === 'id'
                              ? 'Tidak Terhubung'
                              : 'Unbound'}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Proteksi Tolak 451' : 'Fail-Closed 451 Reject'}
                      </dt>
                      <dd className="font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Aktif' : 'Active'}</span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Provider Kirim Aktif' : 'Active Outbound Relay'}
                      </dt>
                      <dd className="font-mono text-slate-900 dark:text-white">
                        {diagData.activeOutboundProvider}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Kuota Hari Ini' : 'Daily Quota'}
                      </dt>
                      <dd className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {diagData.outboundQuota.usedToday} / {diagData.outboundQuota.dailyLimit}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 sm:col-span-2 border-b border-slate-200/70 dark:border-[#232732]">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id'
                          ? 'Email Masuk Terakhir di Edge'
                          : 'Last Inbound Received at Edge'}
                      </dt>
                      <dd className="font-mono tabular-nums text-slate-900 dark:text-white text-right">
                        {formatTime(diagData.lastInboundAt)}
                        {diagData.lastInboundFromDomain
                          ? ` · ${diagData.lastInboundFromDomain}`
                          : ''}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 sm:col-span-2">
                      <dt className="text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? 'Sinkronisasi Klien Terakhir' : 'Last Client Sync'}
                      </dt>
                      <dd className="font-mono tabular-nums text-slate-900 dark:text-white text-right">
                        {formatTime(lastSyncedAt)}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void onRetryQueueSync();
                      void fetchDiagnostics();
                    }}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                  >
                    {lang === 'id' ? 'Cek Antrean Sekarang' : 'Check Queue Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onPullAndPurge().then(() => fetchDiagnostics());
                    }}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#1F2532] rounded-lg transition-colors cursor-pointer"
                  >
                    {lang === 'id' ? 'Tarik & Purge Sekarang' : 'Pull & Purge Now'}
                  </button>
                </div>
              </div>

              {/* Actionable Troubleshooting Guide for Inbound Without Bounce */}
              <div className="p-4 rounded-xl bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#232732] space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Checklist Jika Email dari Gmail/Yandex Tidak Muncul Tanpa Bounce'
                    : 'Checklist When Gmail/Yandex Mail Does Not Appear Without Bounce'}
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    {lang === 'id'
                      ? 'Pastikan di Cloudflare Dashboard → Email → Email Routing → Routing Rules → Catch-all address sudah diarahkan ke Action: "Send to a Worker" → vzmail (bukan Drop / Forward).'
                      : 'Ensure Cloudflare Dashboard → Email → Email Routing → Catch-all address routes to Action: "Send to a Worker" → vzmail (not Drop / Forward).'}
                  </li>
                  <li>
                    {lang === 'id'
                      ? `Pastikan nama akun/handle SSO Anda persis "${username}" (tujuan ${username}@${primaryDomain}, termasuk alias titik/plus).`
                      : `Verify your SSO handle matches "${username}" (destination ${username}@${primaryDomain}, including dot/plus aliases).`}
                  </li>
                  <li>
                    {lang === 'id'
                      ? 'Jika MAIL_TRANSIT_KV berstatus "Tidak Terhubung", Worker kini otomatis menolak dengan SMTP 451 agar pengirim mendapat notifikasi retry/bounce, bukan diterima diam-diam.'
                      : 'If MAIL_TRANSIT_KV is unbound, the Worker now rejects with SMTP 451 fail-closed instead of silently accepting.'}
                  </li>
                  <li>
                    {lang === 'id'
                      ? 'Aktifkan Background Sync (opt-in) agar paket baru di Edge otomatis ditarik ke IndexedDB lokal tanpa perlu klik manual terus-menerus.'
                      : 'Enable opt-in Background Sync so newly queued Edge packets are automatically pulled to local IndexedDB.'}
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              {/* DNS Domain Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runDnsCheck();
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={dnsDomainInput}
                  onChange={(e) => setDnsDomainInput(e.target.value)}
                  placeholder="imy.li"
                  aria-label={lang === 'id' ? 'Domain untuk dicek DNS' : 'Domain to check DNS'}
                  className="flex-1 min-h-[44px] px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  disabled={loadingDns}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {loadingDns ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {lang === 'id' ? 'Periksa DNS Sekarang' : 'Check DNS Now'}
                  </span>
                </button>
              </form>

              {dnsError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-200">
                  {dnsError}
                </div>
              )}

              {loadingDns && !dnsResult ? (
                <div className="py-8 flex items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {lang === 'id'
                      ? 'Mengecek MX, SPF, DKIM, dan DMARC via DoH...'
                      : 'Checking MX, SPF, DKIM, and DMARC via DoH...'}
                  </span>
                </div>
              ) : dnsResult ? (
                <div className="space-y-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {dnsResult.domain}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {formatTime(dnsResult.dns.checkedAt)}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-[#232732] rounded-xl border border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-hidden">
                    {/* MX */}
                    <div className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          MX (Inbound Routing)
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            dnsResult.dns.mxRecords.length > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {dnsResult.dns.mxRecords.length > 0 ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {dnsResult.dns.mxRecords.length > 0
                              ? `${dnsResult.dns.mxRecords.length} record`
                              : lang === 'id'
                                ? 'Tidak ditemukan'
                                : 'Missing'}
                          </span>
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                        {dnsResult.dns.mxRecords.length > 0
                          ? dnsResult.dns.mxRecords.join(' · ')
                          : lang === 'id'
                            ? 'Belum ada MX record. Email masuk ke domain ini tidak akan sampai ke Cloudflare Email Routing.'
                            : 'No MX records found. Inbound mail will not route to Cloudflare Email Routing.'}
                      </div>
                    </div>

                    {/* SPF */}
                    {(() => {
                      const spf = (dnsResult.dns.spfRecord || '').trim();
                      const spfHasSenderMechanism =
                        /\b(include:|ip4:|ip6:|mx\b|a\b|a:|exists:|redirect=)/i.test(spf);
                      const isDenyAllOnly = Boolean(spf) && !spfHasSenderMechanism;
                      const isSpfHealthy =
                        Boolean(spf) &&
                        !isDenyAllOnly &&
                        (dnsResult.dns.spfPolicy === 'strict (-all)' ||
                          dnsResult.dns.spfPolicy === 'softfail (~all)');
                      return (
                        <div className="p-3.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              SPF (TXT)
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                isSpfHealthy
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isDenyAllOnly
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {isSpfHealthy ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isDenyAllOnly
                                  ? lang === 'id'
                                    ? 'Blokir Semua (-all)'
                                    : 'Deny-All (-all)'
                                  : dnsResult.dns.spfPolicy}
                              </span>
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                            {spf ||
                              (lang === 'id'
                                ? 'SPF tidak ditemukan! Tambahkan TXT v=spf1 yang mencakup relay pengirim Anda (Brevo/Resend/cPanel) agar tidak masuk Spam.'
                                : 'SPF missing! Add a v=spf1 TXT record authorizing your outbound provider.')}
                          </div>
                          {isDenyAllOnly && (
                            <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed pt-1">
                              {lang === 'id'
                                ? 'SPF ini menolak seluruh server pengirim karena tidak memiliki include: (penyebab utama email keluar masuk Spam). Ubah TXT SPF menjadi misalnya: v=spf1 include:spf.brevo.com ~all'
                                : 'This SPF rejects all sending servers because it has no include: mechanism (primary cause of Spam placement). Update TXT SPF, e.g.: v=spf1 include:spf.brevo.com ~all'}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* DKIM */}
                    <div className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          DKIM (Selectors)
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            dnsResult.dns.dkimSelectors.length > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {dnsResult.dns.dkimSelectors.length > 0 ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {dnsResult.dns.dkimSelectors.length > 0
                              ? lang === 'id'
                                ? 'Terdeteksi'
                                : 'Detected'
                              : lang === 'id'
                                ? 'Perlu Verifikasi'
                                : 'Not Detected'}
                          </span>
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                        {dnsResult.dns.dkimSelectors.length > 0
                          ? dnsResult.dns.dkimSelectors
                              .map((s) => `${s}._domainkey.${dnsResult.domain}`)
                              .join(' · ')
                          : lang === 'id'
                            ? 'Selector DKIM umum tidak terdeteksi. Pastikan record DKIM dari Brevo/Resend/cPanel sudah dipublikasikan di DNS Cloudflare.'
                            : 'Common DKIM selectors not detected. Publish DKIM keys from your outbound relay in Cloudflare DNS.'}
                      </div>
                    </div>

                    {/* DMARC */}
                    <div className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          DMARC (_dmarc)
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            dnsResult.dns.dmarcPolicy === 'reject' ||
                            dnsResult.dns.dmarcPolicy === 'quarantine'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {dnsResult.dns.dmarcRecord ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>p={dnsResult.dns.dmarcPolicy}</span>
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                        {dnsResult.dns.dmarcRecord ||
                          (lang === 'id'
                            ? 'DMARC belum terpasang. Gmail/Yandex mewajibkan minimal v=DMARC1; p=quarantine; atau p=reject; agar email masuk kotak masuk utama.'
                            : 'DMARC missing. Gmail/Yandex require at least v=DMARC1; p=quarantine; or p=reject; for primary inbox placement.')}
                      </div>
                    </div>
                  </div>

                  {/* Anti-Spam Sending Tip */}
                  <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong className="text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? 'Tips Agar Email Masuk Inbox Utama:'
                        : 'Tips for Primary Inbox Placement:'}
                    </strong>{' '}
                    {lang === 'id'
                      ? 'Gunakan format "Plain-Text" atau "HTML Minimalis" di komposer untuk percakapan personal, pastikan SPF + DKIM + DMARC valid, dan hindari menempel banyak tautan promosi dalam pesan singkat.'
                      : 'Use "Plain-Text" or "Minimal HTML" in the composer for personal emails, keep SPF + DKIM + DMARC aligned, and avoid excessive promotional links in short messages.'}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
