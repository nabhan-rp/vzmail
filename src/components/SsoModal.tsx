import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, LogOut, ShieldCheck, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import { calculateAgeFromDob, type SsoSession } from '../hooks/useSsoSession';

interface SsoModalProps {
  isOpen: boolean;
  lang: Language;
  session: SsoSession;
  age: number | null;
  isVerifiedAdult21: boolean;
  onSignIn: (username: string, birthDate: string) => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function SsoModal({
  isOpen,
  lang,
  session,
  age,
  isVerifiedAdult21,
  onSignIn,
  onSignOut,
  onClose,
}: SsoModalProps) {
  const t = UI_COPY[lang].ssoModal;
  const [usernameInput, setUsernameInput] = useState(session.username || '');
  const [dobInput, setDobInput] = useState(session.birthDate || '');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setUsernameInput(session.username || '');
    setDobInput(session.birthDate || '');
    setFormError('');
  }, [session.username, session.birthDate, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || 'accounts.vz.gay';
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const accountPortalUrl = import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';
  const redirectUri =
    import.meta.env.VITE_AUTH0_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/callback` : 'https://vz.gay/callback');

  const authorizeUrl = clientId
    ? `https://${auth0Domain}/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20profile%20email`
    : `https://${auth0Domain}`;

  const handleVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    const calculated = calculateAgeFromDob(dobInput);
    if (calculated === null) {
      setFormError(t.invalidDobError);
      return;
    }
    setFormError('');
    onSignIn(usernameInput.trim() || 'vz_user', dobInput);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sso-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#232732]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="sso-modal-title"
                className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {t.title}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {t.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.howItWorks}
          </p>

          <div className="space-y-2.5">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.ssoDomainLabel}</span>
              <span className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                {auth0Domain}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.dashboardLabel}</span>
              <span className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                myaccount.vz.gay
              </span>
            </div>
          </div>

          {/* Interactive SSO + 21+ Date of Birth Verification */}
          <div className="pt-4 border-t border-slate-200 dark:border-[#232732]">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {t.sessionSectionTitle}
            </h3>

            {session.isAuthenticated && (
              <div className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 dark:text-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {t.activeSessionLabel}{' '}
                      <span className="font-mono">{session.username}</span>
                      {age !== null ? ` (${age} ${t.ageYearsLabel})` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.signOutButton}</span>
                  </button>
                </div>
                <p
                  className={`text-xs leading-relaxed ${
                    isVerifiedAdult21
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {isVerifiedAdult21 ? t.unlocked21Note : t.restrictedUnder21Note}
                </p>
              </div>
            )}

            <form onSubmit={handleVerifySubmit} className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="sso-username"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    {t.usernameLabel}
                  </label>
                  <input
                    id="sso-username"
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder={t.usernamePlaceholder}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0E1117] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sso-dob"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    {t.dobLabel}
                  </label>
                  <input
                    id="sso-dob"
                    type="date"
                    required
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0E1117] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 tabular-nums"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">{t.dobHelper}</p>

              {formError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2 px-4 text-xs sm:text-sm font-medium text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors cursor-pointer"
              >
                {t.verifyButton}
              </button>
            </form>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {clientId ? t.statusReady : t.statusStandby}
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-end gap-3">
          <a
            href={accountPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.openDashboard}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
          <a
            href={authorizeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.launchLogin}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
