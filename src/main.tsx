import { Auth0Provider } from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const auth0Domain =
  import.meta.env.VITE_AUTH0_DOMAIN || 'galbay.eu.auth0.com';
const auth0ClientId =
  import.meta.env.VITE_AUTH0_CLIENT_ID || 'sn75KSPt8iU8RlhI5lCC6MY53yt85jy3';
const redirectUri =
  typeof window !== 'undefined' ? window.location.origin : '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: redirectUri,
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
