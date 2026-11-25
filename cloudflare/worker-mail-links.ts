/// <reference types="@cloudflare/workers-types" />

// VZ Mail (mail.vz.gay) + VZ Links (links.vz.gay & *.imy.li)
// 2-in-1 Production Cloudflare Worker (`vzmail`):
//
// 1. HTTP Multi-Domain Fetch Router:
//    - GET /api/health               -> Worker health, bound capabilities & version telemetry
//    - GET /api/mail/queue           -> Pull pending ephemeral packets (parallel KV reads)
//    - POST /api/mail/ack            -> Pop-and-Purge immediate KV deletion + purge receipt
//    - POST /api/mail/send           -> Outbound Cloudflare Email Sending (`env.SEND_EMAIL`) + daily quota
//    - POST /api/mail/simulate-inbound -> Ephemeral inbound routing & alias test endpoint
//    - POST /api/mail/seed-transit   -> Seeds initial onboarding transit packet for a handle
//    - GET|POST|DELETE /api/links/*  -> Optional KV-backed shortlink & bio synchronization
//    - GET /*/s/$SLUG                -> Validated HTTP 301 shortlink redirector (`LINKS_KV`)
//    - GET https://$USER.imy.li/*    -> Curated PSL-safe static Link-in-Bio (zero Set-Cookie, strict CSP)
//    - Fallback                      -> Static Vite SPA assets (`env.ASSETS`) with hardened security headers
//
// 2. Inbound Cloudflare Email Routing Handler (`email(message, env, ctx)`):
//    - Canonicalizes Gmail-style `.` and `+` aliases (`fa.dhil+tag@imy.li` -> `fadhil@imy.li`)
//    - Streams & bounds raw MIME input to protect Worker 128 MB memory limit
//    - Stores packet in ephemeral `MAIL_TRANSIT_KV` with 72h auto-TTL (Zero permanent server mailbox)
//
// Design Guarantees:
// - Zero module-level mutable request state (100% isolate-safe across requests)
// - Constant-time Bearer auth check when optional `RELAY_AUTH_TOKEN` secret is set
// - Structured JSON logging for Cloudflare Workers Logs & Traces

import {
  DEFAULT_SUPPORTED_DOMAINS,
  resolveCanonicalEmail,
  sanitizeHandle,
} from '../src/utils/mailIdentity.ts';
import {
  generateSecureId,
  isValidEmailAddress,
  plainTextToSafeEmailHtml,
  sanitizeDisplayName,
  sanitizeExternalUrl,
  sanitizeSlug,
  stripHeaderInjection,
} from '../src/utils/mailSecurity.ts';
import {
  AVATAR_MAX_BYTES,
  detectValidatedAvatarMime,
  generateShortlinkCode,
  isValidBioThemeId,
  isValidButtonStyle,
  sanitizeBioAvatarUrl,
  sanitizeBioWorkspaceInput,
  sanitizePageSlug,
  sanitizeShortlinkSlugInput,
  sanitizeSocialsMap,
  type BioLinkItem,
  type BioPageRecord,
  type BioWorkspaceData,
  type ShortlinkRecord,
} from '../src/utils/linksModel.ts';

export interface CloudflareSendEmailMessage {
  from: string | { email: string; name?: string };
  to: string | string[] | { email: string; name?: string }[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | { email: string; name?: string };
  headers?: Record<string, string>;
}

export interface SendEmailBinding {
  send(message: CloudflareSendEmailMessage): Promise<unknown>;
}

export interface WorkerEnv {
  ASSETS?: Fetcher;
  MAIL_TRANSIT_KV?: KVNamespace;
  LINKS_KV?: KVNamespace;
  LINKS_DB?: D1Database;
  LINKS_MEDIA_R2?: R2Bucket;
  SEND_EMAIL?: SendEmailBinding;
  APP_DOMAIN?: string;
  LINKS_DOMAIN?: string;
  PRIMARY_MAIL_DOMAIN?: string;
  AUTH0_DOMAIN?: string;
  ACCOUNT_DASHBOARD_URL?: string;
  SPONSOR_DOMAIN?: string;
  DAILY_OUTBOUND_LIMIT?: string;
  RELAY_AUTH_TOKEN?: string;
  OUTBOUND_PROVIDER?: string;
  CPANEL_RELAY_URL?: string;
  CPANEL_RELAY_SECRET?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
}

type OutboundProviderId = 'cpanel_relay' | 'resend' | 'brevo' | 'cloudflare' | 'none';

interface OutboundDispatchPayload {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  rfcMessageId: string;
}

function getOutboundCapabilities(env: WorkerEnv) {
  const safeRelayUrl = env.CPANEL_RELAY_URL
    ? sanitizeExternalUrl(env.CPANEL_RELAY_URL.trim(), {
        allowMailto: false,
        blockPrivateHosts: true,
      })
    : null;
  const cpanelRelay = Boolean(
    safeRelayUrl &&
      safeRelayUrl.startsWith('https://') &&
      env.CPANEL_RELAY_SECRET &&
      env.CPANEL_RELAY_SECRET.trim().length >= 16
  );
  const resend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim().length > 0);
  const brevo = Boolean(env.BREVO_API_KEY && env.BREVO_API_KEY.trim().length > 0);
  const cloudflare = Boolean(env.SEND_EMAIL);

  return { safeRelayUrl, cpanelRelay, resend, brevo, cloudflare };
}

function resolveOutboundProvider(env: WorkerEnv): OutboundProviderId {
  const mode = (env.OUTBOUND_PROVIDER || 'auto').trim().toLowerCase();
  const caps = getOutboundCapabilities(env);

  if (mode === 'cpanel_relay') return caps.cpanelRelay ? 'cpanel_relay' : 'none';
  if (mode === 'resend') return caps.resend ? 'resend' : 'none';
  if (mode === 'brevo') return caps.brevo ? 'brevo' : 'none';
  if (mode === 'cloudflare') return caps.cloudflare ? 'cloudflare' : 'none';

  // Default "auto" priority chain: cPanel/WHM ($0) -> Resend ($0) -> Brevo ($0) -> Cloudflare SEND_EMAIL
  if (caps.cpanelRelay) return 'cpanel_relay';
  if (caps.resend) return 'resend';
  if (caps.brevo) return 'brevo';
  if (caps.cloudflare) return 'cloudflare';
  return 'none';
}

