import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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

  if (
    hostMode === 'bio' ||
    (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li')
  ) {
    return 'bio_public';
  }
  if (
    host === 'links.vz.gay' ||
    hostMode === 'links' ||
    pathname.startsWith('/links')
  ) {
    return 'links.vz.gay';
  }
  if (pathname.startsWith('/s/') || hostMode === 'shortlinks') {
    return 'shortlinks';
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
    }
    setActiveHost(nextHost);
  };

  const urlBioUser = useMemo(() => detectBioSubdomainUser(), []);
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

    if (activeHost === 'links.vz.gay') {
      document.title = `VZ Links (links.vz.gay) — ${user}.${domain} & ${domain}/s/`;
    } else if (activeHost === 'bio_public') {
      document.title = `${user}.${domain} — Link-in-Bio Statis (VZ Links)`;
    } else if (activeHost === 'shortlinks') {
      document.title = `${domain}/s/$URL — Pemendek Tautan (VZ Links)`;
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
          onDeactivateMail={deactivateMail}
          onActivateLinks={() => activateLinks(true)}
          onDeactivateLinks={deactivateLinks}
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
                  onDeactivateMail={deactivateMail}
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
                  initialSubTab="bio"
                  onSelectHost={handleSelectHost}
                  onActivateMailFromLinks={() => activateMail(false)}
                  onDeactivateLinks={deactivateLinks}
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

            {activeHost === 'shortlinks' &&
              (session.isAuthenticated && session.linksActivated ? (
                <VzLinksWorkspace
                  lang={lang}
                  session={session}
                  initialSubTab="shortlinks"
                  onSelectHost={handleSelectHost}
                  onActivateMailFromLinks={() => activateMail(false)}
                  onDeactivateLinks={deactivateLinks}
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

            {activeHost === 'bio_public' && (
              <ImyBioPublicView
                lang={lang}
                session={session}
                overrideUser={urlBioUser}
                onSelectHost={handleSelectHost}
              />
            )}

            {activeHost === 'worker_console' && isAdminOwner && (
              <WorkerDomainConsole
                lang={lang}
                username={session.username || 'fadhil'}
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
