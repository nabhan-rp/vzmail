import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SUPPORTED_DOMAINS,
  resolveCanonicalEmail,
  sanitizeHandle,
} from './src/utils/mailIdentity.ts';
import {
  generateSecureId,
  isValidEmailAddress,
  sanitizeDisplayName,
  sanitizeExternalUrl,
  sanitizeSlug,
  stripHeaderInjection,
} from './src/utils/mailSecurity.ts';
import {
  AVATAR_RAW_UPLOAD_MAX_BYTES,
  BIO_DELETE_COOLDOWN_MS,
  MAIL_ATTACHMENT_MAX_COUNT,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  MAIL_ATTACHMENT_TTL_MS,
  RECYCLE_BIN_RETENTION_MS,
  detectRawImageMime,
  detectValidatedAvatarMime,
  generateShortlinkCode,
  isValidBioThemeId,
  isValidButtonStyle,
  sanitizeBioAvatarUrl,
  sanitizeBioIndexingMode,
  sanitizeBioWorkspaceInput,
  sanitizePageSlug,
  sanitizeShortlinkSlugInput,
  type BioDeleteCooldownInfo,
  type BioLinkItem,
  type BioPageRecord,
  type BioWorkspaceData,
  type RecycleBinItemType,
  type RecycleBinRecord,
  type ShortlinkRecord,
} from './src/utils/linksModel.ts';
import { checkReservedUsername } from './src/utils/reservedUsernames.ts';
import { verifyDomainAtEdge } from './src/utils/domainVerify.ts';
import {
  buildHostRobotsTxt,
  buildHostSitemapXml,
  buildLlmsFullTxt,
  buildLlmsTxt,
} from './src/utils/seoConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface EphemeralPacketAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ephemeralId: string;
  ephemeralOwner: string;
  expiresAt: string;
}

