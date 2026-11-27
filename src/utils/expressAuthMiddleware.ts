/**
 * Express Auth0 JWT & Relay Token Verification Middleware.
 * Runs globally on `/api/*`:
 *  - Public routes pass through cleanly.
 *  - Protected routes strictly verify Auth0 RS256 ID Token JWT (or Relay Token) before route handlers execute,
 *    with automatic local-dev fallback strictly limited to local/preview hosts when no Authorization header is provided.
 *  - Conditional routes (guest vs owned shortlinks) expose `requireAuthenticatedUser(req, res, targetUser?)`.
 */

import type express from 'express';
import {
  DEFAULT_AUTH0_CLIENT_IDS,
  assertCanonicalUserOwnership,
  buildBearerAuthChallengeHeader,
  classifyApiRouteAuthPolicy,
  isLocalDevHostname,
  verifyApiRequestAuth,
  type VerifiedApiAuth,
} from './auth0JwtVerify.ts';

export interface ExpressAuthMiddlewareConfig {
  auth0Domain?: string;
  mailClientId?: string;
  linksClientId?: string;
  relayAuthToken?: string;
  allowLocalDevAuthEnv?: boolean;
}

const RES_AUTH_LOCAL_KEY = 'vzVerifiedAuth';

function resolveAllowedClientIds(config: ExpressAuthMiddlewareConfig): string[] {
  const configured = [config.mailClientId, config.linksClientId]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  return configured.length > 0
    ? Array.from(new Set([...configured, ...DEFAULT_AUTH0_CLIENT_IDS]))
    : [...DEFAULT_AUTH0_CLIENT_IDS];
}

export function createExpressAuthMiddleware(config: ExpressAuthMiddlewareConfig) {
  const allowedClientIds = resolveAllowedClientIds(config);
  const auth0Domain = (config.auth0Domain || 'accounts.vz.gay').trim();

  const authenticateRequest = (req: express.Request) => {
    const reqHost = (req.hostname || 'localhost').toLowerCase();
    return verifyApiRequestAuth({
      authorizationHeader: req.header('authorization'),
      relayTokenHeader: req.header('x-vz-relay-token'),
      expectedRelayToken: config.relayAuthToken,
      auth0Domain,
      allowedClientIds,
      allowLocalDevFallback:
        isLocalDevHostname(reqHost) || Boolean(config.allowLocalDevAuthEnv),
    });
  };

  const hasRequestCredentials = (req: express.Request): boolean =>
    Boolean(req.header('authorization')?.trim() || req.header('x-vz-relay-token')?.trim());

  /**
   * Global `/api` middleware enforcing Auth0 JWT verification on all protected routes
   * before entering downstream Express route handlers.
   */
  const apiGuardMiddleware: express.RequestHandler = async (req, res, next) => {
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    const hasOwnerParam = typeof req.query.owner === 'string' && req.query.owner.trim().length > 0;
    const policy = classifyApiRouteAuthPolicy(fullPath, req.method, hasOwnerParam);

    if (policy !== 'protected') {
      next();
      return;
    }

    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      res.setHeader(
        'WWW-Authenticate',
        buildBearerAuthChallengeHeader(hasRequestCredentials(req))
      );
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    res.locals[RES_AUTH_LOCAL_KEY] = auth;
    next();
  };

  /**
   * Verifies authentication (reusing `res.locals` when already validated by `apiGuardMiddleware`)
   * and enforces canonical username ownership when `targetUser` is supplied.
   */
  const requireAuthenticatedUser = async (
    req: express.Request,
    res: express.Response,
    targetUser?: string
  ): Promise<VerifiedApiAuth | null> => {
    let activeAuth = res.locals[RES_AUTH_LOCAL_KEY] as VerifiedApiAuth | undefined;
    if (!activeAuth) {
      const auth = await authenticateRequest(req);
      if (!auth.ok) {
        res.setHeader(
          'WWW-Authenticate',
          buildBearerAuthChallengeHeader(hasRequestCredentials(req))
        );
        res.status(auth.status).json({ ok: false, error: auth.error });
        return null;
      }
      res.locals[RES_AUTH_LOCAL_KEY] = auth;
      activeAuth = auth;
    }

    if (targetUser) {
      const check = assertCanonicalUserOwnership(activeAuth, targetUser);
      if (!check.ok) {
        res.status(check.status).json({ ok: false, error: check.error });
        return null;
      }
    }

    return activeAuth;
  };

  return {
    apiGuardMiddleware,
    requireAuthenticatedUser,
  };
}
