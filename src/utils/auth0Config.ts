export type Auth0ServiceId = 'mail' | 'links';

export interface Auth0ResolvedConfig {
  service: Auth0ServiceId;
  appName: string;
  serviceDomain: string;
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutReturnTo: string;
}

const DEFAULT_AUTH0_DOMAIN = 'accounts.vz.gay';
const DEFAULT_MAIL_CLIENT_ID = 'sn75KSPt8iU8RlhI5lCC6MY53yt85jy3';
const DEFAULT_LINKS_CLIENT_ID = 'BVT8uaChXUDLjuCDhtfPYXeSSWn6yuGa';

export function detectAuth0Service(): Auth0ServiceId {
  if (typeof window === 'undefined') return 'mail';
  const host = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hostMode = params.get('host_mode');

  if (
    host === 'links.vz.gay' ||
    host.startsWith('links.') ||
    hostMode === 'links' ||
    hostMode === 'shortlinks' ||
    pathname.startsWith('/links') ||
    pathname.startsWith('/s/')
  ) {
    return 'links';
  }

  return 'mail';
}

export function resolveAuth0Config(): Auth0ResolvedConfig {
  const service = detectAuth0Service();
  const domain =
    import.meta.env.VITE_AUTH0_DOMAIN || DEFAULT_AUTH0_DOMAIN;

  const mailClientId =
    import.meta.env.VITE_AUTH0_MAIL_CLIENT_ID ||
    import.meta.env.VITE_AUTH0_CLIENT_ID ||
    DEFAULT_MAIL_CLIENT_ID;

  const linksClientId =
    import.meta.env.VITE_AUTH0_LINKS_CLIENT_ID || DEFAULT_LINKS_CLIENT_ID;

  const clientId = service === 'links' ? linksClientId : mailClientId;
  const appName = service === 'links' ? 'VZ Links' : 'VZ Mail';
  const serviceDomain = service === 'links' ? 'links.vz.gay' : 'mail.vz.gay';

  let redirectUri = '';
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    const isDedicatedLinksHost =
      host === 'links.vz.gay' || host.startsWith('links.');
    // On dedicated production domains (mail.vz.gay / links.vz.gay), origin uniquely identifies the service.
    // On shared dev hosts (localhost / *.workers.dev), keep /links on the callback URI so VZ Links resolves its own clientId.
    redirectUri =
      service === 'links' && !isDedicatedLinksHost
        ? `${window.location.origin}/links`
        : window.location.origin;
  }

  return {
    service,
    appName,
    serviceDomain,
    domain,
    clientId,
    redirectUri,
    logoutReturnTo: redirectUri,
  };
}
