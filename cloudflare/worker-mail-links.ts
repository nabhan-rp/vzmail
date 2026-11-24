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
  SEND_EMAIL?: SendEmailBinding;
  APP_DOMAIN?: string;
  LINKS_DOMAIN?: string;
  PRIMARY_MAIL_DOMAIN?: string;
  AUTH0_DOMAIN?: string;
  ACCOUNT_DASHBOARD_URL?: string;
  SPONSOR_DOMAIN?: string;
  DAILY_OUTBOUND_LIMIT?: string;
  RELAY_AUTH_TOKEN?: string;
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

async function handleApiRequest(
  request: Request,
  url: URL,
  env: WorkerEnv
): Promise<Response> {
  const primaryDomain = getPrimaryDomain(env);

  // Public health check endpoint
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse({
      ok: true,
      service: 'vzmail',
      primaryDomain,
      retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
      bindings: {
        mailTransitKv: Boolean(env.MAIL_TRANSIT_KV),
        linksKv: Boolean(env.LINKS_KV),
        sendEmail: Boolean(env.SEND_EMAIL),
        assets: Boolean(env.ASSETS),
        relayAuthProtected: Boolean(env.RELAY_AUTH_TOKEN),
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Optional constant-time auth gate for /api/mail/* and mutating /api/links/*
  if (url.pathname.startsWith('/api/mail/') || (url.pathname.startsWith('/api/links/') && request.method !== 'GET')) {
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
    let dispatchedVia = 'Simulated Local Relay (bind SEND_EMAIL in wrangler.toml for live delivery)';
    let liveEmailDispatched = false;

    if (env.SEND_EMAIL) {
      try {
        await env.SEND_EMAIL.send({
          from: {
            email: safeFromAddress,
            name: sanitizeDisplayName(senderUser, senderUser),
          },
          to: toAddress,
          subject,
          text: bodyText,
          html: plainTextToSafeEmailHtml(bodyText),
          headers: {
            'Message-ID': rfcMessageId,
            'X-VZ-Zero-Retention': 'true',
          },
        });
        dispatchedVia = 'Cloudflare Email Sending Worker (SEND_EMAIL binding)';
        liveEmailDispatched = true;
      } catch (err) {
        logError('send_email_binding_failed', err, {
          senderUser,
          domain: primaryDomain,
        });
        return jsonResponse(
          {
            ok: false,
            error:
              'Pengiriman via Cloudflare Email Sending gagal. Pastikan domain pengirim sudah terverifikasi di Compute > Email Service.',
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

  // 6. Optional KV-backed Shortlink API (`/api/links/shortlinks`)
  if (url.pathname === '/api/links/shortlinks' && request.method === 'POST') {
    const parsed = await readBoundedJson<{ slug?: string; targetUrl?: string }>(request);
    if (!parsed.ok) {
      return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
    }
    const slug = sanitizeSlug(String(parsed.data.slug || ''));
    const safeTarget = sanitizeExternalUrl(String(parsed.data.targetUrl || ''), {
      allowMailto: false,
      blockPrivateHosts: true,
    });
    if (!slug || !safeTarget) {
      return jsonResponse(
        { ok: false, error: 'Slug atau URL tujuan tidak valid / tidak aman.' },
        400
      );
    }
    if (env.LINKS_KV) {
      await env.LINKS_KV.put(`short:${slug}`, safeTarget);
    }
    return jsonResponse({
      ok: true,
      kvBound: Boolean(env.LINKS_KV),
      slug,
      targetUrl: safeTarget,
    });
  }

  if (url.pathname.startsWith('/api/links/shortlinks/') && request.method === 'DELETE') {
    const slug = sanitizeSlug(url.pathname.replace('/api/links/shortlinks/', ''));
    if (!slug) {
      return jsonResponse({ ok: false, error: 'Slug tidak valid.' }, 400);
    }
    if (env.LINKS_KV) {
      await env.LINKS_KV.delete(`short:${slug}`);
    }
    return jsonResponse({ ok: true, kvBound: Boolean(env.LINKS_KV), deletedSlug: slug });
  }

  return jsonResponse({ ok: false, error: 'Endpoint API tidak ditemukan.' }, 404);
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const isHttps = url.protocol === 'https:';

    try {
      // 1. API endpoints (always JSON, never fall back to SPA index.html)
      if (url.pathname.startsWith('/api/')) {
        return await handleApiRequest(request, url, env);
      }

      // 2. Shortlink Redirector: imy.li/s/$SLUG or links.vz.gay/s/$SLUG
      if (url.pathname.startsWith('/s/') && (request.method === 'GET' || request.method === 'HEAD')) {
        const rawSlug = url.pathname.replace(/^\/s\//, '').split('/')[0] || '';
        const slug = sanitizeSlug(rawSlug);
        if (slug && env.LINKS_KV) {
          const rawTarget = await env.LINKS_KV.get(`short:${slug}`, 'text');
          if (rawTarget) {
            const safeTarget = sanitizeExternalUrl(rawTarget, {
              allowMailto: false,
              blockPrivateHosts: true,
            });
            if (safeTarget) {
              return new Response(null, {
                status: 301,
                headers: {
                  Location: safeTarget,
                  'Cache-Control': 'public, max-age=300',
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
