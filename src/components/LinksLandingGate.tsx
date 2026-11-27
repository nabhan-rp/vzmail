import {
  ArrowRight,
  ExternalLink,
  Layers,
  Link2,
  Palette,
  Scissors,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import { checkReservedUsername } from '../utils/reservedUsernames';
import { InAppSsoNotice } from './InAppSsoNotice';
import type { ActiveHostView } from './MailLinksTopBar';

interface LinksLandingGateProps {
  lang: Language;
  session: SsoSession;
  onActivateLinks: () => void;
  onLoginWithAuth0: () => void;
  onSelectHost: (host: ActiveHostView) => void;
}

export function LinksLandingGate({
  lang,
  session,
  onActivateLinks,
  onLoginWithAuth0,
  onSelectHost,
}: LinksLandingGateProps) {
  const user = session.isAuthenticated ? session.username : 'username';
  const domain = session.primaryDomain || 'imy.li';
  const [legalAccepted, setLegalAccepted] = useState(false);

  const reservedCheck = session.isAuthenticated
    ? checkReservedUsername(session.username)
    : { isReserved: false, canonical: '', matchedWord: null, category: null };

  useEffect(() => {
    if (!session.isAuthenticated || !session.username) {
      setLegalAccepted(false);
      return;
    }
    try {
      const saved = window.localStorage.getItem(
        `vz_legal_consent_links_v1:${session.username}`
      );
      setLegalAccepted(saved === 'accepted');
    } catch {
      setLegalAccepted(false);
    }
  }, [session.isAuthenticated, session.username]);

  const handleToggleConsent = (checked: boolean) => {
    setLegalAccepted(checked);
    if (session.isAuthenticated && session.username) {
      try {
        if (checked) {
          window.localStorage.setItem(
            `vz_legal_consent_links_v1:${session.username}`,
            'accepted'
          );
        } else {
          window.localStorage.removeItem(
            `vz_legal_consent_links_v1:${session.username}`
          );
        }
      } catch {
        // Ignore storage errors
      }
    }
  };

  const canActivate =
    session.isAuthenticated && !reservedCheck.isReserved && legalAccepted;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
      {/* 2-Card Split: Multi-Page Bio (Left) + Standalone URL Shortener Direct Access (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Multi-Page Link-in-Bio Activation */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-4">
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>links.vz.gay</span>
              <span aria-hidden="true"> · </span>
              <span>{user}.{domain}</span>
              <span aria-hidden="true"> · </span>
              <span>{user}.{domain}/$PAGE</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display text-balance">
              {lang === 'id'
                ? `Multi-Page Link-in-Bio ${user}.${domain}`
                : `Multi-Page Link-in-Bio on ${user}.${domain}`}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[62ch]">
              {lang === 'id'
                ? `Buat halaman profil utama di ${user}.${domain} lengkap dengan ikon sosial media (hanya tampil jika diisi), serta tambah banyak sub-halaman terpisah seperti ${user}.${domain}/promo atau ${user}.${domain}/kerja dengan tema warna sendiri.`
                : `Build your main profile on ${user}.${domain} with optional social icons (shown only when filled), plus unlimited separate sub-pages like ${user}.${domain}/promo or ${user}.${domain}/work with custom color themes.`}
            </p>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-[#232732] space-y-4">
            {session.isAuthenticated ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    {lang === 'id' ? 'Akun SSO:' : 'SSO Account:'}{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {session.username}
                    </strong>
                  </span>
                  <span className="font-mono">
                    {lang === 'id'
                      ? 'Status Bio: Belum Diaktifkan'
                      : 'Bio Status: Not Activated'}
                  </span>
                </div>

                {reservedCheck.isReserved ? (
                  <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'id'
                          ? `Username sistem "${session.username}" dilindungi (Reserved)`
                          : `System username "${session.username}" is reserved`}
                      </span>
                    </div>
                    <p className="leading-relaxed">
                      {lang === 'id'
                        ? `Subdomain ${session.username}.${domain} dicadangkan khusus untuk operasional resmi sistem (admin, webmaster, noreply, support, dll.). Ubah username SSO Anda di myaccount.vz.gay untuk mengaktifkan Studio Bio.`
                        : `Subdomain ${session.username}.${domain} is reserved for official system operations (admin, webmaster, noreply, support, etc.). Update your SSO username on myaccount.vz.gay to activate Bio Studio.`}
                    </p>
                  </div>
                ) : (
                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={legalAccepted}
                      onChange={(e) => handleToggleConsent(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 shrink-0"
                    />
                    <span className="leading-relaxed">
                      {lang === 'id' ? (
                        <>
                          Saya menyetujui{' '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectHost('terms');
                            }}
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Syarat &amp; Ketentuan
                          </button>{' '}
                          dan{' '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectHost('privacy');
                            }}
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Kebijakan Privasi
                          </button>{' '}
                          VZ Links &amp; VZ Mail, termasuk aturan TLD{' '}
                          <span className="font-mono">.gay</span> (anti-kebencian) &amp; ccTLD{' '}
                          <span className="font-mono">.li</span> (anti-phishing/malware).
                        </>
                      ) : (
                        <>
                          I agree to the VZ Links &amp; VZ Mail{' '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectHost('terms');
                            }}
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Terms of Service
                          </button>{' '}
                          and{' '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectHost('privacy');
                            }}
                            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Privacy Policy
                          </button>
                          , including <span className="font-mono">.gay</span> Rights Protections
                          Policy and SWITCH <span className="font-mono">.li</span> anti-abuse rules.
                        </>
                      )}
                    </span>
                  </label>
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
                  <button
                    type="button"
                    disabled={!canActivate}
                    onClick={onActivateLinks}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Link2 className="w-4 h-4 shrink-0" />
                    <span>
                      {lang === 'id'
                        ? `Aktifkan Studio Bio (${user}.${domain})`
                        : `Activate Bio Studio (${user}.${domain})`}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <a
                    href="https://myaccount.vz.gay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <span>myaccount.vz.gay</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onLoginWithAuth0}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>
                      {lang === 'id' ? 'Masuk SSO untuk Atur Bio' : 'Sign In SSO to Manage Bio'}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
                <InAppSsoNotice lang={lang} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Direct Shortcut to Standalone URL Shortener (imy.li/s/) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <span>{domain}/s/$RANDOM</span>
              <span aria-hidden="true"> · </span>
              <span>{lang === 'id' ? 'Bisa Tanpa Login' : 'No Login Needed'}</span>
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? `Pemendek URL Mandiri (${domain}/s/)`
                : `Standalone URL Shortener (${domain}/s/)`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? `Ingin menyingkat tautan panjang saja tanpa mengatur halaman Bio? Tempel URL tujuan Anda untuk langsung membuat tautan pendek acak atau custom slug dengan penghitung klik nyata.`
                : `Just want to shorten a long URL without setting up a Bio page? Paste any destination link to generate a random code or custom slug with real click tracking immediately.`}
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Random Code:</span>
                <span className="text-slate-900 dark:text-white">
                  https://{domain}/s/k8m2x9
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Custom Slug:</span>
                <span className="text-blue-600 dark:text-blue-400">
                  https://{domain}/s/slug-anda
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectHost('shortlinks')}
              className="w-full min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 rounded-lg inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Scissors className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'id'
                  ? `Buka Pemendek URL (${domain}/s/)`
                  : `Open URL Shortener (${domain}/s/)`}
              </span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* 3-Column Feature Summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>01. Multi-Page Bio</span>
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Banyak Halaman dalam 1 Subdomain'
              : 'Multiple Pages on 1 Subdomain'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? `Pisahkan daftar tautan utama di ${user}.${domain} dengan sub-halaman khusus seperti /kerja, /toko, atau /event.`
              : `Separate your main profile links on ${user}.${domain} from dedicated sub-pages like /work, /shop, or /events.`}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>02. Tema & Sosmed</span>
            <Palette className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? '16 Ikon Sosmed & Tema per Halaman'
              : '16 Social Icons & Per-Page Themes'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Semua ikon sosmed populer siap pakai dan hanya tampil bila Anda mengisi tautannya. Setiap halaman bebas memilih tema warna sendiri.'
              : 'All popular social icons are built in and stay hidden until filled. Every bio page can use its own color palette and button style.'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>03. Cloudflare Edge</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Tervalidasi & Tanpa Data Palsu'
              : 'Validated & Real Edge Storage'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Setiap tautan dan hitungan klik disimpan nyata di Cloudflare D1 / KV dengan validasi URL otomatis.'
              : 'Every link and click counter is stored directly in Cloudflare D1 / KV with automatic URL validation.'}
          </p>
        </div>
      </section>
    </div>
  );
}
