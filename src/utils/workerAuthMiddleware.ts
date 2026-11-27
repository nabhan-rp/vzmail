/**
 * Cloudflare Worker Auth0 JWT & Relay Token Verification Middleware.
 * Strict RS256 JWKS verification in production, with automatic local-dev fallback
 * strictly limited to localhost / 127.0.0.1 / *.run.app preview hosts when no token is sent.
 */

import {
  DEFAULT_AUTH0_CLIENT_IDS,
  assertCanonicalUserOwnership,
  buildBearerAuthChallengeHeader,
  classifyApiRouteAuthPolicy,
  isLocalDevHostname,
  verifyApiRequestAuth,
  type ApiRouteAuthPolicy,
  type VerifiedApiAuth,
} from './auth0JwtVerify.ts';

export interface WorkerAuthMiddlewareEnv {
  AUTH0_DOMAIN?: string;
  AUTH0_MAIL_CLIENT_ID?: string;
  AUTH0_LINKS_CLIENT_ID?: string;
  RELAY_AUTH_TOKEN?: string;
  ALLOW_LOCAL_DEV_AUTH?: string;
}

export type WorkerJsonResponder = (
  body: Record<string, unknown>,
  status?: number,
  extraHeaders?: Record<string, string>
) => Response;

export interface WorkerAuthContext {
  policy: ApiRouteAuthPolicy;
  auth: VerifiedApiAuth | null;
  /**
   * Ensures the request is authenticated (on conditional routes like owned shortlinks)
   * and optionally enforces canonical username ownership.
   */
  requireAuthenticatedUser: (
    targetUser?: string
  ) => Promise<{ ok: true; auth: VerifiedApiAuth } | { ok: false; response: Response }>;
  /**
   * Synchronous ownership check for routes already guarded by the middleware (`policy === 'protected'`).
   */
  requireOwnership: (targetUser: string) => Response | null;
}

export function resolveWorkerAllowedAuth0ClientIds(env: WorkerAuthMiddlewareEnv): string[] {
  const configured = [env.AUTH0_MAIL_CLIENT_ID, env.AUTH0_LINKS_CLIENT_ID]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  return configured.length > 0
    ? Array.from(new Set([...configured, ...DEFAULT_AUTH0_CLIENT_IDS]))
    : [...DEFAULT_AUTH0_CLIENT_IDS];
}

export async function runWorkerAuthMiddleware(
  request: Request,
  url: URL,
  env: WorkerAuthMiddlewareEnv,
  jsonResponder: WorkerJsonResponder
): Promise<{ ok: true; context: WorkerAuthContext } | { ok: false; response: Response }> {
  const hasOwnerParam = Boolean(url.searchParams.get('owner')?.trim());
  const policy = classifyApiRouteAuthPolicy(url.pathname, request.method, hasOwnerParam);

  const authHeader = request.headers.get('Authorization');
  const relayHeader = request.headers.get('X-VZ-Relay-Token');
  const hasCredentials = Boolean((authHeader && authHeader.trim()) || (relayHeader && relayHeader.trim()));

  const authenticate = () =>
    verifyApiRequestAuth({
      authorizationHeader: authHeader,
      relayTokenHeader: relayHeader,
      expectedRelayToken: env.RELAY_AUTH_TOKEN,
      auth0Domain: env.AUTH0_DOMAIN || 'accounts.vz.gay',
      allowedClientIds: resolveWorkerAllowedAuth0ClientIds(env),
      allowLocalDevFallback:
        isLocalDevHostname(url.hostname) || env.ALLOW_LOCAL_DEV_AUTH === 'true',
    });

  let cachedAuth: VerifiedApiAuth | null = null;

  if (policy === 'protected') {
    const authResult = await authenticate();
    if (!authResult.ok) {
      return {
        ok: false,
        response: jsonResponder(
          { ok: false, error: authResult.error },
          authResult.status,
          { 'WWW-Authenticate': buildBearerAuthChallengeHeader(hasCredentials) }
        ),
      };
    }
    cachedAuth = authResult;
  }

  const requireAuthenticatedUser = async (
    targetUser?: string
  ): Promise<{ ok: true; auth: VerifiedApiAuth } | { ok: false; response: Response }> => {
    let activeAuth = cachedAuth;
    if (!activeAuth) {
      const authResult = await authenticate();
      if (!authResult.ok) {
        return {
          ok: false,
          response: jsonResponder(
            { ok: false, error: authResult.error },
            authResult.status,
            { 'WWW-Authenticate': buildBearerAuthChallengeHeader(hasCredentials) }
          ),
        };
      }
      cachedAuth = authResult;
      activeAuth = authResult;
    }

    if (targetUser) {
      const check = assertCanonicalUserOwnership(activeAuth, targetUser);
      if (!check.ok) {
        return {
          ok: false,
          response: jsonResponder({ ok: false, error: check.error }, check.status),
        };
      }
    }

    return { ok: true, auth: activeAuth };
  };

  const requireOwnership = (targetUser: string): Response | null => {
    if (!cachedAuth) {
      return jsonResponder(
        { ok: false, error: 'Autentikasi Auth0 SSO diperlukan.' },
        401,
        { 'WWW-Authenticate': buildBearerAuthChallengeHeader(hasCredentials) }
      );
    }
    const check = assertCanonicalUserOwnership(cachedAuth, targetUser);
    if (!check.ok) {
      return jsonResponder({ ok: false, error: check.error }, check.status);
    }
    return null;
  };

  return {
    ok: true,
    context: {
      policy,
      auth: cachedAuth,
      requireAuthenticatedUser,
      requireOwnership,
    },
  };
}
