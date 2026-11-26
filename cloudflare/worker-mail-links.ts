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
  AVATAR_RAW_UPLOAD_MAX_BYTES,
  BIO_DELETE_COOLDOWN_MS,
  BIO_DELETE_COOLDOWN_SECONDS,
  MAIL_ATTACHMENT_MAX_COUNT,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  MAIL_ATTACHMENT_TTL_MS,
  RECYCLE_BIN_RETENTION_MS,
  RECYCLE_BIN_TTL_SECONDS,
  detectRawImageMime,
  detectValidatedAvatarMime,
  generateShortlinkCode,
  getDefaultQrDesignForTheme,
  isValidBioThemeId,
  isValidButtonStyle,
  sanitizeBioAvatarUrl,
  sanitizeBioIndexingMode,
  sanitizeBioQrDesign,
  sanitizeBioWorkspaceInput,
  sanitizePageSlug,
  sanitizeShortlinkSlugInput,
  sanitizeSocialsMap,
  type BioDeleteCooldownInfo,
  type BioIndexingMode,
  type BioLinkItem,
  type BioPageRecord,
  type BioQrDesignConfig,
  type BioWorkspaceData,
  type RecycleBinItemType,
  type RecycleBinRecord,
  type ShortlinkRecord,
} from '../src/utils/linksModel.ts';
import { checkReservedUsername } from '../src/utils/reservedUsernames.ts';
import { verifyDomainAtEdge } from '../src/utils/domainVerify.ts';
import {
  buildHostRobotsTxt,
  buildHostSitemapXml,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildServiceSeoMeta,
  type SeoMetadataPayload,
  type SeoRouteKind,
} from '../src/utils/seoConfig.ts';

export interface CloudflareImagesTransformResult {
  response(): Response;
}

export interface CloudflareImagesTransformer {
  transform(options: {
    width?: number;
    height?: number;
    fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  }): CloudflareImagesTransformer;
  output(options: {
    format: 'image/avif' | 'image/webp' | 'image/jpeg' | 'image/png';
    quality?: number;
  }): Promise<CloudflareImagesTransformResult>;
}

export interface CloudflareImagesBinding {
  input(stream: ReadableStream<Uint8Array>): CloudflareImagesTransformer;
}

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
  IMAGES?: CloudflareImagesBinding;
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
type BrevoKeyFormatStatus =
  | 'v3_ready'
  | 'mcp_base64_extracted'
  | 'mcp_token_warning'
  | 'missing';

interface OutboundAttachmentBinary {
  filename: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
}

interface OutboundDispatchPayload {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  rfcMessageId: string;
  attachments?: OutboundAttachmentBinary[];
}

function inspectBrevoApiKey(raw?: string): {
  apiKey: string | null;
  keyFormat: BrevoKeyFormatStatus;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { apiKey: null, keyFormat: 'missing' };
  }
  if (trimmed.startsWith('xkeysib-')) {
    return { apiKey: trimmed, keyFormat: 'v3_ready' };
  }
  // Brevo MCP tokens are frequently Base64-encoded JSON (`eyJ...==`). Try extracting embedded xkeysib- key safely.
  if (trimmed.startsWith('eyJ') || trimmed.endsWith('=')) {
    try {
      const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalized);
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      const candidateKeys = [
        parsed?.api_key,
        parsed?.apiKey,
        parsed?.key,
        parsed?.v3_api_key,
      ];
      for (const candidate of candidateKeys) {
        if (typeof candidate === 'string' && candidate.trim().startsWith('xkeysib-')) {
          return {
            apiKey: candidate.trim(),
            keyFormat: 'mcp_base64_extracted',
          };
        }
      }
      return { apiKey: trimmed, keyFormat: 'mcp_token_warning' };
    } catch {
      return { apiKey: trimmed, keyFormat: 'mcp_token_warning' };
    }
  }
  return { apiKey: trimmed, keyFormat: 'v3_ready' };
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
  const brevoInfo = inspectBrevoApiKey(env.BREVO_API_KEY);
  const brevo = Boolean(brevoInfo.apiKey);
  const cloudflare = Boolean(env.SEND_EMAIL);

  return {
    safeRelayUrl,
    cpanelRelay,
    resend,
    brevo,
    brevoKeyFormat: brevoInfo.keyFormat,
    brevoResolvedKey: brevoInfo.apiKey,
    cloudflare,
  };
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
        ...(payload.attachments && payload.attachments.length > 0
          ? {
              attachments: payload.attachments.map((att) => ({
                filename: att.filename,
                content: att.contentBase64,
              })),
            }
          : {}),
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
    const resolvedBrevoKey = caps.brevoResolvedKey || env.BREVO_API_KEY!.trim();
    const brevoBody: Record<string, unknown> = {
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
    };
    if (payload.attachments && payload.attachments.length > 0) {
      brevoBody.attachment = payload.attachments.map((att) => ({
        name: att.filename,
        content: att.contentBase64,
      }));
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': resolvedBrevoKey,
      },
      body: JSON.stringify(brevoBody),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as {
        message?: string;
        code?: string;
      } | null;
      const rawMsg = errBody?.message || '';
      if (
        (res.status === 401 || res.status === 403) &&
        caps.brevoKeyFormat === 'mcp_token_warning'
      ) {
        return {
          ok: false,
          error: `Brevo menolak autentikasi (HTTP ${res.status}): secret BREVO_API_KEY terdeteksi bertipe token MCP (bukan API key v3 standar xkeysib-...). Buat kunci API v3 baru di Brevo -> Settings -> SMTP & API -> API keys (tanpa opsi MCP) lalu perbarui secret BREVO_API_KEY di Cloudflare Workers.`,
        };
      }
      return {
        ok: false,
        error: rawMsg
          ? `Brevo API menolak pengiriman (HTTP ${res.status}): ${rawMsg}`
          : `Pengiriman via Brevo API gagal (HTTP ${res.status}). Pastikan kunci BREVO_API_KEY (xkeysib-...) valid dan domain pengirim imy.li sudah terverifikasi di Brevo.`,
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

export interface EphemeralPacketAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ephemeralId: string;
  ephemeralOwner: string;
  expiresAt: string;
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
  attachments?: EphemeralPacketAttachment[];
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
    "img-src 'self' data: blob: https:",
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
  "img-src 'self' data: blob: https:",
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

function resolveSeoRouteKind(host: string, url: URL): SeoRouteKind {
  const pathname = url.pathname.toLowerCase();
  const hostMode = (url.searchParams.get('host_mode') || '').toLowerCase();

  if (pathname === '/changelog' || pathname.startsWith('/changelog/')) {
    return 'changelog';
  }
  if (pathname === '/terms' || pathname.startsWith('/terms/')) {
    return 'terms';
  }
  if (pathname === '/privacy' || pathname.startsWith('/privacy/')) {
    return 'privacy';
  }
  if (
    hostMode === 'bio' ||
    (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li')
  ) {
    return 'bio_public';
  }
  if (
    host === 'imy.li' ||
    host === 'www.imy.li' ||
    pathname === '/s' ||
    pathname.startsWith('/s/') ||
    hostMode === 'shortlinks'
  ) {
    return 'shortlinks';
  }
  if (host === 'links.vz.gay' || hostMode === 'links' || pathname.startsWith('/links')) {
    return 'links.vz.gay';
  }
  if (hostMode === 'worker') {
    return 'worker_console';
  }
  return 'mail.vz.gay';
}

/**
 * Rewrites HTML <head> SEO tags, OpenGraph/Twitter tags, canonical URL, and Schema.org JSON-LD
 * directly at the Cloudflare edge using HTMLRewriter, and attaches X-Robots-Tag.
 */
function rewriteHtmlSeo(response: Response, meta: SeoMetadataPayload): Response {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', meta.xRobotsTag);

  const safeJsonLd = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');

  const metaNameMap: Record<string, string> = {
    description: meta.description,
    robots: meta.robotsMeta,
    'twitter:title': meta.twitterTitle,
    'twitter:description': meta.twitterDescription,
    'twitter:image': meta.ogImage,
  };

  const metaPropMap: Record<string, string> = {
    'og:type': meta.ogType,
    'og:site_name': meta.ogSiteName,
    'og:url': meta.canonicalUrl,
    'og:title': meta.title,
    'og:description': meta.description,
    'og:image': meta.ogImage,
    'og:image:alt': meta.ogImageAlt,
  };

  const withHeaders = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  if (typeof HTMLRewriter === 'undefined') {
    return withHeaders;
  }

  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute('href', meta.canonicalUrl);
      },
    })
    .on('meta[name]', {
      element(el) {
        const name = (el.getAttribute('name') || '').toLowerCase();
        if (name in metaNameMap) {
          el.setAttribute('content', metaNameMap[name]);
        }
      },
    })
    .on('meta[property]', {
      element(el) {
        const prop = (el.getAttribute('property') || '').toLowerCase();
        if (prop in metaPropMap) {
          el.setAttribute('content', metaPropMap[prop]);
        }
      },
    })
    .on('script#vz-jsonld', {
      element(el) {
        el.setInnerContent(safeJsonLd, { html: true });
      },
    })
    .transform(withHeaders);
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
 * Extracts a clean plain-text body and any base64-encoded MIME attachments from raw RFC 5322 email text.
 */
