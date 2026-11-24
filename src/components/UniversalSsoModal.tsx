import {
  AlertCircle,
  ExternalLink,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import { sanitizeHandle } from '../utils/mailIdentity';

interface UniversalSsoModalProps {
  isOpen: boolean;
  lang: Language;
  session: SsoSession;
  isLoading?: boolean;
  authError?: Error | null;
  auth0Domain?: string;
  onLoginWithAuth0: () => void;
  onSignupWithAuth0: () => void;
  onSignIn: (
    username: string,
    birthDate: string,
    options?: { mailActivated?: boolean; linksActivated?: boolean }
  ) => void;
  onSignOut: () => void;
  onActivateMail: () => void;
  onDeactivateMail: () => void;
  onActivateLinks: () => void;
  onDeactivateLinks: () => void;
  onClose: () => void;
}

export function UniversalSsoModal({
  isOpen,
  lang,
  session,
  isLoading = false,
  authError = null,
  auth0Domain = 'galbay.eu.auth0.com',
  onLoginWithAuth0,
  onSignupWithAuth0,
  onSignIn,
  onSignOut,
  onActivateMail,
  onDeactivateMail,
  onActivateLinks,
  onDeactivateLinks,
  onClose,
}: UniversalSsoModalProps) {
  const [usernameInput, setUsernameInput] = useState(
    session.username || 'fadhil'
  );
  const [birthDateInput, setBirthDateInput] = useState(
    session.birthDate || '2001-05-14'
  );
  const [optInMail, setOptInMail] = useState(false);
  const [optInLinks, setOptInLinks] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setUsernameInput(session.username || 'fadhil');
    setBirthDateInput(session.birthDate || '2001-05-14');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, session.username, session.birthDate, onClose]);

  if (!isOpen) return null;

  const cleanPreview = sanitizeHandle(usernameInput || 'fadhil');
  const domain = session.primaryDomain || 'imy.li';
  const accountPortalUrl =
    import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';

  const handleLocalPreviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSignIn(cleanPreview, birthDateInput, {
      mailActivated: optInMail,
      linksActivated: optInLinks,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Universal SSO"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-[#232732] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-mono text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{auth0Domain} · Auth0 Universal SSO</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {session.isAuthenticated
                ? lang === 'id'
                  ? `Akun SSO Terpadu (${session.username})`
                  : `Universal SSO Identity (${session.username})`
                : lang === 'id'
                  ? 'Masuk dengan Auth0 SSO'
                  : 'Sign In with Auth0 SSO'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? 'Satu login Auth0 berlaku untuk seluruh domain ekosistem (mail.vz.gay, links.vz.gay, *.imy.li). Layanan email & bio bersifat opt-in.'
                : 'One Auth0 login covers every ecosystem domain (mail.vz.gay, links.vz.gay, *.imy.li). Email and link-in-bio modules are opt-in.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
            <span>
              {lang === 'id'
                ? 'Memeriksa sesi autentikasi Auth0...'
                : 'Checking Auth0 authentication session...'}
            </span>
          </div>
        ) : session.isAuthenticated ? (
          <div className="space-y-5">
            {session.authProvider === 'auth0' && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-center gap-3">
                {session.picture ? (
                  <img
                    src={session.picture}
                    alt={session.name || session.username}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-blue-200 dark:border-blue-800 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {(session.name || session.username).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {session.name || session.username}
                  </div>
                  {session.email && (
                    <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {session.email}
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                    Auth0 Verified · {session.sub || auth0Domain}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Auth Mode:</span>
                <span
                  className={
                    session.authProvider === 'auth0'
                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                      : 'font-semibold text-amber-600 dark:text-amber-400'
                  }
                >
                  {session.authProvider === 'auth0'
                    ? 'Auth0 Live OIDC'
                    : 'Local Preview Mode'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">SSO Handle:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {session.username}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reserved Email Slot:</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {session.username}@{domain}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Alias (+ &amp; .):</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {lang === 'id' ? 'Gratis (Tak Terbatas)' : 'Free (Unlimited)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reserved Bio Slot:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {session.username}.{domain}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">
                  {lang === 'id'
                    ? 'Tambah Mailbox / Alias Tanpa +/.:'
                    : 'Extra Mailbox / Alias Without +/.:'}
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  Coming Soon (Paid)
                </span>
              </div>
            </div>

            {/* Opt-In Service Activation Toggles */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'id'
                  ? 'Aktivasi Layanan (Opt-In — Seperti Microsoft Account / Outlook):'
                  : 'Opt-In Service Activation (Microsoft Live / Outlook Model):'}
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      VZ Mail (`mail.vz.gay`)
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {session.username}@{domain}
                    </div>
                  </div>
                </div>
                {session.mailActivated ? (
                  <button
                    type="button"
                    onClick={onDeactivateMail}
                    className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-md cursor-pointer"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onActivateMail();
                      onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                  >
                    Activate
                  </button>
                )}
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      VZ Links (`links.vz.gay`)
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {session.username}.{domain} &amp; {domain}/s/
                    </div>
                  </div>
                </div>
                {session.linksActivated ? (
                  <button
                    type="button"
                    onClick={onDeactivateLinks}
                    className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-md cursor-pointer"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onActivateLinks();
                      onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>

            {/* External Dashboard Notice (myaccount.vz.gay) */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 text-xs">
              <div className="text-slate-600 dark:text-slate-400">
                {lang === 'id'
                  ? 'Kelola semua layanan vz.gay lainnya (enable/disable) di aplikasi dasbor terpisah:'
                  : 'Manage all other vz.gay ecosystem services in the separate central dashboard:'}
              </div>
              <a
                href={accountPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
              >
                <span>myaccount.vz.gay</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>
                  {session.authProvider === 'auth0'
                    ? lang === 'id'
                      ? 'Logout Auth0'
                      : 'Auth0 Logout'
                    : lang === 'id'
                      ? 'Keluar Mode Preview'
                      : 'Exit Preview Mode'}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-600 rounded-lg cursor-pointer"
              >
                {lang === 'id' ? 'Selesai' : 'Done'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {authError && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Auth0 Error: {authError.message}</div>
                  <div className="text-[11px] opacity-90">
                    {lang === 'id'
                      ? `Pastikan origin ${typeof window !== 'undefined' ? window.location.origin : ''} sudah didaftarkan di Allowed Callback URLs, Allowed Logout URLs, dan Allowed Web Origins di Auth0 Dashboard.`
                      : `Ensure ${typeof window !== 'undefined' ? window.location.origin : ''} is added to Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins in your Auth0 Dashboard.`}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'id'
                  ? 'Otentikasi Resmi Auth0 Universal Login'
                  : 'Official Auth0 Universal Login'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'id'
                  ? `Anda akan diarahkan ke halaman login terenkripsi ${auth0Domain} untuk masuk atau membuat akun baru.`
                  : `You will be redirected to ${auth0Domain} to sign in or create a new account securely.`}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onLoginWithAuth0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{lang === 'id' ? 'Masuk (Login)' : 'Login'}</span>
                </button>

                <button
                  type="button"
                  onClick={onSignupWithAuth0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white bg-slate-200 dark:bg-[#1E2430] hover:bg-slate-300 dark:hover:bg-[#272F3F] rounded-lg cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{lang === 'id' ? 'Daftar (Signup)' : 'Signup'}</span>
                </button>
              </div>
            </div>

            <details className="rounded-lg border border-slate-200 dark:border-[#232732] p-3.5 text-xs">
              <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-400 select-none">
                {lang === 'id'
                  ? 'Mode Preview Lokal / Offline Demo (Opsional tanpa Auth0)'
                  : 'Local Preview / Offline Demo Mode (Optional without Auth0)'}
              </summary>

              <form onSubmit={handleLocalPreviewSubmit} className="space-y-3.5 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Username Handle ($USERNAME):
                  </label>
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="fadhil"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                  <div className="mt-1.5 text-[11px] font-mono text-slate-500">
                    1:1 Reserved Pair: <strong>{cleanPreview}@{domain}</strong> &amp;{' '}
                    <strong>{cleanPreview}.{domain}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'id' ? 'Tanggal Lahir (Opsional):' : 'Birth Date (Optional):'}
                  </label>
                  <input
                    type="date"
                    value={birthDateInput}
                    onChange={(e) => setBirthDateInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optInMail}
                      onChange={(e) => setOptInMail(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      {lang === 'id'
                        ? `Aktifkan kotak surat ${cleanPreview}@${domain}`
                        : `Activate ${cleanPreview}@${domain} mailbox`}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optInLinks}
                      onChange={(e) => setOptInLinks(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      {lang === 'id'
                        ? `Aktifkan bio ${cleanPreview}.${domain} & shortlink`
                        : `Activate ${cleanPreview}.${domain} bio & shortlinks`}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-slate-200 dark:bg-[#1E2430] hover:bg-slate-300 dark:hover:bg-[#272F3F] rounded-lg cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {lang === 'id'
                      ? 'Masuk Mode Preview Lokal'
                      : 'Enter Local Preview Mode'}
                  </span>
                </button>
              </form>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
