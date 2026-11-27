import { Auth0Provider } from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { resolveAuth0Config } from './utils/auth0Config.ts';

const auth0Config = resolveAuth0Config();

// Dynamically configure Multi-OS PWA Manifest, Favicon, Mask Icon & Apple Touch Icon per host (VZ Mail vs VZ Links)
if (typeof window !== 'undefined') {
  const isLinks = auth0Config.service === 'links';
  const manifestHref = isLinks
    ? '/manifest-links.webmanifest'
    : '/manifest-mail.webmanifest';
  const appleIconHref = isLinks
    ? '/icons/apple-touch-icon-links.png'
    : '/icons/apple-touch-icon-mail.png';
  const faviconHref = isLinks ? '/icons/links.svg' : '/icons/mail.svg';
  const maskColor = isLinks ? '#8B5CF6' : '#3B82F6';
  const appTitle = isLinks ? 'VZ Links' : 'VZ Mail';

  const manifestEl = document.getElementById('app-manifest') as HTMLLinkElement | null;
  if (manifestEl) {
    manifestEl.href = manifestHref;
  }

  const faviconEl = document.getElementById('app-favicon') as HTMLLinkElement | null;
  if (faviconEl) {
    faviconEl.href = faviconHref;
  }

  const maskIconEl = document.getElementById('app-mask-icon') as HTMLLinkElement | null;
  if (maskIconEl) {
    maskIconEl.href = faviconHref;
    maskIconEl.setAttribute('color', maskColor);
  }

  const appleIconEl = document.getElementById('apple-touch-icon') as HTMLLinkElement | null;
  if (appleIconEl) {
    appleIconEl.href = appleIconHref;
  }

  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', appTitle);
  }

  const appNameMeta = document.querySelector('meta[name="application-name"]');
  if (appNameMeta) {
    appNameMeta.setAttribute('content', appTitle);
  }

  // Register Multi-OS PWA Service Worker only on production HTTPS service origins
  // (skip dev, AI Studio preview iframes, and standalone user Bio subdomains *.imy.li)
  if ('serviceWorker' in navigator) {
    const shouldRegisterSw =
      !import.meta.env.DEV &&
      !auth0Config.isPreviewHost &&
      !auth0Config.isStandaloneBioHost &&
      window.location.protocol === 'https:' &&
      !window.location.search.includes('no-sw');

    if (shouldRegisterSw) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch((err) => {
            console.warn('[PWA] ServiceWorker registration failed:', err);
          });
      });
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            void reg.unregister();
          }
        })
        .catch(() => {
          // Ignore iframe/storage restrictions
        });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      cacheLocation="localstorage"
      useRefreshTokens={true}
      useRefreshTokensFallback={true}
      skipRedirectCallback={auth0Config.isPreviewHost || auth0Config.isImyExternalHost}
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
