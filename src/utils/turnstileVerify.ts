/**
 * Cloudflare Turnstile & VZ Ecosystem Hybrid Anti-Bot Guard.
 * Zero-dependency Web Standards module shared by Cloudflare Worker (`worker-mail-links.ts`)
 * and Express local dev server (`server.ts`).
 *
 * Security model for POST /api/links/shortlinks:
 *   1. Verified Auth0 SSO JWT (`auth0_jwt`) or Relay Token (`relay_token`) -> bypass Turnstile.
 *   2. Trusted VZ Ecosystem API Key (`X-VZ-Ecosystem-Key` or `X-VZ-Relay-Token`, constant-time) -> bypass Turnstile.
 *   3. If client explicitly supplies a Turnstile token and server secret is configured -> ALWAYS verify via `siteverify`.
 *   4. Scoped Trusted VZ Ecosystem Browser Origin (HTTPS allowlist for active sibling services + optional
 *      `VZ_ECOSYSTEM_ALLOWED_ORIGINS`) -> bypass Turnstile.
 *      NOTE: `links.vz.gay`, `mail.vz.gay`, `imy.li`, `www.imy.li`, and `*.imy.li` are ALWAYS excluded from Origin bypass
 *      so anonymous public users on the shortener UI MUST pass Cloudflare Turnstile.
 *   5. Public anonymous requests -> strict Cloudflare Turnstile `siteverify` in production (fail-closed if secret missing);
 *      automatic dev/preview bypass strictly on local/preview hosts when Turnstile secret is unset.
 */

import { isLocalDevHostname } from './auth0JwtVerify.ts';

export const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAAGWaOorjmzmCqhEP';
export const TURNSTILE_SHORTLINK_ACTION = 'shortlink_create';
export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const TURNSTILE_FETCH_TIMEOUT_MS = 8000;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

/**
 * Built-in active VZ ecosystem services that integrate imy.li / links.vz.gay shortlinks.
 * Note: `mail.vz.gay` is intentionally excluded from anonymous Origin bypass because it hosts
 * the same public SPA shortener UI; logged-in Mail users already bypass via Auth0 SSO JWT.
 */
const BUILTIN_TRUSTED_EXACT_HOSTS = new Set<string>([
  'builder.vz.gay',
  'desk.vz.gay',
  'files.vz.gay',
  'cite.vz.gay',
  'docs.vz.gay',
  'sheets.vz.gay',
  'presentation.vz.gay',
  'forms.vz.gay',
  'diary.vz.gay',
  'press.vz.gay',
  'flowcharts.vz.gay',
  'draw.vz.gay',
  'craft.vz.gay',
  'design.vz.gay',
  'motion.vz.gay',
  'math.vz.gay',
  'ekonometrics.vz.gay',
  'metrics.vz.gay',
  'chat.vz.gay',
  'groups.vz.gay',
  'contacts.vz.gay',
  'view.vz.gay',
  'pub.vz.gay',
  'go-blog.vz.gay',
  'business.vz.gay',
]);

const BUILTIN_TRUSTED_WILDCARD_BASES = [
  'game.vz.gay',
  'app.vz.gay',
  'code.vz.gay',
] as const;

/**
 * Public shortlink surfaces that must NEVER bypass Turnstile via Origin header.
 */
function isPublicShortlinkSurfaceHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'links.vz.gay' ||
    h === 'mail.vz.gay' ||
    h === 'imy.li' ||
    h === 'www.imy.li' ||
    h.endsWith('.imy.li')
  );
}

/**
 * Resolves the Turnstile server secret from either `TURNSTILE_SECRET_KEY` (primary)
 * or `TURNSTILE_SECRET` (Cloudflare Turnstile Spin canonical env var name).
 */
export function resolveTurnstileSecretKey(
  primarySecret?: string | null,
  spinSecretAlias?: string | null
): string {
  return (primarySecret || '').trim() || (spinSecretAlias || '').trim();
}

/**
 * Lightweight client-side heuristic to detect when user input resembles a real public URL
 * so the on-demand Turnstile widget does not burn unused challenges on partial keystrokes.
 */
export function isLikelyValidShortlinkUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 4 || /\s/.test(trimmed)) return false;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.')) return false;
    const labels = host.split('.');
    if (labels.some((label) => !label || label.length > 63)) return false;
    const tld = labels[labels.length - 1];
    return /^[a-z]{2,24}$/.test(tld);
  } catch {
    return false;
  }
}

