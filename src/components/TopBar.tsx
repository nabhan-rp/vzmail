import { useEffect, useState, type MouseEvent } from 'react';
import {
  ChevronRight,
  Globe,
  Layers,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { ParsedRoute } from '../hooks/usePathRouter';
import type { ThemePreference } from '../hooks/useTheme';
import type { DirectoryFilter } from './ServiceDirectory';

interface TopBarProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: ThemePreference;
  onChangeTheme: (theme: ThemePreference) => void;
  route: ParsedRoute;
  isAuthenticated: boolean;
  username: string;
  onNavigate: (to: string) => void;
  onOpenSso: () => void;
}

export function TopBar({
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  route,
  isAuthenticated,
  username,
  onNavigate,
  onOpenSso,
}: TopBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = UI_COPY[lang];
  const navCopy = t.nav;

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [route.pathname]);

  // Escape key & scroll lock when mobile drawer is open
  useEffect(() => {
    if (!drawerOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  const handleLinkClick = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    setDrawerOpen(false);
    onNavigate(path);
  };

  const navItems: {
    view: ParsedRoute['view'];
    path: string;
    label: string;
  }[] = [
    { view: 'services', path: '/services', label: navCopy.services },
    { view: 'desk', path: '/desk', label: navCopy.vzDesk },
    { view: 'live_domains', path: '/live-domains', label: navCopy.liveApps },
    { view: 'about', path: '/about', label: navCopy.infrastructure },
  ];

  const categoryRoutes: { filter: DirectoryFilter; path: string; label: string }[] = [
    { filter: 'all', path: '/services', label: t.directory.tabs.all },
    { filter: 'live', path: '/services/live', label: t.directory.tabs.live },
    {
      filter: 'productivity',
      path: '/services/productivity',
      label: t.directory.tabs.productivity,
    },
    { filter: 'web_business', path: '/services/web', label: t.directory.tabs.web_business },
    {
      filter: 'developer_cloud',
      path: '/services/cloud',
      label: t.directory.tabs.developer_cloud,
    },
    { filter: 'media_content', path: '/services/media', label: t.directory.tabs.media_content },
    { filter: 'education', path: '/services/edu', label: t.directory.tabs.education },
    {
      filter: 'system_community',
      path: '/services/system',
      label: t.directory.tabs.system_community,
    },
  ];

  const currentViewLabel =
    route.view === 'home'
      ? lang === 'id'
        ? 'Beranda'
        : 'Home'
      : route.view === 'services'
        ? navCopy.services
        : route.view === 'desk'
          ? navCopy.vzDesk
          : route.view === 'live_domains'
            ? navCopy.liveApps
            : navCopy.infrastructure;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-[#232732] bg-[#FAFAFA]/95 dark:bg-[#0B0D11]/95 backdrop-blur-md">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Brand Wordmark + Mobile Active Section Indicator */}
          <div className="flex items-center gap-2.5 min-w-0">
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm"
            >
              vz.gay
            </a>

            {route.view !== 'home' && (
              <span className="md:hidden inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                <span aria-hidden="true">/</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold truncate">
                  {currentViewLabel}
                </span>
              </span>
            )}
          </div>

          {/* Center: Desktop Primary Navigation (1-row 3-zone contract) */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {navItems.map((item) => {
              const isActive = route.view === item.view;
              return (
                <a
                  key={item.path}
                  href={item.path}
                  onClick={(e) => handleLinkClick(e, item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`transition-colors duration-150 whitespace-nowrap shrink-0 underline-offset-8 ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400 underline font-semibold'
                      : 'hover:text-slate-900 dark:hover:text-white hover:underline'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right: SSO Action + Mobile Hamburger Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSso}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 max-w-[155px] sm:max-w-[190px] truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11] cursor-pointer"
            >
              {isAuthenticated ? `${navCopy.signedInPrefix} ${username}` : navCopy.signIn}
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={
                drawerOpen
                  ? lang === 'id'
                    ? 'Tutup menu navigasi'
                    : 'Close navigation menu'
                  : lang === 'id'
                    ? 'Buka menu navigasi'
                    : 'Open navigation menu'
              }
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-[#252A36] bg-white dark:bg-[#141821] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1D222F] transition-colors cursor-pointer shrink-0"
            >
              {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Hamburger Navigation Drawer */}
      {drawerOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'id' ? 'Menu Navigasi Mobile' : 'Mobile Navigation Menu'}
          className="fixed inset-0 z-50 md:hidden flex justify-end bg-black/55 backdrop-blur-xs"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full max-w-[340px] h-full overflow-y-auto bg-white dark:bg-[#101319] border-l border-slate-200 dark:border-[#232732] shadow-2xl flex flex-col justify-between p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#232732]">
                <div>
                  <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    vz.gay
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t.hero.kicker}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label={lang === 'id' ? 'Tutup menu' : 'Close menu'}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-[#252A36] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Primary Navigation Routes */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Halaman Utama' : 'Main Pages'}</span>
                </div>

                <nav className="space-y-1">
                  <a
                    href="/"
                    onClick={(e) => handleLinkClick(e, '/')}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      route.view === 'home'
                        ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#181C26]'
                    }`}
                  >
                    <span>{lang === 'id' ? 'Beranda & Pencarian' : 'Home & Search'}</span>
                    <ChevronRight className="w-4 h-4 opacity-60" />
                  </a>

                  {navItems.map((item) => {
                    const isActive = route.view === item.view;
                    return (
                      <a
                        key={item.path}
                        href={item.path}
                        onClick={(e) => handleLinkClick(e, item.path)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#181C26]'
                        }`}
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="w-4 h-4 opacity-60" />
                      </a>
                    );
                  })}
                </nav>
              </div>

              {/* Category Sub-Routes */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#232732]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Kategori Direktori' : 'Directory Categories'}</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {categoryRoutes.map((cat) => {
                    const isCatActive =
                      route.view === 'services' && route.filter === cat.filter;
                    return (
                      <a
                        key={cat.path}
                        href={cat.path}
                        onClick={(e) => handleLinkClick(e, cat.path)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate ${
                          isCatActive
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-100 dark:bg-[#171B24] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#202634]'
                        }`}
                      >
                        {cat.label}
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* Language & Theme Controls inside Mobile Drawer */}
              <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{lang === 'id' ? 'Bahasa' : 'Language'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#171B24] border border-slate-200/80 dark:border-[#242A38]">
                    <button
                      type="button"
                      onClick={() => onChangeLang('id')}
                      aria-pressed={lang === 'id'}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        lang === 'id'
                          ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Indonesia (ID)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeLang('en')}
                      aria-pressed={lang === 'en'}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        lang === 'en'
                          ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      English (EN)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    {lang === 'id' ? 'Tema Tampilan' : 'Display Theme'}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#171B24] border border-slate-200/80 dark:border-[#242A38]">
                    <button
                      type="button"
                      onClick={() => onChangeTheme('system')}
                      aria-pressed={theme === 'system'}
                      className={`inline-flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        theme === 'system'
                          ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{t.controls.themeSystem}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTheme('light')}
                      aria-pressed={theme === 'light'}
                      className={`inline-flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        theme === 'light'
                          ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>{t.controls.themeLight}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTheme('dark')}
                      aria-pressed={theme === 'dark'}
                      className={`inline-flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>{t.controls.themeDark}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom SSO Action in Mobile Drawer */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#232732]">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenSso();
                }}
                className="w-full py-2.5 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-xl transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isAuthenticated
                    ? `${navCopy.signedInPrefix} ${username}`
                    : navCopy.signIn}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