function extractBodyAndAttachmentsFromRawMime(rawMime: string): {
  bodyText: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }>;
} {
  const normalized = rawMime.replace(/\r\n/g, '\n');
  const headerBodySplit = normalized.indexOf('\n\n');
  if (headerBodySplit < 0) {
    return { bodyText: normalized.trim().slice(0, MAX_EMAIL_BODY_CHARS), attachments: [] };
  }

  const headersPart = normalized.slice(0, headerBodySplit);
  const bodyPart = normalized.slice(headerBodySplit + 2);
  let extractedText = '';
  const attachments: Array<{ filename: string; mimeType: string; bytes: Uint8Array }> = [];
  let totalAttBytes = 0;

  const parseMultipart = (partHeaders: string, partBody: string, depth: number) => {
    if (depth > 3) return;
    const boundaryMatch = partHeaders.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
    if (!boundaryMatch) return;
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const sections = partBody.split(`--${boundary}`);
    for (const rawSection of sections) {
      const section = rawSection.replace(/^\n+/, '');
      if (!section || section.startsWith('--')) continue;
      const splitIdx = section.indexOf('\n\n');
      if (splitIdx < 0) continue;
      const secHeaders = section.slice(0, splitIdx);
      const secBody = section.slice(splitIdx + 2).replace(/\n--$/, '').trim();

      if (/content-type:\s*multipart\//i.test(secHeaders)) {
        parseMultipart(secHeaders, secBody, depth + 1);
        continue;
      }

      const isAttachment =
        /content-disposition:\s*attachment/i.test(secHeaders) ||
        /filename\s*=/i.test(secHeaders);

      if (isAttachment && attachments.length < MAIL_ATTACHMENT_MAX_COUNT) {
        const nameMatch =
          secHeaders.match(/filename="?([^";\n]+)"?/i) ||
          secHeaders.match(/name="?([^";\n]+)"?/i);
        const ctMatch = secHeaders.match(/content-type:\s*([^;\n]+)/i);
        const isBase64 = /content-transfer-encoding:\s*base64/i.test(secHeaders);
        const filename = sanitizeAttachmentFilename(nameMatch?.[1] || 'attachment.bin');
        const mimeType = (ctMatch?.[1] || 'application/octet-stream').trim().toLowerCase();

        try {
          const bytes = isBase64
            ? base64ToUint8(secBody.replace(/\s+/g, ''))
            : new TextEncoder().encode(secBody);
          if (bytes.byteLength > 0 && totalAttBytes + bytes.byteLength <= MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
            totalAttBytes += bytes.byteLength;
            attachments.push({ filename, mimeType, bytes });
          }
        } catch {
          // Skip malformed attachment chunk safely
        }
        continue;
      }

      if (!extractedText && /content-type:\s*text\/plain/i.test(secHeaders)) {
        const isBase64 = /content-transfer-encoding:\s*base64/i.test(secHeaders);
        try {
          extractedText = isBase64
            ? new TextDecoder('utf-8', { fatal: false }).decode(
                base64ToUint8(secBody.replace(/\s+/g, ''))
              )
            : secBody;
        } catch {
          extractedText = secBody;
        }
      }
    }
  };

  if (/content-type:\s*multipart\//i.test(headersPart)) {
    parseMultipart(headersPart, bodyPart, 0);
  }

  return {
    bodyText: (extractedText || bodyPart).trim().slice(0, MAX_EMAIL_BODY_CHARS),
    attachments,
  };
}

function sanitizeAttachmentFilename(raw: string): string {
  const cleaned = stripHeaderInjection(raw, 120)
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'attachment.bin';
}