async function dispatchOutboundEmail(
  provider: OutboundProviderId,
  env: WorkerEnv,
  payload: OutboundDispatchPayload
): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  const caps = getOutboundCapabilities(env);

  if (provider === 'cpanel_relay') {
    if (!caps.safeRelayUrl || !caps.safeRelayUrl.startsWith('https://') || !env.CPANEL_RELAY_SECRET) {
      return {
        ok: false,
        error:
          'Konfigurasi cPanel Relay belum valid. Pastikan CPANEL_RELAY_URL menggunakan HTTPS publik dan CPANEL_RELAY_SECRET (min 16 karakter) sudah diset via wrangler secret put.',
      };
    }

    const res = await fetch(caps.safeRelayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.CPANEL_RELAY_SECRET.trim()}`,
        'X-VZ-Relay-Origin': 'cloudflare-worker',
      },
      body: JSON.stringify({
        action: 'send',
        fromEmail: payload.fromEmail,
        fromName: payload.fromName,
        toEmail: payload.toEmail,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        messageId: payload.rfcMessageId,
      }),
    });

    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error:
          data?.error ||
          `Relay cPanel menolak permintaan pengiriman (HTTP ${res.status}). Periksa token rahasia dan status Remote Mail Exchanger di cPanel.`,
      };
    }

    return {
      ok: true,
      label: 'cPanel/WHM Outbound Relay (Zero-Storage Exim + DKIM)',
    };
  }

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
      },
      body: JSON.stringify({
        from: `${payload.fromName} <${payload.fromEmail}>`,
        to: [payload.toEmail],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        headers: {
          'Message-ID': payload.rfcMessageId,
          'X-VZ-Zero-Retention': 'true',
        },
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        error:
          errBody?.message ||
          `Pengiriman via Resend API gagal (HTTP ${res.status}). Pastikan domain imy.li sudah terverifikasi di Resend.`,
      };
    }

    return { ok: true, label: 'Resend Transactional API' };
  }

  if (provider === 'brevo') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.BREVO_API_KEY!.trim(),
      },
      body: JSON.stringify({
        sender: {
          name: payload.fromName,
          email: payload.fromEmail,
        },
        to: [{ email: payload.toEmail }],
        subject: payload.subject,
        textContent: payload.text,
        htmlContent: payload.html,
        headers: {
          'Message-ID': payload.rfcMessageId,
          'X-VZ-Zero-Retention': 'true',
        },
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        error:
          errBody?.message ||
          `Pengiriman via Brevo API gagal (HTTP ${res.status}). Pastikan domain pengirim imy.li sudah terverifikasi di Brevo.`,
      };
    }

    return { ok: true, label: 'Brevo Transactional API' };
  }

  if (provider === 'cloudflare' && env.SEND_EMAIL) {
    await env.SEND_EMAIL.send({
      from: {
        email: payload.fromEmail,
        name: payload.fromName,
      },
      to: payload.toEmail,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: {
        'Message-ID': payload.rfcMessageId,
        'X-VZ-Zero-Retention': 'true',
      },
    });
    return {
      ok: true,
      label: 'Cloudflare Email Sending Worker (SEND_EMAIL binding)',
    };
  }

  return {
    ok: false,
    error: 'Belum ada provider email keluar yang aktif.',
  };
}

export interface EphemeralMailPacket {
  id: string;
  rfcMessageId: string;
  canonicalUser: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  plusTag: string | null;
  dotNormalized: boolean;
  subject: string;
  bodyText: string;
  receivedAt: string;
  expiresAt: string;
}

const TRANSIT_TTL_SECONDS = 72 * 3600;
const QUOTA_TTL_SECONDS = 36 * 3600;
const MAX_JSON_BODY_BYTES = 256 * 1024; // 256 KB max API JSON request payload
const MAX_EMAIL_BODY_CHARS = 64 * 1024; // 64 KB stored text cap per transit packet
const MAX_RAW_EMAIL_SCAN_BYTES = 256 * 1024; // Bound stream read to protect 128 MB isolate memory
const MAX_INBOUND_REJECT_BYTES = 10 * 1024 * 1024; // Reject >10 MB raw inbound messages cleanly
const MAX_PACKETS_PER_PULL = 50;

function buildAppCsp(auth0Domain?: string): string {
  const authOrigins = new Set<string>([
    'https://accounts.vz.gay',
  ]);
  const cleaned = (auth0Domain || '').trim().toLowerCase();
  if (cleaned && /^[a-z0-9.-]+$/.test(cleaned)) {
    authOrigins.add(`https://${cleaned}`);
  }
  const authList = Array.from(authOrigins).join(' ');

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    `connect-src 'self' ${authList}`,
    `frame-src 'self' ${authList}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

const BIO_STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

function logInfo(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', event, ...data }));
}

function logError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      error: error instanceof Error ? error.message : String(error),
      ...data,
    })
  );
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-VZ-Zero-Retention': 'EPHEMERAL_POP_AND_PURGE',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function applyHtmlSecurityHeaders(
  response: Response,
  options: { isBioSubdomain?: boolean; isHttps?: boolean; auth0Domain?: string } = {}
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  if (options.isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const contentType = headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    headers.set(
      'Content-Security-Policy',
      options.isBioSubdomain ? BIO_STRICT_CSP : buildAppCsp(options.auth0Domain)
    );
    headers.set('Cache-Control', 'no-cache, must-revalidate');
  }

  if (options.isBioSubdomain) {
    headers.delete('Set-Cookie');
    headers.set('X-VZ-PSL-Isolation', 'static-curated-zero-cookie');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Constant-time token verification using SHA-256 + crypto.subtle.timingSafeEqual
 * (avoids length leakage and timing side-channels).
 */
async function verifyRelayAuth(request: Request, env: WorkerEnv): Promise<boolean> {
  const expected = env.RELAY_AUTH_TOKEN?.trim();
  if (!expected) {
    return true; // Open preview mode until RELAY_AUTH_TOKEN secret is configured
  }

  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (request.headers.get('X-VZ-Relay-Token') || '').trim();

  if (!bearerToken) return false;

  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(bearerToken)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(providedHash, expectedHash);
  }

  // Constant-time byte loop fallback for non-Workers test runtimes
  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Reads and parses a bounded JSON request body to prevent memory DoS.
 */
async function readBoundedJson<T>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: 'Payload terlalu besar (maks 256 KB).' };
  }

  if (!request.body) {
    return { ok: false, status: 400, error: 'Body JSON diperlukan.' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { ok: false, status: 413, error: 'Payload terlalu besar (maks 256 KB).' };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder().decode(merged);
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: 'Format JSON tidak valid.' };
  }
}

/**
 * Streams a bounded prefix from `message.raw` so multi-megabyte attachments never
 * exhaust the 128 MB Cloudflare Worker isolate memory limit.
 */
async function readBoundedStreamText(
  stream: ReadableStream<Uint8Array>,
  maxBytes = MAX_RAW_EMAIL_SCAN_BYTES
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(merged),
    truncated,
  };
}

/**
 * Extracts a clean plain-text body from raw RFC 5322 / MIME text without external dependencies.
 */
function extractReadableBodyFromRawMime(rawMime: string): string {
  const normalized = rawMime.replace(/\r\n/g, '\n');
  const headerBodySplit = normalized.indexOf('\n\n');
  if (headerBodySplit < 0) {
    return normalized.trim().slice(0, MAX_EMAIL_BODY_CHARS);
  }

  const headersPart = normalized.slice(0, headerBodySplit);
  const bodyPart = normalized.slice(headerBodySplit + 2);

  // Check if multipart and extract first text/plain section if present
  const boundaryMatch = headersPart.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const sections = bodyPart.split(`--${boundary}`);
    for (const section of sections) {
      if (/content-type:\s*text\/plain/i.test(section)) {
        const partSplit = section.indexOf('\n\n');
        if (partSplit >= 0) {
          return section
            .slice(partSplit + 2)
            .replace(/--\s*$/, '')
            .trim()
            .slice(0, MAX_EMAIL_BODY_CHARS);
        }
      }
    }
  }

  return bodyPart.trim().slice(0, MAX_EMAIL_BODY_CHARS);
}

function getDailyLimit(env: WorkerEnv): number {
  const parsed = Number.parseInt(env.DAILY_OUTBOUND_LIMIT || '25', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1000 ? parsed : 25;
}

function getPrimaryDomain(env: WorkerEnv): string {
  return (env.PRIMARY_MAIL_DOMAIN || 'imy.li').toLowerCase();
}

async function getDailyQuotaUsage(
  env: WorkerEnv,
  user: string
): Promise<{ date: string; usedToday: number; dailyLimit: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const dailyLimit = getDailyLimit(env);
  if (!env.MAIL_TRANSIT_KV) {
    return { date, usedToday: 0, dailyLimit };
  }
  const raw = await env.MAIL_TRANSIT_KV.get(`quota:${date}:${user}`, 'text');
  const usedToday = raw ? Number.parseInt(raw, 10) || 0 : 0;
  return { date, usedToday, dailyLimit };
}

function buildSeedPacket(user: string, domain: string): EphemeralMailPacket {
  const now = new Date();
  return {
    id: `cf-q-${user}-init`,
    rfcMessageId: `<cf-edge-routing-${now.getTime()}@${domain}>`,
    canonicalUser: user,
    fromName: 'Cloudflare Email Routing Edge',
    fromAddress: 'routing-daemon@mail.vz.gay',
    toAddress: `${user}+edge-verify@${domain}`,
    plusTag: 'edge-verify',
    dotNormalized: false,
    subject: `[Transit Queue Ready] Paket masuk untuk ${user}+edge-verify@${domain} siap ditarik ke lokal`,
    bodyText: `Paket ini tertahan sementara di Ephemeral Transit Buffer Cloudflare Worker sambil menunggu perangkat ${user}@${domain} online.\n\nBegitu Anda menekan tombol "Tarik & Hapus dari Server (Pop & Purge)", pesan ini disimpan ke IndexedDB browser Anda dan langsung dihapus permanen dari edge buffer (Zero Server Mailbox Retention).`,
    receivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TRANSIT_TTL_SECONDS * 1000).toISOString(),
  };
}

export function canonicalizeImyRecipient(rawAddress: string): {
  canonicalUser: string;
  canonicalEmail: string;
  plusTag: string | null;
  dotNormalized: boolean;
  domain: string;
} {
  const resolved = resolveCanonicalEmail(rawAddress, DEFAULT_SUPPORTED_DOMAINS);
  return {
    canonicalUser: resolved.canonicalUsername,
    canonicalEmail: resolved.canonicalEmail,
    plusTag: resolved.plusTag,
    dotNormalized: resolved.dotCount > 0,
    domain: resolved.domain,
  };
}

type LinksStorageEngine = 'cloudflare-d1' | 'cloudflare-kv' | 'none';

function getLinksStorageEngine(env: WorkerEnv): LinksStorageEngine {
  if (env.LINKS_DB) return 'cloudflare-d1';
  if (env.LINKS_KV) return 'cloudflare-kv';
  return 'none';
}

function parseKvShortlinkRecord(slug: string, raw: string | null): ShortlinkRecord | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<ShortlinkRecord>;
      const safeTarget = sanitizeExternalUrl(String(parsed.targetUrl || ''), {
        allowMailto: false,
        blockPrivateHosts: true,
      });
      if (!safeTarget) return null;
      return {
        slug: parsed.slug || slug,
        ownerUser: typeof parsed.ownerUser === 'string' && parsed.ownerUser ? parsed.ownerUser : null,
        title: String(parsed.title || '').slice(0, 120),
        targetUrl: safeTarget,
        isCustomSlug: Boolean(parsed.isCustomSlug),
        clicks: Math.max(0, Number(parsed.clicks) || 0),
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        lastClickedAt: typeof parsed.lastClickedAt === 'string' ? parsed.lastClickedAt : null,
      };
    } catch {
      return null;
    }
  }
  // Backward compatibility for legacy plain-string KV values (`short:<slug>` -> `https://...`)
  const safeTarget = sanitizeExternalUrl(trimmed, {
    allowMailto: false,
    blockPrivateHosts: true,
  });
  if (!safeTarget) return null;
  return {
    slug,
    ownerUser: null,
    title: '',
    targetUrl: safeTarget,
    isCustomSlug: true,
    clicks: 0,
    createdAt: new Date().toISOString(),
    lastClickedAt: null,
  };
}

