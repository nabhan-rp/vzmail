import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Globe,
  Link2,
  LogOut,
  Mail,
  Menu,
  Moon,
  Plus,
  Scissors,
  Server,
  ShieldCheck,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import type { ThemePreference } from '../hooks/useTheme';
import { BrandMark } from './BrandMark';

export type ActiveHostView =
  | 'mail.vz.gay'
  | 'links.vz.gay'
  | 'bio_public'
  | 'shortlinks'
  | 'worker_console';

interface MailLinksTopBarProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: ThemePreference;
  onChangeTheme: (theme: ThemePreference) => void;
  activeHost: ActiveHostView;
  onSelectHost: (host: ActiveHostView) => void;
  session: SsoSession;
  isAdminOwner: boolean;
  isAuthLoading?: boolean;
  onLoginWithAuth0: () => void;
  onSignupWithAuth0: () => void;
  onSignOut: () => void;
  onActivateMail: () => void;
  onDeactivateMail: () => void;
  onActivateLinks: () => void;
  onDeactivateLinks: () => void;
  onOpenCompose: () => void;
  onOpenInstall?: () => void;
  isInstalled?: boolean;
  isIos?: boolean;
}

export function MailLinksTopBar({
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  activeHost,
  onSelectHost,
  session,
  isAdminOwner,
  isAuthLoading = false,
  onLoginWithAuth0,
  onSignupWithAuth0,
  onSignOut,
  onActivateMail,
  onDeactivateMail,
  onActivateLinks,
  onDeactivateLinks,
  onOpenCompose,
  onOpenInstall,
  isInstalled = false,
  isIos = false,
}: MailLinksTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const handle = session.isAuthenticated ? session.username : 'username';
  const domain = session.primaryDomain || 'imy.li';
  const initials = (session.username || 'VZ').slice(0, 2).toUpperCase();

  const brandVariant: 'mail' | 'links' =
    activeHost === 'links.vz.gay' ||
    activeHost === 'shortlinks' ||
    activeHost === 'bio_public'
      ? 'links'
      : 'mail';

  const brandWordmark =
    activeHost === 'links.vz.gay' || activeHost === 'shortlinks'
      ? 'VZ Links'
      : activeHost === 'bio_public'
        ? `${handle}.${domain}`
        : 'VZ Mail';

  const baseNavItems: {
    id: ActiveHostView;
    label: string;
    subtitle: string;
    icon: typeof Mail;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'mail.vz.gay',
      label: 'mail.vz.gay',
      subtitle:
        lang === 'id'
          ? `Email Lokal Privat (@${domain})`
          : `Local-First Email (@${domain})`,
      icon: Mail,
    },
    {
      id: 'links.vz.gay',
      label: 'links.vz.gay',
      subtitle:
        lang === 'id'
          ? 'Studio Link-in-Bio & Tautan'
          : 'Link-in-Bio & Links Studio',
      icon: Link2,
    },
    {
      id: 'bio_public',
      label: `${handle}.${domain}`,
      subtitle:
        lang === 'id'
          ? 'Pratinjau Halaman Bio Statis'
          : 'Static Bio Page Preview',
      icon: Globe,
    },
    {
      id: 'shortlinks',
      label: `${domain}/s/`,
      subtitle:
        lang === 'id'
          ? 'Pemendek Tautan HTTP 301'
          : 'Fast HTTP 301 Shortlinks',
      icon: Scissors,
    },
    {
      id: 'worker_console',
      label: lang === 'id' ? 'Worker & Domain' : 'Worker & Domains',
      subtitle:
        lang === 'id'
          ? 'DNS Deliverability & Registry'
          : 'DNS Deliverability & Registry',
      icon: Server,
      adminOnly: true,
    },
  ];

  const navItems = baseNavItems.filter(
    (item) => !item.adminOnly || isAdminOwner
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!accountDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [accountDropdownOpen]);

  const handleNavigateFromDrawer = (host: ActiveHostView) => {
    setMobileMenuOpen(false);
    onSelectHost(host);
  };

  const handleSwitchServiceFromDropdown = (targetHost: ActiveHostView) => {
    setAccountDropdownOpen(false);
    onSelectHost(targetHost);
  };

  const isMailActiveService =
    activeHost === 'mail.vz.gay' || activeHost === 'worker_console';
  const isLinksActiveService =
    activeHost === 'links.vz.gay' ||
    activeHost === 'shortlinks' ||
    activeHost === 'bio_public';

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0B0D11]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#232732]">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3 md:gap-8">
          {/* Zone 1: Mobile Hamburger Trigger + Single-Line Brand Wordmark */}
          <div className="flex items-center gap-1.5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={
                lang === 'id'
                  ? 'Buka menu navigasi'
                  : 'Open navigation menu'
              }
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#191E28] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Menu className="w-5 h-5" />
            </button>

            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                onSelectHost(
                  activeHost === 'links.vz.gay' || activeHost === 'shortlinks'
                    ? 'links.vz.gay'
                    : 'mail.vz.gay'
                );
              }}
              className="inline-flex items-center gap-2.5 min-w-0 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
            >
              <BrandMark
                variant={brandVariant}
                className="w-7 h-7 rounded-[7px] shadow-xs"
              />
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate max-w-[130px] sm:max-w-none font-display">
                {brandWordmark}
              </span>
            </a>
          </div>

          {/* Zone 2: Desktop Concise Single-Line Navigation Links */}
          <nav
            aria-label="Service Host Navigation"
            className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            {navItems.map((item) => {
              const isActive = activeHost === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectHost(item.id);
                  }}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 font-semibold'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:underline underline-offset-4'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Direct Auth0 SSO Button or Post-Login Account & Service Switcher Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            {!isInstalled && onOpenInstall && (
              <button
                type="button"
                onClick={onOpenInstall}
                className="hidden md:inline-flex px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1C202A] dark:hover:bg-[#252B38] border border-slate-200 dark:border-[#2D3342] rounded-lg transition-colors whitespace-nowrap items-center gap-1.5 cursor-pointer"
                title={
                  lang === 'id'
                    ? 'Pasang Aplikasi PWA Multi-OS'
                    : 'Install Multi-OS PWA App'
                }
              >
                <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  {isIos
                    ? lang === 'id'
                      ? 'Pasang iOS'
                      : 'Install iOS'
                    : lang === 'id'
                      ? 'Pasang App'
                      : 'Install App'}
                </span>
              </button>
            )}

            {session.isAuthenticated &&
              activeHost === 'mail.vz.gay' &&
              session.mailActivated && (
                <button
                  type="button"
                  onClick={onOpenCompose}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Tulis' : 'Compose'}</span>
                </button>
              )}

            {!session.isAuthenticated ? (
              <button
                type="button"
                onClick={onLoginWithAuth0}
                disabled={isAuthLoading}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11]"
              >
                {isAuthLoading
                  ? lang === 'id'
                    ? 'Memuat...'
                    : 'Loading...'
                  : lang === 'id'
                    ? 'Masuk'
                    : 'Sign In'}
              </button>
            ) : (
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountDropdownOpen((v) => !v)}
                  aria-expanded={accountDropdownOpen}
                  aria-haspopup="menu"
                  className="min-h-[38px] pl-2 pr-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200/80 dark:bg-[#181C24] dark:hover:bg-[#222834] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {session.picture ? (
                    <img
                      src={session.picture}
                      alt={session.username}
                      className="w-5 h-5 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {initials}
                    </span>
                  )}
                  <span className="font-mono truncate max-w-[110px] sm:max-w-[165px]">
                    <span className="sm:hidden">@{session.username}</span>
                    <span className="hidden sm:inline">
                      {session.username}@{domain}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      accountDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Post-Login Account & Service Switcher Dropdown (files.vz.gay Style) */}
                {accountDropdownOpen && (
                  <div
                    role="menu"
                    aria-label={
                      lang === 'id'
                        ? 'Menu Akun & Layanan'
                        : 'Account & Services Menu'
                    }
                    className="absolute right-0 mt-2 w-80 sm:w-88 rounded-xl bg-white dark:bg-[#131720] border border-slate-200 dark:border-[#262C3A] shadow-xl z-50 overflow-hidden divide-y divide-slate-200 dark:divide-[#232732]"
                  >
                    {/* 1. Profile & @imy.li Identity */}
                    <div className="p-3.5 bg-[#FAFAFA] dark:bg-[#0D1016] space-y-2">
                      <div className="flex items-center gap-2.5">
                        {session.picture ? (
                          <img
                            src={session.picture}
                            alt={session.username}
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-[#2A303E] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {session.name || session.username}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {session.email || `${session.username}@${domain}`}
                          </div>
                        </div>
                      </div>

                      <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#141821] border border-slate-200 dark:border-[#232834] flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">
                          1:1 Handle:
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold truncate">
                          {session.username}@{domain} · {session.username}.{domain}
                        </span>
                      </div>
                    </div>

                    {/* 2. Switch Service (VZ Mail <-> VZ Links) */}
                    <div className="p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {lang === 'id'
                          ? 'Pindah Layanan Ekosistem'
                          : 'Switch Ecosystem Service'}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleSwitchServiceFromDropdown('mail.vz.gay')
                          }
                          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            isMailActiveService
                              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500/60 text-blue-700 dark:text-blue-300'
                              : 'bg-[#FAFAFA] dark:bg-[#0E1117] border-slate-200 dark:border-[#232834] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#191E28]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span>VZ Mail</span>
                            </span>
                            {isMailActiveService && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            )}
                          </div>
                          <div className="mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            mail.vz.gay
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSwitchServiceFromDropdown('links.vz.gay')
                          }
                          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            isLinksActiveService
                              ? 'bg-violet-50/80 dark:bg-violet-950/40 border-violet-500/60 text-violet-700 dark:text-violet-300'
                              : 'bg-[#FAFAFA] dark:bg-[#0E1117] border-slate-200 dark:border-[#232834] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#191E28]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                              <Link2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                              <span>VZ Links</span>
                            </span>
                            {isLinksActiveService && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                            )}
                          </div>
                          <div className="mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            links.vz.gay
                          </div>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {lang === 'id'
                          ? 'Sesi cookie mail.vz.gay & links.vz.gay terpisah (aplikasi Auth0 independen). Jika belum login di layanan tujuan, Anda akan diminta masuk terlebih dahulu.'
                          : 'mail.vz.gay & links.vz.gay use separate Auth0 app sessions. If not signed in on the target service yet, you will be prompted to sign in.'}
                      </p>
                    </div>

                    {/* 3. Opt-In Service Activation Toggles */}
                    <div className="p-3 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {lang === 'id'
                          ? 'Status & Aktivasi Layanan (Opt-In)'
                          : 'Service Activation Status (Opt-In)'}
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="px-2.5 py-2 rounded-lg bg-[#FAFAFA] dark:bg-[#0E1117] border border-slate-200 dark:border-[#232834] flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              VZ Mail ({session.username}@{domain})
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {session.mailActivated
                                ? lang === 'id'
                                  ? 'Aktif'
                                  : 'Active'
                                : lang === 'id'
                                  ? 'Belum aktif'
                                  : 'Not active'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={
                              session.mailActivated
                                ? onDeactivateMail
                                : onActivateMail
                            }
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                              session.mailActivated
                                ? 'text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-[#1E2430] hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                                : 'text-white bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {session.mailActivated
                              ? lang === 'id'
                                ? 'Nonaktifkan'
                                : 'Disable'
                              : lang === 'id'
                                ? 'Aktifkan'
                                : 'Activate'}
                          </button>
                        </div>

                        <div className="px-2.5 py-2 rounded-lg bg-[#FAFAFA] dark:bg-[#0E1117] border border-slate-200 dark:border-[#232834] flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              VZ Links ({session.username}.{domain})
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {session.linksActivated
                                ? lang === 'id'
                                  ? 'Aktif'
                                  : 'Active'
                                : lang === 'id'
                                  ? 'Belum aktif'
                                  : 'Not active'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={
                              session.linksActivated
                                ? onDeactivateLinks
                                : onActivateLinks
                            }
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors shrink-0 cursor-pointer ${
                              session.linksActivated
                                ? 'text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-[#1E2430] hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'
                                : 'text-white bg-violet-600 hover:bg-violet-700'
                            }`}
                          >
                            {session.linksActivated
                              ? lang === 'id'
                                ? 'Nonaktifkan'
                                : 'Disable'
                              : lang === 'id'
                                ? 'Aktifkan'
                                : 'Activate'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 4. External Account Portal, Admin Console (Owner Only) & Logout */}
                    <div className="p-2 bg-[#FAFAFA] dark:bg-[#0D1016] space-y-1">
                      {isAdminOwner && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSwitchServiceFromDropdown('worker_console')
                          }
                          className="w-full px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#1B202B] flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>
                              {lang === 'id'
                                ? 'Konsol Worker & Domain (@imy.li)'
                                : 'Worker & Domain Console (@imy.li)'}
                            </span>
                          </span>
                        </button>
                      )}

                      <a
                        href="https://myaccount.vz.gay"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setAccountDropdownOpen(false)}
                        className="w-full px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#1B202B] flex items-center justify-between transition-colors"
                      >
                        <span className="font-mono">myaccount.vz.gay</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setAccountDropdownOpen(false);
                          onSignOut();
                        }}
                        className="w-full px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'id' ? 'Keluar (Logout)' : 'Sign Out'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'id' ? 'Menu Navigasi' : 'Navigation Menu'}
          className="md:hidden fixed inset-0 z-50 flex"
        >
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Panel */}
          <div className="relative z-10 w-[300px] max-w-[86vw] h-full bg-white dark:bg-[#11141B] border-r border-slate-200 dark:border-[#232732] flex flex-col overflow-hidden shadow-xl">
            {/* Drawer Header */}
            <div className="px-4 h-14 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark
                  variant={brandVariant}
                  className="w-8 h-8 rounded-lg shadow-xs"
                />
                <div className="min-w-0">
                  <div className="text-base font-bold text-slate-900 dark:text-white font-display truncate">
                    {brandWordmark}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    mail.vz.gay · links.vz.gay
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={lang === 'id' ? 'Tutup menu' : 'Close menu'}
                className="min-h-[44px] min-w-[44px] -mr-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Account / Direct SSO Card */}
              <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono text-blue-600 dark:text-blue-400">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>accounts.vz.gay</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {session.isAuthenticated
                      ? lang === 'id'
                        ? 'Aktif'
                        : 'Signed In'
                      : lang === 'id'
                        ? 'Belum Masuk'
                        : 'Signed Out'}
                  </span>
                </div>

                {session.isAuthenticated ? (
                  <div className="space-y-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {session.name || session.username}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {session.email || `${session.username}@${domain}`}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={
                          session.mailActivated
                            ? onDeactivateMail
                            : onActivateMail
                        }
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                          session.mailActivated
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500/50 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-[#141821] border-slate-200 dark:border-[#232834] text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Mail: {session.mailActivated ? 'ON' : 'OFF'}
                      </button>
                      <button
                        type="button"
                        onClick={
                          session.linksActivated
                            ? onDeactivateLinks
                            : onActivateLinks
                        }
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                          session.linksActivated
                            ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-500/50 text-violet-700 dark:text-violet-300'
                            : 'bg-white dark:bg-[#141821] border-slate-200 dark:border-[#232834] text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Links: {session.linksActivated ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSignOut();
                      }}
                      className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'id' ? 'Keluar (Logout)' : 'Sign Out'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {lang === 'id'
                        ? 'Masuk langsung dengan SSO accounts.vz.gay untuk mengelola email @imy.li & tautan bio.'
                        : 'Sign in directly with accounts.vz.gay SSO to manage @imy.li email & bio links.'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onLoginWithAuth0();
                        }}
                        className="min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                      >
                        {lang === 'id' ? 'Masuk' : 'Sign In'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onSignupWithAuth0();
                        }}
                        className="min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161B24] border border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#1E2430] rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Daftar' : 'Sign Up'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Service Destinations */}
              <div className="space-y-1.5">
                <div className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Navigasi Layanan' : 'Service Navigation'}
                </div>
                <nav
                  aria-label="Mobile Service Navigation"
                  className="space-y-1"
                >
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeHost === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavigateFromDrawer(item.id)}
                        className={`w-full min-h-[48px] px-3 py-2 rounded-xl flex items-center gap-3 text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#191E28]'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Utilities: PWA Install, Language, Theme */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-3">
                <div className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Pengaturan & Aplikasi' : 'Preferences & App'}
                </div>

                {!isInstalled && onOpenInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenInstall();
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>
                      {isIos
                        ? lang === 'id'
                          ? 'Pasang Aplikasi di iOS'
                          : 'Install App on iOS'
                        : lang === 'id'
                          ? 'Pasang Aplikasi PWA'
                          : 'Install PWA App'}
                    </span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeLang(lang === 'id' ? 'en' : 'id')}
                    className="min-h-[44px] px-3 py-2 text-xs font-mono font-medium text-slate-700 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg hover:bg-slate-100 dark:hover:bg-[#191E28] transition-colors cursor-pointer"
                  >
                    {lang === 'id' ? 'Bahasa: ID' : 'Lang: EN'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeTheme(theme === 'dark' ? 'light' : 'dark')
                    }
                    className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg hover:bg-slate-100 dark:hover:bg-[#191E28] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        <span>Light</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Dark</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer Links */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0B0D11] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0">
              <a
                href="https://myaccount.vz.gay"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono hover:text-blue-600 dark:hover:text-blue-400"
              >
                <span>myaccount.vz.gay</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://vz.gay"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 dark:hover:text-white"
              >
                vz.gay
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
