/**
 * Zero-dependency Auth0 OIDC ID Token (RS256) JWT verifier using Web Crypto (`crypto.subtle`).
 * Runs identically in Cloudflare Workers and Node.js 22+ (Express `server.ts`).
 */

import { sanitizeHandle } from './mailIdentity.ts';

export interface VerifiedAuth0Identity {
  sub: string;
  email: string | null;
  canonicalUsername: string;
  aud: string;
  iss: string;
  exp: number;
}

export type ApiAuthResult =
  | {
      ok: true;
      mode: 'auth0_jwt';
      user: VerifiedAuth0Identity;
      isPrivileged: false;
    }
  | {
      ok: true;
      mode: 'relay_token';
      user: null;
      isPrivileged: true;
    }
  | {
      ok: true;
      mode: 'local_dev_fallback';
      user: null;
      isPrivileged: true;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export interface VerifyApiAuthOptions {
  authorizationHeader?: string | null;
  relayTokenHeader?: string | null;
  expectedRelayToken?: string | null;
  auth0Domain?: string | null;
  allowedClientIds?: readonly string[];
  allowLocalDevFallback?: boolean;
}

interface JwkRsaKey extends JsonWebKey {
  kid?: string;
  use?: string;
  alg?: string;
  kty?: string;
}

interface JwksCacheEntry {
  fetchedAt: number;
  keys: Map<string, CryptoKey>;
}

const DEFAULT_AUTH0_DOMAIN = 'accounts.vz.gay';
export const DEFAULT_AUTH0_CLIENT_IDS = [
  'sn75KSPt8iU8RlhI5lCC6MY53yt85jy3', // VZ Mail
  'BVT8uaChXUDLjuCDhtfPYXeSSWn6yuGa', // VZ Links
] as const;

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLOCK_SKEW_SECONDS = 60;
const jwksCache = new Map<string, JwksCacheEntry>();

function base64UrlToUint8Array(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const normalized = padded + '='.repeat(padLen);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const bytes = base64UrlToUint8Array(segment);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function deriveCanonicalUsernameFromClaims(claims: {
  preferred_username?: unknown;
  nickname?: unknown;
  email?: unknown;
  name?: unknown;
  sub?: unknown;
}): string {
  const preferred =
    typeof claims.preferred_username === 'string' ? claims.preferred_username : '';
  const nickname = typeof claims.nickname === 'string' ? claims.nickname : '';
  const email = typeof claims.email === 'string' ? claims.email : '';
  const name = typeof claims.name === 'string' ? claims.name : '';
  const sub = typeof claims.sub === 'string' ? claims.sub : '';

  const candidate =
    preferred ||
    nickname ||
    (email ? email.split('@')[0] : '') ||
    name ||
    sub.split('|').pop() ||
    'user';
  return sanitizeHandle(candidate);
}

async function constantTimeSecretMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(providedHash, expectedHash);
  }

  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function loadJwksForDomain(
  domain: string,
  forceRefresh = false
): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  const cached = jwksCache.get(domain);
  if (!forceRefresh && cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  const jwksUrl = `https://${domain}/.well-known/jwks.json`;
  const res = await fetch(jwksUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    if (cached) return cached.keys;
    throw new Error(`JWKS fetch failed (HTTP ${res.status})`);
  }

  const body = (await res.json().catch(() => null)) as { keys?: JwkRsaKey[] } | null;
  const rawKeys = Array.isArray(body?.keys) ? body.keys : [];
  const keyMap = new Map<string, CryptoKey>();

  for (const jwk of rawKeys) {
    if (jwk.kty !== 'RSA' || !jwk.kid || !jwk.n || !jwk.e) continue;
    if (jwk.use && jwk.use !== 'sig') continue;
    try {
      const imported = await crypto.subtle.importKey(
        'jwk',
        {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          ext: true,
        },
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['verify']
      );
      keyMap.set(jwk.kid, imported);
    } catch {
      // Skip malformed JWK entries safely
    }
  }

  jwksCache.set(domain, { fetchedAt: now, keys: keyMap });
  return keyMap;
}

export async function verifyAuth0IdTokenJwt(
  token: string,
  options: {
    auth0Domain?: string | null;
    allowedClientIds?: readonly string[];
  } = {}
): Promise<VerifiedAuth0Identity | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    iss?: string;
    sub?: string;
    aud?: string | string[];
    azp?: string;
    exp?: number;
    nbf?: number;
    email?: string;
    nickname?: string;
    preferred_username?: string;
    name?: string;
  }>(payloadB64);

  if (!header || !payload) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    return null;
  }

  const domain = (options.auth0Domain || DEFAULT_AUTH0_DOMAIN).trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+$/.test(domain)) {
    return null;
  }

  // Validate issuer strictly
  const expectedIss = `https://${domain}/`;
  const iss = typeof payload.iss === 'string' ? payload.iss.trim() : '';
  if (iss !== expectedIss && iss !== `https://${domain}`) {
    return null;
  }

  // Validate audience against allowed Auth0 SPA Client IDs
  const allowedAud = new Set<string>(
    (options.allowedClientIds && options.allowedClientIds.length > 0
      ? options.allowedClientIds
      : DEFAULT_AUTH0_CLIENT_IDS
    ).map((c) => c.trim()).filter(Boolean)
  );
  const audList = Array.isArray(payload.aud)
    ? payload.aud
    : typeof payload.aud === 'string'
      ? [payload.aud]
      : [];
  const matchedAud = audList.find((a) => typeof a === 'string' && allowedAud.has(a));
  if (!matchedAud) {
    return null;
  }
  // OIDC Core 1.0 §3.1.3.7: if multiple audiences exist, `azp` must match an allowed Client ID
  if (audList.length > 1) {
    const azp = typeof payload.azp === 'string' ? payload.azp.trim() : '';
    if (!azp || !allowedAud.has(azp)) {
      return null;
    }
  }

  // Validate temporal claims
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSec) {
    return null;
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSec) {
    return null;
  }
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    return null;
  }

  // Resolve public signing key from Auth0 JWKS (with 1x refresh on key rotation)
  let keys = await loadJwksForDomain(domain, false);
  let signingKey = keys.get(header.kid);
  if (!signingKey) {
    keys = await loadJwksForDomain(domain, true);
    signingKey = keys.get(header.kid);
  }
  if (!signingKey) {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(sigB64);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    signatureBytes.buffer as ArrayBuffer,
    signingInput
  );
  if (!verified) {
    return null;
  }

  const canonicalUsername = deriveCanonicalUsernameFromClaims(payload);
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    canonicalUsername,
    aud: matchedAud,
    iss,
    exp: payload.exp,
  };
}

