import { Auth0Provider } from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { resolveAuth0Config } from './utils/auth0Config.ts';

const auth0Config = resolveAuth0Config();

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