const VALID_HOSTNAME_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function parseExtraAllowedPatterns(extraAllowedOriginsCsv?: string | null): {
  exactHosts: Set<string>;
  wildcardBases: string[];
} {
  const exactHosts = new Set<string>();
  const wildcardBases: string[] = [];

  const raw = (extraAllowedOriginsCsv || '').trim();
  if (!raw) return { exactHosts, wildcardBases };

  for (const part of raw.split(',')) {
    let entry = part.trim().toLowerCase();
    if (!entry) continue;

    // Strip optional scheme if user configured full origin like https://foo.vz.gay
    if (entry.startsWith('https://')) {
      entry = entry.slice('https://'.length);
    } else if (entry.startsWith('http://')) {
      // Never allow insecure http:// in trusted production allowlist
      continue;
    }

    // Strip trailing slash / path if accidentally appended
    const slashIdx = entry.indexOf('/');
    if (slashIdx !== -1) {
      entry = entry.slice(0, slashIdx);
    }

    if (entry.startsWith('*.')) {
      const base = entry.slice(2);
      if (
        VALID_HOSTNAME_REGEX.test(base) &&
        !isPublicShortlinkSurfaceHost(base) &&
        base !== 'vz.gay' // Prevent overly broad *.vz.gay wildcard from capturing links.vz.gay
      ) {
        wildcardBases.push(base);
      }
      continue;
    }

    if (VALID_HOSTNAME_REGEX.test(entry) && !isPublicShortlinkSurfaceHost(entry)) {
      exactHosts.add(entry);
    }
  }

  return { exactHosts, wildcardBases };
}

/**
 * Strictly validates whether an HTTP `Origin` header belongs to a trusted sibling
 * VZ ecosystem web service (`https:` only, exact hostname or scoped subdomain wildcard,
 * never `links.vz.gay` or `*.imy.li`).
 *
 * Returns the normalized exact origin string (e.g. `https://go-blog.builder.vz.gay`)
 * or `null` if not trusted.
 */
export function resolveTrustedVzEcosystemOrigin(
  originHeader?: string | null,
  extraAllowedOriginsCsv?: string | null
): string | null {
  const raw = (originHeader || '').trim();
  if (!raw || raw === 'null') return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // Must be pure HTTPS origin with no credentials, custom port, path, query, or hash
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (parsed.origin !== raw) return null;

  const hostname = parsed.hostname.toLowerCase();
  if (!VALID_HOSTNAME_REGEX.test(hostname)) return null;

  // Hard exclusion: public shortener hosts must ALWAYS go through Turnstile
  if (isPublicShortlinkSurfaceHost(hostname)) return null;

  // 1. Built-in exact matches
  if (BUILTIN_TRUSTED_EXACT_HOSTS.has(hostname)) {
    return parsed.origin;
  }

  // 2. Built-in scoped subdomain matches (*.builder.vz.gay, *.desk.vz.gay, *.files.vz.gay)
  for (const base of BUILTIN_TRUSTED_WILDCARD_BASES) {
    if (hostname.endsWith(`.${base}`)) {
      return parsed.origin;
    }
  }

  // 3. Optional extra env allowlist
  const extra = parseExtraAllowedPatterns(extraAllowedOriginsCsv);
  if (extra.exactHosts.has(hostname)) {
    return parsed.origin;
  }
  for (const base of extra.wildcardBases) {
    if (hostname.endsWith(`.${base}`)) {
      return parsed.origin;
    }
  }

  return null;
}

export function isTrustedVzEcosystemOrigin(
  originHeader?: string | null,
  extraAllowedOriginsCsv?: string | null
): boolean {
  return resolveTrustedVzEcosystemOrigin(originHeader, extraAllowedOriginsCsv) !== null;
}

/**
 * Builds strict, non-wildcard CORS headers for verified VZ ecosystem origins.
 * Returns an empty object `{}` for untrusted or absent origins.
 */