async function getShortlinkRecord(env: WorkerEnv, slug: string): Promise<ShortlinkRecord | null> {
  if (env.LINKS_DB) {
    const row = await env.LINKS_DB.prepare(
      'SELECT slug, owner_user, title, target_url, is_custom_slug, clicks, created_at, last_clicked_at FROM shortlinks WHERE slug = ? LIMIT 1'
    )
      .bind(slug)
      .first<{
        slug: string;
        owner_user: string | null;
        title: string | null;
        target_url: string;
        is_custom_slug: number;
        clicks: number;
        created_at: string;
        last_clicked_at: string | null;
      }>();
    if (row) {
      return {
        slug: row.slug,
        ownerUser: row.owner_user || null,
        title: row.title || '',
        targetUrl: row.target_url,
        isCustomSlug: Boolean(row.is_custom_slug),
        clicks: Math.max(0, Number(row.clicks) || 0),
        createdAt: row.created_at,
        lastClickedAt: row.last_clicked_at || null,
      };
    }
  }
  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get(`short:${slug}`, 'text');
    return parseKvShortlinkRecord(slug, raw);
  }
  return null;
}

async function listShortlinksByOwner(env: WorkerEnv, ownerUser: string): Promise<ShortlinkRecord[]> {
  if (env.LINKS_DB) {
    const res = await env.LINKS_DB.prepare(
      'SELECT slug, owner_user, title, target_url, is_custom_slug, clicks, created_at, last_clicked_at FROM shortlinks WHERE owner_user = ? ORDER BY created_at DESC LIMIT 200'
    )
      .bind(ownerUser)
      .all<{
        slug: string;
        owner_user: string | null;
        title: string | null;
        target_url: string;
        is_custom_slug: number;
        clicks: number;
        created_at: string;
        last_clicked_at: string | null;
      }>();
    return (res.results || []).map((row) => ({
      slug: row.slug,
      ownerUser: row.owner_user || null,
      title: row.title || '',
      targetUrl: row.target_url,
      isCustomSlug: Boolean(row.is_custom_slug),
      clicks: Math.max(0, Number(row.clicks) || 0),
      createdAt: row.created_at,
      lastClickedAt: row.last_clicked_at || null,
    }));
  }
  if (env.LINKS_KV) {
    const idx = await env.LINKS_KV.get<string[]>(`short_idx:${ownerUser}`, 'json');
    const slugs = Array.isArray(idx) ? idx.slice(0, 200) : [];
    const records = await Promise.all(slugs.map((s) => getShortlinkRecord(env, s)));
    return records
      .filter((r): r is ShortlinkRecord => Boolean(r))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return [];
}

async function saveShortlinkRecord(env: WorkerEnv, record: ShortlinkRecord): Promise<void> {
  if (env.LINKS_DB) {
    await env.LINKS_DB.prepare(
      'INSERT INTO shortlinks (slug, owner_user, title, target_url, is_custom_slug, clicks, created_at, last_clicked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        record.slug,
        record.ownerUser,
        record.title,
        record.targetUrl,
        record.isCustomSlug ? 1 : 0,
        record.clicks,
        record.createdAt,
        record.lastClickedAt
      )
      .run();
    return;
  }
  if (env.LINKS_KV) {
    await env.LINKS_KV.put(`short:${record.slug}`, JSON.stringify(record));
    if (record.ownerUser) {
      const existing = await env.LINKS_KV.get<string[]>(`short_idx:${record.ownerUser}`, 'json');
      const next = [record.slug, ...(Array.isArray(existing) ? existing.filter((s) => s !== record.slug) : [])].slice(
        0,
        200
      );
      await env.LINKS_KV.put(`short_idx:${record.ownerUser}`, JSON.stringify(next));
    }
  }
}

async function deleteShortlinkRecord(
  env: WorkerEnv,
  slug: string,
  ownerUser: string | null
): Promise<{ deleted: boolean; forbidden?: boolean }> {
  const existing = await getShortlinkRecord(env, slug);
  if (!existing) {
    return { deleted: false };
  }
  if (existing.ownerUser && ownerUser && existing.ownerUser !== ownerUser) {
    return { deleted: false, forbidden: true };
  }
  if (env.LINKS_DB) {
    await env.LINKS_DB.prepare('DELETE FROM shortlinks WHERE slug = ?').bind(slug).run();
  }
  if (env.LINKS_KV) {
    await env.LINKS_KV.delete(`short:${slug}`);
    if (existing.ownerUser) {
      const idx = await env.LINKS_KV.get<string[]>(`short_idx:${existing.ownerUser}`, 'json');
      if (Array.isArray(idx)) {
        await env.LINKS_KV.put(
          `short_idx:${existing.ownerUser}`,
          JSON.stringify(idx.filter((s) => s !== slug))
        );
      }
    }
  }
  return { deleted: true };
}

async function incrementShortlinkClick(env: WorkerEnv, slug: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    if (env.LINKS_DB) {
      await env.LINKS_DB.prepare(
        'UPDATE shortlinks SET clicks = clicks + 1, last_clicked_at = ? WHERE slug = ?'
      )
        .bind(now, slug)
        .run();
      return;
    }
    if (env.LINKS_KV) {
      const rec = await getShortlinkRecord(env, slug);
      if (rec) {
        await env.LINKS_KV.put(
          `short:${slug}`,
          JSON.stringify({ ...rec, clicks: rec.clicks + 1, lastClickedAt: now })
        );
      }
    }
  } catch (err) {
    logError('shortlink_click_increment_failed', err, { slug });
  }
}

