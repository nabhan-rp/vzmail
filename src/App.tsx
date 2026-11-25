import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { CrossServiceOfferBar } from './components/CrossServiceOfferBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MailLandingGate } from './components/MailLandingGate';
import {
  MailLinksTopBar,
  type ActiveHostView,
} from './components/MailLinksTopBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { useLanguage } from './hooks/useLanguage';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useSsoSession } from './hooks/useSsoSession';
import { useTheme } from './hooks/useTheme';
import { sanitizePageSlug } from './utils/linksModel';
import { sanitizeHandle } from './utils/mailIdentity';

// Lazy-load heavy workspaces & modals to keep initial landing page JS minimal
const VzMailWorkspace = lazy(() =>
  import('./components/VzMailWorkspace').then((m) => ({
    default: m.VzMailWorkspace,
  }))
);
const VzLinksWorkspace = lazy(() =>
  import('./components/VzLinksWorkspace').then((m) => ({
    default: m.VzLinksWorkspace,
  }))
);
const ShortlinkStudio = lazy(() =>
  import('./components/ShortlinkStudio').then((m) => ({
    default: m.ShortlinkStudio,
  }))
);
const LinksLandingGate = lazy(() =>
  import('./components/LinksLandingGate').then((m) => ({
    default: m.LinksLandingGate,
  }))
);
const ImyBioPublicView = lazy(() =>
  import('./components/ImyBioPublicView').then((m) => ({
    default: m.ImyBioPublicView,
  }))
);
const WorkerDomainConsole = lazy(() =>
  import('./components/WorkerDomainConsole').then((m) => ({
    default: m.WorkerDomainConsole,
  }))
);
const LegalDocumentView = lazy(() =>
  import('./components/LegalDocumentView').then((m) => ({
    default: m.LegalDocumentView,
  }))
);
const VaultBackupModal = lazy(() =>
  import('./components/VaultBackupModal').then((m) => ({
    default: m.VaultBackupModal,
  }))
);
const PwaInstallModal = lazy(() =>
  import('./components/PwaInstallModal').then((m) => ({
    default: m.PwaInstallModal,
  }))
);

function detectDefaultServiceView(): 'mail.vz.gay' | 'links.vz.gay' {
  if (typeof window === 'undefined') return 'mail.vz.gay';
  const host = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  if (host === 'links.vz.gay' || pathname.startsWith('/links')) {
    return 'links.vz.gay';
  }
  return 'mail.vz.gay';
}

function detectInitialHostView(): ActiveHostView {
  if (typeof window === 'undefined') return 'mail.vz.gay';
  const host = window.location.hostname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hostMode = params.get('host_mode');
  const pathname = window.location.pathname.toLowerCase();

  if (pathname === '/terms' || pathname.startsWith('/terms/')) {
    return 'terms';
  }
  if (pathname === '/privacy' || pathname.startsWith('/privacy/')) {
    return 'privacy';
  }

  if (
    hostMode === 'bio' ||
    (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li')
  ) {
    return 'bio_public';
  }
  if (
    host === 'imy.li' ||
    host === 'www.imy.li' ||
    pathname === '/s' ||
    pathname.startsWith('/s/') ||
    hostMode === 'shortlinks'
  ) {
    return 'shortlinks';
  }
  if (
    host === 'links.vz.gay' ||
    hostMode === 'links' ||
    pathname.startsWith('/links')
  ) {
    return 'links.vz.gay';
  }
  if (hostMode === 'worker') {
    return 'worker_console';
  }
  return 'mail.vz.gay';
}

function detectBioSubdomainUser(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const queryBioUser = params.get('bio_user');
  if (queryBioUser && queryBioUser.trim()) {
    return sanitizeHandle(queryBioUser);
  }
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li') {
    const sub = host.slice(0, -'.imy.li'.length);
    if (sub && !sub.includes('.')) {
      return sanitizeHandle(sub);
    }
  }
  return null;
}