export function buildVzEcosystemCorsHeaders(
  originHeader?: string | null,
  extraAllowedOriginsCsv?: string | null
): Record<string, string> {
  const trustedOrigin = resolveTrustedVzEcosystemOrigin(
    originHeader,
    extraAllowedOriginsCsv
  );
  if (!trustedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': trustedOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-VZ-Ecosystem-Key, X-VZ-Relay-Token',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Constant-time secret string comparison using SHA-256 digests + byte XOR.
 * Avoids timing side-channels and works identically in Cloudflare Workers and Node.js.
 */
export async function constantTimeSecretMatch(
  provided?: string | null,
  expected?: string | null
): Promise<boolean> {
  const a = (provided || '').trim();
  const b = (expected || '').trim();
  if (!a || !b) return false;

  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

export type ShortlinkAntiBotMode =
  | 'auth0_sso_bypass'
  | 'vz_ecosystem_api_key'
  | 'vz_ecosystem_origin'
  | 'turnstile_verified'
  | 'local_dev_bypass';

export type ShortlinkAntiBotResult =
  | {
      ok: true;
      mode: ShortlinkAntiBotMode;
      trustedOrigin?: string;
      turnstileHostname?: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 503;
      error: string;
      errorCodes?: string[];
    };

export interface VerifyShortlinkAntiBotOptions {
  /** True only when a real Auth0 RS256 JWT or Relay Token has been cryptographically verified. */
  hasVerifiedAuth0Sso?: boolean;
  ecosystemKeyHeader?: string | null;
  expectedEcosystemApiKey?: string | null;
  relayTokenHeader?: string | null;
  expectedRelayToken?: string | null;
  originHeader?: string | null;
  extraAllowedOriginsCsv?: string | null;
  turnstileToken?: string | null;
  turnstileSecretKey?: string | null;
  /** Optional Cloudflare Spin canonical alias (`TURNSTILE_SECRET`) if `TURNSTILE_SECRET_KEY` is unset. */
  turnstileSecretAlias?: string | null;
  /** Optional CSV of deployment-specific expected Turnstile widget hostnames (`TURNSTILE_HOSTNAMES`). */
  expectedHostnamesCsv?: string | null;
  clientIp?: string | null;
  requestHostname: string;
  allowLocalDevFallback?: boolean;
  expectedAction?: string;
}

interface CloudflareTurnstileSiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

function isLocalhostLike(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function isAllowedTurnstileResponseHostname(
  returnedHostname: string,
  requestHostname: string,
  expectedHostnamesCsv?: string | null
): boolean {
  const h = returnedHostname.trim().toLowerCase();
  const reqHost = requestHostname.trim().toLowerCase();
  const reqIsLocal = isLocalDevHostname(reqHost);

  if (!h) return true;

  // Cloudflare Spin rule: production backends must NEVER accept localhost / 127.0.0.1 tokens
  if (!reqIsLocal && isLocalhostLike(h)) {
    return false;
  }

  // Allow official Cloudflare Turnstile testing hostname strictly on local/preview hosts
  if (h === 'example.com' && reqIsLocal) return true;

  // If deployment explicitly sets TURNSTILE_HOSTNAMES, enforce exact match against that set
  const rawExpected = (expectedHostnamesCsv || '').trim();
  if (rawExpected) {
    const allowedSet = new Set(
      rawExpected
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => Boolean(item) && (reqIsLocal || !isLocalhostLike(item)))
    );
    if (allowedSet.size > 0) {
      return allowedSet.has(h);
    }
  }

  if (h === reqHost) return true;
  if (
    h === 'imy.li' ||
    h === 'www.imy.li' ||
    h.endsWith('.imy.li') ||
    h === 'links.vz.gay' ||
    h === 'mail.vz.gay' ||
    h.endsWith('.vz.gay')
  ) {
    return true;
  }
  return false;
}

function mapTurnstileErrorMessage(errorCodes: string[]): string {
  if (errorCodes.includes('timeout-or-duplicate')) {
    return 'Verifikasi anti-bot Cloudflare Turnstile kedaluwarsa atau sudah terpakai. Silakan muat ulang verifikasi dan coba lagi.';
  }
  if (errorCodes.includes('invalid-input-response') || errorCodes.includes('missing-input-response')) {
    return 'Token verifikasi Cloudflare Turnstile tidak valid. Selesaikan verifikasi keamanan terlebih dahulu.';
  }
  if (errorCodes.includes('invalid-input-secret') || errorCodes.includes('missing-input-secret')) {
    return 'Konfigurasi secret Cloudflare Turnstile di server belum valid.';
  }
  return 'Verifikasi keamanan Cloudflare Turnstile gagal. Silakan coba lagi.';
}

/**
 * Evaluates the Hybrid VZ Ecosystem + Cloudflare Turnstile guard for `POST /api/links/shortlinks`.
 */
export async function verifyShortlinkAntiBotGuard(
  options: VerifyShortlinkAntiBotOptions
): Promise<ShortlinkAntiBotResult> {
  // Path 1: Cryptographically verified Auth0 SSO user
  if (options.hasVerifiedAuth0Sso) {
    return { ok: true, mode: 'auth0_sso_bypass' };
  }

  // Path 2: Trusted VZ Ecosystem API Key or Relay Token (constant-time)
  if (
    (await constantTimeSecretMatch(
      options.ecosystemKeyHeader,
      options.expectedEcosystemApiKey
    )) ||
    (await constantTimeSecretMatch(
      options.relayTokenHeader,
      options.expectedRelayToken
    ))
  ) {
    return { ok: true, mode: 'vz_ecosystem_api_key' };
  }

  const secretKey = resolveTurnstileSecretKey(
    options.turnstileSecretKey,
    options.turnstileSecretAlias
  );
  const token = (options.turnstileToken || '').trim();

  // Path 3: If client explicitly supplied a Turnstile token and server secret is configured,
  // ALWAYS validate via Cloudflare siteverify so no issued widget token goes unverified.
  const shouldForceSiteverifyForSuppliedToken = Boolean(token && secretKey);

  // Path 4: Scoped Trusted VZ Ecosystem Browser Origin (only when no Turnstile token was submitted)
  if (!shouldForceSiteverifyForSuppliedToken) {
    const trustedOrigin = resolveTrustedVzEcosystemOrigin(
      options.originHeader,
      options.extraAllowedOriginsCsv
    );
    if (trustedOrigin) {
      return {
        ok: true,
        mode: 'vz_ecosystem_origin',
        trustedOrigin,
      };
    }
  }

  // Path 5: Public anonymous request (or forced token verification) -> Turnstile siteverify
  const isLocalHost =
    Boolean(options.allowLocalDevFallback) || isLocalDevHostname(options.requestHostname);

  if (!secretKey) {
    if (isLocalHost) {
      return { ok: true, mode: 'local_dev_bypass' };
    }
    // Fail-closed in production so misconfiguration never silently disables bot protection
    return {
      ok: false,
      status: 503,
      error:
        'Perlindungan anti-bot Cloudflare Turnstile belum dikonfigurasi di server produksi (TURNSTILE_SECRET_KEY / TURNSTILE_SECRET belum terpasang).',
      errorCodes: ['missing-input-secret'],
    };
  }

  if (!token) {
    return {
      ok: false,
      status: 403,
      error:
        'Selesaikan verifikasi keamanan Cloudflare Turnstile terlebih dahulu sebelum membuat shortlink publik.',
      errorCodes: ['missing-input-response'],
    };
  }

  if (token.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: 'Format token Cloudflare Turnstile tidak valid.',
      errorCodes: ['invalid-input-response'],
    };
  }

  const formBody = new URLSearchParams();
  formBody.set('secret', secretKey);
  formBody.set('response', token);
  const ip = (options.clientIp || '').trim();
  if (ip) {
    formBody.set('remoteip', ip);
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    formBody.set('idempotency_key', crypto.randomUUID());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURNSTILE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 503,
        error: 'Layanan verifikasi Cloudflare Turnstile sedang tidak dapat dijangkau. Coba lagi.',
        errorCodes: [`http-${response.status}`],
      };
    }

    const outcome = (await response.json()) as CloudflareTurnstileSiteverifyResponse;
    if (!outcome || outcome.success !== true) {
      const codes = Array.isArray(outcome?.['error-codes'])
        ? outcome['error-codes'].map(String)
        : ['verification-failed'];
      return {
        ok: false,
        status: 403,
        error: mapTurnstileErrorMessage(codes),
        errorCodes: codes,
      };
    }

    const expectedAction = options.expectedAction ?? TURNSTILE_SHORTLINK_ACTION;
    if (expectedAction && outcome.action && outcome.action !== expectedAction) {
      return {
        ok: false,
        status: 403,
        error: 'Aksi token Cloudflare Turnstile tidak sesuai dengan pembuatan shortlink.',
        errorCodes: ['action-mismatch'],
      };
    }

    if (
      outcome.hostname &&
      !isAllowedTurnstileResponseHostname(
        outcome.hostname,
        options.requestHostname,
        options.expectedHostnamesCsv
      )
    ) {
      return {
        ok: false,
        status: 403,
        error: 'Hostname verifikasi Cloudflare Turnstile tidak cocok dengan layanan ini.',
        errorCodes: ['hostname-mismatch'],
      };
    }

    return {
      ok: true,
      mode: 'turnstile_verified',
      turnstileHostname: outcome.hostname,
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Gagal menghubungi server verifikasi Cloudflare Turnstile. Silakan coba lagi.',
      errorCodes: ['siteverify-network-error'],
    };
  } finally {
    clearTimeout(timer);
  }
}
