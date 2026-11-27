import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  LogIn,
  QrCode,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import { apiFetch } from '../utils/apiAuthClient';
import { copyTextSafely } from '../utils/clipboard';
import type { ShortlinkRecord } from '../utils/linksModel';
import { ConfirmActionModal } from './ConfirmActionModal';
import { InAppSsoNotice } from './InAppSsoNotice';
import type { ActiveHostView } from './MailLinksTopBar';
import { QrCodeModal } from './QrCodeModal';

interface ShortlinkStudioProps {
  lang: Language;
  session: SsoSession;
  onLoginWithAuth0: () => void;
  onSelectHost: (host: ActiveHostView) => void;
}

const GUEST_SLUGS_STORAGE_KEY = 'vz_guest_shortlink_slugs_v1';

function readGuestSlugs(): string[] {
  try {
    const raw = window.localStorage.getItem(GUEST_SLUGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function writeGuestSlugs(slugs: string[]): void {
  try {
    window.localStorage.setItem(
      GUEST_SLUGS_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(slugs)).slice(0, 50))
    );
  } catch {
    // Ignore storage quota errors
  }
}

function formatStorageLabel(engine: string): string {
  if (engine === 'cloudflare-d1') return 'Cloudflare D1';
  if (engine === 'cloudflare-kv') return 'Cloudflare KV';
  if (engine === 'local-dev-memory') return 'Local Dev';
  return 'Edge Storage';
}

export function ShortlinkStudio({
  lang,
  session,
  onLoginWithAuth0,
  onSelectHost,
}: ShortlinkStudioProps) {
  const domain = session.primaryDomain || 'imy.li';
  const [targetUrl, setTargetUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdRecord, setCreatedRecord] = useState<ShortlinkRecord | null>(null);

  const [items, setItems] = useState<ShortlinkRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [storageEngine, setStorageEngine] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ShortlinkRecord | null>(null);
  const [qrTargetRecord, setQrTargetRecord] = useState<ShortlinkRecord | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<{
    text: string;
    movedToRecycleBin: boolean;
  } | null>(null);

  const copyTimerRef = useRef<number | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const loadShortlinks = useCallback(async () => {
    setLoadingList(true);
    try {
      let endpoint = '';
      if (session.isAuthenticated && session.username) {
        endpoint = `/api/links/shortlinks?owner=${encodeURIComponent(session.username)}`;
      } else {
        const guestSlugs = readGuestSlugs();
        if (guestSlugs.length === 0) {
          setItems([]);
          setLoadingList(false);
          return;
        }
        endpoint = `/api/links/shortlinks?slugs=${encodeURIComponent(guestSlugs.join(','))}`;
      }

      const res = await apiFetch(endpoint, { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        storageEngine?: string;
        items?: ShortlinkRecord[];
      } | null;

      if (res.ok && data?.ok) {
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.storageEngine) setStorageEngine(data.storageEngine);
      }
    } catch {
      // Preserve current items on transient error
    } finally {
      setLoadingList(false);
    }
  }, [session.isAuthenticated, session.username]);

  useEffect(() => {
    void loadShortlinks();
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, [loadShortlinks]);

  const handleCopy = (slug: string) => {
    const shortUrl = `https://${domain}/s/${slug}`;
    void copyTextSafely(shortUrl);
    setCopiedSlug(slug);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopiedSlug(null), 2200);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl) {
      setFormError(
        lang === 'id'
          ? 'Tempel (paste) URL panjang tujuan terlebih dahulu.'
          : 'Please paste a destination URL first.'
      );
      urlInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/links/shortlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: trimmedUrl,
          customSlug: customSlug.trim() || undefined,
          title: title.trim() || undefined,
          ownerUser: session.isAuthenticated ? session.username : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        storageEngine?: string;
        record?: ShortlinkRecord;
      } | null;

      if (!res.ok || !data?.ok || !data.record) {
        setFormError(
          data?.error ||
            (lang === 'id'
              ? 'Gagal membuat shortlink. Periksa format URL Anda.'
              : 'Failed to shorten URL. Please check the URL format.')
        );
        return;
      }

      const rec = data.record;
      if (data.storageEngine) setStorageEngine(data.storageEngine);
      setCreatedRecord(rec);
      setTargetUrl('');
      setCustomSlug('');
      setTitle('');

      if (!session.isAuthenticated) {
        const nextSlugs = [rec.slug, ...readGuestSlugs().filter((s) => s !== rec.slug)];
        writeGuestSlugs(nextSlugs);
      }

      setItems((prev) => [rec, ...prev.filter((item) => item.slug !== rec.slug)]);
    } catch {
      setFormError(
        lang === 'id'
          ? 'Koneksi ke server edge gagal. Coba lagi.'
          : 'Failed to reach the edge server. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const executeDelete = async (
    item: ShortlinkRecord,
    mode: 'recycle' | 'permanent'
  ) => {
    setDeletingSlug(item.slug);
    try {
      if (session.isAuthenticated && session.username) {
        const res = await apiFetch(
          `/api/links/shortlinks/${encodeURIComponent(item.slug)}?owner=${encodeURIComponent(
            session.username
          )}&mode=${mode}`,
          { method: 'DELETE' }
        );
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          movedToRecycleBin?: boolean;
        } | null;

        if (res.ok && json?.ok !== false) {
          setItems((prev) => prev.filter((x) => x.slug !== item.slug));
          if (createdRecord?.slug === item.slug) setCreatedRecord(null);
          const moved = Boolean(json?.movedToRecycleBin);
          setDeleteNotice({
            movedToRecycleBin: moved,
            text: moved
              ? lang === 'id'
                ? `Shortlink ${domain}/s/${item.slug} dihentikan dari redirect aktif & dipindahkan ke Recycle Bin (14 hari sebelum terhapus otomatis).`
                : `Shortlink ${domain}/s/${item.slug} stopped redirecting and moved to Recycle Bin (auto-purged after 14 days).`
              : lang === 'id'
                ? `Shortlink ${domain}/s/${item.slug} telah dihapus permanen dari database.`
                : `Shortlink ${domain}/s/${item.slug} has been permanently deleted from the database.`,
          });
        }
      } else {
        // Guest deletes anonymous shortlink permanently from DB
        await apiFetch(
          `/api/links/shortlinks/${encodeURIComponent(item.slug)}?mode=permanent`,
          { method: 'DELETE' }
        );
        const remaining = readGuestSlugs().filter((s) => s !== item.slug);
        writeGuestSlugs(remaining);
        setItems((prev) => prev.filter((x) => x.slug !== item.slug));
        if (createdRecord?.slug === item.slug) setCreatedRecord(null);
        setDeleteNotice({
          movedToRecycleBin: false,
          text:
            lang === 'id'
              ? `Shortlink ${domain}/s/${item.slug} telah dihapus permanen dari database.`
              : `Shortlink ${domain}/s/${item.slug} has been permanently deleted from the database.`,
        });
      }
    } finally {
      setDeletingSlug(null);
      setPendingDeleteItem(null);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.slug.toLowerCase().includes(q) ||
        item.targetUrl.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const totalClicks = useMemo(
    () => items.reduce((sum, item) => sum + item.clicks, 0),
    [items]
  );

  return (
    <div className="max-w-[1040px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>{domain}/s/$CODE</span>
            <span aria-hidden="true"> · </span>
            <span>{lang === 'id' ? 'Pemendek URL Mandiri' : 'Standalone URL Shortener'}</span>
            {storageEngine && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatStorageLabel(storageEngine)}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Pemendek URL ${domain}/s/`
              : `${domain}/s/ URL Shortener`}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[66ch]">
            {lang === 'id'
              ? `Tempel URL panjang apa pun untuk langsung diubah menjadi tautan pendek ${domain}/s/kode-acak. Terpisah dari Link-in-Bio dan dapat dipakai langsung dengan atau tanpa login.`
              : `Paste any long URL to turn it into a clean ${domain}/s/random-code redirect. Completely independent from Link-in-Bio and works with or without signing in.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onSelectHost('links.vz.gay')}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#191E28] dark:hover:bg-[#232A38] border border-slate-200 dark:border-[#2A303E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Link2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <span>{lang === 'id' ? 'Buka Studio Bio' : 'Open Bio Studio'}</span>
        </button>
      </div>

      {/* Primary URL Shortener Form Card */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 sm:p-6 space-y-5">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="shortlink-target-url"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {lang === 'id'
                ? 'Paste URL Panjang Tujuan'
                : 'Paste Long Destination URL'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                ref={urlInputRef}
                id="shortlink-target-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://contoh.com/halaman/sangat-panjang?utm_source=..."
                className="flex-1 min-h-[46px] px-4 py-2.5 text-sm font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[46px] px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Scissors className="w-4 h-4 shrink-0" />
                <span>
                  {submitting
                    ? lang === 'id'
                      ? 'Memproses...'
                      : 'Shortening...'
                    : lang === 'id'
                      ? 'Singkatkan URL'
                      : 'Shorten URL'}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label
                htmlFor="shortlink-custom-slug"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                {lang === 'id'
                  ? 'Custom Slug (Opsional — kosongkan untuk kode acak)'
                  : 'Custom Slug (Optional — leave blank for random code)'}
              </label>
              <div className="flex items-center rounded-lg border border-slate-300 dark:border-[#2A303D] bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
                <span className="px-3 py-2 text-xs font-mono text-slate-500 border-r border-slate-200 dark:border-[#232732] select-none shrink-0">
                  {domain}/s/
                </span>
                <input
                  id="shortlink-custom-slug"
                  type="text"
                  autoComplete="off"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder="k8m2x9"
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="shortlink-title"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                {lang === 'id'
                  ? 'Catatan / Label (Opsional)'
                  : 'Label / Note (Optional)'}
              </label>
              <input
                id="shortlink-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  lang === 'id'
                    ? 'Contoh: Promo Akhir Tahun'
                    : 'Example: Product Launch Deck'
                }
                className="w-full min-h-[40px] px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}
        </form>

        {/* Instant Result Banner */}
        {createdRecord && (
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'id'
                    ? 'Shortlink berhasil dibuat dan aktif'
                    : 'Shortlink created and live'}
                </span>
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                https://{domain}/s/{createdRecord.slug}
              </div>
              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                → {createdRecord.targetUrl}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(createdRecord.slug)}
                className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedSlug === createdRecord.slug ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{lang === 'id' ? 'Tersalin' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{lang === 'id' ? 'Salin Link' : 'Copy Link'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setQrTargetRecord(createdRecord)}
                className="min-h-[38px] px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-white dark:bg-[#181C25] border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Code</span>
              </button>

              <a
                href={`/s/${createdRecord.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#222836] rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Uji Buka' : 'Test Open'}</span>
              </a>
            </div>
          </div>
        )}

        {/* Guest vs SSO Persistence Info Bar */}
        {!session.isAuthenticated && (
          <div className="pt-3 border-t border-slate-200 dark:border-[#232732] space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {lang === 'id'
                  ? 'Mode Tamu aktif: tautan tetap berfungsi selamanya, riwayat tersimpan di browser ini. Masuk SSO untuk menyinkronkan daftar tautan lintas perangkat.'
                  : 'Guest mode active: links work permanently, history is saved in this browser. Sign in with SSO to sync your link history across devices.'}
              </span>
              <button
                type="button"
                onClick={onLoginWithAuth0}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Masuk SSO' : 'Sign In SSO'}</span>
              </button>
            </div>
            <InAppSsoNotice lang={lang} compact />
          </div>
        )}
      </section>

      {/* Shortlinks History & Real Click Stats */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
        {deleteNotice && (
          <div className="px-5 py-3 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
            <span>{deleteNotice.text}</span>
            <div className="flex items-center gap-3 shrink-0">
              {deleteNotice.movedToRecycleBin && (
                <button
                  type="button"
                  onClick={() => onSelectHost('links.vz.gay')}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {lang === 'id' ? 'Buka Recycle Bin di Studio Bio' : 'Open Recycle Bin in Bio Studio'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleteNotice(null)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {lang === 'id' ? 'Tutup' : 'Dismiss'}
              </button>
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {session.isAuthenticated
                ? lang === 'id'
                  ? `Daftar Shortlink Akun (${session.username})`
                  : `Account Shortlinks (${session.username})`
                : lang === 'id'
                  ? 'Riwayat Shortlink di Perangkat Ini'
                  : 'Shortlink History on This Browser'}
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>
                {items.length} {lang === 'id' ? 'tautan' : 'links'}
              </span>
              <span aria-hidden="true"> · </span>
              <span>
                {totalClicks.toLocaleString()} {lang === 'id' ? 'total klik nyata' : 'total real clicks'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'id' ? 'Cari slug atau URL...' : 'Search slug or URL...'}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadShortlinks()}
              disabled={loadingList}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              <span>{lang === 'id' ? 'Refresh Klik' : 'Refresh Clicks'}</span>
            </button>
          </div>
        </div>

        {loadingList ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-12 rounded-lg bg-slate-100 dark:bg-[#191E28] animate-pulse"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Scissors className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {items.length === 0
                ? lang === 'id'
                  ? 'Belum ada shortlink yang dibuat'
                  : 'No shortlinks created yet'
                : lang === 'id'
                  ? 'Tidak ada hasil yang cocok'
                  : 'No matching shortlinks'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {lang === 'id'
                ? `Tempel URL panjang pada kolom di atas lalu klik "Singkatkan URL" untuk membuat tautan ${domain}/s/kode-acak pertama Anda.`
                : `Paste a long URL above and click "Shorten URL" to create your first ${domain}/s/code link.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#232732] text-slate-500">
                  <th className="py-2.5 px-5 font-medium">Shortlink</th>
                  <th className="py-2.5 px-4 font-medium">
                    {lang === 'id' ? 'URL Tujuan' : 'Destination URL'}
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    {lang === 'id' ? 'Klik' : 'Clicks'}
                  </th>
                  <th className="py-2.5 px-5 font-medium text-right">
                    {lang === 'id' ? 'Aksi' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#232732]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.slug}
                    className="hover:bg-slate-50/80 dark:hover:bg-[#171B24] transition-colors"
                  >
                    <td className="py-3 px-5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {domain}/s/{item.slug}
                      </div>
                      {item.title && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {item.title}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <a
                        href={item.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 truncate block max-w-[240px] sm:max-w-[380px]"
                        title={item.targetUrl}
                      >
                        {item.targetUrl}
                      </a>
                      <div className="text-[10px] font-mono text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString(
                          lang === 'id' ? 'id-ID' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      {item.clicks.toLocaleString()}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(item.slug)}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1C212C] dark:hover:bg-[#252C3B] rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedSlug === item.slug ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>{lang === 'id' ? 'Disalin' : 'Copied'}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>{lang === 'id' ? 'Salin' : 'Copy'}</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrTargetRecord(item)}
                          aria-label={`QR Code ${domain}/s/${item.slug}`}
                          title={lang === 'id' ? 'Tampilkan & Unduh QR Code' : 'Show & Download QR Code'}
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C212C] transition-colors cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`/s/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${domain}/s/${item.slug}`}
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C212C] transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteItem(item)}
                          disabled={deletingSlug === item.slug}
                          aria-label={`Delete ${item.slug}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Simple Yes/Cancel Confirmation Modal (No typing required for shortlinks) */}
      <ConfirmActionModal
        isOpen={Boolean(pendingDeleteItem)}
        lang={lang}
        tone={session.isAuthenticated ? 'warning' : 'danger'}
        title={
          pendingDeleteItem
            ? lang === 'id'
              ? `Hapus shortlink ${domain}/s/${pendingDeleteItem.slug}?`
              : `Delete shortlink ${domain}/s/${pendingDeleteItem.slug}?`
            : ''
        }
        description={
          pendingDeleteItem
            ? session.isAuthenticated
              ? lang === 'id'
                ? `Tautan ${domain}/s/${pendingDeleteItem.slug} akan langsung dihapus dari rute redirect aktif sehingga tidak dapat diakses lagi. Anda dapat memindahkannya ke Recycle Bin (14 hari sebelum terhapus otomatis dari database) atau langsung menghapusnya permanen sekarang.`
                : `Shortlink ${domain}/s/${pendingDeleteItem.slug} will immediately be removed from live edge redirects. You can move it to the Recycle Bin (auto-purged from the database after 14 days) or permanently delete it right now.`
              : lang === 'id'
                ? `Tautan ${domain}/s/${pendingDeleteItem.slug} akan langsung dihapus secara permanen dari database Cloudflare dan berhenti dialihkan seketika.`
                : `Shortlink ${domain}/s/${pendingDeleteItem.slug} will be permanently erased from the Cloudflare database and stop redirecting immediately.`
            : ''
        }
        details={
          pendingDeleteItem
            ? `${domain}/s/${pendingDeleteItem.slug} → ${pendingDeleteItem.targetUrl}`
            : undefined
        }
        confirmLabel={
          session.isAuthenticated
            ? lang === 'id'
              ? 'Pindah ke Recycle Bin (14 hari)'
              : 'Move to Recycle Bin (14 days)'
            : lang === 'id'
              ? 'Ya, Hapus Permanen'
              : 'Yes, Delete Permanently'
        }
        secondaryAction={
          session.isAuthenticated && pendingDeleteItem
            ? {
                label:
                  lang === 'id'
                    ? 'Hapus Permanen dari DB'
                    : 'Delete Permanently from DB',
                tone: 'danger',
                onClick: () => void executeDelete(pendingDeleteItem, 'permanent'),
              }
            : undefined
        }
        loading={Boolean(pendingDeleteItem && deletingSlug === pendingDeleteItem.slug)}
        onConfirm={() => {
          if (!pendingDeleteItem) return;
          void executeDelete(
            pendingDeleteItem,
            session.isAuthenticated ? 'recycle' : 'permanent'
          );
        }}
        onCancel={() => {
          if (deletingSlug) return;
          setPendingDeleteItem(null);
        }}
      />

      {/* QR Code Modal for both newly created and previously existing shortlinks */}
      <QrCodeModal
        isOpen={Boolean(qrTargetRecord)}
        lang={lang}
        title={
          qrTargetRecord
            ? qrTargetRecord.title || `${domain}/s/${qrTargetRecord.slug}`
            : ''
        }
        subtitle={qrTargetRecord ? qrTargetRecord.targetUrl : undefined}
        url={qrTargetRecord ? `https://${domain}/s/${qrTargetRecord.slug}` : ''}
        filenameBase={qrTargetRecord ? `shortlink-${qrTargetRecord.slug}` : 'shortlink-qr'}
        design={
          qrTargetRecord
            ? {
                fgColor: '#0F172A',
                bgColor: '#FFFFFF',
                dotStyle: 'rounded',
                cornerStyle: 'rounded',
                frameStyle: 'bottom_bar',
                frameText: `${domain}/s/${qrTargetRecord.slug}`.slice(0, 42),
                frameColor: '#1D4ED8',
                frameTextColor: '#FFFFFF',
                centerLogoMode: 'none',
              }
            : undefined
        }
        onClose={() => setQrTargetRecord(null)}
      />
    </div>
  );
}