function detectInitialBioPageSlug(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const queryPage = params.get('bio_page');
  if (queryPage && queryPage.trim()) {
    return sanitizePageSlug(queryPage) || '';
  }
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li') {
    const firstSegment = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
    if (firstSegment) {
      return sanitizePageSlug(firstSegment) || '';
    }
  }
  return '';
}

function WorkspaceFallback() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-4">
      <div className="h-10 w-64 rounded-lg bg-slate-200 dark:bg-[#191E28] animate-pulse" />
      <div className="h-64 w-full rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] animate-pulse" />
    </div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const {
    session,
    isAdminOwner,
    isLoading: authLoading,
    authError,
    crossOffer,
    loginWithAuth0,
    signupWithAuth0,
    signOut,
    activateMail,
    deactivateMail,
    activateLinks,
    deactivateLinks,
    dismissCrossOffer,
  } = useSsoSession();

  const [activeHost, setActiveHost] = useState<ActiveHostView>(() =>
    detectInitialHostView()
  );

  // Guard: If a visitor or non-admin account accesses ?host_mode=worker or worker_console,
  // automatically redirect them to the main service home page and clean the URL query param.
  useEffect(() => {
    if (authLoading) return;
    if (activeHost === 'worker_console' && !isAdminOwner) {
      const fallbackView = detectDefaultServiceView();
      setActiveHost(fallbackView);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.get('host_mode') === 'worker') {
          url.searchParams.delete('host_mode');
          window.history.replaceState({}, document.title, url.toString());
        }
      }
    }
  }, [authLoading, activeHost, isAdminOwner]);

  const [confirmDeactivateService, setConfirmDeactivateService] = useState<
    'mail' | 'links' | null
  >(null);

  useEffect(() => {
    const onPopState = () => {
      setActiveHost(detectInitialHostView());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // On dedicated production domains (mail.vz.gay vs links.vz.gay), navigate across origins
  // so each service uses its own isolated Auth0 SPA Client ID and origin storage.
  const handleSelectHost = (nextHost: ActiveHostView) => {
    if (nextHost === 'worker_console' && !isAdminOwner) {
      setActiveHost(detectDefaultServiceView());
      return;
    }
    if (typeof window !== 'undefined') {
      const currentHostname = window.location.hostname.toLowerCase();
      if (currentHostname === 'mail.vz.gay' && nextHost === 'links.vz.gay') {
        window.location.href = 'https://links.vz.gay';
        return;
      }
      if (currentHostname === 'links.vz.gay' && nextHost === 'mail.vz.gay') {
        window.location.href = 'https://mail.vz.gay';
        return;
      }

      if (nextHost === 'terms' && window.location.pathname !== '/terms') {
        window.history.pushState({}, '', '/terms');
      } else if (nextHost === 'privacy' && window.location.pathname !== '/privacy') {
        window.history.pushState({}, '', '/privacy');
      } else if (
        nextHost !== 'terms' &&
        nextHost !== 'privacy' &&
        (window.location.pathname === '/terms' ||
          window.location.pathname === '/privacy')
      ) {
        window.history.pushState({}, '', '/');
      }
    }
    setActiveHost(nextHost);
    if (nextHost === 'terms' || nextHost === 'privacy') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const urlBioUser = useMemo(() => detectBioSubdomainUser(), []);
  const [bioPageSlug, setBioPageSlug] = useState<string>(() =>
    detectInitialBioPageSlug()
  );

  const handleChangeBioPageSlug = (nextSlug: string) => {
    const clean = sanitizePageSlug(nextSlug) ?? '';
    setBioPageSlug(clean);
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li') {
        const nextPath = clean ? `/${clean}` : '/';
        window.history.pushState({}, '', nextPath);
      }
    }
  };

  const {
    os,
    isIos,
    isInstalled,
    canPromptNative,
    promptInstall,
  } = usePwaInstall();
  const [pwaOpen, setPwaOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [composeCounter, setComposeCounter] = useState(0);
  const [mailRefreshCounter, setMailRefreshCounter] = useState(0);

  // Keep document title & tab favicon synchronized with the active domain view
  useEffect(() => {
    const user =
      activeHost === 'bio_public' && urlBioUser
        ? urlBioUser
        : session.isAuthenticated
          ? session.username
          : 'username';
    const domain = session.primaryDomain || 'imy.li';
    const isLinksView =
      activeHost === 'links.vz.gay' ||
      activeHost === 'shortlinks' ||
      activeHost === 'bio_public';

    if (activeHost === 'terms') {
      document.title =
        lang === 'id'
          ? 'Syarat & Ketentuan (Terms of Service) — VZ Mail & VZ Links'
          : 'Terms of Service — VZ Mail & VZ Links';
    } else if (activeHost === 'privacy') {
      document.title =
        lang === 'id'
          ? 'Kebijakan Privasi (Privacy Policy) — VZ Mail & VZ Links'
          : 'Privacy Policy — VZ Mail & VZ Links';
    } else if (activeHost === 'links.vz.gay') {
      document.title = `VZ Links (links.vz.gay) — ${user}.${domain} & ${domain}/s/`;
    } else if (activeHost === 'bio_public') {
      document.title = bioPageSlug
        ? `${user}.${domain}/${bioPageSlug} — VZ Links`
        : `${user}.${domain} — VZ Links`;
    } else if (activeHost === 'shortlinks') {
      document.title = `${domain}/s/ — Pemendek URL (VZ Links)`;
    } else if (activeHost === 'worker_console' && isAdminOwner) {
      document.title = `Worker & Domain Registry (@${domain}) — VZ Mail & Links`;
    } else {
      document.title = `VZ Mail (mail.vz.gay) — Email Lokal Privat @${domain}`;
    }

    const svgHref = isLinksView ? '/icons/links.svg' : '/icons/mail.svg';
    const maskColor = isLinksView ? '#8B5CF6' : '#3B82F6';
    const appleHref = isLinksView
      ? '/icons/apple-touch-icon-links.png'
      : '/icons/apple-touch-icon-mail.png';

    const faviconEl = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (faviconEl && faviconEl.getAttribute('href') !== svgHref) {
      faviconEl.href = svgHref;
    }

    const maskIconEl = document.getElementById('app-mask-icon') as HTMLLinkElement | null;
    if (maskIconEl) {
      if (maskIconEl.getAttribute('href') !== svgHref) {
        maskIconEl.href = svgHref;
      }
      maskIconEl.setAttribute('color', maskColor);
    }

    const appleIconEl = document.getElementById('apple-touch-icon') as HTMLLinkElement | null;
    if (appleIconEl && appleIconEl.getAttribute('href') !== appleHref) {
      appleIconEl.href = appleHref;
    }
  }, [
    activeHost,
    bioPageSlug,
    isAdminOwner,
    urlBioUser,
    session.isAuthenticated,
    session.username,
    session.primaryDomain,
  ]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-slate-900 dark:bg-[#0B0D11] dark:text-slate-100">
        <MailLinksTopBar
          lang={lang}
          onChangeLang={setLang}
          theme={theme}
          onChangeTheme={setTheme}
          activeHost={activeHost}
          onSelectHost={handleSelectHost}
          session={session}
          isAdminOwner={isAdminOwner}
          isAuthLoading={authLoading}
          onLoginWithAuth0={loginWithAuth0}
          onSignupWithAuth0={signupWithAuth0}
          onSignOut={signOut}
          onActivateMail={() => activateMail(true)}
          onDeactivateMail={() => setConfirmDeactivateService('mail')}
          onActivateLinks={() => activateLinks(true)}
          onDeactivateLinks={() => setConfirmDeactivateService('links')}
          onOpenCompose={() => setComposeCounter((c) => c + 1)}
          onOpenInstall={() => setPwaOpen(true)}
          isInstalled={isInstalled}
          isIos={isIos}
        />

        <CrossServiceOfferBar
          lang={lang}
          username={session.username || 'fadhil'}
          domain={session.primaryDomain || 'imy.li'}
          crossOffer={crossOffer}
          onAcceptLinksOffer={() => activateLinks(false)}
          onAcceptMailOffer={() => activateMail(false)}
          onDismiss={dismissCrossOffer}
          onSelectHost={handleSelectHost}
        />

        {authError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 px-4 sm:px-6 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-4">
            <span className="font-mono">
              Auth0: {authError.message}
            </span>
            <button
              type="button"
              onClick={loginWithAuth0}
              className="font-semibold underline shrink-0 cursor-pointer"
            >
              {lang === 'id' ? 'Masuk Ulang SSO' : 'Retry SSO Sign In'}
            </button>
          </div>
        )}

        <main className="flex-1">
          <Suspense fallback={<WorkspaceFallback />}>
            {activeHost === 'mail.vz.gay' &&
              (session.isAuthenticated && session.mailActivated ? (
                <VzMailWorkspace
                  lang={lang}
                  onChangeLang={setLang}
                  theme={theme}
                  onChangeTheme={setTheme}
                  session={session}
                  composeRequested={composeCounter}
                  onSelectHost={handleSelectHost}
                  onOpenVault={() => setVaultOpen(true)}
                  onDeactivateMail={() => setConfirmDeactivateService('mail')}
                  refreshTrigger={mailRefreshCounter}
                />
              ) : (
                <MailLandingGate
                  lang={lang}
                  session={session}
                  onActivateMail={() => {
                    if (!session.isAuthenticated) {
                      loginWithAuth0();
                      return;
                    }
                    activateMail(true);
                  }}
                  onLoginWithAuth0={loginWithAuth0}
                  onSelectHost={handleSelectHost}
                />
              ))}

            {activeHost === 'links.vz.gay' &&
              (session.isAuthenticated && session.linksActivated ? (
                <VzLinksWorkspace
                  lang={lang}
                  session={session}
                  onSelectHost={handleSelectHost}
                  onOpenPublicBioPage={(slug) => {
                    setBioPageSlug(slug);
                    handleSelectHost('bio_public');
                  }}
                  onActivateMailFromLinks={() => activateMail(false)}
                  onDeactivateLinks={() => setConfirmDeactivateService('links')}
                />
              ) : (
                <LinksLandingGate
                  lang={lang}
                  session={session}
                  onActivateLinks={() => {
                    if (!session.isAuthenticated) {
                      loginWithAuth0();
                      return;
                    }
                    activateLinks(true);
                  }}
                  onLoginWithAuth0={loginWithAuth0}
                  onSelectHost={handleSelectHost}
                />
              ))}

            {activeHost === 'shortlinks' && (
              <ShortlinkStudio
                lang={lang}
                session={session}
                onLoginWithAuth0={loginWithAuth0}
                onSelectHost={handleSelectHost}
              />
            )}

            {activeHost === 'bio_public' && (
              <ImyBioPublicView
                lang={lang}
                session={session}
                overrideUser={urlBioUser}
                pageSlug={bioPageSlug}
                onChangePageSlug={handleChangeBioPageSlug}
                onSelectHost={handleSelectHost}
                onLoginWithAuth0={loginWithAuth0}
              />
            )}

            {activeHost === 'worker_console' && isAdminOwner && (
              <WorkerDomainConsole
                lang={lang}
                username={session.username || 'fadhil'}
              />
            )}

            {(activeHost === 'terms' || activeHost === 'privacy') && (
              <LegalDocumentView
                lang={lang}
                docType={activeHost}
                onSwitchDoc={(next) => handleSelectHost(next)}
                onBack={() => handleSelectHost(detectDefaultServiceView())}
              />
            )}
          </Suspense>
        </main>

        <footer className="border-t border-slate-200 dark:border-[#232732] bg-white dark:bg-[#0D1016] pb-16 md:pb-0">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <span>© 2026 PT Galeri Langkah Bahagia Yuwana (galbay)</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono">
                mail.vz.gay + links.vz.gay + *.imy.li
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/terms"
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectHost('terms');
                }}
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {lang === 'id' ? 'Syarat & Ketentuan' : 'Terms of Service'}
              </a>
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectHost('privacy');
                }}
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {lang === 'id' ? 'Kebijakan Privasi' : 'Privacy Policy'}
              </a>
              <a
                href="https://vz.gay"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                vz.gay Portal
              </a>
              <a
                href="https://myaccount.vz.gay"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                myaccount.vz.gay
              </a>
              <button
                type="button"
                onClick={() => setPwaOpen(true)}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                {lang === 'id' ? 'Pasang App (PWA)' : 'Install App (PWA)'}
              </button>
              <button
                type="button"
                onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
                className="font-mono hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {lang === 'id' ? 'Switch to EN' : 'Ganti ke ID'}
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        </footer>

        <ConfirmActionModal
          isOpen={confirmDeactivateService !== null}
          lang={lang}
          tone="warning"
          title={
            confirmDeactivateService === 'mail'
              ? lang === 'id'
                ? `Nonaktifkan layanan VZ Mail (${session.username}@${session.primaryDomain || 'imy.li'})?`
                : `Disable VZ Mail (${session.username}@${session.primaryDomain || 'imy.li'})?`
              : lang === 'id'
                ? `Nonaktifkan akses Studio VZ Links (${session.username}.${session.primaryDomain || 'imy.li'})?`
                : `Disable VZ Links Studio (${session.username}.${session.primaryDomain || 'imy.li'})?`
          }
          description={
            confirmDeactivateService === 'mail'
              ? lang === 'id'
                ? 'Akses kotak surat lokal pada sesi ini akan dinonaktifkan dan Anda akan kembali ke halaman aktivasi VZ Mail. Riwayat pesan lokal di IndexedDB browser tidak dihapus.'
                : 'Mailbox access for this session will be disabled and you will return to the VZ Mail activation page. Local IndexedDB messages remain intact on your device.'
              : lang === 'id'
                ? 'Akses Studio VZ Links pada sesi ini akan dinonaktifkan. Untuk menyembunyikan halaman Bio dari publik atau menghapus data permanen dari database, gunakan tab Pengaturan & Bahaya di Studio Bio.'
                : 'VZ Links Studio access for this session will be disabled. To hide your Bio page from public visitors or permanently delete database records, use the Settings & Danger tab in Bio Studio.'
          }
          confirmLabel={
            lang === 'id' ? 'Ya, Nonaktifkan' : 'Yes, Disable'
          }
          onConfirm={() => {
            if (confirmDeactivateService === 'mail') {
              deactivateMail();
            } else if (confirmDeactivateService === 'links') {
              deactivateLinks();
            }
            setConfirmDeactivateService(null);
          }}
          onCancel={() => setConfirmDeactivateService(null)}
        />

        <MobileBottomNav
          lang={lang}
          activeHost={activeHost}
          onSelectHost={handleSelectHost}
        />

        {vaultOpen && (
          <Suspense fallback={null}>
            <VaultBackupModal
              isOpen={vaultOpen}
              lang={lang}
              username={session.username || 'fadhil'}
              onClose={() => setVaultOpen(false)}
              onImported={() => setMailRefreshCounter((c) => c + 1)}
            />
          </Suspense>
        )}

        {pwaOpen && (
          <Suspense fallback={null}>
            <PwaInstallModal
              isOpen={pwaOpen}
              lang={lang}
              onClose={() => setPwaOpen(false)}
              service={
                activeHost === 'links.vz.gay' || activeHost === 'shortlinks'
                  ? 'links'
                  : 'mail'
              }
              os={os}
              isIos={isIos}
              isInstalled={isInstalled}
              canPromptNative={canPromptNative}
              onPromptInstall={promptInstall}
            />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
}
