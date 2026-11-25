import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
}

const MAX_QUEUE_PACKETS = 500;
const MAX_EMAIL_BODY_CHARS = 64 * 1024;
const DAILY_OUTBOUND_LIMIT = 25;

// Ephemeral in-memory local dev buffer (Zero permanent retention: purged immediately upon client ACK)
const ephemeralQueue: Map<string, EphemeralMailPacket> = new Map();
const outboundQuotaCounter: Map<string, { date: string; count: number }> = new Map();
const localShortlinks: Map<string, string> = new Map();

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
    res.json({
      ok: true,
      service: 'vzmail-local-dev',
      primaryDomain: 'imy.li',
      retentionPolicy: 'EPHEMERAL_POP_AND_PURGE',
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

  // 4. POST /api/mail/send — Dispatch outbound email via Cloudflare Email Sending relay (dev simulation)
  app.post('/api/mail/send', (req, res) => {
    pruneExpiredAndBoundQueue();

    const senderUser = sanitizeHandle(String(req.body?.senderUser || 'fadhil'));
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

    outboundQuotaCounter.set(senderUser, {
      date: today,
      count: currentCount + 1,
    });

    const rfcMessageId = `<${generateSecureId('out')}@imy.li>`;
    const resolvedRecipient = resolveCanonicalEmail(toAddress, DEFAULT_SUPPORTED_DOMAINS);
    let routedLoopbackPacket: EphemeralMailPacket | null = null;

    if (resolvedRecipient.isValid && resolvedRecipient.isSupportedDomain) {
      const pktId = generateSecureId('cf-loop');
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
        receivedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      };
      ephemeralQueue.set(pktId, routedLoopbackPacket);
    }

    res.json({
      ok: true,
      kvBound: true,
      liveEmailDispatched: false,
      dispatchedVia: 'Local Dev Relay (Cloudflare Email Sending send_email simulation)',
      rfcMessageId,
      sentAt: new Date().toISOString(),
      serverStoredCopy: false,
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

  // 6. Local shortlink sync & 301 redirector parity with Cloudflare Worker
  app.post('/api/links/shortlinks', (req, res) => {
    const slug = sanitizeSlug(String(req.body?.slug || ''));
    const safeTarget = sanitizeExternalUrl(String(req.body?.targetUrl || ''), {
      allowMailto: false,
      blockPrivateHosts: true,
    });
    if (!slug || !safeTarget) {
      res.status(400).json({ ok: false, error: 'Slug atau URL tujuan tidak valid.' });
      return;
    }
    localShortlinks.set(slug, safeTarget);
    res.json({ ok: true, kvBound: true, slug, targetUrl: safeTarget });
  });

  app.delete('/api/links/shortlinks/:slug', (req, res) => {
    const slug = sanitizeSlug(String(req.params.slug || ''));
    localShortlinks.delete(slug);
    res.json({ ok: true, kvBound: true, deletedSlug: slug });
  });

  app.get('/s/:slug', (req, res, next) => {
    const slug = sanitizeSlug(String(req.params.slug || ''));
    const target = localShortlinks.get(slug);
    if (target) {
      res.redirect(301, target);
      return;
    }
    next();
  });

  // Return JSON 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint API tidak ditemukan.' });
  });

  if (process.env.NODE_ENV !== 'production') {
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