export async function verifyApiRequestAuth(
  options: VerifyApiAuthOptions
): Promise<ApiAuthResult> {
  const authHeader = (options.authorizationHeader || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const relayHeaderToken = (options.relayTokenHeader || '').trim();
  const expectedRelay = (options.expectedRelayToken || '').trim();

  // 1. Constant-time shared relay token (server-to-server / automation)
  const candidateRelay = relayHeaderToken || (bearerToken && !bearerToken.includes('.') ? bearerToken : '');
  if (expectedRelay && candidateRelay) {
    const matched = await constantTimeSecretMatch(candidateRelay, expectedRelay);
    if (matched) {
      return { ok: true, mode: 'relay_token', user: null, isPrivileged: true };
    }
    return {
      ok: false,
      status: 401,
      error: 'Token autentikasi relay tidak valid.',
    };
  }

  // 2. Auth0 OIDC ID Token JWT verification (primary user authentication)
  if (bearerToken && bearerToken.split('.').length === 3) {
    try {
      const identity = await verifyAuth0IdTokenJwt(bearerToken, {
        auth0Domain: options.auth0Domain,
        allowedClientIds: options.allowedClientIds,
      });
      if (identity) {
        return {
          ok: true,
          mode: 'auth0_jwt',
          user: identity,
          isPrivileged: false,
        };
      }
    } catch {
      return {
        ok: false,
        status: 401,
        error: 'Gagal memverifikasi sesi Auth0. Silakan login ulang.',
      };
    }
    return {
      ok: false,
      status: 401,
      error: 'Token sesi Auth0 tidak valid atau sudah kedaluwarsa. Silakan login ulang.',
    };
  }

  // 3. Controlled local-dev / preview fallback (never active on production vz.gay / imy.li hosts)
  if (options.allowLocalDevFallback && !bearerToken && !relayHeaderToken) {
    return {
      ok: true,
      mode: 'local_dev_fallback',
      user: null,
      isPrivileged: true,
    };
  }

  return {
    ok: false,
    status: 401,
    error: 'Autentikasi Auth0 SSO diperlukan untuk mengakses endpoint ini.',
  };
}

/**
 * Verifies that an authenticated Auth0 JWT user owns the target canonical handle.
 * Privileged relay tokens and local dev preview mode pass through cleanly.
 */
export function assertCanonicalUserOwnership(
  auth: Extract<ApiAuthResult, { ok: true }>,
  targetUsername: string
): { ok: true } | { ok: false; status: 403; error: string } {
  if (auth.isPrivileged || !auth.user) {
    return { ok: true };
  }
  const normalizedTarget = sanitizeHandle(targetUsername);
  if (auth.user.canonicalUsername !== normalizedTarget) {
    return {
      ok: false,
      status: 403,
      error: `Akses ditolak: sesi aktif (@${auth.user.canonicalUsername}) tidak berhak mengakses data milik @${normalizedTarget}.`,
    };
  }
  return { ok: true };
}

export type VerifiedApiAuth = Extract<ApiAuthResult, { ok: true }>;

export type ApiRouteAuthPolicy = 'public' | 'conditional' | 'protected';

/**
 * Shared route-level authentication policy used identically by both Cloudflare Worker
 * and Express Auth0 JWT middleware.
 */
export function classifyApiRouteAuthPolicy(
  pathname: string,
  method: string,
  hasOwnerQueryParam: boolean
): ApiRouteAuthPolicy {
  const upperMethod = method.toUpperCase();

  if (pathname === '/api/health' && upperMethod === 'GET') {
    return 'public';
  }
  if (pathname === '/api/links/bio-click' && upperMethod === 'POST') {
    return 'public';
  }
  if (pathname.startsWith('/api/links/bio/') && upperMethod === 'GET') {
    return 'public';
  }
  if (
    pathname.startsWith('/api/links/avatar/') &&
    (upperMethod === 'GET' || upperMethod === 'HEAD')
  ) {
    return 'public';
  }
  if (pathname === '/api/links/shortlinks' && upperMethod === 'GET' && !hasOwnerQueryParam) {
    return 'public';
  }
  if (
    (pathname === '/api/links/shortlinks' && upperMethod === 'POST') ||
    (pathname.startsWith('/api/links/shortlinks/') && upperMethod === 'DELETE')
  ) {
    return 'conditional';
  }
  if (
    pathname.startsWith('/api/mail/') ||
    pathname.startsWith('/api/vzfiles/') ||
    pathname.startsWith('/api/links/')
  ) {
    return 'protected';
  }
  return 'public';
}

export function buildBearerAuthChallengeHeader(hasCredentials: boolean): string {
  return hasCredentials
    ? 'Bearer realm="vz-platform", error="invalid_token"'
    : 'Bearer realm="vz-platform"';
}

export function isLocalDevHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.run.app') ||
    host.endsWith('.webcontainer.io') ||
    host.endsWith('.stackblitz.io')
  );
}