async function getBioWorkspaceFromStorage(
  env: WorkerEnv,
  username: string
): Promise<BioWorkspaceData | null> {
  if (env.LINKS_DB) {
    const profile = await env.LINKS_DB.prepare(
      'SELECT username, display_name, headline, bio, avatar_url, socials_json, updated_at FROM bio_profiles WHERE username = ? LIMIT 1'
    )
      .bind(username)
      .first<{
        username: string;
        display_name: string;
        headline: string;
        bio: string;
        avatar_url: string;
        socials_json: string;
        updated_at: string;
      }>();

    if (profile) {
      const pagesRes = await env.LINKS_DB.prepare(
        'SELECT id, page_slug, title, description, avatar_url, theme_id, button_style, show_socials, is_published, updated_at FROM bio_pages WHERE username = ? ORDER BY CASE WHEN page_slug = "" THEN 0 ELSE 1 END, page_slug ASC'
      )
        .bind(username)
        .all<{
          id: string;
          page_slug: string;
          title: string;
          description: string;
          avatar_url?: string;
          theme_id: string;
          button_style: string;
          show_socials: number;
          is_published: number;
          updated_at: string;
        }>();

      const linksRes = await env.LINKS_DB.prepare(
        'SELECT id, page_id, title, subtitle, url, sort_order, enabled, clicks FROM bio_links WHERE username = ? ORDER BY sort_order ASC'
      )
        .bind(username)
        .all<{
          id: string;
          page_id: string;
          title: string;
          subtitle: string;
          url: string;
          sort_order: number;
          enabled: number;
          clicks: number;
        }>();

      const linksByPage = new Map<string, BioLinkItem[]>();
      for (const l of linksRes.results || []) {
        const list = linksByPage.get(l.page_id) || [];
        list.push({
          id: l.id,
          title: l.title,
          subtitle: l.subtitle || '',
          url: l.url,
          sortOrder: Number(l.sort_order) || 0,
          enabled: Boolean(l.enabled),
          clicks: Math.max(0, Number(l.clicks) || 0),
        });
        linksByPage.set(l.page_id, list);
      }

      let parsedSocials: unknown = {};
      try {
        parsedSocials = JSON.parse(profile.socials_json || '{}');
      } catch {
        parsedSocials = {};
      }

      const pages: BioPageRecord[] = (pagesRes.results || []).map((p) => ({
        id: p.id,
        pageSlug: p.page_slug || '',
        title: p.title || profile.display_name || username,
        description: p.description || '',
        avatarUrl: sanitizeBioAvatarUrl(p.avatar_url || ''),
        themeId: isValidBioThemeId(p.theme_id) ? p.theme_id : 'midnight_slate',
        buttonStyle: isValidButtonStyle(p.button_style) ? p.button_style : 'rounded',
        showSocials: Boolean(p.show_socials),
        isPublished: Boolean(p.is_published),
        links: linksByPage.get(p.id) || [],
        updatedAt: p.updated_at || profile.updated_at,
      }));

      return {
        username: profile.username,
        displayName: profile.display_name || username,
        headline: profile.headline || '',
        bio: profile.bio || '',
        avatarUrl: sanitizeBioAvatarUrl(profile.avatar_url || ''),
        socials: sanitizeSocialsMap(parsedSocials),
        pages,
        updatedAt: profile.updated_at,
        configured: true,
      };
    }
  }

  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get<BioWorkspaceData>(`bio:${username}`, 'json');
    if (raw && typeof raw === 'object' && Array.isArray(raw.pages)) {
      return { ...raw, username, configured: true };
    }
  }

  return null;
}

async function saveBioWorkspaceToStorage(
  env: WorkerEnv,
  username: string,
  rawInput: unknown
): Promise<BioWorkspaceData> {
  const existing = await getBioWorkspaceFromStorage(env, username);
  const existingClicks = new Map<string, number>();
  if (existing) {
    for (const p of existing.pages) {
      for (const l of p.links) {
        existingClicks.set(l.id, l.clicks);
      }
    }
  }

  const sanitized = sanitizeBioWorkspaceInput(username, rawInput, existingClicks);

  if (env.LINKS_DB) {
    const stmts: D1PreparedStatement[] = [
      env.LINKS_DB.prepare(
        'INSERT INTO bio_profiles (username, display_name, headline, bio, avatar_url, socials_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, headline = excluded.headline, bio = excluded.bio, avatar_url = excluded.avatar_url, socials_json = excluded.socials_json, updated_at = excluded.updated_at'
      ).bind(
        sanitized.username,
        sanitized.displayName,
        sanitized.headline,
        sanitized.bio,
        sanitized.avatarUrl,
        JSON.stringify(sanitized.socials),
        sanitized.updatedAt
      ),
      env.LINKS_DB.prepare('DELETE FROM bio_links WHERE username = ?').bind(sanitized.username),
      env.LINKS_DB.prepare('DELETE FROM bio_pages WHERE username = ?').bind(sanitized.username),
    ];

    for (const page of sanitized.pages) {
      stmts.push(
        env.LINKS_DB.prepare(
          'INSERT INTO bio_pages (id, username, page_slug, title, description, avatar_url, theme_id, button_style, show_socials, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          page.id,
          sanitized.username,
          page.pageSlug,
          page.title,
          page.description,
          page.avatarUrl || '',
          page.themeId,
          page.buttonStyle,
          page.showSocials ? 1 : 0,
          page.isPublished ? 1 : 0,
          page.updatedAt,
          page.updatedAt
        )
      );

      for (const link of page.links) {
        stmts.push(
          env.LINKS_DB.prepare(
            'INSERT INTO bio_links (id, page_id, username, title, subtitle, url, sort_order, enabled, clicks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            link.id,
            page.id,
            sanitized.username,
            link.title,
            link.subtitle,
            link.url,
            link.sortOrder,
            link.enabled ? 1 : 0,
            link.clicks,
            sanitized.updatedAt
          )
        );
      }
    }

    await env.LINKS_DB.batch(stmts);
    return sanitized;
  }

  if (env.LINKS_KV) {
    await env.LINKS_KV.put(`bio:${sanitized.username}`, JSON.stringify(sanitized));
  }

  return sanitized;
}

async function incrementBioLinkClickInStorage(
  env: WorkerEnv,
  username: string,
  pageSlug: string,
  linkId: string
): Promise<number | null> {
  if (env.LINKS_DB) {
    await env.LINKS_DB.prepare(
      'UPDATE bio_links SET clicks = clicks + 1 WHERE id = ? AND username = ?'
    )
      .bind(linkId, username)
      .run();
    const row = await env.LINKS_DB.prepare(
      'SELECT clicks FROM bio_links WHERE id = ? AND username = ? LIMIT 1'
    )
      .bind(linkId, username)
      .first<{ clicks: number }>();
    return row ? Number(row.clicks) || 0 : null;
  }

  if (env.LINKS_KV) {
    const workspace = await getBioWorkspaceFromStorage(env, username);
    if (!workspace) return null;
    let updatedClicks: number | null = null;
    const nextPages = workspace.pages.map((p) => {
      if (p.pageSlug !== pageSlug) return p;
      return {
        ...p,
        links: p.links.map((l) => {
          if (l.id !== linkId) return l;
          updatedClicks = l.clicks + 1;
          return { ...l, clicks: updatedClicks };
        }),
      };
    });
    if (updatedClicks !== null) {
      await env.LINKS_KV.put(
        `bio:${username}`,
        JSON.stringify({ ...workspace, pages: nextPages })
      );
    }
    return updatedClicks;
  }

  return null;
}

type MediaStorageEngine = 'cloudflare-r2' | 'cloudflare-d1' | 'cloudflare-kv' | 'none';

function getMediaStorageEngine(env: WorkerEnv): MediaStorageEngine {
  if (env.LINKS_MEDIA_R2) return 'cloudflare-r2';
  if (env.LINKS_DB) return 'cloudflare-d1';
  if (env.LINKS_KV) return 'cloudflare-kv';
  return 'none';
}

