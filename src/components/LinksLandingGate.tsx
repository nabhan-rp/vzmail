import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import { sanitizeHandle } from '../utils/mailIdentity';
import type { ActiveHostView } from './MailLinksTopBar';

interface LinksLandingGateProps {
  lang: Language;
  session: SsoSession;
  onActivateLinks: () => void;
  onOpenSso: () => void;
  onSelectHost: (host: ActiveHostView) => void;
}

export function LinksLandingGate({
  lang,
  session,
  onActivateLinks,
  onOpenSso,
  onSelectHost,
}: LinksLandingGateProps) {
  const user = session.isAuthenticated ? session.username : 'fadhil';
  const domain = session.primaryDomain || 'imy.li';
  const [previewHandle, setPreviewHandle] = useState(user);
  const [previewSlug, setPreviewSlug] = useState('portfolio');

  useEffect(() => {
    setPreviewHandle(user);
  }, [user]);

  const cleanHandle = sanitizeHandle(previewHandle || user);
  const cleanSlug =
    previewSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '') || 'portfolio';

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
      {/* Hero Split for links.vz.gay */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8">
          <div className="space-y-4">
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>links.vz.gay</span>
              <span aria-hidden="true"> · </span>
              <span>
                {user}.{domain} Link-in-Bio
              </span>
              <span aria-hidden="true"> · </span>
              <span>{domain}/s/$URL Shortener</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display text-balance">
              {lang === 'id'
                ? `Halaman Link-in-Bio ${user}.${domain} & Pemendek Tautan ${domain}/s/`
                : `Static PSL-Safe Link-in-Bio (${user}.${domain}) & ${domain}/s/ Shortlinks`}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
              {lang === 'id'
                ? `VZ Links memasangkan identitas SSO Anda dengan subdomain profil statis ${user}.${domain} (terisolasi tanpa cookie lintas-subdomain & bebas skrip pihak ketiga) serta pemendek URL cepat di ${domain}/s/$URL—berjalan dalam satu Cloudflare Worker terpadu bersama VZ Mail.`
                : `VZ Links pairs your universal SSO handle with a curated static ${user}.${domain} profile (zero cross-subdomain cookie collision, no arbitrary third-party JS) and ultra-fast ${domain}/s/$URL shortlinks—powered by the same 2-in-1 Cloudflare Worker as VZ Mail.`}
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-[#232732] space-y-4">
            {session.isAuthenticated ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? 'Akun SSO Universal (accounts.vz.gay):'
                        : 'Universal SSO Account (accounts.vz.gay):'}
                    </span>{' '}
                    <span className="font-mono">{session.username}</span>
                  </div>
                  <span>
                    {lang === 'id'
                      ? `Status VZ Links: Belum Diaktifkan (Opt-In)`
                      : `VZ Links Status: Not Activated Yet (Opt-In)`}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {lang === 'id'
                    ? `Jika Anda mengaktifkan VZ Links terlebih dahulu, sistem juga akan menawarkan opsi apakah Anda ingin sekalian mengonfigurasi kotak surat email ${user}@${domain} di VZ Mail.`
                    : `If you activate VZ Links first, you will also be prompted with the option to configure your paired ${user}@${domain} email mailbox on VZ Mail.`}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onActivateLinks}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>
                      {lang === 'id'
                        ? `Aktifkan ${user}.${domain} & Shortlink`
                        : `Activate ${user}.${domain} & Shortlinks`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectHost('mail.vz.gay')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232936] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>
                      {lang === 'id'
                        ? `Buka VZ Mail (${user}@${domain})`
                        : `Explore VZ Mail (${user}@${domain})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenSso}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>myaccount.vz.gay</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {lang === 'id'
                    ? 'Masuk dengan akun SSO accounts.vz.gay untuk mengklaim subdomain Link-in-Bio dan membuat shortlink.'
                    : 'Sign in with your accounts.vz.gay SSO identity to claim your Link-in-Bio subdomain and create shortlinks.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onOpenSso}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>
                      {lang === 'id'
                        ? 'Masuk via SSO accounts.vz.gay'
                        : 'Sign In via accounts.vz.gay SSO'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectHost('mail.vz.gay')}
                    className="px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg hover:bg-slate-200 dark:hover:bg-[#232936] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {lang === 'id'
                      ? 'Lihat Landing Page mail.vz.gay'
                      : 'View mail.vz.gay Landing Page'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Namespace Simulator ($USERNAME.imy.li + imy.li/s/$URL) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>Unified {domain} Namespace</span>
              <span aria-hidden="true"> · </span>
              <span>1:1 Identity Pairing</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Simulasi Pairing Bio, Email & Shortlink'
                : 'Live Bio, Email & Shortlink Pairing Preview'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? 'Satu username SSO mengunci alamat email dan subdomain bio yang sama agar tidak dapat diklaim orang lain.'
                : 'A single SSO username reserves both the matching email handle and link-in-bio subdomain so no one else can claim it.'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Handle ($USERNAME):
                </label>
                <input
                  type="text"
                  value={previewHandle}
                  onChange={(e) => setPreviewHandle(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Shortlink Slug ($URL):
                </label>
                <input
                  type="text"
                  value={previewSlug}
                  onChange={(e) => setPreviewSlug(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Link-in-Bio URL:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  https://{cleanHandle}.{domain}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Paired Email (1:1):</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {cleanHandle}@{domain}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Shortlink Format:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  https://{domain}/s/{cleanSlug}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Cookie Isolation:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  Zero-Cookie Static (PSL Safe)
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Wildcard SSL & Edge Routing:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              *.{domain}/* + {domain}/s/*
            </span>
          </div>
        </div>
      </section>

      {/* 3-Column Technical Architecture Highlights for VZ Links */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>01. Zero Cookie Collision</span>
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Aman Tanpa Public Suffix List (PSL)'
              : 'Safe Without Public Suffix List (PSL)'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? `Semua sesi login disimpan terpusat di accounts.vz.gay & links.vz.gay, sedangkan halaman ${user}.${domain} dirender murni statis tanpa custom JS bebas dari user.`
              : `All login sessions stay strictly on accounts.vz.gay & links.vz.gay while ${user}.${domain} renders as curated static HTML with zero arbitrary user JavaScript.`}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>02. Shortlink Namespace</span>
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Pemendek URL ${domain}/s/$URL`
              : `Fast ${domain}/s/$URL Redirection`}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? `Path ${domain}/s/$URL menangani pengalihan HTTP 301 berkecepatan tinggi di edge Cloudflare lengkap dengan penghitung klik tabular-nums.`
              : `Root path ${domain}/s/$URL performs instant HTTP 301 edge redirects backed by Cloudflare KV with real-time click counters.`}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>03. Anti-Phishing Guard</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Proteksi Reputasi Domain & Email'
              : 'Shared Domain Reputation Protection'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? `Seluruh tautan di ${user}.${domain} dan ${domain}/s/ divalidasi otomatis agar domain ${domain} tetap bersih dari suspend registry maupun filter spam email.`
              : `Every URL on ${user}.${domain} and ${domain}/s/ is validated automatically so the shared ${domain} root maintains clean registry and email deliverability reputation.`}
          </p>
        </div>
      </section>

      {/* Quick Preview CTA to Public Bio */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Live Static Subdomain Preview Ready</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Ingin melihat tampilan halaman publik ${user}.${domain} terlebih dahulu?`
              : `Want to preview how the public ${user}.${domain} page looks first?`}
          </h3>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectHost('bio_public')}
            className="px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#252C3B] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {lang === 'id'
              ? `Pratinjau ${user}.${domain}`
              : `Preview ${user}.${domain}`}
          </button>
          <button
            type="button"
            onClick={onActivateLinks}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {lang === 'id' ? 'Aktifkan & Edit Bio' : 'Activate & Edit Bio'}
          </button>
        </div>
      </section>
    </div>
  );
}