function buildEphemeralAttachmentKey(ownerUser: string, attId: string): string {
  const safeOwner = sanitizeHandle(ownerUser);
  const safeId = attId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return `mail-ephemeral/${safeOwner}/${safeId}`;
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

let d1SchemaReady = false;
let d1SchemaInitPromise: Promise<boolean> | null = null;

const D1_BOOTSTRAP_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS bio_profiles (
    username TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    headline TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    socials_json TEXT NOT NULL DEFAULT '{}',
    indexing_mode TEXT NOT NULL DEFAULT 'none',
    is_deactivated INTEGER NOT NULL DEFAULT 0,
    deactivated_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bio_pages (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    page_slug TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    theme_id TEXT NOT NULL DEFAULT 'midnight_slate',
    button_style TEXT NOT NULL DEFAULT 'rounded',
    show_socials INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    qr_design_json TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(username, page_slug),
    FOREIGN KEY (username) REFERENCES bio_profiles(username) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS bio_links (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    username TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    clicks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES bio_pages(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS bio_avatars (
    avatar_key TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    page_slug TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shortlinks (
    slug TEXT PRIMARY KEY,
    owner_user TEXT,
    title TEXT NOT NULL DEFAULT '',
    target_url TEXT NOT NULL,
    is_custom_slug INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_clicked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS links_recycle_bin (
    id TEXT PRIMARY KEY,
    owner_user TEXT NOT NULL,
    item_type TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bio_delete_cooldowns (
    username TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL,
    unlock_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bio_pages_user ON bio_pages(username, page_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_bio_links_page ON bio_links(page_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_bio_avatars_user ON bio_avatars(username, page_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_shortlinks_owner_created ON shortlinks(owner_user, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_recycle_bin_owner ON links_recycle_bin(owner_user, deleted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON links_recycle_bin(expires_at)`,
];

/**
 * Ensures all 7 VZ Links tables and indexes exist in Cloudflare D1 (`LINKS_DB`).
 * Cached once per Worker isolate so subsequent requests incur zero DDL latency.
 * If D1 fails transiently, resets the cache and returns false so callers fall back to `LINKS_KV`.
 */
async function ensureLinksD1Schema(env: WorkerEnv): Promise<boolean> {
  const db = env.LINKS_DB;
  if (!db) return false;
  if (d1SchemaReady) return true;

  if (!d1SchemaInitPromise) {
    d1SchemaInitPromise = (async () => {
      try {
        await db.batch(D1_BOOTSTRAP_STATEMENTS.map((sql) => db.prepare(sql)));

        // Safe incremental column checks for pre-existing D1 databases created before newer columns
        const [profileColsRes, pageColsRes] = await Promise.all([
          db.prepare('PRAGMA table_info(bio_profiles)').all<{ name: string }>(),
          db.prepare('PRAGMA table_info(bio_pages)').all<{ name: string }>(),
        ]);
        const profileCols = new Set((profileColsRes.results || []).map((c) => c.name));
        const pageCols = new Set((pageColsRes.results || []).map((c) => c.name));

        const alterStmts: D1PreparedStatement[] = [];
        if (!profileCols.has('indexing_mode')) {
          alterStmts.push(
            db.prepare("ALTER TABLE bio_profiles ADD COLUMN indexing_mode TEXT NOT NULL DEFAULT 'none'")
          );
        }
        if (!profileCols.has('is_deactivated')) {
          alterStmts.push(
            db.prepare('ALTER TABLE bio_profiles ADD COLUMN is_deactivated INTEGER NOT NULL DEFAULT 0')
          );
        }
        if (!profileCols.has('deactivated_at')) {
          alterStmts.push(
            db.prepare('ALTER TABLE bio_profiles ADD COLUMN deactivated_at TEXT')
          );
        }
        if (!pageCols.has('avatar_url')) {
          alterStmts.push(
            db.prepare("ALTER TABLE bio_pages ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")
          );
        }
        if (!pageCols.has('qr_design_json')) {
          alterStmts.push(
            db.prepare("ALTER TABLE bio_pages ADD COLUMN qr_design_json TEXT NOT NULL DEFAULT ''")
          );
        }
        if (alterStmts.length > 0) {
          await db.batch(alterStmts);
        }

        d1SchemaReady = true;
        logInfo('d1_schema_bootstrapped', { tables: 7, migratedCols: alterStmts.length });
        return true;
      } catch (err) {
        logError('d1_schema_bootstrap_failed', err);
        d1SchemaInitPromise = null;
        return false;
      }
    })();
  }

  return d1SchemaInitPromise;
}

function getLinksStorageEngine(env: WorkerEnv): LinksStorageEngine {
  if (env.LINKS_DB && d1SchemaReady) return 'cloudflare-d1';
  if (env.LINKS_KV) return 'cloudflare-kv';
  if (env.LINKS_DB) return 'cloudflare-d1';
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
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
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
    } catch (err) {
      logError('d1_get_shortlink_failed', err, { slug });
    }
  }
  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get(`short:${slug}`, 'text');
    return parseKvShortlinkRecord(slug, raw);
  }
  return null;
}

async function listShortlinksByOwner(env: WorkerEnv, ownerUser: string): Promise<ShortlinkRecord[]> {
  const merged = new Map<string, ShortlinkRecord>();

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
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
      for (const row of res.results || []) {
        merged.set(row.slug, {
          slug: row.slug,
          ownerUser: row.owner_user || null,
          title: row.title || '',
          targetUrl: row.target_url,
          isCustomSlug: Boolean(row.is_custom_slug),
          clicks: Math.max(0, Number(row.clicks) || 0),
          createdAt: row.created_at,
          lastClickedAt: row.last_clicked_at || null,
        });
      }
    } catch (err) {
      logError('d1_list_shortlinks_failed', err, { ownerUser });
    }
  }

  // Always merge legacy LINKS_KV shortlinks not yet in D1 (deduplicated by slug)
  if (env.LINKS_KV) {
    try {
      const idx = await env.LINKS_KV.get<string[]>(`short_idx:${ownerUser}`, 'json');
      const slugs = Array.isArray(idx) ? idx.filter((s) => !merged.has(s)).slice(0, 200) : [];
      if (slugs.length > 0) {
        const kvRows = await Promise.all(
          slugs.map(async (s) => parseKvShortlinkRecord(s, await env.LINKS_KV!.get(`short:${s}`, 'text')))
        );
        for (const rec of kvRows) {
          if (rec && !merged.has(rec.slug)) {
            merged.set(rec.slug, rec);
          }
        }
      }
    } catch (err) {
      logError('kv_list_shortlinks_failed', err, { ownerUser });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);
}

async function saveShortlinkRecord(env: WorkerEnv, record: ShortlinkRecord): Promise<void> {
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
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
    } catch (err) {
      logError('d1_save_shortlink_failed', err, { slug: record.slug });
      if (!env.LINKS_KV) throw err;
    }
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
): Promise<{ deleted: boolean; forbidden?: boolean; record?: ShortlinkRecord }> {
  const existing = await getShortlinkRecord(env, slug);
  if (!existing) {
    return { deleted: false };
  }
  if (existing.ownerUser && ownerUser && existing.ownerUser !== ownerUser) {
    return { deleted: false, forbidden: true };
  }
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await env.LINKS_DB.prepare('DELETE FROM shortlinks WHERE slug = ?').bind(slug).run();
    } catch (err) {
      logError('d1_delete_shortlink_failed', err, { slug });
    }
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
  return { deleted: true, record: existing };
}

async function incrementShortlinkClick(env: WorkerEnv, slug: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
      const res = await env.LINKS_DB.prepare(
        'UPDATE shortlinks SET clicks = clicks + 1, last_clicked_at = ? WHERE slug = ?'
      )
        .bind(now, slug)
        .run();
      if ((res.meta?.changes ?? 0) > 0) {
        return;
      }
    }
    if (env.LINKS_KV) {
      const raw = await env.LINKS_KV.get(`short:${slug}`, 'text');
      const rec = parseKvShortlinkRecord(slug, raw);
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
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const profile = await env.LINKS_DB.prepare(
        'SELECT username, display_name, headline, bio, avatar_url, socials_json, indexing_mode, is_deactivated, deactivated_at, updated_at FROM bio_profiles WHERE username = ? LIMIT 1'
      )
        .bind(username)
        .first<{
          username: string;
          display_name: string;
          headline: string;
          bio: string;
          avatar_url: string;
          socials_json: string;
          indexing_mode?: string | null;
          is_deactivated?: number;
          deactivated_at?: string | null;
          updated_at: string;
        }>();

      if (profile) {
        const pagesRes = await env.LINKS_DB.prepare(
          'SELECT id, page_slug, title, description, avatar_url, theme_id, button_style, show_socials, is_published, qr_design_json, updated_at FROM bio_pages WHERE username = ? ORDER BY CASE WHEN page_slug = "" THEN 0 ELSE 1 END, page_slug ASC'
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
            qr_design_json?: string;
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

        const pages: BioPageRecord[] = (pagesRes.results || []).map((p) => {
          const themeId = isValidBioThemeId(p.theme_id) ? p.theme_id : 'midnight_slate';
          let qrDesign: BioQrDesignConfig | undefined;
          if (typeof p.qr_design_json === 'string' && p.qr_design_json.trim().startsWith('{')) {
            try {
              const parsedQr = JSON.parse(p.qr_design_json);
              qrDesign = sanitizeBioQrDesign(
                parsedQr,
                getDefaultQrDesignForTheme(
                  themeId,
                  p.page_slug ? `${username}.imy.li/${p.page_slug}` : `${username}.imy.li`
                )
              );
            } catch {
              qrDesign = undefined;
            }
          }
          return {
            id: p.id,
            pageSlug: p.page_slug || '',
            title: p.title || profile.display_name || username,
            description: p.description || '',
            avatarUrl: sanitizeBioAvatarUrl(p.avatar_url || ''),
            themeId,
            buttonStyle: isValidButtonStyle(p.button_style) ? p.button_style : 'rounded',
            showSocials: Boolean(p.show_socials),
            isPublished: Boolean(p.is_published),
            ...(qrDesign ? { qrDesign } : {}),
            links: linksByPage.get(p.id) || [],
            updatedAt: p.updated_at || profile.updated_at,
          };
        });

        return {
          username: profile.username,
          displayName: profile.display_name || username,
          headline: profile.headline || '',
          bio: profile.bio || '',
          avatarUrl: sanitizeBioAvatarUrl(profile.avatar_url || ''),
          socials: sanitizeSocialsMap(parsedSocials),
          pages,
          indexingMode: sanitizeBioIndexingMode(profile.indexing_mode),
          isDeactivated: Boolean(profile.is_deactivated),
          deactivatedAt: profile.deactivated_at || null,
          updatedAt: profile.updated_at,
          configured: true,
        };
      }
    } catch (err) {
      logError('d1_get_bio_failed', err, { username });
    }
  }

  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get<BioWorkspaceData>(`bio:${username}`, 'json');
    if (raw && typeof raw === 'object' && Array.isArray(raw.pages)) {
      return {
        ...raw,
        username,
        indexingMode: sanitizeBioIndexingMode(raw.indexingMode),
        isDeactivated: raw.isDeactivated === true,
        deactivatedAt: raw.isDeactivated ? raw.deactivatedAt || null : null,
        configured: true,
      };
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

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const stmts: D1PreparedStatement[] = [
        env.LINKS_DB.prepare(
          'INSERT INTO bio_profiles (username, display_name, headline, bio, avatar_url, socials_json, indexing_mode, is_deactivated, deactivated_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, headline = excluded.headline, bio = excluded.bio, avatar_url = excluded.avatar_url, socials_json = excluded.socials_json, indexing_mode = excluded.indexing_mode, is_deactivated = excluded.is_deactivated, deactivated_at = excluded.deactivated_at, updated_at = excluded.updated_at'
        ).bind(
          sanitized.username,
          sanitized.displayName,
          sanitized.headline,
          sanitized.bio,
          sanitized.avatarUrl,
          JSON.stringify(sanitized.socials),
          sanitizeBioIndexingMode(sanitized.indexingMode),
          sanitized.isDeactivated ? 1 : 0,
          sanitized.deactivatedAt || null,
          sanitized.updatedAt
        ),
        env.LINKS_DB.prepare('DELETE FROM bio_links WHERE username = ?').bind(sanitized.username),
        env.LINKS_DB.prepare('DELETE FROM bio_pages WHERE username = ?').bind(sanitized.username),
      ];

      for (const page of sanitized.pages) {
        stmts.push(
          env.LINKS_DB.prepare(
            'INSERT INTO bio_pages (id, username, page_slug, title, description, avatar_url, theme_id, button_style, show_socials, is_published, qr_design_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
            page.qrDesign ? JSON.stringify(page.qrDesign) : '',
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
    } catch (err) {
      logError('d1_save_bio_failed', err, { username: sanitized.username });
      if (!env.LINKS_KV) throw err;
    }
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
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const upd = await env.LINKS_DB.prepare(
        'UPDATE bio_links SET clicks = clicks + 1 WHERE id = ? AND username = ?'
      )
        .bind(linkId, username)
        .run();
      if ((upd.meta?.changes ?? 0) > 0) {
        const row = await env.LINKS_DB.prepare(
          'SELECT clicks FROM bio_links WHERE id = ? AND username = ? LIMIT 1'
        )
          .bind(linkId, username)
          .first<{ clicks: number }>();
        return row ? Number(row.clicks) || 0 : null;
      }
    } catch (err) {
      logError('d1_bio_click_failed', err, { username, linkId });
    }
  }

  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get<BioWorkspaceData>(`bio:${username}`, 'json');
    if (!raw || !Array.isArray(raw.pages)) return null;
    let updatedClicks: number | null = null;
    const nextPages = raw.pages.map((p) => {
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
        JSON.stringify({ ...raw, pages: nextPages })
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
  contentType: string
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

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await env.LINKS_DB.prepare(
        'INSERT INTO bio_avatars (avatar_key, username, page_slug, content_type, data_base64, byte_size, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(avatar_key) DO UPDATE SET content_type = excluded.content_type, data_base64 = excluded.data_base64, byte_size = excluded.byte_size, updated_at = excluded.updated_at'
      )
        .bind(key, username, pageSlug, contentType, dataBase64, bytes.byteLength, now)
        .run();
      return 'cloudflare-d1';
    } catch (err) {
      logError('d1_put_avatar_failed', err, { key });
    }
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

const SAFE_STORED_AVATAR_MIMES = new Set([
  'image/avif',
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/gif',
]);

function normalizeStoredAvatarContentType(raw?: string): string {
  if (raw && SAFE_STORED_AVATAR_MIMES.has(raw.toLowerCase())) {
    return raw.toLowerCase();
  }
  return 'image/avif';
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
      const ct = normalizeStoredAvatarContentType(obj.httpMetadata?.contentType);
      return { body: obj.body, contentType: ct };
    }
  }

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const row = await env.LINKS_DB.prepare(
        'SELECT content_type, data_base64 FROM bio_avatars WHERE avatar_key = ? LIMIT 1'
      )
        .bind(key)
        .first<{ content_type: string; data_base64: string }>();
      if (row && row.data_base64) {
        const ct = normalizeStoredAvatarContentType(row.content_type);
        const bytes = base64ToUint8(row.data_base64);
        return { body: bytes.buffer as ArrayBuffer, contentType: ct };
      }
    } catch (err) {
      logError('d1_get_avatar_failed', err, { key });
    }
  }

  if (env.LINKS_KV) {
    const raw = await env.LINKS_KV.get<{
      contentType?: string;
      dataBase64?: string;
    }>(`avatar:${key}`, 'json');
    if (raw?.dataBase64) {
      const ct = normalizeStoredAvatarContentType(raw.contentType);
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
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    tasks.push(
      env.LINKS_DB.prepare('DELETE FROM bio_avatars WHERE avatar_key = ?').bind(key).run()
    );
  }
  if (env.LINKS_KV) {
    tasks.push(env.LINKS_KV.delete(`avatar:${key}`));
  }
  await Promise.allSettled(tasks);
}

async function getBioDeleteCooldown(
  env: WorkerEnv,
  username: string
): Promise<BioDeleteCooldownInfo> {
  const nowMs = Date.now();
  const empty: BioDeleteCooldownInfo = {
    active: false,
    deletedAt: null,
    unlockAt: null,
    remainingMs: 0,
  };

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const row = await env.LINKS_DB.prepare(
        'SELECT deleted_at, unlock_at FROM bio_delete_cooldowns WHERE username = ? LIMIT 1'
      )
        .bind(username)
        .first<{ deleted_at: string; unlock_at: string }>();
      if (row) {
        const unlockMs = new Date(row.unlock_at).getTime();
        if (Number.isFinite(unlockMs) && unlockMs > nowMs) {
          return {
            active: true,
            deletedAt: row.deleted_at,
            unlockAt: row.unlock_at,
            remainingMs: unlockMs - nowMs,
          };
        }
        await env.LINKS_DB.prepare('DELETE FROM bio_delete_cooldowns WHERE username = ?')
          .bind(username)
          .run();
      }
    } catch (err) {
      logError('d1_get_cooldown_failed', err, { username });
    }
  }

  if (env.LINKS_KV) {
    const rec = await env.LINKS_KV.get<{ deletedAt?: string; unlockAt?: string }>(
      `cooldown:bio:${username}`,
      'json'
    );
    if (rec?.unlockAt) {
      const unlockMs = new Date(rec.unlockAt).getTime();
      if (Number.isFinite(unlockMs) && unlockMs > nowMs) {
        return {
          active: true,
          deletedAt: rec.deletedAt || null,
          unlockAt: rec.unlockAt,
          remainingMs: unlockMs - nowMs,
        };
      }
      await env.LINKS_KV.delete(`cooldown:bio:${username}`);
    }
  }

  return empty;
}

async function hardDeleteBioProfileAndSetCooldown(
  env: WorkerEnv,
  username: string
): Promise<BioDeleteCooldownInfo> {
  const now = new Date();
  const deletedAt = now.toISOString();
  const unlockAt = new Date(now.getTime() + BIO_DELETE_COOLDOWN_MS).toISOString();

  // 1. Delete all avatars for this user across R2, D1, and KV
  if (env.LINKS_MEDIA_R2) {
    try {
      const listed = await env.LINKS_MEDIA_R2.list({ prefix: `avatars/${username}/` });
      if (listed.objects.length > 0) {
        await env.LINKS_MEDIA_R2.delete(listed.objects.map((o) => o.key));
      }
    } catch (err) {
      logError('bio_hard_delete_r2_failed', err, { username });
    }
  }

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await env.LINKS_DB.batch([
        env.LINKS_DB.prepare('DELETE FROM bio_links WHERE username = ?').bind(username),
        env.LINKS_DB.prepare('DELETE FROM bio_pages WHERE username = ?').bind(username),
        env.LINKS_DB.prepare('DELETE FROM bio_profiles WHERE username = ?').bind(username),
        env.LINKS_DB.prepare('DELETE FROM bio_avatars WHERE username = ?').bind(username),
        env.LINKS_DB.prepare(
          'INSERT INTO bio_delete_cooldowns (username, deleted_at, unlock_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET deleted_at = excluded.deleted_at, unlock_at = excluded.unlock_at'
        ).bind(username, deletedAt, unlockAt),
      ]);
    } catch (err) {
      logError('d1_hard_delete_bio_failed', err, { username });
    }
  }

  if (env.LINKS_KV) {
    await env.LINKS_KV.delete(`bio:${username}`);
    try {
      const avatarKeys = await env.LINKS_KV.list({ prefix: `avatar:avatars/${username}/` });
      await Promise.allSettled(avatarKeys.keys.map((k) => env.LINKS_KV!.delete(k.name)));
    } catch {
      // Ignore KV list errors
    }
    await env.LINKS_KV.put(
      `cooldown:bio:${username}`,
      JSON.stringify({ deletedAt, unlockAt }),
      { expirationTtl: BIO_DELETE_COOLDOWN_SECONDS }
    );
  }

  return {
    active: true,
    deletedAt,
    unlockAt,
    remainingMs: BIO_DELETE_COOLDOWN_MS,
  };
}

async function purgeExpiredRecycleBinD1(env: WorkerEnv): Promise<void> {
  if (!env.LINKS_DB || !(await ensureLinksD1Schema(env))) return;
  try {
    const nowIso = new Date().toISOString();
    await env.LINKS_DB.prepare('DELETE FROM links_recycle_bin WHERE expires_at <= ?')
      .bind(nowIso)
      .run();
  } catch (err) {
    logError('d1_purge_recycle_bin_failed', err);
  }
}

async function addItemToRecycleBin(
  env: WorkerEnv,
  ownerUser: string,
  itemType: RecycleBinItemType,
  label: string,
  summary: string,
  payload: Record<string, unknown>
): Promise<RecycleBinRecord> {
  const now = new Date();
  const record: RecycleBinRecord = {
    id: generateSecureId('rb'),
    ownerUser,
    itemType,
    label: label.trim().slice(0, 140),
    summary: summary.trim().slice(0, 260),
    payload,
    deletedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RECYCLE_BIN_RETENTION_MS).toISOString(),
  };

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await purgeExpiredRecycleBinD1(env);
      await env.LINKS_DB.prepare(
        'INSERT INTO links_recycle_bin (id, owner_user, item_type, label, summary, payload_json, deleted_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          record.id,
          record.ownerUser,
          record.itemType,
          record.label,
          record.summary,
          JSON.stringify(record.payload),
          record.deletedAt,
          record.expiresAt
        )
        .run();
      return record;
    } catch (err) {
      logError('d1_add_recycle_bin_failed', err, { ownerUser, itemType });
      if (!env.LINKS_KV) throw err;
    }
  }

  if (env.LINKS_KV) {
    await env.LINKS_KV.put(
      `recycle:${ownerUser}:${record.id}`,
      JSON.stringify(record),
      { expirationTtl: RECYCLE_BIN_TTL_SECONDS }
    );
  }

  return record;
}

async function listRecycleBinItems(
  env: WorkerEnv,
  ownerUser: string
): Promise<RecycleBinRecord[]> {
  const nowMs = Date.now();
  const merged = new Map<string, RecycleBinRecord>();

  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await purgeExpiredRecycleBinD1(env);
      const res = await env.LINKS_DB.prepare(
        'SELECT id, owner_user, item_type, label, summary, payload_json, deleted_at, expires_at FROM links_recycle_bin WHERE owner_user = ? ORDER BY deleted_at DESC LIMIT 100'
      )
        .bind(ownerUser)
        .all<{
          id: string;
          owner_user: string;
          item_type: string;
          label: string;
          summary: string;
          payload_json: string;
          deleted_at: string;
          expires_at: string;
        }>();

      for (const row of res.results || []) {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(row.payload_json || '{}');
        } catch {
          parsedPayload = {};
        }
        merged.set(row.id, {
          id: row.id,
          ownerUser: row.owner_user,
          itemType:
            row.item_type === 'bio_page' || row.item_type === 'shortlink'
              ? row.item_type
              : 'bio_link',
          label: row.label,
          summary: row.summary,
          payload: parsedPayload,
          deletedAt: row.deleted_at,
          expiresAt: row.expires_at,
        });
      }
    } catch (err) {
      logError('d1_list_recycle_bin_failed', err, { ownerUser });
    }
  }

  if (env.LINKS_KV) {
    try {
      const listed = await env.LINKS_KV.list({ prefix: `recycle:${ownerUser}:`, limit: 100 });
      const rows = await Promise.all(
        listed.keys.map((k) => env.LINKS_KV!.get<RecycleBinRecord>(k.name, 'json'))
      );
      for (const r of rows) {
        if (r && r.id && new Date(r.expiresAt).getTime() > nowMs && !merged.has(r.id)) {
          merged.set(r.id, r);
        }
      }
    } catch (err) {
      logError('kv_list_recycle_bin_failed', err, { ownerUser });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())
    .slice(0, 100);
}

async function getRecycleBinItem(
  env: WorkerEnv,
  ownerUser: string,
  id: string
): Promise<RecycleBinRecord | null> {
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await purgeExpiredRecycleBinD1(env);
      const row = await env.LINKS_DB.prepare(
        'SELECT id, owner_user, item_type, label, summary, payload_json, deleted_at, expires_at FROM links_recycle_bin WHERE id = ? AND owner_user = ? LIMIT 1'
      )
        .bind(id, ownerUser)
        .first<{
          id: string;
          owner_user: string;
          item_type: string;
          label: string;
          summary: string;
          payload_json: string;
          deleted_at: string;
          expires_at: string;
        }>();
      if (row) {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(row.payload_json || '{}');
        } catch {
          parsedPayload = {};
        }
        return {
          id: row.id,
          ownerUser: row.owner_user,
          itemType:
            row.item_type === 'bio_page' || row.item_type === 'shortlink'
              ? row.item_type
              : 'bio_link',
          label: row.label,
          summary: row.summary,
          payload: parsedPayload,
          deletedAt: row.deleted_at,
          expiresAt: row.expires_at,
        };
      }
    } catch (err) {
      logError('d1_get_recycle_bin_failed', err, { ownerUser, id });
    }
  }

  if (env.LINKS_KV) {
    const item = await env.LINKS_KV.get<RecycleBinRecord>(
      `recycle:${ownerUser}:${id}`,
      'json'
    );
    if (!item || new Date(item.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return item;
  }

  return null;
}

async function hardDeleteRecycleBinItem(
  env: WorkerEnv,
  ownerUser: string,
  id: string
): Promise<void> {
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      await env.LINKS_DB.prepare(
        'DELETE FROM links_recycle_bin WHERE id = ? AND owner_user = ?'
      )
        .bind(id, ownerUser)
        .run();
    } catch (err) {
      logError('d1_delete_recycle_bin_failed', err, { ownerUser, id });
    }
  }
  if (env.LINKS_KV) {
    await env.LINKS_KV.delete(`recycle:${ownerUser}:${id}`);
  }
}

async function emptyRecycleBinForOwner(
  env: WorkerEnv,
  ownerUser: string
): Promise<number> {
  let purgedCount = 0;
  if (env.LINKS_DB && (await ensureLinksD1Schema(env))) {
    try {
      const countRow = await env.LINKS_DB.prepare(
        'SELECT COUNT(*) as total FROM links_recycle_bin WHERE owner_user = ?'
      )
        .bind(ownerUser)
        .first<{ total: number }>();
      purgedCount = Number(countRow?.total) || 0;
      await env.LINKS_DB.prepare('DELETE FROM links_recycle_bin WHERE owner_user = ?')
        .bind(ownerUser)
        .run();
    } catch (err) {
      logError('d1_empty_recycle_bin_failed', err, { ownerUser });
    }
  }
  if (env.LINKS_KV) {
    const listed = await env.LINKS_KV.list({ prefix: `recycle:${ownerUser}:`, limit: 200 });
    purgedCount = Math.max(purgedCount, listed.keys.length);
    await Promise.allSettled(listed.keys.map((k) => env.LINKS_KV!.delete(k.name)));
  }
  return purgedCount;
}

async function handleApiRequest(
  request: Request,
  url: URL,
  env: WorkerEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const primaryDomain = getPrimaryDomain(env);

  // Public health check endpoint (booleans & safe format enums only — never exposes secret values)
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const caps = getOutboundCapabilities(env);
    const activeOutboundProvider = resolveOutboundProvider(env);
    const d1Ready = env.LINKS_DB ? await ensureLinksD1Schema(env) : false;
    return jsonResponse({
      ok: true,
      service: 'vzmail',
      primaryDomain,
      retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
      outboundProviderMode: (env.OUTBOUND_PROVIDER || 'auto').trim().toLowerCase(),
      activeOutboundProvider,
      brevoKeyFormat: caps.brevoKeyFormat,
      linksStorageEngine: d1Ready
        ? 'cloudflare-d1'
        : env.LINKS_KV
          ? 'cloudflare-kv'
          : 'none',
      d1SchemaReady: d1Ready,
      mediaStorageEngine: getMediaStorageEngine(env),
      bindings: {
        mailTransitKv: Boolean(env.MAIL_TRANSIT_KV),
        linksKv: Boolean(env.LINKS_KV),
        linksDb: Boolean(env.LINKS_DB),
        linksMediaR2: Boolean(env.LINKS_MEDIA_R2),
        imagesBinding: Boolean(env.IMAGES),
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

  // 4.5 POST /api/mail/attachments/upload — Store temporary attachment in R2 (max 10 MB, 7-day TTL, purged on download/send)
  if (url.pathname === '/api/mail/attachments/upload' && request.method === 'POST') {
    const ownerUser = sanitizeHandle(url.searchParams.get('ownerUser') || 'fadhil');
    const filename = sanitizeAttachmentFilename(url.searchParams.get('filename') || 'attachment.bin');
    const mimeType = stripHeaderInjection(
      request.headers.get('content-type') || 'application/octet-stream',
      120
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

    const bin = await readBoundedBinary(request, MAIL_ATTACHMENT_MAX_TOTAL_BYTES);
    if (!bin.ok) {
      return jsonResponse(
        {
          ok: false,
          error: 'Ukuran lampiran melebihi batas maksimal 10 MB per email.',
        },
        bin.status
      );
    }
    if (bin.bytes.byteLength === 0) {
      return jsonResponse({ ok: false, error: 'File lampiran kosong.' }, 400);
    }
    if (!env.LINKS_MEDIA_R2) {
      return jsonResponse(
        {
          ok: false,
          error: 'Bucket R2 LINKS_MEDIA_R2 belum aktif untuk menampung lampiran sementara.',
        },
        503
      );
    }

    const attId = generateSecureId('att');
    const key = buildEphemeralAttachmentKey(ownerUser, attId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAIL_ATTACHMENT_TTL_MS).toISOString();

    await env.LINKS_MEDIA_R2.put(key, bin.bytes, {
      httpMetadata: {
        contentType: mimeType || 'application/octet-stream',
        cacheControl: 'private, no-store',
      },
      customMetadata: {
        ownerUser,
        filename,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: String(bin.bytes.byteLength),
        uploadedAt: now.toISOString(),
        expiresAt,
      },
    });

    return jsonResponse({
      ok: true,
      id: attId,
      ephemeralId: attId,
      ephemeralOwner: ownerUser,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: bin.bytes.byteLength,
      expiresAt,
      storageEngine: 'cloudflare-r2-ephemeral',
    });
  }

  // 4.6 GET /api/mail/attachments/:ownerUser/:attId — WhatsApp-style one-time download + immediate R2 purge
  if (url.pathname.startsWith('/api/mail/attachments/') && request.method === 'GET') {
    const rest = url.pathname.replace('/api/mail/attachments/', '').replace(/\/+$/, '');
    const parts = rest.split('/').filter(Boolean);
    if (parts.length < 2) {
      return jsonResponse({ ok: false, error: 'Parameter lampiran tidak valid.' }, 400);
    }
    const ownerUser = sanitizeHandle(decodeURIComponent(parts[0]));
    const attId = decodeURIComponent(parts[1]).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!attId) {
      return jsonResponse({ ok: false, error: 'ID lampiran tidak valid.' }, 400);
    }
    if (!env.LINKS_MEDIA_R2) {
      return jsonResponse(
        {
          ok: false,
          code: 'EXPIRED_OR_PURGED',
          error: 'Penyimpanan lampiran R2 tidak aktif atau media sudah terhapus.',
        },
        410
      );
    }

    const key = buildEphemeralAttachmentKey(ownerUser, attId);
    const obj = await env.LINKS_MEDIA_R2.get(key);
    if (!obj) {
      return jsonResponse(
        {
          ok: false,
          code: 'EXPIRED_OR_PURGED',
          error:
            'Media ini sudah tidak ada di server R2 (otomatis terhapus setelah diunduh atau melewati batas 7 hari). Minta pengirim untuk mengirim ulang.',
        },
        410
      );
    }

    const expiresAtStr = obj.customMetadata?.expiresAt || '';
    if (expiresAtStr && Date.now() > new Date(expiresAtStr).getTime()) {
      ctx.waitUntil(env.LINKS_MEDIA_R2.delete(key));
      return jsonResponse(
        {
          ok: false,
          code: 'EXPIRED_OR_PURGED',
          error:
            'Lampiran ini telah melewati batas simpan sementara 7 hari dan dihapus dari server R2. Minta pengirim untuk mengirim ulang.',
        },
        410
      );
    }

    const bytes = await obj.arrayBuffer();
    const filename = sanitizeAttachmentFilename(obj.customMetadata?.filename || 'attachment.bin');
    const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';

    // WhatsApp-style Zero Retention: purge object from R2 immediately after serving to recipient
    ctx.waitUntil(env.LINKS_MEDIA_R2.delete(key));

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-VZ-R2-Purged': 'true',
      },
    });
  }

  // 5. POST /api/mail/send — Dispatch outbound email via Brevo / Resend / cPanel / Cloudflare SEND_EMAIL
  if (url.pathname === '/api/mail/send' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      senderUser?: string;
      fromAddress?: string;
      toAddress?: string;
      subject?: string;
      bodyText?: string;
      attachments?: Array<{
        id?: string;
        ephemeralId?: string;
        filename?: string;
        mimeType?: string;
        sizeBytes?: number;
      }>;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }

    const senderUser = sanitizeHandle(String(parsed.data.senderUser || 'fadhil'));
    const senderReserved = checkReservedUsername(senderUser);
    if (senderReserved.isReserved) {
      return jsonResponse(
        {
          ok: false,
          error: `Username "${senderReserved.canonical}" dicadangkan untuk sistem resmi @${primaryDomain} dan tidak dapat digunakan untuk mengirim email.`,
        },
        403
      );
    }
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

    // Load temporary R2 attachments (if any), enforcing max 5 files & 10 MB total
    const rawAttRefs = Array.isArray(parsed.data.attachments)
      ? parsed.data.attachments.slice(0, MAIL_ATTACHMENT_MAX_COUNT)
      : [];
    const loadedAttachments: Array<{
      r2Key: string;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
      contentBase64: string;
    }> = [];
    let totalAttachmentBytes = 0;

    if (rawAttRefs.length > 0 && env.LINKS_MEDIA_R2) {
      for (const ref of rawAttRefs) {
        const attId = String(ref.ephemeralId || ref.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!attId) continue;
        const r2Key = buildEphemeralAttachmentKey(senderUser, attId);
        const obj = await env.LINKS_MEDIA_R2.get(r2Key);
        if (!obj) {
          return jsonResponse(
            {
              ok: false,
              error: `Lampiran "${ref.filename || attId}" sudah kedaluwarsa di R2. Unggah ulang file sebelum mengirim.`,
            },
            410
          );
        }
        const buf = new Uint8Array(await obj.arrayBuffer());
        totalAttachmentBytes += buf.byteLength;
        if (totalAttachmentBytes > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
          return jsonResponse(
            {
              ok: false,
              error: 'Total ukuran seluruh lampiran melebihi batas maksimal 10 MB per email.',
            },
            413
          );
        }
        loadedAttachments.push({
          r2Key,
          filename: sanitizeAttachmentFilename(
            ref.filename || obj.customMetadata?.filename || 'attachment.bin'
          ),
          mimeType:
            ref.mimeType ||
            obj.httpMetadata?.contentType ||
            'application/octet-stream',
          bytes: buf,
          contentBase64: uint8ToBase64(buf),
        });
      }
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
          attachments: loadedAttachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            contentBase64: a.contentBase64,
            sizeBytes: a.bytes.byteLength,
          })),
        });
        if (!result.ok) {
          logError('outbound_provider_rejected', new Error(result.error), {
            senderUser,
            provider: activeProvider,
            domain: primaryDomain,
          });
          return jsonResponse(
            {
              ok: false,
              providerUsed: activeProvider,
              error: result.error,
            },
            502
          );
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
            providerUsed: activeProvider,
            error: `Pengiriman email via ${activeProvider} mengalami gangguan koneksi. Periksa konfigurasi provider di Konsol Worker & Domain.`,
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
      const recipientAttachments: EphemeralPacketAttachment[] = [];

      // Clone ephemeral R2 attachment for internal recipient (7-day TTL, purged on download)
      if (loadedAttachments.length > 0 && env.LINKS_MEDIA_R2) {
        const expiresAt = new Date(now.getTime() + MAIL_ATTACHMENT_TTL_MS).toISOString();
        for (const att of loadedAttachments) {
          const recAttId = generateSecureId('att');
          const recKey = buildEphemeralAttachmentKey(
            resolvedRecipient.canonicalUsername,
            recAttId
          );
          await env.LINKS_MEDIA_R2.put(recKey, att.bytes, {
            httpMetadata: {
              contentType: att.mimeType,
              cacheControl: 'private, no-store',
            },
            customMetadata: {
              ownerUser: resolvedRecipient.canonicalUsername,
              filename: att.filename,
              mimeType: att.mimeType,
              sizeBytes: String(att.bytes.byteLength),
              uploadedAt: now.toISOString(),
              expiresAt,
            },
          });
          recipientAttachments.push({
            id: recAttId,
            filename: att.filename,
            mimeType: att.mimeType,
            sizeBytes: att.bytes.byteLength,
            ephemeralId: recAttId,
            ephemeralOwner: resolvedRecipient.canonicalUsername,
            expiresAt,
          });
        }
      }

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
        attachments: recipientAttachments,
      };

      if (env.MAIL_TRANSIT_KV) {
        await env.MAIL_TRANSIT_KV.put(
          `q:${loopbackPacket.canonicalUser}:${loopbackPacket.id}`,
          JSON.stringify(loopbackPacket),
          { expirationTtl: TRANSIT_TTL_SECONDS }
        );
      }
    }

    // Immediately purge sender's temporary outbound R2 uploads so R2 stays at 0 bytes for sent mail!
    if (loadedAttachments.length > 0 && env.LINKS_MEDIA_R2) {
      const keysToDelete = loadedAttachments.map((a) => a.r2Key);
      ctx.waitUntil(
        Promise.allSettled(keysToDelete.map((k) => env.LINKS_MEDIA_R2!.delete(k)))
      );
    }

    logInfo('mail_outbound_processed', {
      senderUser,
      liveEmailDispatched,
      providerUsed: activeProvider,
      attachmentCount: loadedAttachments.length,
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
      r2AttachmentsPurged: loadedAttachments.length,
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
    const mode = url.searchParams.get('mode') === 'recycle' ? 'recycle' : 'permanent';
    const result = await deleteShortlinkRecord(env, slug, ownerUser);
    if (result.forbidden) {
      return jsonResponse(
        { ok: false, error: 'Anda tidak memiliki izin menghapus shortlink milik akun lain.' },
        403
      );
    }
    let recycleRecord: RecycleBinRecord | null = null;
    if (result.deleted && result.record && mode === 'recycle' && ownerUser) {
      recycleRecord = await addItemToRecycleBin(
        env,
        ownerUser,
        'shortlink',
        `${primaryDomain}/s/${result.record.slug}`,
        result.record.title || result.record.targetUrl,
        result.record as unknown as Record<string, unknown>
      );
    }
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      deletedSlug: slug,
      deleted: result.deleted,
      mode,
      movedToRecycleBin: Boolean(recycleRecord),
      recycleId: recycleRecord?.id || null,
    });
  }

  // 7. Recycle Bin API (14-Day Auto-Purge) for All VZ Links Items
  if (url.pathname === '/api/links/recycle-bin' && request.method === 'GET') {
    const ownerParam = url.searchParams.get('owner')?.trim() || '';
    if (!ownerParam) {
      return jsonResponse({ ok: false, error: 'Parameter owner diperlukan.' }, 400);
    }
    const ownerUser = sanitizeHandle(ownerParam);
    const items = await listRecycleBinItems(env, ownerUser);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      retentionDays: 14,
      items,
    });
  }

  if (url.pathname === '/api/links/recycle-bin' && request.method === 'POST') {
    const parsed = await readBoundedJson<{
      ownerUser?: string;
      itemType?: RecycleBinItemType;
      label?: string;
      summary?: string;
      payload?: Record<string, unknown>;
    }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const ownerUser = sanitizeHandle(String(parsed.data.ownerUser || ''));
    const itemType = parsed.data.itemType;
    if (itemType !== 'bio_link' && itemType !== 'bio_page' && itemType !== 'shortlink') {
      return jsonResponse({ ok: false, error: 'Tipe item Recycle Bin tidak valid.' }, 400);
    }
    const record = await addItemToRecycleBin(
      env,
      ownerUser,
      itemType,
      String(parsed.data.label || itemType),
      String(parsed.data.summary || ''),
      parsed.data.payload && typeof parsed.data.payload === 'object' ? parsed.data.payload : {}
    );
    return jsonResponse({ ok: true, record }, 201);
  }

  if (url.pathname === '/api/links/recycle-bin/restore' && request.method === 'POST') {
    const parsed = await readBoundedJson<{ ownerUser?: string; id?: string }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const ownerUser = sanitizeHandle(String(parsed.data.ownerUser || ''));
    const itemId = String(parsed.data.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (!itemId) {
      return jsonResponse({ ok: false, error: 'ID item tidak valid.' }, 400);
    }

    const item = await getRecycleBinItem(env, ownerUser, itemId);
    if (!item) {
      return jsonResponse(
        { ok: false, error: 'Item tidak ditemukan atau sudah kedaluwarsa (> 14 hari).' },
        404
      );
    }

    if (item.itemType === 'shortlink') {
      const rawPayload = item.payload as Partial<ShortlinkRecord>;
      const safeTarget = sanitizeExternalUrl(String(rawPayload.targetUrl || ''), {
        allowMailto: false,
        blockPrivateHosts: true,
      });
      if (!safeTarget) {
        await hardDeleteRecycleBinItem(env, ownerUser, itemId);
        return jsonResponse({ ok: false, error: 'URL shortlink tidak valid untuk dipulihkan.' }, 400);
      }
      let targetSlug = sanitizeShortlinkSlugInput(String(rawPayload.slug || '')) || generateShortlinkCode(6);
      const conflict = await getShortlinkRecord(env, targetSlug);
      if (conflict) {
        targetSlug = generateShortlinkCode(7);
      }
      const restored: ShortlinkRecord = {
        slug: targetSlug,
        ownerUser,
        title: stripHeaderInjection(String(rawPayload.title || ''), 120),
        targetUrl: safeTarget,
        isCustomSlug: Boolean(rawPayload.isCustomSlug && !conflict),
        clicks: Math.max(0, Number(rawPayload.clicks) || 0),
        createdAt:
          typeof rawPayload.createdAt === 'string' && rawPayload.createdAt
            ? rawPayload.createdAt
            : new Date().toISOString(),
        lastClickedAt:
          typeof rawPayload.lastClickedAt === 'string' ? rawPayload.lastClickedAt : null,
      };
      await saveShortlinkRecord(env, restored);
      await hardDeleteRecycleBinItem(env, ownerUser, itemId);
      return jsonResponse({
        ok: true,
        itemType: 'shortlink',
        restoredSlug: restored.slug,
        record: restored,
      });
    }

    // Restoring Bio Link or Bio Page respects the 3-day bio delete cooldown
    const cooldown = await getBioDeleteCooldown(env, ownerUser);
    if (cooldown.active) {
      return jsonResponse(
        {
          ok: false,
          error: 'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen.',
          cooldown,
        },
        429
      );
    }

    const existing = await getBioWorkspaceFromStorage(env, ownerUser);
    if (!existing) {
      return jsonResponse(
        { ok: false, error: 'Simpan profil Bio utama terlebih dahulu sebelum memulihkan item ini.' },
        400
      );
    }

    if (item.itemType === 'bio_page') {
      const pagePayload = item.payload as Partial<BioPageRecord>;
      const baseSlug = sanitizePageSlug(String(pagePayload.pageSlug || '')) || `page-${Date.now().toString(36).slice(-4)}`;
      let finalSlug = baseSlug;
      if (existing.pages.some((p) => p.pageSlug === finalSlug)) {
        finalSlug = `${baseSlug.slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;
      }
      const restoredPage: BioPageRecord = {
        id: `page-${ownerUser}-${finalSlug}-${Date.now().toString(36)}`,
        pageSlug: finalSlug,
        title: String(pagePayload.title || `/${finalSlug}`).slice(0, 80),
        description: String(pagePayload.description || '').slice(0, 260),
        avatarUrl: sanitizeBioAvatarUrl(pagePayload.avatarUrl || ''),
        themeId: isValidBioThemeId(pagePayload.themeId) ? pagePayload.themeId : 'midnight_slate',
        buttonStyle: isValidButtonStyle(pagePayload.buttonStyle) ? pagePayload.buttonStyle : 'rounded',
        showSocials: pagePayload.showSocials !== false,
        isPublished: true,
        links: Array.isArray(pagePayload.links) ? (pagePayload.links as BioLinkItem[]) : [],
        updatedAt: new Date().toISOString(),
      };
      const updated = await saveBioWorkspaceToStorage(env, ownerUser, {
        ...existing,
        pages: [...existing.pages, restoredPage],
      });
      await hardDeleteRecycleBinItem(env, ownerUser, itemId);
      return jsonResponse({ ok: true, itemType: 'bio_page', data: updated });
    }

    // itemType === 'bio_link'
    const linkPayload = item.payload as { pageSlug?: string; link?: Partial<BioLinkItem> };
    const desiredSlug = typeof linkPayload.pageSlug === 'string' ? linkPayload.pageSlug : '';
    const linkData = linkPayload.link || (item.payload as Partial<BioLinkItem>);
    const targetPage =
      existing.pages.find((p) => p.pageSlug === desiredSlug) || existing.pages[0];
    const restoredLink: BioLinkItem = {
      id: `lnk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(linkData.title || item.label || 'Tautan').slice(0, 100),
      subtitle: String(linkData.subtitle || '').slice(0, 140),
      url: String(linkData.url || ''),
      sortOrder: targetPage.links.length,
      enabled: true,
      clicks: Math.max(0, Number(linkData.clicks) || 0),
    };
    const nextPages = existing.pages.map((p) =>
      p.pageSlug === targetPage.pageSlug
        ? { ...p, links: [...p.links, restoredLink] }
        : p
    );
    const updated = await saveBioWorkspaceToStorage(env, ownerUser, {
      ...existing,
      pages: nextPages,
    });
    await hardDeleteRecycleBinItem(env, ownerUser, itemId);
    return jsonResponse({ ok: true, itemType: 'bio_link', data: updated });
  }

  if (url.pathname === '/api/links/recycle-bin' && request.method === 'DELETE') {
    const ownerParam = url.searchParams.get('owner')?.trim() || '';
    if (!ownerParam) {
      return jsonResponse({ ok: false, error: 'Parameter owner diperlukan.' }, 400);
    }
    const ownerUser = sanitizeHandle(ownerParam);
    const purgedCount = await emptyRecycleBinForOwner(env, ownerUser);
    return jsonResponse({ ok: true, purgedCount });
  }

  if (url.pathname.startsWith('/api/links/recycle-bin/') && request.method === 'DELETE') {
    const ownerParam = url.searchParams.get('owner')?.trim() || '';
    if (!ownerParam) {
      return jsonResponse({ ok: false, error: 'Parameter owner diperlukan.' }, 400);
    }
    const ownerUser = sanitizeHandle(ownerParam);
    const itemId = url.pathname
      .replace('/api/links/recycle-bin/', '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);
    if (!itemId) {
      return jsonResponse({ ok: false, error: 'ID item tidak valid.' }, 400);
    }
    await hardDeleteRecycleBinItem(env, ownerUser, itemId);
    return jsonResponse({ ok: true, deletedId: itemId });
  }

  // 8. Multi-Page Link-in-Bio API (`/api/links/bio/:username`, `/status`, DELETE, `/bio-click`)
  if (
    url.pathname.startsWith('/api/links/bio/') &&
    url.pathname.endsWith('/status') &&
    request.method === 'PATCH'
  ) {
    const trimmed = url.pathname
      .replace('/api/links/bio/', '')
      .replace(/\/status$/, '');
    const username = sanitizeHandle(decodeURIComponent(trimmed || ''));
    const reserved = checkReservedUsername(username);
    if (reserved.isReserved) {
      return jsonResponse(
        { ok: false, error: `Username "${reserved.canonical}" dicadangkan untuk sistem.` },
        403
      );
    }
    const parsed = await readBoundedJson<{ isDeactivated?: boolean }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const existing = await getBioWorkspaceFromStorage(env, username);
    if (!existing) {
      return jsonResponse(
        { ok: false, error: 'Profil Bio belum tersimpan di server.' },
        404
      );
    }
    const isDeactivated = parsed.data.isDeactivated === true;
    const saved = await saveBioWorkspaceToStorage(env, username, {
      ...existing,
      isDeactivated,
      deactivatedAt: isDeactivated ? new Date().toISOString() : null,
    });
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      data: saved,
    });
  }

  if (url.pathname.startsWith('/api/links/bio/') && request.method === 'GET') {
    const rawUser = decodeURIComponent(url.pathname.replace('/api/links/bio/', '').split('/')[0] || '');
    const username = sanitizeHandle(rawUser);
    const reserved = checkReservedUsername(username);
    const [data, cooldown] = await Promise.all([
      getBioWorkspaceFromStorage(env, username),
      getBioDeleteCooldown(env, username),
    ]);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      configured: Boolean(data),
      username,
      reserved: reserved.isReserved,
      cooldown,
      data,
    });
  }

  if (url.pathname.startsWith('/api/links/bio/') && request.method === 'PUT') {
    const rawUser = decodeURIComponent(url.pathname.replace('/api/links/bio/', '').split('/')[0] || '');
    const username = sanitizeHandle(rawUser);
    const reserved = checkReservedUsername(username);
    if (reserved.isReserved) {
      return jsonResponse(
        {
          ok: false,
          error: `Username "${reserved.canonical}" dicadangkan untuk sistem resmi ${primaryDomain} dan tidak dapat diklaim.`,
        },
        403
      );
    }
    const cooldown = await getBioDeleteCooldown(env, username);
    if (cooldown.active) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen untuk mencegah penyalahgunaan database.',
          cooldown,
        },
        429
      );
    }
    const parsed = await readBoundedJson<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const saved = await saveBioWorkspaceToStorage(env, username, parsed.data);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      configured: true,
      cooldown: { active: false, deletedAt: null, unlockAt: null, remainingMs: 0 },
      data: saved,
    });
  }

  if (url.pathname.startsWith('/api/links/bio/') && request.method === 'DELETE') {
    const rawUser = decodeURIComponent(url.pathname.replace('/api/links/bio/', '').split('/')[0] || '');
    const username = sanitizeHandle(rawUser);
    const cooldown = await hardDeleteBioProfileAndSetCooldown(env, username);
    return jsonResponse({
      ok: true,
      storageEngine: getLinksStorageEngine(env),
      deleted: true,
      username,
      cooldown,
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

  // 9. Dedicated Bio Link AVIF Avatar API (`/api/links/avatar/:username` & `/:pageSlug`)
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
      const reserved = checkReservedUsername(username);
      if (reserved.isReserved) {
        return jsonResponse(
          { ok: false, error: `Username "${reserved.canonical}" dicadangkan untuk sistem.` },
          403
        );
      }
      const cooldown = await getBioDeleteCooldown(env, username);
      if (cooldown.active) {
        return jsonResponse(
          {
            ok: false,
            error: 'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen.',
            cooldown,
          },
          429
        );
      }

      // Accept ANY supported image format up to 10 MB for server-side AVIF conversion
      const bin = await readBoundedBinary(request, AVATAR_RAW_UPLOAD_MAX_BYTES);
      if (!bin.ok) {
        return jsonResponse(
          { ok: false, error: 'Ukuran gambar sumber melebihi batas maksimal 10 MB.' },
          bin.status
        );
      }

      const sourceBytes = bin.bytes.byteLength;
      const sourceMime = detectRawImageMime(bin.bytes);
      if (!sourceMime) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Format berkas tidak dikenali sebagai gambar yang aman (mendukung JPG, PNG, WebP, GIF, AVIF, HEIC, BMP, TIFF, SVG).',
          },
          400
        );
      }

      let finalBytes: Uint8Array = bin.bytes;
      let finalMime: string = sourceMime;
      let convertedBy:
        | 'cloudflare-images-avif'
        | 'client-avif'
        | 'client-webp-fallback'
        | 'passthrough-raw' = 'passthrough-raw';

      const alreadyCompactAvifOrWebp = detectValidatedAvatarMime(bin.bytes);
      const forceServerConvert = url.searchParams.get('convert') === 'server';

      // Server-side Image Converter: convert ANY uploaded image -> AVIF (512x512 cover) via Cloudflare Images Binding
      if (
        env.IMAGES &&
        (forceServerConvert || alreadyCompactAvifOrWebp !== 'image/avif')
      ) {
        try {
          const stream = new Response(bin.bytes.slice()).body;
          if (stream) {
            const transformed = await env.IMAGES.input(stream)
              .transform({ width: 512, height: 512, fit: 'cover' })
              .output({ format: 'image/avif', quality: 80 });
            const avifRes = transformed.response();
            const avifBuf = new Uint8Array(await avifRes.arrayBuffer());
            if (avifBuf.byteLength > 12) {
              finalBytes = avifBuf;
              finalMime = 'image/avif';
              convertedBy = 'cloudflare-images-avif';
            }
          }
        } catch (imgErr) {
          logError('cf_images_avif_convert_fallback', imgErr, {
            username,
            sourceMime,
            sourceBytes,
          });
        }
      }

      if (convertedBy !== 'cloudflare-images-avif') {
        if (alreadyCompactAvifOrWebp === 'image/avif') {
          finalMime = 'image/avif';
          convertedBy = 'client-avif';
        } else if (alreadyCompactAvifOrWebp === 'image/webp') {
          finalMime = 'image/webp';
          convertedBy = 'client-webp-fallback';
        } else if (
          SAFE_STORED_AVATAR_MIMES.has(sourceMime) &&
          sourceBytes <= 2 * 1024 * 1024
        ) {
          finalMime = sourceMime;
          convertedBy = 'passthrough-raw';
        } else {
          return jsonResponse(
            {
              ok: false,
              error:
                'Konverter AVIF Cloudflare Images (env.IMAGES) belum aktif pada akun Cloudflare ini. Gunakan opsi Crop 1:1 untuk kompresi otomatis AVIF di browser atau aktifkan Cloudflare Images Free Tier (5.000/bulan gratis).',
            },
            422
          );
        }
      }

      const mediaEngine = await putAvatarToStorage(
        env,
        username,
        pageSlug,
        finalBytes,
        finalMime
      );
      const version = Date.now().toString(36);
      const avatarPath = pageSlug
        ? `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(pageSlug)}?v=${version}`
        : `/api/links/avatar/${encodeURIComponent(username)}?v=${version}`;

      return jsonResponse({
        ok: true,
        avatarUrl: avatarPath,
        contentType: finalMime,
        sourceMime,
        sourceBytes,
        byteSize: finalBytes.byteLength,
        convertedBy,
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

  // 9.5 Same-Origin Domain Verification Proxy (`GET /api/mail/verify-domain?domain=...`)
  //     Executes Cloudflare DoH (MX, SPF, DMARC, DKIM) & authoritative RDAP at the edge
  //     so strict browser CSP and RDAP CORS never cause false "missing" DNS warnings.
  if (url.pathname === '/api/mail/verify-domain' && request.method === 'GET') {
    const rawDomain = (url.searchParams.get('domain') || '').trim().slice(0, 253);
    if (!rawDomain) {
      return jsonResponse({ ok: false, error: 'Parameter domain diperlukan.' }, 400);
    }
    const result = await verifyDomainAtEdge(rawDomain);
    if (!result) {
      return jsonResponse({ ok: false, error: 'Format domain tidak valid.' }, 400);
    }
    return jsonResponse(result as unknown as Record<string, unknown>, 200, {
      'Cache-Control': 'public, max-age=120',
    });
  }

  // 10. Non-AI VZ Search Grounding Proxy (`GET /api/mail/vz-search?q=...&page=...`)
  //     Fetches live web index results from https://search.vz.gay/api/search?q=...
  if (url.pathname === '/api/mail/vz-search' && request.method === 'GET') {
    const rawQ = (url.searchParams.get('q') || '').trim().slice(0, 240);
    const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
    const page = Number.isFinite(rawPage) ? Math.min(20, Math.max(1, rawPage)) : 1;

    if (!rawQ) {
      return jsonResponse(
        { ok: false, error: 'Parameter pencarian q diperlukan.' },
        400
      );
    }

    const searchPageUrl = `https://search.vz.gay/?q=${encodeURIComponent(rawQ)}&page=${page}`;
    try {
      const upstream = await fetch(
        `https://search.vz.gay/api/search?q=${encodeURIComponent(rawQ)}&page=${page}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'Mozilla/5.0 (compatible; VZMail-SearchGrounding/1.0; +https://mail.vz.gay)',
          },
        }
      );
      const data = (await upstream.json().catch(() => null)) as {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          siteName?: string;
          favicon?: string;
          age?: string;
        }>;
        hasMore?: boolean;
        spellcheckSuggestion?: string | null;
        suggestion?: string | null;
        error?: string;
      } | null;

      if (!upstream.ok || !data) {
        return jsonResponse(
          {
            ok: false,
            query: rawQ,
            page,
            searchUrl: searchPageUrl,
            error: data?.error || 'Tidak dapat memuat hasil dari search.vz.gay saat ini.',
          },
          502
        );
      }

      const rawItems = Array.isArray(data.results) ? data.results.slice(0, 15) : [];
      const results = rawItems
        .map((item) => {
          const safeUrl = sanitizeExternalUrl(String(item.url || ''), {
            allowMailto: false,
            blockPrivateHosts: true,
          });
          if (!safeUrl) return null;
          const cleanSnippet = String(item.description || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;|&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .slice(0, 360);
          return {
            title: stripHeaderInjection(String(item.title || safeUrl), 180),
            url: safeUrl,
            description: cleanSnippet,
            siteName: stripHeaderInjection(String(item.siteName || ''), 80),
            favicon: sanitizeExternalUrl(String(item.favicon || ''), {
              allowMailto: false,
              blockPrivateHosts: true,
            }),
            age: stripHeaderInjection(String(item.age || ''), 40),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return jsonResponse({
        ok: true,
        query: rawQ,
        page,
        searchUrl: searchPageUrl,
        hasMore: Boolean(data.hasMore),
        spellcheckSuggestion:
          typeof (data.spellcheckSuggestion || data.suggestion) === 'string'
            ? String(data.spellcheckSuggestion || data.suggestion).slice(0, 160)
            : null,
        results,
      });
    } catch {
      return jsonResponse(
        {
          ok: false,
          query: rawQ,
          page,
          searchUrl: searchPageUrl,
          error: 'Gagal menghubungi layanan search.vz.gay.',
        },
        502
      );
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
        return await handleApiRequest(request, url, env, ctx);
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

      // 3. Dynamic Host-Aware SEO & AI Crawler Discovery Endpoints
      //    (/robots.txt, /sitemap.xml, /llms.txt, /llms-full.txt)
      const isBioSubdomain =
        host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li';
      const bioSubdomainUser = isBioSubdomain
        ? sanitizeHandle(host.slice(0, -'.imy.li'.length))
        : null;

      if (url.pathname === '/robots.txt' && (request.method === 'GET' || request.method === 'HEAD')) {
        let effectiveMode: BioIndexingMode | null = null;
        if (isBioSubdomain && bioSubdomainUser) {
          const ws = await getBioWorkspaceFromStorage(env, bioSubdomainUser);
          effectiveMode =
            ws && ws.configured && !ws.isDeactivated
              ? sanitizeBioIndexingMode(ws.indexingMode)
              : 'none';
        }
        return new Response(buildHostRobotsTxt(host, effectiveMode), {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': isBioSubdomain ? 'public, max-age=300' : 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      if (url.pathname === '/sitemap.xml' && (request.method === 'GET' || request.method === 'HEAD')) {
        if (isBioSubdomain) {
          return new Response('Not Found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
          });
        }
        return new Response(buildHostSitemapXml(host), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      if (url.pathname === '/llms.txt' && (request.method === 'GET' || request.method === 'HEAD')) {
        return new Response(buildLlmsTxt(), {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      if (url.pathname === '/llms-full.txt' && (request.method === 'GET' || request.method === 'HEAD')) {
        return new Response(buildLlmsFullTxt(), {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      // 4. Shortlink Redirector: imy.li/s/$SLUG or links.vz.gay/s/$SLUG
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
                  'X-Robots-Tag': 'noindex, nofollow',
                },
              });
            }
          }
        }
      }

      // 5. SPA Assets + Dynamic Edge SEO (HTMLRewriter) & PSL-Safe Bio Isolation
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        const secured = applyHtmlSecurityHeaders(assetResponse, {
          isBioSubdomain,
          isHttps,
          auth0Domain: env.AUTH0_DOMAIN,
        });

        const contentType = secured.headers.get('Content-Type') || '';
        if (contentType.includes('text/html')) {
          const routeKind = resolveSeoRouteKind(host, url);
          let bioWorkspace: BioWorkspaceData | null = null;
          let bioPageSlug = '';
          const effectiveBioUser =
            bioSubdomainUser ||
            (url.searchParams.get('bio_user')
              ? sanitizeHandle(url.searchParams.get('bio_user') || '')
              : null);

          if (routeKind === 'bio_public' && effectiveBioUser) {
            bioWorkspace = await getBioWorkspaceFromStorage(env, effectiveBioUser);
            const rawSegment = isBioSubdomain
              ? url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || ''
              : url.searchParams.get('bio_page') || '';
            bioPageSlug = rawSegment ? sanitizePageSlug(rawSegment) || '' : '';
          }

          const seoMeta = buildServiceSeoMeta({
            routeKind,
            hostname: host,
            pathname: url.pathname,
            bioUsername: effectiveBioUser,
            bioPageSlug,
            bioWorkspace,
          });
          return rewriteHtmlSeo(secured, seoMeta);
        }

        return secured;
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

      // Read full inbound MIME up to 10 MB so real attachments can be extracted to ephemeral R2
      const scanLimit = env.LINKS_MEDIA_R2
        ? Math.min(message.rawSize || MAX_RAW_EMAIL_SCAN_BYTES, MAIL_ATTACHMENT_MAX_TOTAL_BYTES)
        : MAX_RAW_EMAIL_SCAN_BYTES;
      const { text: rawPrefix, truncated } = await readBoundedStreamText(
        message.raw,
        Math.max(MAX_RAW_EMAIL_SCAN_BYTES, scanLimit)
      );
      const parsedMime = extractBodyAndAttachmentsFromRawMime(rawPrefix);
      let bodyText = parsedMime.bodyText;
      if (truncated) {
        bodyText +=
          '\n\n[VZ Mail Edge Note: Pesan melebihi batas baca edge, sebagian isi dipotong demi keamanan memori.]';
      }

      const now = new Date();
      const inboundAttachments: EphemeralPacketAttachment[] = [];
      if (parsedMime.attachments.length > 0 && env.LINKS_MEDIA_R2) {
        const attExpiresAt = new Date(now.getTime() + MAIL_ATTACHMENT_TTL_MS).toISOString();
        for (const att of parsedMime.attachments) {
          const attId = generateSecureId('att');
          const r2Key = buildEphemeralAttachmentKey(resolved.canonicalUser, attId);
          await env.LINKS_MEDIA_R2.put(r2Key, att.bytes, {
            httpMetadata: {
              contentType: att.mimeType,
              cacheControl: 'private, no-store',
            },
            customMetadata: {
              ownerUser: resolved.canonicalUser,
              filename: att.filename,
              mimeType: att.mimeType,
              sizeBytes: String(att.bytes.byteLength),
              uploadedAt: now.toISOString(),
              expiresAt: attExpiresAt,
            },
          });
          inboundAttachments.push({
            id: attId,
            filename: att.filename,
            mimeType: att.mimeType,
            sizeBytes: att.bytes.byteLength,
            ephemeralId: attId,
            ephemeralOwner: resolved.canonicalUser,
            expiresAt: attExpiresAt,
          });
        }
      }

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
        attachments: inboundAttachments,
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
        attachmentCount: inboundAttachments.length,
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
