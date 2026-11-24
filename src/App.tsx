import { useEffect, useState } from 'react';
import { CrossServiceOfferBar } from './components/CrossServiceOfferBar';
import { ImyBioPublicView } from './components/ImyBioPublicView';
import { LinksLandingGate } from './components/LinksLandingGate';
import { MailLandingGate } from './components/MailLandingGate';
import {
  MailLinksTopBar,
  type ActiveHostView,
} from './components/MailLinksTopBar';
import { UniversalSsoModal } from './components/UniversalSsoModal';
import { VaultBackupModal } from './components/VaultBackupModal';
import { VzLinksWorkspace } from './components/VzLinksWorkspace';
import { VzMailWorkspace } from './components/VzMailWorkspace';
import { WorkerDomainConsole } from './components/WorkerDomainConsole';
import { useLanguage } from './hooks/useLanguage';
import { useSsoSession } from './hooks/useSsoSession';
import { useTheme } from './hooks/useTheme';

function detectInitialHostView(): ActiveHostView {
  if (typeof window === 'undefined') return 'mail.vz.gay';
  const host = window.location.hostname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hostMode = params.get('host_mode');
  const pathname = window.location.pathname.toLowerCase();

  if (hostMode === 'bio' || (host.endsWith('.imy.li') && host !== 'www.imy.li')) {
    return 'bio_public';
  }
  if (host === 'links.vz.gay' || hostMode === 'links' || pathname.startsWith('/links')) {
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

export default function App() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const {
    session,
    crossOffer,
    signIn,
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
  const [ssoOpen, setSsoOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [composeCounter, setComposeCounter] = useState(0);
  const [mailRefreshCounter, setMailRefreshCounter] = useState(0);

  // Keep document title synchronized with the active domain view
  useEffect(() => {
    const user = session.isAuthenticated ? session.username : 'username';
    const domain = session.primaryDomain || 'imy.li';
    if (activeHost === 'links.vz.gay') {
      document.title = `VZ Links (links.vz.gay) — ${user}.${domain} & ${domain}/s/`;
    } else if (activeHost === 'bio_public') {
      document.title = `${user}.${domain} — Link-in-Bio Statis (VZ Links)`;
    } else if (activeHost === 'shortlinks') {
      document.title = `${domain}/s/$URL — Pemendek Tautan (VZ Links)`;
    } else if (activeHost === 'worker_console') {
      document.title = `Worker & Domain Registry (@${domain}) — VZ Mail & Links`;
    } else {
      document.title = `VZ Mail (mail.vz.gay) — Email Lokal Privat @${domain}`;
    }
  }, [activeHost, session.isAuthenticated, session.username, session.primaryDomain]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-slate-900 dark:bg-[#0B0D11] dark:text-slate-100">
      <MailLinksTopBar
        lang={lang}
        activeHost={activeHost}
        onSelectHost={setActiveHost}
        session={session}
        onOpenSso={() => setSsoOpen(true)}
        onOpenCompose={() => setComposeCounter((c) => c + 1)}
      />

      <CrossServiceOfferBar
        lang={lang}
        username={session.username || 'fadhil'}
        domain={session.primaryDomain || 'imy.li'}
        crossOffer={crossOffer}
        onAcceptLinksOffer={() => activateLinks(false)}
        onAcceptMailOffer={() => activateMail(false)}
        onDismiss={dismissCrossOffer}
        onSelectHost={setActiveHost}
      />

      <main className="flex-1">
        {activeHost === 'mail.vz.gay' &&
          (session.isAuthenticated && session.mailActivated ? (
            <VzMailWorkspace
              lang={lang}
              onChangeLang={setLang}
              theme={theme}
              onChangeTheme={setTheme}
              session={session}
              composeRequested={composeCounter}
              onSelectHost={setActiveHost}
              onOpenVault={() => setVaultOpen(true)}
              onOpenSso={() => setSsoOpen(true)}
              onDeactivateMail={deactivateMail}
              refreshTrigger={mailRefreshCounter}
            />
          ) : (
            <MailLandingGate
              lang={lang}
              session={session}
              onActivateMail={() => {
                if (!session.isAuthenticated) {
                  setSsoOpen(true);
                  return;
                }
                activateMail(true);
              }}
              onOpenSso={() => setSsoOpen(true)}
              onSelectHost={setActiveHost}
            />
          ))}

        {activeHost === 'links.vz.gay' &&
          (session.isAuthenticated && session.linksActivated ? (
            <VzLinksWorkspace
              lang={lang}
              session={session}
              initialSubTab="bio"
              onSelectHost={setActiveHost}
              onActivateMailFromLinks={() => activateMail(false)}
              onDeactivateLinks={deactivateLinks}
              onOpenSso={() => setSsoOpen(true)}
            />
          ) : (
            <LinksLandingGate
              lang={lang}
              session={session}
              onActivateLinks={() => {
                if (!session.isAuthenticated) {
                  setSsoOpen(true);
                  return;
                }
                activateLinks(true);
              }}
              onOpenSso={() => setSsoOpen(true)}
              onSelectHost={setActiveHost}
            />
          ))}

        {activeHost === 'shortlinks' &&
          (session.isAuthenticated && session.linksActivated ? (
            <VzLinksWorkspace
              lang={lang}
              session={session}
              initialSubTab="shortlinks"
              onSelectHost={setActiveHost}
              onActivateMailFromLinks={() => activateMail(false)}
              onDeactivateLinks={deactivateLinks}
              onOpenSso={() => setSsoOpen(true)}
            />
          ) : (
            <LinksLandingGate
              lang={lang}
              session={session}
              onActivateLinks={() => {
                if (!session.isAuthenticated) {
                  setSsoOpen(true);
                  return;
                }
                activateLinks(true);
              }}
              onOpenSso={() => setSsoOpen(true)}
              onSelectHost={setActiveHost}
            />
          ))}

        {activeHost === 'bio_public' && (
          <ImyBioPublicView
            lang={lang}
            session={session}
            onSelectHost={setActiveHost}
          />
        )}

        {activeHost === 'worker_console' && (
          <WorkerDomainConsole
            lang={lang}
            username={session.username || 'fadhil'}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-[#232732] bg-white dark:bg-[#0D1016]">
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

      <UniversalSsoModal
        isOpen={ssoOpen}
        lang={lang}
        session={session}
        onSignIn={signIn}
        onSignOut={signOut}
        onActivateMail={() => activateMail(true)}
        onDeactivateMail={deactivateMail}
        onActivateLinks={() => activateLinks(true)}
        onDeactivateLinks={deactivateLinks}
        onClose={() => setSsoOpen(false)}
      />

      <VaultBackupModal
        isOpen={vaultOpen}
        lang={lang}
        username={session.username || 'fadhil'}
        onClose={() => setVaultOpen(false)}
        onImported={() => setMailRefreshCounter((c) => c + 1)}
      />
    </div>
  );
}
