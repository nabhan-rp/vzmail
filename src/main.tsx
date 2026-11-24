import { Auth0Provider } from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { resolveAuth0Config } from './utils/auth0Config.ts';

const auth0Config = resolveAuth0Config();

// Dynamically configure Multi-OS PWA Manifest & Apple Touch Icon per host (VZ Mail vs VZ Links)
if (typeof window !== 'undefined') {
  const isLinks = auth0Config.service === 'links';
  const manifestHref = isLinks
    ? '/manifest-links.webmanifest'
    : '/manifest-mail.webmanifest';
  const appleIconHref = isLinks
    ? '/icons/apple-touch-icon-links.png'
    : '/icons/apple-touch-icon-mail.png';
  const appTitle = isLinks ? 'VZ Links' : 'VZ Mail';

  const manifestEl = document.getElementById('app-manifest') as HTMLLinkElement | null;
  if (manifestEl) {
    manifestEl.href = manifestHref;
  }

  const appleIconEl = document.getElementById('apple-touch-icon') as HTMLLinkElement | null;
  if (appleIconEl) {
    appleIconEl.href = appleIconHref;
  }

  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', appTitle);
  }

  // Register Multi-OS PWA Service Worker
  if ('serviceWorker' in navigator && !window.location.search.includes('no-sw')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] ServiceWorker registration failed:', err);
        });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        redirect_uri: auth0Config.redirectUri,
      }}
      onRedirectCallback={(appState) => {
        if (typeof window !== 'undefined') {
          window.history.replaceState(
            {},
            document.title,
            appState?.returnTo || window.location.pathname
          );
        }
      }}
    >
      <App />
    </Auth0Provider>
  </StrictMode>
);