interface EphemeralMailPacket {
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

interface StoredEphemeralAttachment {
  id: string;
  ownerUser: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  uploadedAt: string;
  expiresAt: string;
}

const MAX_QUEUE_PACKETS = 500;
const MAX_EMAIL_BODY_CHARS = 64 * 1024;
const DAILY_OUTBOUND_LIMIT = 25;

// Ephemeral in-memory local dev buffer (Zero permanent retention: purged immediately upon client ACK)
const ephemeralQueue: Map<string, EphemeralMailPacket> = new Map();
const localEphemeralAttachments: Map<string, StoredEphemeralAttachment> = new Map();
const outboundQuotaCounter: Map<string, { date: string; count: number }> = new Map();
const localShortlinks: Map<string, ShortlinkRecord> = new Map();
const localBioWorkspaces: Map<string, BioWorkspaceData> = new Map();
const localBioAvatars: Map<
  string,
  { bytes: Buffer; contentType: string; updatedAt: string }
> = new Map();
const localRecycleBin: Map<string, RecycleBinRecord> = new Map();
const localBioDeleteCooldowns: Map<string, { deletedAt: string; unlockAt: string }> = new Map();

function sanitizeLocalFilename(raw: string): string {
  const cleaned = stripHeaderInjection(raw, 120)
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'attachment.bin';
}

function buildLocalAttachmentKey(ownerUser: string, attId: string): string {
  return `${sanitizeHandle(ownerUser)}:${attId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function pruneExpiredLocalAttachments(): void {
  const now = Date.now();
  for (const [key, item] of localEphemeralAttachments.entries()) {
    if (new Date(item.expiresAt).getTime() <= now) {
      localEphemeralAttachments.delete(key);
    }
  }
}

function pruneExpiredLocalRecycleBin(): void {
  const now = Date.now();
  for (const [id, rec] of localRecycleBin.entries()) {
    if (new Date(rec.expiresAt).getTime() <= now) {
      localRecycleBin.delete(id);
    }
  }
}

function getLocalBioCooldown(username: string): BioDeleteCooldownInfo {
  const rec = localBioDeleteCooldowns.get(username);
  if (!rec) {
    return { active: false, deletedAt: null, unlockAt: null, remainingMs: 0 };
  }
  const remainingMs = new Date(rec.unlockAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    localBioDeleteCooldowns.delete(username);
    return { active: false, deletedAt: null, unlockAt: null, remainingMs: 0 };
  }
  return {
    active: true,
    deletedAt: rec.deletedAt,
    unlockAt: rec.unlockAt,
    remainingMs,
  };
}

let totalPurgedSinceBoot = 0;

function pruneExpiredAndBoundQueue(): void {
  const now = Date.now();
  for (const [id, pkt] of ephemeralQueue.entries()) {
    if (new Date(pkt.expiresAt).getTime() <= now) {
      ephemeralQueue.delete(id);
    }
  }
  while (ephemeralQueue.size >= MAX_QUEUE_PACKETS) {
    const oldestKey = ephemeralQueue.keys().next().value;
    if (!oldestKey) break;
    ephemeralQueue.delete(oldestKey);
  }
}

function pruneStaleQuotas(today: string): void {
  for (const [user, rec] of outboundQuotaCounter.entries()) {
    if (rec.date !== today) {
      outboundQuotaCounter.delete(user);
    }
  }
}

function seedInitialEphemeralPacketForUser(rawUser: string): void {
  pruneExpiredAndBoundQueue();
  const user = sanitizeHandle(rawUser);
  const existingForUser = Array.from(ephemeralQueue.values()).some(
    (p) => p.canonicalUser === user
  );
  if (existingForUser) return;

  const packetId = `cf-q-${user}-init`;
  if (!ephemeralQueue.has(packetId)) {
    ephemeralQueue.set(packetId, {
      id: packetId,
      rfcMessageId: `<cf-edge-routing-${Date.now()}@imy.li>`,
      canonicalUser: user,
      fromName: 'Cloudflare Email Routing Edge',
      fromAddress: 'routing-daemon@mail.vz.gay',
      toAddress: `${user}+edge-verify@imy.li`,
      plusTag: 'edge-verify',
      dotNormalized: false,
      subject: `[Transit Queue Ready] Paket masuk untuk ${user}+edge-verify@imy.li siap ditarik ke lokal`,
      bodyText: `Paket ini tertahan sementara di Ephemeral Transit Buffer Cloudflare Worker sambil menunggu perangkat ${user}@imy.li online.\n\nBegitu Anda menekan tombol "Tarik & Hapus dari Server (Pop & Purge)", pesan ini disimpan ke IndexedDB browser Anda dan langsung dihapus permanen dari memori Worker (Zero Server Mailbox Retention).`,
      receivedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  // Baseline security headers for local dev & Node preview
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-VZ-Zero-Retention', 'EPHEMERAL_POP_AND_PURGE');
    next();
  });

  // 0. GET /api/health
  app.get('/api/health', (_req, res) => {
    pruneExpiredAndBoundQueue();
    const hasCpanel = Boolean(process.env.CPANEL_RELAY_URL && process.env.CPANEL_RELAY_SECRET);
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    const hasBrevo = Boolean(process.env.BREVO_API_KEY);
    const activeOutboundProvider = hasCpanel
      ? 'cpanel_relay'
      : hasResend
        ? 'resend'
        : hasBrevo
          ? 'brevo'
          : 'none';

    res.json({
      ok: true,
      service: 'vzmail-local-dev',
      primaryDomain: 'imy.li',
      retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
      outboundProviderMode: (process.env.OUTBOUND_PROVIDER || 'auto').toLowerCase(),
      activeOutboundProvider,
      brevoKeyFormat: !process.env.BREVO_API_KEY
        ? 'missing'
        : process.env.BREVO_API_KEY.trim().startsWith('xkeysib-')
          ? 'v3_ready'
          : 'mcp_token_warning',
      linksStorageEngine: 'local-dev-memory',
      mediaStorageEngine: 'local-dev-memory',
      bindings: {
        mailTransitKv: true,
        linksKv: true,
        linksDb: false,
        linksMediaR2: false,
        imagesBinding: false,
        sendEmail: false,
        cpanelRelay: hasCpanel,
        resendApi: hasResend,
        brevoApi: hasBrevo,
        assets: true,
        relayAuthProtected: Boolean(process.env.RELAY_AUTH_TOKEN),
      },
      pendingInMemoryPackets: ephemeralQueue.size,
      timestamp: new Date().toISOString(),
    });
  });

  // 1. GET /api/mail/queue?username=fadhil
  app.get('/api/mail/queue', (req, res) => {
    pruneExpiredAndBoundQueue();
    const rawUser = String(req.query.username || 'fadhil');
    const user = sanitizeHandle(rawUser);

    const pending = Array.from(ephemeralQueue.values())
      .filter((pkt) => pkt.canonicalUser === user)
      .sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );

    const today = new Date().toISOString().slice(0, 10);
    pruneStaleQuotas(today);
    const quotaRec = outboundQuotaCounter.get(user);
    const usedToday = quotaRec && quotaRec.date === today ? quotaRec.count : 0;

    res.json({
      ok: true,
      kvBound: true,
      mode: 'local-dev-ephemeral',
      canonicalUser: user,
      primaryEmail: `${user}@imy.li`,
      pairedBioDomain: `${user}.imy.li`,
      pendingCount: pending.length,
      packets: pending,
      zeroRetentionStatus: {
        retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
        serverPermanentMailboxBytes: 0,
        totalPurgedReceipts: totalPurgedSinceBoot,
      },
      outboundQuota: {
        usedToday,
        dailyLimit: DAILY_OUTBOUND_LIMIT,
      },
    });
  });

  // 2. POST /api/mail/ack — Immediately purges pulled packet IDs owned by the requesting user
  app.post('/api/mail/ack', (req, res) => {
    const user = sanitizeHandle(String(req.body?.username || 'fadhil'));
    const packetIds: string[] = Array.isArray(req.body?.packetIds)
      ? req.body.packetIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const purgedIds: string[] = [];

    for (const id of packetIds.slice(0, 100)) {
      const existing = ephemeralQueue.get(id);
      if (existing && existing.canonicalUser === user) {
        ephemeralQueue.delete(id);
        purgedIds.push(id);
        totalPurgedSinceBoot += 1;
      }
    }

    const receiptCode = `PURGED-CF-${Date.now().toString(36).toUpperCase()}-${purgedIds.length}`;
    res.json({
      ok: true,
      kvBound: true,
      purgedCount: purgedIds.length,
      purgedIds,
      remainingInServerQueue: ephemeralQueue.size,
      receiptCode,
      purgedAt: new Date().toISOString(),
    });
  });

  // 3. POST /api/mail/simulate-inbound — Simulate an incoming email via Cloudflare Email Routing
  app.post('/api/mail/simulate-inbound', (req, res) => {
    pruneExpiredAndBoundQueue();

    const toAddress = stripHeaderInjection(
      String(req.body?.toAddress || 'fadhil@imy.li'),
      254
    ).toLowerCase();
    const fromAddress = stripHeaderInjection(
      String(req.body?.fromAddress || 'dimas@proton.me'),
      254
    ).toLowerCase();

    if (!isValidEmailAddress(toAddress) || !isValidEmailAddress(fromAddress)) {
      res.status(400).json({
        ok: false,
        error: 'Format alamat email pengirim atau tujuan tidak valid.',
      });
      return;
    }

    const fromName = sanitizeDisplayName(
      String(req.body?.fromName || 'Dimas Aditya'),
      fromAddress.split('@')[0]
    );
    const subject =
      stripHeaderInjection(
        String(
          req.body?.subject ||
            'Pengujian Cloudflare Email Routing + Alias Normalizer'
        ),
        250
      ) || '(Tanpa Subjek)';
    const bodyText = String(
      req.body?.bodyText ||
        `Halo!\n\nPesan ini dikirim ke ${toAddress} untuk menguji normalisasi alias (+ / .) dan antrean transit tanpa penyimpanan server permanen.`
    )
      .trim()
      .slice(0, MAX_EMAIL_BODY_CHARS);

    const resolved = resolveCanonicalEmail(toAddress, DEFAULT_SUPPORTED_DOMAINS);

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
      receivedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    ephemeralQueue.set(packetId, packet);

    res.json({
      ok: true,
      kvBound: true,
      queuedPacket: packet,
      resolvedIdentity: resolved,
    });
  });

  // 3.5 Ephemeral Email Attachment Upload & WhatsApp-Style One-Time Download (max 10 MB, 7-day TTL)
  const attachmentRawParser = express.raw({
    type: () => true,
    limit: '10mb',
  });

  app.post('/api/mail/attachments/upload', attachmentRawParser, (req, res) => {
    pruneExpiredLocalAttachments();
    const ownerUser = sanitizeHandle(String(req.query.ownerUser || 'fadhil'));
    const filename = sanitizeLocalFilename(String(req.query.filename || 'attachment.bin'));
    const mimeType = stripHeaderInjection(
      String(req.headers['content-type'] || 'application/octet-stream'),
      120
    )
      .split(';')[0]
      .trim()
      .toLowerCase();
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (buf.byteLength === 0) {
      res.status(400).json({ ok: false, error: 'File lampiran kosong.' });
      return;
    }
    if (buf.byteLength > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
      res.status(413).json({
        ok: false,
        error: 'Ukuran lampiran melebihi batas maksimal 10 MB per email.',
      });
      return;
    }

    const attId = generateSecureId('att');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAIL_ATTACHMENT_TTL_MS).toISOString();
    localEphemeralAttachments.set(buildLocalAttachmentKey(ownerUser, attId), {
      id: attId,
      ownerUser,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      bytes: buf,
      uploadedAt: now.toISOString(),
      expiresAt,
    });

    res.json({
      ok: true,
      id: attId,
      ephemeralId: attId,
      ephemeralOwner: ownerUser,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: buf.byteLength,
      expiresAt,
      storageEngine: 'local-dev-ephemeral',
    });
  });

  app.get('/api/mail/attachments/:ownerUser/:attId', (req, res) => {
    pruneExpiredLocalAttachments();
    const ownerUser = sanitizeHandle(String(req.params.ownerUser || ''));
    const attId = String(req.params.attId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const key = buildLocalAttachmentKey(ownerUser, attId);
    const stored = localEphemeralAttachments.get(key);
    if (!stored) {
      res.status(410).json({
        ok: false,
        code: 'EXPIRED_OR_PURGED',
        error:
          'Media ini sudah tidak ada di server (otomatis terhapus setelah diunduh atau melewati batas 7 hari). Minta pengirim untuk mengirim ulang.',
      });
      return;
    }
    // WhatsApp-style one-time download: purge immediately on serve
    localEphemeralAttachments.delete(key);
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${stored.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-VZ-R2-Purged', 'true');
    res.status(200).send(stored.bytes);
  });

  // 4. POST /api/mail/send — Dispatch outbound email via Cloudflare Email Sending relay (dev simulation)
  app.post('/api/mail/send', (req, res) => {
    pruneExpiredAndBoundQueue();
    pruneExpiredLocalAttachments();

    const senderUser = sanitizeHandle(String(req.body?.senderUser || 'fadhil'));
    const senderReserved = checkReservedUsername(senderUser);
    if (senderReserved.isReserved) {
      res.status(403).json({
        ok: false,
        error: `Username "${senderReserved.canonical}" dicadangkan untuk sistem resmi @imy.li.`,
      });
      return;
    }
    const rawFrom = stripHeaderInjection(
      String(req.body?.fromAddress || `${senderUser}@imy.li`),
      254
    ).toLowerCase();
    const toAddress = stripHeaderInjection(
      String(req.body?.toAddress || ''),
      254
    ).toLowerCase();
    const subject =
      stripHeaderInjection(String(req.body?.subject || '(Tanpa Subjek)'), 250) ||
      '(Tanpa Subjek)';
    const bodyText = String(req.body?.bodyText || '')
      .trim()
      .slice(0, MAX_EMAIL_BODY_CHARS);

    if (!isValidEmailAddress(toAddress)) {
      res.status(400).json({
        ok: false,
        error: 'Alamat tujuan email tidak valid.',
      });
      return;
    }

    if (!bodyText) {
      res.status(400).json({
        ok: false,
        error: 'Isi pesan email tidak boleh kosong.',
      });
      return;
    }

    const resolvedFrom = resolveCanonicalEmail(rawFrom, DEFAULT_SUPPORTED_DOMAINS);
    const safeFromAddress =
      resolvedFrom.isValid &&
      resolvedFrom.isSupportedDomain &&
      resolvedFrom.canonicalUsername === senderUser
        ? rawFrom
        : `${senderUser}@imy.li`;

    const today = new Date().toISOString().slice(0, 10);
    pruneStaleQuotas(today);
    const existingQuota = outboundQuotaCounter.get(senderUser);
    const currentCount =
      existingQuota && existingQuota.date === today ? existingQuota.count : 0;

    if (currentCount >= DAILY_OUTBOUND_LIMIT) {
      res.status(429).json({
        ok: false,
        error: `Kuota kirim harian (${DAILY_OUTBOUND_LIMIT}/hari) tercapai untuk menjaga reputasi domain @imy.li.`,
      });
      return;
    }

    // Resolve & validate attached temporary files (max 5 files, 10 MB total)
    const rawAttRefs = Array.isArray(req.body?.attachments)
      ? (req.body.attachments as Array<{ id?: string; ephemeralId?: string; filename?: string }>).slice(
          0,
          MAIL_ATTACHMENT_MAX_COUNT
        )
      : [];
    const loadedLocalAttachments: Array<{ key: string; item: StoredEphemeralAttachment }> = [];
    let totalBytes = 0;
    for (const ref of rawAttRefs) {
      const attId = String(ref.ephemeralId || ref.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!attId) continue;
      const key = buildLocalAttachmentKey(senderUser, attId);
      const item = localEphemeralAttachments.get(key);
      if (!item) {
        res.status(410).json({
          ok: false,
          error: `Lampiran "${ref.filename || attId}" sudah kedaluwarsa. Unggah ulang file sebelum mengirim.`,
        });
        return;
      }
      totalBytes += item.bytes.byteLength;
      if (totalBytes > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
        res.status(413).json({
          ok: false,
          error: 'Total ukuran seluruh lampiran melebihi batas maksimal 10 MB per email.',
        });
        return;
      }
      loadedLocalAttachments.push({ key, item });
    }

    outboundQuotaCounter.set(senderUser, {
      date: today,
      count: currentCount + 1,
    });

    const rfcMessageId = `<${generateSecureId('out')}@imy.li>`;
    const resolvedRecipient = resolveCanonicalEmail(toAddress, DEFAULT_SUPPORTED_DOMAINS);
    let routedLoopbackPacket: EphemeralMailPacket | null = null;

    if (resolvedRecipient.isValid && resolvedRecipient.isSupportedDomain) {
      const pktId = generateSecureId('cf-loop');
      const now = new Date();
      const recipientAttachments: EphemeralPacketAttachment[] = [];
      const expiresAt = new Date(now.getTime() + MAIL_ATTACHMENT_TTL_MS).toISOString();

      for (const { item } of loadedLocalAttachments) {
        const recAttId = generateSecureId('att');
        const recKey = buildLocalAttachmentKey(resolvedRecipient.canonicalUsername, recAttId);
        localEphemeralAttachments.set(recKey, {
          ...item,
          id: recAttId,
          ownerUser: resolvedRecipient.canonicalUsername,
          uploadedAt: now.toISOString(),
          expiresAt,
        });
        recipientAttachments.push({
          id: recAttId,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: item.bytes.byteLength,
          ephemeralId: recAttId,
          ephemeralOwner: resolvedRecipient.canonicalUsername,
          expiresAt,
        });
      }

      routedLoopbackPacket = {
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
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        attachments: recipientAttachments,
      };
      ephemeralQueue.set(pktId, routedLoopbackPacket);
    }

    // Purge sender's temporary uploads immediately after dispatch
    for (const { key } of loadedLocalAttachments) {
      localEphemeralAttachments.delete(key);
    }

    res.json({
      ok: true,
      kvBound: true,
      liveEmailDispatched: false,
      providerUsed: 'none',
      dispatchedVia: 'Local Dev Relay (simulasi pengiriman email & lampiran sementara)',
      rfcMessageId,
      sentAt: new Date().toISOString(),
      serverStoredCopy: false,
      r2AttachmentsPurged: loadedLocalAttachments.length,
      quota: {
        usedToday: currentCount + 1,
        dailyLimit: DAILY_OUTBOUND_LIMIT,
      },
      routedToImyQueue: Boolean(routedLoopbackPacket),
      resolvedRecipient,
    });
  });

  // 5. POST /api/mail/seed-transit — Seeds a sample transit packet when a user activates their mailbox
  app.post('/api/mail/seed-transit', (req, res) => {
    const user = sanitizeHandle(String(req.body?.username || 'fadhil'));
    seedInitialEphemeralPacketForUser(user);
    res.json({ ok: true, kvBound: true, username: user });
  });

  // 6. Standalone Shortlinks & Multi-Page Bio APIs (parity with Cloudflare Worker)
  app.get('/api/links/shortlinks', (req, res) => {
    const ownerParam = String(req.query.owner || '').trim();
    const slugsParam = String(req.query.slugs || '').trim();

    if (ownerParam) {
      const owner = sanitizeHandle(ownerParam);
      const items = Array.from(localShortlinks.values())
        .filter((r) => r.ownerUser === owner)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json({ ok: true, storageEngine: 'local-dev-memory', items });
      return;
    }

    if (slugsParam) {
      const slugs = slugsParam
        .split(',')
        .map((s) => sanitizeSlug(s))
        .filter(Boolean)
        .slice(0, 50);
      const items = slugs
        .map((s) => localShortlinks.get(s))
        .filter((r): r is ShortlinkRecord => Boolean(r));
      res.json({ ok: true, storageEngine: 'local-dev-memory', items });
      return;
    }

    res.json({ ok: true, storageEngine: 'local-dev-memory', items: [] });
  });

  app.post('/api/links/shortlinks', (req, res) => {
    const rawTarget = String(req.body?.targetUrl || '').trim();
    const withProtocol = /^https?:\/\//i.test(rawTarget) ? rawTarget : `https://${rawTarget}`;
    const safeTarget = sanitizeExternalUrl(withProtocol, {
      allowMailto: false,
      blockPrivateHosts: true,
    });
    if (!safeTarget) {
      res.status(400).json({
        ok: false,
        error: 'URL tujuan tidak valid atau diblokir. Gunakan alamat https:// publik yang sah.',
      });
      return;
    }

    const rawCustom = String(req.body?.customSlug ?? req.body?.slug ?? '').trim();
    let finalSlug = '';
    let isCustomSlug = false;

    if (rawCustom) {
      const cleanCustom = sanitizeShortlinkSlugInput(rawCustom);
      if (!cleanCustom) {
        res.status(400).json({
          ok: false,
          error:
            'Custom slug harus 2–48 karakter (huruf kecil, angka, tanda hubung) dan bukan kata sistem.',
        });
        return;
      }
      if (localShortlinks.has(cleanCustom)) {
        res.status(409).json({
          ok: false,
          error: `Slug "${cleanCustom}" sudah dipakai. Pilih slug lain atau kosongkan untuk kode acak.`,
        });
        return;
      }
      finalSlug = cleanCustom;
      isCustomSlug = true;
    } else {
      for (let i = 0; i < 6; i += 1) {
        const candidate = generateShortlinkCode(i < 4 ? 6 : 7);
        if (!localShortlinks.has(candidate)) {
          finalSlug = candidate;
          break;
        }
      }
      if (!finalSlug) finalSlug = generateShortlinkCode(8);
    }

    const ownerUser =
      typeof req.body?.ownerUser === 'string' && req.body.ownerUser.trim()
        ? sanitizeHandle(req.body.ownerUser)
        : null;
    const title = stripHeaderInjection(String(req.body?.title || ''), 120);

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
    localShortlinks.set(finalSlug, record);
    res.status(201).json({
      ok: true,
      storageEngine: 'local-dev-memory',
      shortUrl: `https://imy.li/s/${record.slug}`,
      record,
    });
  });

  app.delete('/api/links/shortlinks/:slug', (req, res) => {
    const slug = sanitizeSlug(String(req.params.slug || ''));
    const existing = localShortlinks.get(slug);
    const ownerParam = String(req.query.owner || '').trim();
    const ownerUser = ownerParam ? sanitizeHandle(ownerParam) : null;
    const mode = req.query.mode === 'recycle' ? 'recycle' : 'permanent';
    if (existing && existing.ownerUser && ownerUser && existing.ownerUser !== ownerUser) {
      res.status(403).json({
        ok: false,
        error: 'Anda tidak memiliki izin menghapus shortlink milik akun lain.',
      });
      return;
    }
    const deleted = localShortlinks.delete(slug);
    let recycleId: string | null = null;
    if (deleted && existing && mode === 'recycle' && ownerUser) {
      pruneExpiredLocalRecycleBin();
      const now = new Date();
      const rec: RecycleBinRecord = {
        id: generateSecureId('rb'),
        ownerUser,
        itemType: 'shortlink',
        label: `imy.li/s/${existing.slug}`,
        summary: existing.title || existing.targetUrl,
        payload: existing as unknown as Record<string, unknown>,
        deletedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + RECYCLE_BIN_RETENTION_MS).toISOString(),
      };
      localRecycleBin.set(rec.id, rec);
      recycleId = rec.id;
    }
    res.json({
      ok: true,
      storageEngine: 'local-dev-memory',
      deletedSlug: slug,
      deleted,
      mode,
      movedToRecycleBin: Boolean(recycleId),
      recycleId,
    });
  });

  // Recycle Bin API (14-Day Auto-Purge)
  app.get('/api/links/recycle-bin', (req, res) => {
    pruneExpiredLocalRecycleBin();
    const ownerParam = String(req.query.owner || '').trim();
    if (!ownerParam) {
      res.status(400).json({ ok: false, error: 'Parameter owner diperlukan.' });
      return;
    }
    const ownerUser = sanitizeHandle(ownerParam);
    const items = Array.from(localRecycleBin.values())
      .filter((r) => r.ownerUser === ownerUser)
      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
    res.json({
      ok: true,
      storageEngine: 'local-dev-memory',
      retentionDays: 14,
      items,
    });
  });

  app.post('/api/links/recycle-bin', (req, res) => {
    pruneExpiredLocalRecycleBin();
    const ownerUser = sanitizeHandle(String(req.body?.ownerUser || ''));
    const itemType = req.body?.itemType as RecycleBinItemType;
    if (itemType !== 'bio_link' && itemType !== 'bio_page' && itemType !== 'shortlink') {
      res.status(400).json({ ok: false, error: 'Tipe item Recycle Bin tidak valid.' });
      return;
    }
    const now = new Date();
    const record: RecycleBinRecord = {
      id: generateSecureId('rb'),
      ownerUser,
      itemType,
      label: String(req.body?.label || itemType).slice(0, 140),
      summary: String(req.body?.summary || '').slice(0, 260),
      payload:
        req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
      deletedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RECYCLE_BIN_RETENTION_MS).toISOString(),
    };
    localRecycleBin.set(record.id, record);
    res.status(201).json({ ok: true, record });
  });

  app.post('/api/links/recycle-bin/restore', (req, res) => {
    pruneExpiredLocalRecycleBin();
    const ownerUser = sanitizeHandle(String(req.body?.ownerUser || ''));
    const id = String(req.body?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const item = localRecycleBin.get(id);
    if (!item || item.ownerUser !== ownerUser) {
      res.status(404).json({
        ok: false,
        error: 'Item tidak ditemukan atau sudah kedaluwarsa (> 14 hari).',
      });
      return;
    }

    if (item.itemType === 'shortlink') {
      const rawPayload = item.payload as Partial<ShortlinkRecord>;
      const safeTarget = sanitizeExternalUrl(String(rawPayload.targetUrl || ''), {
        allowMailto: false,
        blockPrivateHosts: true,
      });
      if (!safeTarget) {
        localRecycleBin.delete(id);
        res.status(400).json({ ok: false, error: 'URL shortlink tidak valid.' });
        return;
      }
      let targetSlug =
        sanitizeShortlinkSlugInput(String(rawPayload.slug || '')) || generateShortlinkCode(6);
      const conflict = localShortlinks.has(targetSlug);
      if (conflict) targetSlug = generateShortlinkCode(7);
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
      localShortlinks.set(restored.slug, restored);
      localRecycleBin.delete(id);
      res.json({ ok: true, itemType: 'shortlink', restoredSlug: restored.slug, record: restored });
      return;
    }

    const cooldown = getLocalBioCooldown(ownerUser);
    if (cooldown.active) {
      res.status(429).json({
        ok: false,
        error: 'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen.',
        cooldown,
      });
      return;
    }

    const existing = localBioWorkspaces.get(ownerUser);
    if (!existing) {
      res.status(400).json({
        ok: false,
        error: 'Simpan profil Bio utama terlebih dahulu sebelum memulihkan item ini.',
      });
      return;
    }

    if (item.itemType === 'bio_page') {
      const pagePayload = item.payload as Partial<BioPageRecord>;
      const baseSlug =
        sanitizePageSlug(String(pagePayload.pageSlug || '')) ||
        `page-${Date.now().toString(36).slice(-4)}`;
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
      const updated = sanitizeBioWorkspaceInput(ownerUser, {
        ...existing,
        pages: [...existing.pages, restoredPage],
      });
      localBioWorkspaces.set(ownerUser, updated);
      localRecycleBin.delete(id);
      res.json({ ok: true, itemType: 'bio_page', data: updated });
      return;
    }

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
    const updated = sanitizeBioWorkspaceInput(ownerUser, { ...existing, pages: nextPages });
    localBioWorkspaces.set(ownerUser, updated);
    localRecycleBin.delete(id);
    res.json({ ok: true, itemType: 'bio_link', data: updated });
  });

  app.delete('/api/links/recycle-bin', (req, res) => {
    const ownerParam = String(req.query.owner || '').trim();
    if (!ownerParam) {
      res.status(400).json({ ok: false, error: 'Parameter owner diperlukan.' });
      return;
    }
    const ownerUser = sanitizeHandle(ownerParam);
    let purgedCount = 0;
    for (const [id, rec] of localRecycleBin.entries()) {
      if (rec.ownerUser === ownerUser) {
        localRecycleBin.delete(id);
        purgedCount += 1;
      }
    }
    res.json({ ok: true, purgedCount });
  });

  app.delete('/api/links/recycle-bin/:id', (req, res) => {
    const ownerParam = String(req.query.owner || '').trim();
    if (!ownerParam) {
      res.status(400).json({ ok: false, error: 'Parameter owner diperlukan.' });
      return;
    }
    const ownerUser = sanitizeHandle(ownerParam);
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const existing = localRecycleBin.get(id);
    if (existing && existing.ownerUser === ownerUser) {
      localRecycleBin.delete(id);
    }
    res.json({ ok: true, deletedId: id });
  });

  app.patch('/api/links/bio/:username/status', (req, res) => {
    const username = sanitizeHandle(String(req.params.username || ''));
    const reserved = checkReservedUsername(username);
    if (reserved.isReserved) {
      res.status(403).json({
        ok: false,
        error: `Username "${reserved.canonical}" dicadangkan untuk sistem.`,
      });
      return;
    }
    const existing = localBioWorkspaces.get(username);
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Profil Bio belum tersimpan di server.' });
      return;
    }
    const isDeactivated = req.body?.isDeactivated === true;
    const saved: BioWorkspaceData = {
      ...existing,
      isDeactivated,
      deactivatedAt: isDeactivated ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    localBioWorkspaces.set(username, saved);
    res.json({ ok: true, storageEngine: 'local-dev-memory', data: saved });
  });

  app.get('/api/links/bio/:username', (req, res) => {
    const username = sanitizeHandle(String(req.params.username || ''));
    const reserved = checkReservedUsername(username);
    const data = localBioWorkspaces.get(username) || null;
    const cooldown = getLocalBioCooldown(username);
    res.json({
      ok: true,
      storageEngine: 'local-dev-memory',
      configured: Boolean(data),
      username,
      reserved: reserved.isReserved,
      cooldown,
      data,
    });
  });

  app.put('/api/links/bio/:username', (req, res) => {
    const username = sanitizeHandle(String(req.params.username || ''));
    const reserved = checkReservedUsername(username);
    if (reserved.isReserved) {
      res.status(403).json({
        ok: false,
        error: `Username "${reserved.canonical}" dicadangkan untuk sistem resmi imy.li dan tidak dapat diklaim.`,
      });
      return;
    }
    const cooldown = getLocalBioCooldown(username);
    if (cooldown.active) {
      res.status(429).json({
        ok: false,
        error:
          'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen untuk mencegah penyalahgunaan database.',
        cooldown,
      });
      return;
    }
    const existing = localBioWorkspaces.get(username);
    const existingClicks = new Map<string, number>();
    if (existing) {
      for (const p of existing.pages) {
        for (const l of p.links) {
          existingClicks.set(l.id, l.clicks);
        }
      }
    }
    const saved = sanitizeBioWorkspaceInput(username, req.body, existingClicks);
    localBioWorkspaces.set(username, saved);
    res.json({
      ok: true,
      storageEngine: 'local-dev-memory',
      configured: true,
      cooldown: { active: false, deletedAt: null, unlockAt: null, remainingMs: 0 },
      data: saved,
    });
  });

  app.delete('/api/links/bio/:username', (req, res) => {
    const username = sanitizeHandle(String(req.params.username || ''));
    localBioWorkspaces.delete(username);
    for (const key of Array.from(localBioAvatars.keys())) {
      if (key.startsWith(`avatars/${username}/`)) {
        localBioAvatars.delete(key);
      }
    }
    const now = new Date();
    const deletedAt = now.toISOString();
    const unlockAt = new Date(now.getTime() + BIO_DELETE_COOLDOWN_MS).toISOString();
    localBioDeleteCooldowns.set(username, { deletedAt, unlockAt });
    res.json({
      ok: true,
      storageEngine: 'local-dev-memory',
      deleted: true,
      username,
      cooldown: {
        active: true,
        deletedAt,
        unlockAt,
        remainingMs: BIO_DELETE_COOLDOWN_MS,
      },
    });
  });

  app.post('/api/links/bio-click', (req, res) => {
    const username = sanitizeHandle(String(req.body?.username || ''));
    const pageSlug = sanitizePageSlug(String(req.body?.pageSlug || '')) ?? '';
    const linkId = String(req.body?.linkId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80);
    const workspace = localBioWorkspaces.get(username);
    if (!workspace || !linkId) {
      res.json({ ok: true, clicks: null });
      return;
    }
    let clicks: number | null = null;
    const nextPages = workspace.pages.map((p) => {
      if (p.pageSlug !== pageSlug) return p;
      return {
        ...p,
        links: p.links.map((l) => {
          if (l.id !== linkId) return l;
          clicks = l.clicks + 1;
          return { ...l, clicks };
        }),
      };
    });
    if (clicks !== null) {
      localBioWorkspaces.set(username, { ...workspace, pages: nextPages });
    }
    res.json({ ok: true, clicks });
  });

  // 7. Dedicated Bio Link Image-to-AVIF Avatar Endpoints (parity with Cloudflare Worker Images + R2)
  const avatarRawParser = express.raw({
    type: () => true,
    limit: '10mb',
  });

  const resolveAvatarKey = (rawUser: string, rawPage?: string) => {
    const username = sanitizeHandle(rawUser);
    const pageSlug = rawPage ? sanitizePageSlug(rawPage) : '';
    if (pageSlug === null) return null;
    const key = pageSlug ? `avatars/${username}/page-${pageSlug}` : `avatars/${username}/main`;
    return { username, pageSlug, key };
  };

  const handleGetAvatar: express.RequestHandler = (req, res) => {
    const resolved = resolveAvatarKey(String(req.params.username || ''), req.params.pageSlug);
    if (!resolved) {
      res.status(400).end();
      return;
    }
    const stored = localBioAvatars.get(resolved.key);
    if (!stored) {
      res.status(404).setHeader('Cache-Control', 'no-store').end();
      return;
    }
    res.setHeader('Content-Type', stored.contentType);
    res.setHeader(
      'Cache-Control',
      req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).send(stored.bytes);
  };

  const handlePutAvatar: express.RequestHandler = (req, res) => {
    const resolved = resolveAvatarKey(String(req.params.username || ''), req.params.pageSlug);
    if (!resolved) {
      res.status(400).json({ ok: false, error: 'Parameter avatar tidak valid.' });
      return;
    }
    const reserved = checkReservedUsername(resolved.username);
    if (reserved.isReserved) {
      res.status(403).json({
        ok: false,
        error: `Username "${reserved.canonical}" dicadangkan untuk sistem.`,
      });
      return;
    }
    const cooldown = getLocalBioCooldown(resolved.username);
    if (cooldown.active) {
      res.status(429).json({
        ok: false,
        error: 'Profil Bio sedang dalam masa tunggu 3 hari pasca penghapusan permanen.',
        cooldown,
      });
      return;
    }
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.byteLength === 0 || buf.byteLength > AVATAR_RAW_UPLOAD_MAX_BYTES) {
      res.status(413).json({
        ok: false,
        error: 'Ukuran gambar sumber maksimal 10 MB.',
      });
      return;
    }
    const u8 = new Uint8Array(buf);
    const sourceMime = detectRawImageMime(u8);
    if (!sourceMime) {
      res.status(400).json({
        ok: false,
        error: 'Format berkas tidak dikenali sebagai gambar yang aman.',
      });
      return;
    }
    const compactMime = detectValidatedAvatarMime(u8);
    const finalMime = compactMime || sourceMime;
    const convertedBy =
      compactMime === 'image/avif'
        ? 'client-avif'
        : compactMime === 'image/webp'
          ? 'client-webp-fallback'
          : 'local-dev-raw';

    localBioAvatars.set(resolved.key, {
      bytes: buf,
      contentType: finalMime,
      updatedAt: new Date().toISOString(),
    });
    const version = Date.now().toString(36);
    const avatarUrl = resolved.pageSlug
      ? `/api/links/avatar/${encodeURIComponent(resolved.username)}/${encodeURIComponent(resolved.pageSlug)}?v=${version}`
      : `/api/links/avatar/${encodeURIComponent(resolved.username)}?v=${version}`;

    res.json({
      ok: true,
      avatarUrl,
      contentType: finalMime,
      sourceMime,
      sourceBytes: buf.byteLength,
      byteSize: buf.byteLength,
      convertedBy,
      mediaStorageEngine: 'local-dev-memory',
    });
  };

  const handleDeleteAvatar: express.RequestHandler = (req, res) => {
    const resolved = resolveAvatarKey(String(req.params.username || ''), req.params.pageSlug);
    if (!resolved) {
      res.status(400).json({ ok: false, error: 'Parameter avatar tidak valid.' });
      return;
    }
    localBioAvatars.delete(resolved.key);
    res.json({
      ok: true,
      deleted: true,
      username: resolved.username,
      pageSlug: resolved.pageSlug,
    });
  };

  app.get('/api/links/avatar/:username', handleGetAvatar);
  app.get('/api/links/avatar/:username/:pageSlug', handleGetAvatar);
  app.put('/api/links/avatar/:username', avatarRawParser, handlePutAvatar);
  app.put('/api/links/avatar/:username/:pageSlug', avatarRawParser, handlePutAvatar);
  app.delete('/api/links/avatar/:username', handleDeleteAvatar);
  app.delete('/api/links/avatar/:username/:pageSlug', handleDeleteAvatar);

  // Same-Origin Domain Verification Proxy (`GET /api/mail/verify-domain?domain=...`)
  app.get('/api/mail/verify-domain', async (req, res) => {
    const rawDomain = String(req.query.domain || '').trim().slice(0, 253);
    if (!rawDomain) {
      res.status(400).json({ ok: false, error: 'Parameter domain diperlukan.' });
      return;
    }
    const result = await verifyDomainAtEdge(rawDomain);
    if (!result) {
      res.status(400).json({ ok: false, error: 'Format domain tidak valid.' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json(result);
  });

  // Non-AI VZ Search Grounding Proxy (`GET /api/mail/vz-search?q=...&page=...`)
  app.get('/api/mail/vz-search', async (req, res) => {
    const rawQ = String(req.query.q || '').trim().slice(0, 240);
    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const page = Number.isFinite(rawPage) ? Math.min(20, Math.max(1, rawPage)) : 1;

    if (!rawQ) {
      res.status(400).json({ ok: false, error: 'Parameter pencarian q diperlukan.' });
      return;
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
        res.status(502).json({
          ok: false,
          query: rawQ,
          page,
          searchUrl: searchPageUrl,
          error: data?.error || 'Tidak dapat memuat hasil dari search.vz.gay saat ini.',
        });
        return;
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

      res.json({
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
      res.status(502).json({
        ok: false,
        query: rawQ,
        page,
        searchUrl: searchPageUrl,
        error: 'Gagal menghubungi layanan search.vz.gay.',
      });
    }
  });

  app.get('/s/:slug', (req, res, next) => {
    const slug = sanitizeSlug(String(req.params.slug || ''));
    const record = localShortlinks.get(slug);
    if (record) {
      record.clicks += 1;
      record.lastClickedAt = new Date().toISOString();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.redirect(302, record.targetUrl);
      return;
    }
    next();
  });

  // Dynamic Host-Aware SEO & AI Crawler Discovery Routes (parity with Cloudflare Worker)
  app.get('/robots.txt', (req, res) => {
    const host = String(req.hostname || 'mail.vz.gay').toLowerCase();
    const isBioSub =
      host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li';
    let bioMode = undefined;
    if (isBioSub) {
      const bioUser = sanitizeHandle(host.slice(0, -'.imy.li'.length));
      const ws = localBioWorkspaces.get(bioUser);
      bioMode =
        ws && ws.configured && !ws.isDeactivated
          ? sanitizeBioIndexingMode(ws.indexingMode)
          : ('none' as const);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(buildHostRobotsTxt(host, bioMode));
  });

  app.get('/sitemap.xml', (req, res) => {
    const host = String(req.hostname || 'mail.vz.gay').toLowerCase();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buildHostSitemapXml(host));
  });

  app.get('/llms.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buildLlmsTxt());
  });

  app.get('/llms-full.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buildLlmsFullTxt());
  });

  // Return JSON 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint API tidak ditemukan.' });
  });

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE) ||
    process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1d' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `VZ Mail & VZ Links 2-in-1 Edge Server running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