function buildAvatarStorageKey(username: string, pageSlug: string): string {
  return pageSlug ? `avatars/${username}/page-${pageSlug}` : `avatars/${username}/main`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function readBoundedBinary(
  request: Request,
  maxBytes = AVATAR_MAX_BYTES
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number; error: string }> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Ukuran foto terlalu besar (maks ${Math.round(maxBytes / 1024)} KB setelah kompresi AVIF).`,
    };
  }
  if (!request.body) {
    return { ok: false, status: 400, error: 'Data biner gambar diperlukan.' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return {
            ok: false,
            status: 413,
            error: `Ukuran foto melebihi batas ${Math.round(maxBytes / 1024)} KB.`,
          };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: merged };
}

async function putAvatarToStorage(
  env: WorkerEnv,
  username: string,
  pageSlug: string,
  bytes: Uint8Array,
  contentType: 'image/avif' | 'image/webp'
): Promise<MediaStorageEngine> {
  const key = buildAvatarStorageKey(username, pageSlug);
  const now = new Date().toISOString();

  if (env.LINKS_MEDIA_R2) {
    await env.LINKS_MEDIA_R2.put(key, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        username,
        pageSlug,
        updatedAt: now,
      },
    });
    return 'cloudflare-r2';
  }

  const dataBase64 = uint8ToBase64(bytes);

  if (env.LINKS_DB) {
    await env.LINKS_DB.prepare(
      'INSERT INTO bio_avatars (avatar_key, username, page_slug, content_type, data_base64, byte_size, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(avatar_key) DO UPDATE SET content_type = excluded.content_type, data_base64 = excluded.data_base64, byte_size = excluded.byte_size, updated_at = excluded.updated_at'
    )
      .bind(key, username, pageSlug, contentType, dataBase64, bytes.byteLength, now)
      .run();
    return 'cloudflare-d1';
  }

  if (env.LINKS_KV) {
    await env.LINKS_KV.put(
      `avatar:${key}`,
      JSON.stringify({
        contentType,
        dataBase64,
        byteSize: bytes.byteLength,
        updatedAt: now,
      })
    );
    return 'cloudflare-kv';
  }

  return 'none';
}

async function getAvatarFromStorage(
  env: WorkerEnv,
  username: string,
  pageSlug: string
): Promise<{ body: ArrayBuffer | ReadableStream; contentType: string } | null> {
  const key = buildAvatarStorageKey(username, pageSlug);

  if (env.LINKS_MEDIA_R2) {
    const obj = await env.LINKS_MEDIA_R2.get(key);
    if (obj && obj.body) {
      const ct =
        obj.httpMetadata?.contentType === 'image/webp' ? 'image/webp' : 'image/avif';
      return { body: obj.body, contentType: ct };
    }
  }

  if (env.LINKS_DB) {
    const row = await env.LINKS_DB.prepare(
      'SELECT content_type, data_base64 FROM bio_avatars WHERE avatar_key = ? LIMIT 1'
    )
      .bind(key)
      .first<{ content_type: string; data_base64: string }>();
    if (row && row.data_base64) {
      const ct = row.content_type === 'image/webp' ? 'image/webp' : 'image/avif';
      const bytes = base64ToUint8(row.data_base64);
      return { body: bytes.buffer as ArrayBuffer, contentType: ct };
    }
  }

  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get<{
      contentType?: string;
      dataBase64?: string;
    }>(`avatar:${key}`, 'json');
    if (raw?.dataBase64) {
      const ct = raw.contentType === 'image/webp' ? 'image/webp' : 'image/avif';
      const bytes = base64ToUint8(raw.dataBase64);
      return { body: bytes.buffer as ArrayBuffer, contentType: ct };
    }
  }

  return null;
}

async function deleteAvatarFromStorage(
  env: WorkerEnv,
  username: string,
  pageSlug: string
): Promise<void> {
  const key = buildAvatarStorageKey(username, pageSlug);
  const tasks: Promise<unknown>[] = [];
  if (env.LINKS_MEDIA_R2) {
    tasks.push(env.LINKS_MEDIA_R2.delete(key));
  }
  if (env.LINKS_DB) {
    tasks.push(
      env.LINKS_DB.prepare('DELETE FROM bio_avatars WHERE avatar_key = ?').bind(key).run()
    );
  }
  if (env.LINKS_KV) {
    tasks.push(env.LINKS_KV.delete(`avatar:${key}`));
  }
  await Promise.allSettled(tasks);
}

async function handleApiRequest(
  request: Request,
  url: URL,
  env: WorkerEnv
): Promise<Response> {
  const primaryDomain = getPrimaryDomain(env);

  // Public health check endpoint (booleans only — never exposes secret values)
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const caps = getOutboundCapabilities(env);
    const activeOutboundProvider = resolveOutboundProvider(env);
    return jsonResponse({
      ok: true,
      service: 'vzmail',
      primaryDomain,
      retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
      outboundProviderMode: (env.OUTBOUND_PROVIDER || 'auto').trim().toLowerCase(),
      activeOutboundProvider,
      linksStorageEngine: getLinksStorageEngine(env),
      mediaStorageEngine: getMediaStorageEngine(env),
      bindings: {
        mailTransitKv: Boolean(env.MAIL_TRANSIT_KV),
        linksKv: Boolean(env.LINKS_KV),
        linksDb: Boolean(env.LINKS_DB),
        linksMediaR2: Boolean(env.LINKS_MEDIA_R2),
        sendEmail: caps.cloudflare,
        cpanelRelay: caps.cpanelRelay,
        resendApi: caps.resend,
        brevoApi: caps.brevo,
        assets: Boolean(env.ASSETS),
        relayAuthProtected: Boolean(env.RELAY_AUTH_TOKEN),
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Optional constant-time auth gate for /api/mail/* and bio/delete endpoints.
  // Public shortlink creation (POST /api/links/shortlinks) and click tracking (POST /api/links/bio-click)
  // stay publicly accessible for both guest visitors and logged-in SSO users.
  const isPublicLinksWrite =
    (url.pathname === '/api/links/shortlinks' && request.method === 'POST') ||
    (url.pathname === '/api/links/bio-click' && request.method === 'POST');

  if (
    url.pathname.startsWith('/api/mail/') ||
    (url.pathname.startsWith('/api/links/') &&
      request.method !== 'GET' &&
      !isPublicLinksWrite)
  ) {
    const authorized = await verifyRelayAuth(request, env);
    if (!authorized) {
      return jsonResponse({ ok: false, error: 'Unauthorized relay token.' }, 401);
    }
  }

  // 1. GET /api/mail/queue?username=fadhil
  if (url.pathname === '/api/mail/queue' && request.method === 'GET') {
    const user = sanitizeHandle(url.searchParams.get('username') || 'fadhil');
    const quota = await getDailyQuotaUsage(env, user);

    if (!env.MAIL_TRANSIT_KV) {
      return jsonResponse({
        ok: true,
        kvBound: false,
        mode: 'local-fallback',
        canonicalUser: user,
        primaryEmail: `${user}@${primaryDomain}`,
        pairedBioDomain: `${user}.${primaryDomain}`,
        pendingCount: 0,
        packets: [],
        zeroRetentionStatus: {
          retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
          serverPermanentMailboxBytes: 0,
        },
        outboundQuota: {
          usedToday: quota.usedToday,
          dailyLimit: quota.dailyLimit,
        },
      });
    }

    const list = await env.MAIL_TRANSIT_KV.list({
      prefix: `q:${user}:`,
      limit: MAX_PACKETS_PER_PULL,
    });

    const fetched = await Promise.all(
      list.keys.map((k) => env.MAIL_TRANSIT_KV!.get<EphemeralMailPacket>(k.name, 'json'))
    );
    const packets = fetched
      .filter((pkt): pkt is EphemeralMailPacket => Boolean(pkt && pkt.id))
      .sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );

    return jsonResponse({
      ok: true,
      kvBound: true,
      mode: 'cloudflare-kv-ephemeral',
      canonicalUser: user,
      primaryEmail: `${user}@${primaryDomain}`,
      pairedBioDomain: `${user}.${primaryDomain}`,
      pendingCount: packets.length,
      packets,
      zeroRetentionStatus: {
        retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
        serverPermanentMailboxBytes: 0,
      },
      outboundQuota: {
        usedToday: quota.usedToday,
        dailyLimit: quota.dailyLimit,
      },
    });
  }

  // 2. POST /api/mail/ack — Immediately purge acknowledged packets from KV
  if (url.pathname === '/api/mail/ack' && request.method === 'POST') {
    const parsed = await readBoundedJson<{ username?: string; packetIds?: unknown }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const user = sanitizeHandle(String(parsed.data.username || 'fadhil'));
    const rawIds = Array.isArray(parsed.data.packetIds) ? parsed.data.packetIds : [];
    const safeIds = rawIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128))
      .filter(Boolean)
      .slice(0, MAX_PACKETS_PER_PULL);

    if (env.MAIL_TRANSIT_KV && safeIds.length > 0) {
      await Promise.all(
        safeIds.map((id) => env.MAIL_TRANSIT_KV!.delete(`q:${user}:${id}`))
      );
    }

    const receiptCode = `PURGED-CF-${Date.now().toString(36).toUpperCase()}-${safeIds.length}`;
    logInfo('mail_ack_purged', {
      user,
      purgedCount: safeIds.length,
      kvBound: Boolean(env.MAIL_TRANSIT_KV),
    });

    return jsonResponse({
      ok: true,
      kvBound: Boolean(env.MAIL_TRANSIT_KV),
      purgedCount: safeIds.length,
      purgedIds: safeIds,
      receiptCode,
      purgedAt: new Date().toISOString(),
    });
  }

  // 3. POST /api/mail/simulate-inbound — Test Gmail-style + / . canonical routing
  if (url.pathname === '/api/mail/simulate-inbound' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      toAddress?: string;
      fromName?: string;
      fromAddress?: string;
      subject?: string;
      bodyText?: string;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const toAddress = stripHeaderInjection(
      String(parsed.data.toAddress || `fadhil@${primaryDomain}`),
      254
    ).toLowerCase();
    const fromAddress = stripHeaderInjection(
      String(parsed.data.fromAddress || 'dimas@proton.me'),
      254
    ).toLowerCase();

    if (!isValidEmailAddress(toAddress) || !isValidEmailAddress(fromAddress)) {
      return jsonResponse(
        { ok: false, error: 'Format alamat email pengirim atau tujuan tidak valid.' },
        400
      );
    }

    const fromName = sanitizeDisplayName(
      String(parsed.data.fromName || 'Dimas Aditya'),
      fromAddress.split('@')[0]
    );
    const subject =
      stripHeaderInjection(
        String(
          parsed.data.subject ||
            'Pengujian Cloudflare Email Routing + Alias Normalizer'
        ),
        250
      ) || '(Tanpa Subjek)';
    const bodyText = String(
      parsed.data.bodyText ||
        `Halo!\n\nPesan ini dikirim ke ${toAddress} untuk menguji normalisasi alias (+ / .) dan antrean transit tanpa penyimpanan server permanen.`
    )
      .trim()
      .slice(0, MAX_EMAIL_BODY_CHARS);

    const resolved = resolveCanonicalEmail(toAddress, [
      primaryDomain,
      ...DEFAULT_SUPPORTED_DOMAINS,
    ]);

    const now = new Date();
    const packetId = generateSecureId('cf-pkt');
    const packet: EphemeralMailPacket = {
      id: packetId,
      rfcMessageId: `<${packetId}@${resolved.domain}>`,
      canonicalUser: resolved.canonicalUsername,
      fromName,
      fromAddress,
      toAddress,
      plusTag: resolved.plusTag,
      dotNormalized: resolved.dotCount > 0,
      subject,
      bodyText,
      receivedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TRANSIT_TTL_SECONDS * 1000).toISOString(),
    };

    if (env.MAIL_TRANSIT_KV) {
      await env.MAIL_TRANSIT_KV.put(
        `q:${packet.canonicalUser}:${packet.id}`,
        JSON.stringify(packet),
        { expirationTtl: TRANSIT_TTL_SECONDS }
      );
    }

    return jsonResponse({
      ok: true,
      kvBound: Boolean(env.MAIL_TRANSIT_KV),
      queuedPacket: packet,
      resolvedIdentity: resolved,
    });
  }

  // 4. POST /api/mail/seed-transit — Seed onboarding edge packet
  if (url.pathname === '/api/mail/seed-transit' && request.method === 'POST') {
    const parsed = await readBoundedJson<{ username?: string }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const user = sanitizeHandle(String(parsed.data.username || 'fadhil'));
    const seedPacket = buildSeedPacket(user, primaryDomain);

    if (env.MAIL_TRANSIT_KV) {
      const existing = await env.MAIL_TRANSIT_KV.list({
        prefix: `q:${user}:`,
        limit: 1,
      });
      if (existing.keys.length === 0) {
        await env.MAIL_TRANSIT_KV.put(
          `q:${user}:${seedPacket.id}`,
          JSON.stringify(seedPacket),
          { expirationTtl: TRANSIT_TTL_SECONDS }
        );
      }
    }

    return jsonResponse({
      ok: true,
      kvBound: Boolean(env.MAIL_TRANSIT_KV),
      username: user,
      seedPacket: env.MAIL_TRANSIT_KV ? null : seedPacket,
    });
  }

  // 5. POST /api/mail/send — Dispatch via Cloudflare Email Sending (`env.SEND_EMAIL`)
  if (url.pathname === '/api/mail/send' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      senderUser?: string;
      fromAddress?: string;
      toAddress?: string;
      subject?: string;
      bodyText?: string;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const senderUser = sanitizeHandle(String(parsed.data.senderUser || 'fadhil'));
    const rawFrom = stripHeaderInjection(
      String(parsed.data.fromAddress || `${senderUser}@${primaryDomain}`),
      254
    ).toLowerCase();
    const toAddress = stripHeaderInjection(
      String(parsed.data.toAddress || ''),
      254
    ).toLowerCase();
    const subject =
      stripHeaderInjection(String(parsed.data.subject || '(Tanpa Subjek)'), 250) ||
      '(Tanpa Subjek)';
    const bodyText = String(parsed.data.bodyText || '')
      .trim()
      .slice(0, MAX_EMAIL_BODY_CHARS);

    if (!isValidEmailAddress(toAddress)) {
      return jsonResponse(
        { ok: false, error: 'Alamat tujuan email tidak valid.' },
        400
      );
    }

    if (!bodyText) {
      return jsonResponse(
        { ok: false, error: 'Isi pesan email tidak boleh kosong.' },
        400
      );
    }

    // Ensure sender can only send from their own canonical identity (+/. variations allowed)
    const resolvedFrom = resolveCanonicalEmail(rawFrom, [
      primaryDomain,
      ...DEFAULT_SUPPORTED_DOMAINS,
    ]);
    const safeFromAddress =
      resolvedFrom.isValid &&
      resolvedFrom.isSupportedDomain &&
      resolvedFrom.canonicalUsername === senderUser
        ? rawFrom
        : `${senderUser}@${primaryDomain}`;

    // Enforce daily outbound quota via KV when bound
    const quota = await getDailyQuotaUsage(env, senderUser);
    if (quota.usedToday >= quota.dailyLimit) {
      return jsonResponse(
        {
          ok: false,
          error: `Kuota kirim harian (${quota.dailyLimit}/hari) tercapai untuk menjaga reputasi domain @${primaryDomain}.`,
        },
        429
      );
    }

    const messageIdToken = generateSecureId('out');
    const rfcMessageId = `<${messageIdToken}@${primaryDomain}>`;
    const activeProvider = resolveOutboundProvider(env);
    let dispatchedVia =
      'Simulated Local Relay (set CPANEL_RELAY_URL+CPANEL_RELAY_SECRET, RESEND_API_KEY, BREVO_API_KEY, atau binding SEND_EMAIL untuk pengiriman live)';
    let liveEmailDispatched = false;

    if (activeProvider !== 'none') {
      try {
        const result = await dispatchOutboundEmail(activeProvider, env, {
          fromEmail: safeFromAddress,
          fromName: sanitizeDisplayName(senderUser, senderUser),
          toEmail: toAddress,
          subject,
          text: bodyText,
          html: plainTextToSafeEmailHtml(bodyText),
          rfcMessageId,
        });
        if (!result.ok) {
          logError('outbound_provider_rejected', new Error(result.error), {
            senderUser,
            provider: activeProvider,
            domain: primaryDomain,
          });
          return jsonResponse({ ok: false, error: result.error }, 502);
        }
        dispatchedVia = result.label;
        liveEmailDispatched = true;
      } catch (err) {
        logError('outbound_provider_exception', err, {
          senderUser,
          provider: activeProvider,
          domain: primaryDomain,
        });
        return jsonResponse(
          {
            ok: false,
            error: `Pengiriman email via ${activeProvider} mengalami gangguan koneksi. Periksa konfigurasi provider di Konsol Admin.`,
          },
          502
        );
      }
    }

    if (env.MAIL_TRANSIT_KV) {
      await env.MAIL_TRANSIT_KV.put(
        `quota:${quota.date}:${senderUser}`,
        String(quota.usedToday + 1),
        { expirationTtl: QUOTA_TTL_SECONDS }
      );
    }

    // Loopback routing into ephemeral transit queue if recipient is on an active domain
    const resolvedRecipient = resolveCanonicalEmail(toAddress, [
      primaryDomain,
      ...DEFAULT_SUPPORTED_DOMAINS,
    ]);
    let loopbackPacket: EphemeralMailPacket | null = null;

    if (resolvedRecipient.isValid && resolvedRecipient.isSupportedDomain) {
      const now = new Date();
      const pktId = generateSecureId('cf-loop');
      loopbackPacket = {
        id: pktId,
        rfcMessageId,
        canonicalUser: resolvedRecipient.canonicalUsername,
        fromName: senderUser,
        fromAddress: safeFromAddress,
        toAddress,
        plusTag: resolvedRecipient.plusTag,
        dotNormalized: resolvedRecipient.dotCount > 0,
        subject,
        bodyText,
        receivedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + TRANSIT_TTL_SECONDS * 1000).toISOString(),
      };

      if (env.MAIL_TRANSIT_KV) {
        await env.MAIL_TRANSIT_KV.put(
          `q:${loopbackPacket.canonicalUser}:${loopbackPacket.id}`,
          JSON.stringify(loopbackPacket),
          { expirationTtl: TRANSIT_TTL_SECONDS }
        );
      }
    }

    logInfo('mail_outbound_processed', {
      senderUser,
      liveEmailDispatched,
      routedToImyQueue: Boolean(loopbackPacket),
    });

    return jsonResponse({
      ok: true,
      kvBound: Boolean(env.MAIL_TRANSIT_KV),
      liveEmailDispatched,
      providerUsed: activeProvider,
      dispatchedVia,
      rfcMessageId,
      sentAt: new Date().toISOString(),
      serverStoredCopy: false,
      quota: {
        usedToday: quota.usedToday + 1,
        dailyLimit: quota.dailyLimit,
      },
      routedToImyQueue: Boolean(loopbackPacket),
      loopbackPacket: env.MAIL_TRANSIT_KV ? null : loopbackPacket,
      resolvedRecipient,
    });
  }

  // 6. Standalone Shortlink API (`/api/links/shortlinks`) — D1 primary + KV fallback
  if (url.pathname === '/api/links/shortlinks' && request.method === 'GET') {
    const ownerParam = url.searchParams.get('owner')?.trim() || '';
    const slugsParam = url.searchParams.get('slugs')?.trim() || '';
    const storageEngine = getLinksStorageEngine(env);

    if (ownerParam) {
      const owner = sanitizeHandle(ownerParam);
      const items = await listShortlinksByOwner(env, owner);
      return jsonResponse({ ok: true, storageEngine, items });
    }

    if (slugsParam) {
      const slugs = slugsParam
        .split(',')
        .map((s) => sanitizeSlug(s))
        .filter(Boolean)
        .slice(0, 50);
      const fetched = await Promise.all(slugs.map((s) => getShortlinkRecord(env, s)));
      const items = fetched.filter((item): item is ShortlinkRecord => Boolean(item));
      return jsonResponse({ ok: true, storageEngine, items });
    }

    return jsonResponse({ ok: true, storageEngine, items: [] });
  }

  if (url.pathname === '/api/links/shortlinks' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      targetUrl?: string;
      customSlug?: string;
      slug?: string;
      title?: string;
      ownerUser?: string | null;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const rawTarget = String(parsed.data.targetUrl || '').trim();
    const withProtocol = /^https?:\/\//i.test(rawTarget) ? rawTarget : `https://${rawTarget}`;
    const safeTarget = sanitizeExternalUrl(withProtocol, {
      allowMailto: false,
      blockPrivateHosts: true,
    });
    if (!safeTarget) {
      return jsonResponse(
        {
          ok: false,
          error: 'URL tujuan tidak valid atau diblokir. Gunakan alamat https:// publik yang sah.',
        },
        400
      );
    }

    const rawCustom = String(parsed.data.customSlug ?? parsed.data.slug ?? '').trim();
    let finalSlug = '';
    let isCustomSlug = false;

    if (rawCustom) {
      const cleanCustom = sanitizeShortlinkSlugInput(rawCustom);
      if (!cleanCustom) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Custom slug harus 2–48 karakter (huruf kecil, angka, tanda hubung) dan bukan kata sistem.',
          },
          400
        );
      }
      const existing = await getShortlinkRecord(env, cleanCustom);
      if (existing) {
        return jsonResponse(
          {
            ok: false,
            error: `Slug "${cleanCustom}" sudah dipakai. Pilih slug lain atau kosongkan untuk kode acak.`,
          },
          409
        );
      }
      finalSlug = cleanCustom;
      isCustomSlug = true;
    } else {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = generateShortlinkCode(attempt < 4 ? 6 : 7);
        const existing = await getShortlinkRecord(env, candidate);
        if (!existing) {
          finalSlug = candidate;
          break;
        }
      }
      if (!finalSlug) {
        finalSlug = generateShortlinkCode(8);
      }
    }

    const ownerUser =
      typeof parsed.data.ownerUser === 'string' && parsed.data.ownerUser.trim()
        ? sanitizeHandle(parsed.data.ownerUser)
        : null;
    const title = stripHeaderInjection(String(parsed.data.title || ''), 120);

    const record: ShortlinkRecord = {
      slug: finalSlug,
      ownerUser,
      title,
      targetUrl: safeTarget,
      isCustomSlug,
      clicks: 0,
      createdAt: new Date().toISOString(),
      lastClickedAt: null,
    };

    await saveShortlinkRecord(env, record);

    return jsonResponse(
      {
        ok: true,
        storageEngine: getLinksStorageEngine(env),
        shortUrl: `https://${primaryDomain}/s/${record.slug}`,
        record,
      },
      201
    );
  }

  if (url.pathname.startsWith('/api/links/shortlinks/') && request.method === 'DELETE') {
    const slug = sanitizeSlug(url.pathname.replace('/api/links/shortlinks/', ''));
    if (!slug) {
      return jsonResponse({ ok: false, error: 'Slug tidak valid.' }, 400);
    }
    const ownerParam = url.searchParams.get('owner')?.trim();
    const ownerUser = ownerParam ? sanitizeHandle(ownerParam) : null;
    const result = await deleteShortlinkRecord(env, slug, ownerUser);
    if (result.forbidden) {
      return jsonResponse(
        { ok: false, error: 'Anda tidak memiliki izin menghapus shortlink milik akun lain.' },
        403
      );
    }
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      deletedSlug: slug,
      deleted: result.deleted,
    });
  }

  // 7. Multi-Page Link-in-Bio API (`/api/links/bio/:username` & `/api/links/bio-click`)
  if (url.pathname.startsWith('/api/links/bio/') && request.method === 'GET') {
    const rawUser = decodeURIComponent(url.pathname.replace('/api/links/bio/', '').split('/')[0] || '');
    const username = sanitizeHandle(rawUser);
    const data = await getBioWorkspaceFromStorage(env, username);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      configured: Boolean(data),
      username,
      data,
    });
  }

  if (url.pathname.startsWith('/api/links/bio/') && request.method === 'PUT') {
    const rawUser = decodeURIComponent(url.pathname.replace('/api/links/bio/', '').split('/')[0] || '');
    const username = sanitizeHandle(rawUser);
    const parsed = await readBoundedJson<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const saved = await saveBioWorkspaceToStorage(env, username, parsed.data);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      configured: true,
      data: saved,
    });
  }

  if (url.pathname === '/api/links/bio-click' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      username?: string;
      pageSlug?: string;
      linkId?: string;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const username = sanitizeHandle(String(parsed.data.username || ''));
    const pageSlug = sanitizePageSlug(String(parsed.data.pageSlug || '')) ?? '';
    const linkId = String(parsed.data.linkId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);
    if (!linkId) {
      return jsonResponse({ ok: false, error: 'linkId tidak valid.' }, 400);
    }
    const clicks = await incrementBioLinkClickInStorage(env, username, pageSlug, linkId);
    return jsonResponse({ ok: true, clicks });
  }

  // 8. Dedicated Bio Link AVIF Avatar API (`/api/links/avatar/:username` & `/:pageSlug`)
  //    Primary: Cloudflare R2 (`LINKS_MEDIA_R2`) -> Fallback: D1 (`bio_avatars`) -> KV (`LINKS_KV`)
  if (url.pathname.startsWith('/api/links/avatar/')) {
    const rest = url.pathname.replace('/api/links/avatar/', '').replace(/\/+$/, '');
    const parts = rest.split('/').filter(Boolean);
    const rawUser = decodeURIComponent(parts[0] || '');
    const rawPage = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (!rawUser) {
      return jsonResponse({ ok: false, error: 'Username diperlukan.' }, 400);
    }
    const username = sanitizeHandle(rawUser);
    const pageSlug = rawPage ? sanitizePageSlug(rawPage) : '';
    if (pageSlug === null) {
      return jsonResponse({ ok: false, error: 'Slug halaman tidak valid.' }, 400);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const stored = await getAvatarFromStorage(env, username, pageSlug);
      if (!stored) {
        return new Response(null, {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      const hasVersion = Boolean(url.searchParams.get('v'));
      return new Response(request.method === 'HEAD' ? null : stored.body, {
        status: 200,
        headers: {
          'Content-Type': stored.contentType,
          'Cache-Control': hasVersion
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    if (request.method === 'PUT') {
      const bin = await readBoundedBinary(request, AVATAR_MAX_BYTES);
      if (!bin.ok) {
        return jsonResponse({ ok: false, error: bin.error }, bin.status);
      }
      const validatedMime = detectValidatedAvatarMime(bin.bytes);
      if (!validatedMime) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Format berkas ditolak. Hanya gambar AVIF atau WebP terkompresi (maks 128 KB) yang diizinkan.',
          },
          400
        );
      }

      const mediaEngine = await putAvatarToStorage(
        env,
        username,
        pageSlug,
        bin.bytes,
        validatedMime
      );
      const version = Date.now().toString(36);
      const avatarPath = pageSlug
        ? `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(pageSlug)}?v=${version}`
        : `/api/links/avatar/${encodeURIComponent(username)}?v=${version}`;

      return jsonResponse({
        ok: true,
        avatarUrl: avatarPath,
        contentType: validatedMime,
        byteSize: bin.bytes.byteLength,
        mediaStorageEngine: mediaEngine,
      });
    }

    if (request.method === 'DELETE') {
      await deleteAvatarFromStorage(env, username, pageSlug);
      return jsonResponse({
        ok: true,
        deleted: true,
        username,
        pageSlug,
      });
    }
  }

  return jsonResponse({ ok: false, error: 'Endpoint API tidak ditemukan.' }, 404);
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const isHttps = url.protocol === 'https:';

    try {
      // 1. API endpoints (always JSON, never fall back to SPA index.html)
      if (url.pathname.startsWith('/api/')) {
        return await handleApiRequest(request, url, env);
      }

      // 2. Dynamic PWA Web App Manifests & Service Worker (Multi-OS PWA for mail.vz.gay & links.vz.gay)
      if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') {
        const isLinks =
          host === 'links.vz.gay' ||
          host.startsWith('links.') ||
          url.searchParams.get('host_mode') === 'links' ||
          url.searchParams.get('pwa') === 'links';
        const targetPath = isLinks
          ? '/manifest-links.webmanifest'
          : '/manifest-mail.webmanifest';
        if (env.ASSETS) {
          const manifestReq = new Request(new URL(targetPath, request.url), request);
          const manifestRes = await env.ASSETS.fetch(manifestReq);
          const headers = new Headers(manifestRes.headers);
          headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
          headers.set('Cache-Control', 'public, max-age=3600');
          return new Response(manifestRes.body, { status: manifestRes.status, headers });
        }
      }

      if (url.pathname === '/sw.js') {
        if (env.ASSETS) {
          const swRes = await env.ASSETS.fetch(request);
          const headers = new Headers(swRes.headers);
          headers.set('Content-Type', 'application/javascript; charset=utf-8');
          headers.set('Service-Worker-Allowed', '/');
          headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          return new Response(swRes.body, { status: swRes.status, headers });
        }
      }

      // 3. Shortlink Redirector: imy.li/s/$SLUG or links.vz.gay/s/$SLUG
      //    Uses 302 + no-store so browsers don't cache over real click counting.
      if (url.pathname.startsWith('/s/') && (request.method === 'GET' || request.method === 'HEAD')) {
        const rawSlug = url.pathname.replace(/^\/s\//, '').split('/')[0] || '';
        const slug = sanitizeSlug(rawSlug);
        if (slug) {
          const record = await getShortlinkRecord(env, slug);
          if (record) {
            const safeTarget = sanitizeExternalUrl(record.targetUrl, {
              allowMailto: false,
              blockPrivateHosts: true,
            });
            if (safeTarget) {
              if (request.method === 'GET') {
                ctx.waitUntil(incrementShortlinkClick(env, slug));
              }
              return new Response(null, {
                status: 302,
                headers: {
                  Location: safeTarget,
                  'Cache-Control': 'no-store, max-age=0',
                  'X-Content-Type-Options': 'nosniff',
                  'Referrer-Policy': 'no-referrer',
                },
              });
            }
          }
        }
      }

      // 3. Wildcard Subdomain Link-in-Bio: $USERNAME.imy.li
      //    Enforces Zero Cookie Collision (no Set-Cookie, strict CSP without arbitrary user JS)
      const isBioSubdomain =
        host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li';

      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        return applyHtmlSecurityHeaders(assetResponse, {
          isBioSubdomain,
          isHttps,
          auth0Domain: env.AUTH0_DOMAIN,
        });
      }

      return jsonResponse({
        ok: true,
        service: 'vzmail',
        message: 'VZ Mail & VZ Links 2-in-1 Cloudflare Worker Ready',
      });
    } catch (error) {
      logError('worker_fetch_unhandled', error, {
        method: request.method,
        path: url.pathname,
        host,
      });
      return jsonResponse({ ok: false, error: 'Internal server error' }, 500);
    }
  },

  async email(
    message: ForwardableEmailMessage,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    try {
      if (message.rawSize > MAX_INBOUND_REJECT_BYTES) {
        message.setReject('Message exceeds 10 MB ephemeral relay size limit.');
        logInfo('inbound_email_rejected_size', {
          rawSize: message.rawSize,
          to: message.to,
        });
        return;
      }

      const resolved = canonicalizeImyRecipient(message.to);
      const packetId = generateSecureId('cf-in');
      const subject =
        stripHeaderInjection(message.headers.get('subject') || '(No Subject)', 250) ||
        '(No Subject)';
      const fromHeader = message.headers.get('from') || message.from;
      const fromName = sanitizeDisplayName(
        fromHeader.replace(/<[^>]+>/g, ''),
        message.from.split('@')[0] || message.from
      );

      const { text: rawPrefix, truncated } = await readBoundedStreamText(
        message.raw,
        MAX_RAW_EMAIL_SCAN_BYTES
      );
      let bodyText = extractReadableBodyFromRawMime(rawPrefix);
      if (truncated) {
        bodyText += '\n\n[VZ Mail Edge Note: Pesan melebihi 256 KB, pratinjau dipotong demi keamanan memori edge.]';
      }

      const now = new Date();
      const packet: EphemeralMailPacket = {
        id: packetId,
        rfcMessageId: stripHeaderInjection(
          message.headers.get('message-id') || `<${packetId}@${resolved.domain}>`,
          256
        ),
        canonicalUser: resolved.canonicalUser,
        fromName,
        fromAddress: stripHeaderInjection(message.from, 254).toLowerCase(),
        toAddress: stripHeaderInjection(message.to, 254).toLowerCase(),
        plusTag: resolved.plusTag,
        dotNormalized: resolved.dotNormalized,
        subject,
        bodyText: bodyText.slice(0, MAX_EMAIL_BODY_CHARS),
        receivedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + TRANSIT_TTL_SECONDS * 1000).toISOString(),
      };

      if (env.MAIL_TRANSIT_KV) {
        await env.MAIL_TRANSIT_KV.put(
          `q:${resolved.canonicalUser}:${packetId}`,
          JSON.stringify(packet),
          { expirationTtl: TRANSIT_TTL_SECONDS }
        );
      }

      logInfo('inbound_email_queued', {
        canonicalUser: resolved.canonicalUser,
        plusTag: resolved.plusTag,
        dotNormalized: resolved.dotNormalized,
        rawSize: message.rawSize,
        kvStored: Boolean(env.MAIL_TRANSIT_KV),
      });
    } catch (error) {
      logError('inbound_email_failed', error, {
        to: message.to,
        from: message.from,
      });
      message.setReject('Temporary error processing inbound message.');
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
