import {
  Download,
  ExternalLink,
  Globe,
  Link2,
  Mail,
  Menu,
  Moon,
  Scissors,
  Server,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import type { ThemePreference } from '../hooks/useTheme';

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
  onOpenSso: () => void;
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
  onOpenSso,
  onOpenCompose,
  onOpenInstall,
  isInstalled = false,
  isIos = false,
}: MailLinksTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handle = session.isAuthenticated ? session.username : 'username';
  const domain = session.primaryDomain || 'imy.li';

  const brandWordmark =
    activeHost === 'links.vz.gay' || activeHost === 'shortlinks'
      ? 'VZ Links'
      : activeHost === 'bio_public'
        ? `${handle}.${domain}`
        : 'VZ Mail';

  const navItems: {
    id: ActiveHostView;
    label: string;
    subtitle: string;
    icon: typeof Mail;
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
    },
  ];

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

  const handlePrimaryAction = () => {
    if (!session.isAuthenticated) {
      onOpenSso();
      return;
    }
    if (activeHost === 'mail.vz.gay' && session.mailActivated) {
      onOpenCompose();
      return;
    }
    onOpenSso();
  };

  const primaryDesktopLabel = !session.isAuthenticated
    ? lang === 'id'
      ? 'Masuk SSO'
      : 'SSO Sign In'
    : activeHost === 'mail.vz.gay' && session.mailActivated
      ? lang === 'id'
        ? '+ Tulis Email'
        : '+ Compose Mail'
      : `${session.username}@${domain}`;

  const primaryMobileLabel = !session.isAuthenticated
    ? lang === 'id'
      ? 'Masuk SSO'
      : 'Sign In'
    : activeHost === 'mail.vz.gay' && session.mailActivated
      ? lang === 'id'
        ? '+ Tulis'
        : '+ Compose'
      : `@${session.username}`;

  const handleNavigateFromDrawer = (host: ActiveHostView) => {
    setMobileMenuOpen(false);
    onSelectHost(host);
  };

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
              className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate max-w-[150px] sm:max-w-none shrink-0 font-display"
            >
              {brandWordmark}
            </a>
          </div>

          {/* Zone 2: Desktop 5 Concise Single-Line Navigation Links */}
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

          {/* Zone 3: Primary Action (PWA Install shown on desktop; moved inside drawer on mobile) */}
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

            <button
              type="button"
              onClick={handlePrimaryAction}
              className="min-h-[40px] md:min-h-0 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap truncate max-w-[155px] sm:max-w-[220px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11]"
            >
              <span className="md:hidden">{primaryMobileLabel}</span>
              <span className="hidden md:inline">{primaryDesktopLabel}</span>
            </button>
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
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900 dark:text-white font-display truncate">
                  {brandWordmark}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  mail.vz.gay · links.vz.gay
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
              {/* Account / SSO Card */}
              <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2.5">
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
                        ? 'Tamu'
                        : 'Guest'}
                  </span>
                </div>

                {session.isAuthenticated ? (
                  <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                    {session.username}@{domain}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {lang === 'id'
                      ? 'Satu SSO untuk email @imy.li, bio, dan shortlink.'
                      : 'One SSO for @imy.li email, bio, and shortlinks.'}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSso();
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  {session.isAuthenticated
                    ? lang === 'id'
                      ? 'Kelola Akun SSO & Layanan'
                      : 'Manage SSO & Services'
                    : lang === 'id'
                      ? 'Masuk / Daftar SSO'
                      : 'Sign In / Sign Up SSO'}
                </button>
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
