import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  generateAliasExamples,
  resolveCanonicalEmail,
} from '../utils/mailIdentity';
import { checkReservedUsername } from '../utils/reservedUsernames';
import type { ActiveHostView } from './MailLinksTopBar';

interface MailLandingGateProps {
  lang: Language;
  session: SsoSession;
  onActivateMail: () => void;
  onLoginWithAuth0: () => void;
  onSelectHost: (host: ActiveHostView) => void;
}

export function MailLandingGate({
  lang,
  session,
  onActivateMail,
  onLoginWithAuth0,
  onSelectHost,
}: MailLandingGateProps) {
  const user = session.isAuthenticated ? session.username : 'fadhil';
  const domain = session.primaryDomain || 'imy.li';
  const [testInput, setTestInput] = useState(
    `${user.slice(0, 2)}.${user.slice(2) || 'id'}+github@${domain}`
  );
  const [legalAccepted, setLegalAccepted] = useState(false);

  const reservedCheck = session.isAuthenticated
    ? checkReservedUsername(session.username)
    : { isReserved: false, canonical: '', matchedWord: null, category: null };

  useEffect(() => {
    setTestInput(`${user.slice(0, 2)}.${user.slice(2) || 'id'}+github@${domain}`);
  }, [user, domain]);

  useEffect(() => {
    if (!session.isAuthenticated || !session.username) {
      setLegalAccepted(false);
      return;
    }
    try {
      const saved = window.localStorage.getItem(
        `vz_legal_consent_mail_v1:${session.username}`
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
            `vz_legal_consent_mail_v1:${session.username}`,
            'accepted'
          );
        } else {
          window.localStorage.removeItem(
            `vz_legal_consent_mail_v1:${session.username}`
          );
        }
      } catch {
        // Ignore storage errors
      }
    }
  };

  const canActivate =
    session.isAuthenticated && !reservedCheck.isReserved && legalAccepted;

  const resolved = resolveCanonicalEmail(testInput, [domain, 'vz.gay']);
  const aliasExamples = generateAliasExamples(user, domain);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
      {/* Hero Split: Mail Opt-In & SSO Gate */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8">
          <div className="space-y-4">
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>mail.vz.gay</span>
              <span aria-hidden="true"> · </span>
              <span>@{domain} Primary Identity</span>
              <span aria-hidden="true"> · </span>
              <span>Zero Server Retention</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display text-balance">
              {lang === 'id'
                ? `Email Privat Berbasis Perangkat Lokal dengan Identitas @${domain}`
                : `Local-First Conversational Email Powered by @${domain}`}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-[65ch]">
              {lang === 'id'
                ? `VZ Mail memadukan Cloudflare Email Routing & Email Sending tanpa VPS. Seperti WhatsApp, riwayat surat elektronik disimpan murni di IndexedDB perangkat lokal Anda—antrean transit di edge server langsung dihapus (Pop-and-Purge) begitu perangkat menarik pesan.`
                : `VZ Mail combines Cloudflare Email Routing and Email Sending with zero VPS dependency. Like WhatsApp, your message history lives exclusively in your device's local IndexedDB—the edge transit buffer is immediately purged once pulled.`}
            </p>
          </div>

          {/* SSO Opt-In Decision Box (Microsoft Live / Outlook Concept) */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-[#232732] space-y-4">
            {session.isAuthenticated ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? `Terautentikasi SSO Universal (accounts.vz.gay):`
                        : `Universal SSO Active (accounts.vz.gay):`}
                    </span>{' '}
                    <span className="font-mono">{session.username}</span>
                  </div>
                  <span>
                    {lang === 'id'
                      ? 'Status Kotak Surat: Belum Diaktifkan (Opt-In)'
                      : 'Mailbox Status: Not Provisioned Yet (Opt-In)'}
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
                        ? `Alamat ${session.username}@${domain} dicadangkan khusus untuk operasional resmi sistem (seperti admin, webmaster, noreply, cs, support). Ganti username akun SSO Anda di myaccount.vz.gay untuk mengaktifkan kotak surat pribadi.`
                        : `Address ${session.username}@${domain} is reserved for official system operations (e.g., admin, webmaster, noreply, support). Update your SSO username on myaccount.vz.gay to activate a personal mailbox.`}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {lang === 'id'
                        ? `Satu akun SSO digunakan untuk seluruh layanan ekosistem vz.gay. Anda bebas memilih apakah ingin membuat kotak surat ${user}@${domain} sekarang atau tidak (serupa akun Microsoft Live yang dapat dipakai tanpa membuat Outlook/Hotmail).`
                        : `One SSO account works across all vz.gay services. Choosing to create a ${user}@${domain} mailbox is completely optional (just like registering a Microsoft account without creating an Outlook inbox).`}
                    </p>

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
                            VZ Mail &amp; VZ Links, termasuk kepatuhan kebijakan TLD{' '}
                            <span className="font-mono">.gay</span> (anti-kebencian) &amp; ccTLD{' '}
                            <span className="font-mono">.li</span> (anti-spam/phishing).
                          </>
                        ) : (
                          <>
                            I agree to the VZ Mail &amp; VZ Links{' '}
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
                  </>
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 pt-1">
                  <button
                    type="button"
                    disabled={!canActivate}
                    onClick={onActivateMail}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {lang === 'id'
                        ? `Aktifkan Kotak Surat ${user}@${domain}`
                        : `Activate ${user}@${domain} Mailbox`}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectHost('links.vz.gay')}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232936] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span className="truncate">
                      {lang === 'id'
                        ? `Buka VZ Links (${user}.${domain})`
                        : `Explore VZ Links (${user}.${domain})`}
                    </span>
                  </button>

                  <a
                    href="https://myaccount.vz.gay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>myaccount.vz.gay</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {lang === 'id'
                    ? 'Masuk langsung dengan akun SSO Universal accounts.vz.gay. Setelah masuk, Anda dapat memilih untuk mengaktifkan email atau tidak.'
                    : 'Sign in directly with your universal accounts.vz.gay SSO account. Once signed in, you can choose whether or not to activate an email mailbox.'}
                </p>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={onLoginWithAuth0}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>
                      {lang === 'id'
                        ? 'Masuk dengan SSO'
                        : 'Sign In with SSO'}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectHost('links.vz.gay')}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg hover:bg-slate-200 dark:hover:bg-[#232936] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {lang === 'id'
                      ? 'Buka links.vz.gay'
                      : 'Open links.vz.gay'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Gmail-Style + and . Canonical Alias Simulator */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>Canonical Resolver</span>
              <span aria-hidden="true"> · </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {lang === 'id'
                  ? 'Alias + & . (Fasilitas Gratis)'
                  : '+ & . Aliases (100% Free)'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Uji Resolusi Alias Email (+ & .) Otomatis — Gratis'
                : 'Test Free Automatic (+ & .) Email Alias Resolution'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? `Fasilitas gratis untuk setiap akun SSO: 1 mailbox utama (${user}@${domain}) sudah mencakup variasi tanda titik (.) dan subaddressing (+) tak terbatas ke kotak surat yang sama.`
                : `Included free with every SSO account: 1 primary mailbox (${user}@${domain}) with unlimited dot (.) variations and plus (+) subaddresses routed to the same inbox.`}
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {lang === 'id'
                ? 'Ketik variasi alamat tujuan:'
                : 'Type any recipient alias variation:'}
            </label>
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            />

            <div className="p-4 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2 text-xs font-mono tabular-nums">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-slate-500 shrink-0">Canonical Inbox:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400 truncate">
                  {resolved.canonicalEmail}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-slate-500 shrink-0">Plus Filter Tag:</span>
                <span className="text-slate-800 dark:text-slate-200 truncate">
                  {resolved.plusTag ? `+${resolved.plusTag}` : 'none (primary)'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-slate-500 shrink-0">Dots Stripped:</span>
                <span className="text-slate-800 dark:text-slate-200 truncate">
                  {resolved.dotCount} dot(s) normalized
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-slate-500 shrink-0">Paired Link-in-Bio:</span>
                <span className="text-emerald-600 dark:text-emerald-400 truncate">
                  https://{resolved.pairedBioDomain}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'id'
                  ? 'Klik contoh alias gratis (+ / .) untuk mencoba:'
                  : 'Click a free (+ / .) alias example to test:'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {aliasExamples.map((ex) => (
                  <button
                    key={ex.address}
                    type="button"
                    onClick={() => setTestInput(ex.address)}
                    className="px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#252C3B] rounded transition-colors cursor-pointer"
                  >
                    {ex.address}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#232732] space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
              <span>
                {lang === 'id'
                  ? '1 Mailbox Utama + Alias (+ & .) di Atas:'
                  : '1 Primary Mailbox + (+ & .) Aliases Above:'}
              </span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {lang === 'id' ? 'Gratis · Aktif' : 'Free · Active'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
              <span>
                {lang === 'id'
                  ? 'Tambah Mailbox & Alias Tanpa + / . (1 Akun SSO):'
                  : 'Add Extra Mailbox & Custom Alias Without + / . (1 SSO):'}
              </span>
              <span className="font-mono text-amber-600 dark:text-amber-400">
                {lang === 'id'
                  ? 'Coming Soon · Paket Berbayar'
                  : 'Coming Soon · Paid Package'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Architectural Proof Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>01. Local-First DB</span>
            <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Penyimpanan Perangkat (Mirip WhatsApp)'
              : 'Device-Local Storage (WhatsApp Model)'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Kotak masuk tidak disimpan permanen di database cloud. Begitu ditarik ke IndexedDB browser, antrean transit di Cloudflare Worker langsung dikosongkan.'
              : 'Your inbox is never stored permanently in a cloud database. Once pulled into browser IndexedDB, the Cloudflare Worker transit queue is immediately purged.'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>02. Dual Inbox UI</span>
            <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Gelembung Percakapan & Tabel Klasik'
              : 'Conversational Bubbles & Classic Grid'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Balas email secepat chat dengan tampilan gelembung yang terhubung ke chat.vz.gay, atau beralih ke tabel email klasik berdensitas tinggi.'
              : 'Reply to emails as fast chat bubbles bridged with chat.vz.gay, or switch anytime to a high-density classic inbox table.'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>03. MyVault Portability</span>
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Ekspor & Impor .eml, .mbox, .enc'
              : 'Portable .eml, .mbox & .enc Vaults'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Pindahkan seluruh riwayat email antar perangkat lewat berkas standar .eml/.mbox atau kontainer terenkripsi AES-256-GCM (.enc MyVault).'
              : 'Migrate your email history across devices using standard RFC 5322 .eml/.mbox files or AES-256-GCM password-encrypted .enc containers.'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>04. 2-in-1 Worker</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Terintegrasi ${user}.${domain} & ${domain}/s/`
              : `Paired with ${user}.${domain} & ${domain}/s/`}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? `Satu deployment Cloudflare Worker melayani mail.vz.gay, links.vz.gay, halaman bio statis ${user}.${domain}, serta shortlink ${domain}/s/$URL.`
              : `A single 2-in-1 Cloudflare Worker serves mail.vz.gay, links.vz.gay, static ${user}.${domain} bio pages, and ${domain}/s/$URL shortlinks.`}
          </p>
        </div>
      </section>

      {/* Active Ecosystem Status & myaccount.vz.gay Table */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Status Modul Akun SSO Anda (mail.vz.gay & links.vz.gay)'
                : 'Your SSO Account Module Status (mail.vz.gay & links.vz.gay)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? 'Setiap layanan bersifat opt-in dan dapat diaktifkan/dinonaktifkan dari sini maupun melalui dasbor terpusat myaccount.vz.gay.'
                : 'Each service is opt-in and can be enabled or disabled here or via the central myaccount.vz.gay account dashboard.'}
            </p>
          </div>
          {session.isAuthenticated ? (
            <a
              href="https://myaccount.vz.gay"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#242B3A] rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <span>myaccount.vz.gay</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={onLoginWithAuth0}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'id' ? 'Masuk dengan SSO' : 'Sign In with SSO'}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#232732] text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Layanan / Service</th>
                <th className="py-2.5 px-4 font-medium">Domain & Identitas</th>
                <th className="py-2.5 px-4 font-medium">Status SSO</th>
                <th className="py-2.5 pl-4 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232732] font-mono text-xs">
              <tr className="h-11">
                <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900 dark:text-white">
                  VZ Mail (mail.vz.gay)
                </td>
                <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                  {user}@{domain} (+ / . aliases)
                </td>
                <td className="py-2.5 px-4">
                  {session.mailActivated ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Not Activated (Opt-In)</span>
                  )}
                </td>
                <td className="py-2.5 pl-4 text-right font-sans">
                  <button
                    type="button"
                    disabled={session.isAuthenticated && !canActivate}
                    onClick={onActivateMail}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {lang === 'id' ? 'Aktifkan Sekarang' : 'Activate Now'}
                  </button>
                </td>
              </tr>
              <tr className="h-11">
                <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900 dark:text-white">
                  VZ Links (links.vz.gay)
                </td>
                <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                  {user}.{domain} & {domain}/s/$URL
                </td>
                <td className="py-2.5 px-4">
                  {session.linksActivated ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Not Activated (Opt-In)</span>
                  )}
                </td>
                <td className="py-2.5 pl-4 text-right font-sans">
                  <button
                    type="button"
                    onClick={() => onSelectHost('links.vz.gay')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {lang === 'id' ? 'Buka links.vz.gay' : 'Open links.vz.gay'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
