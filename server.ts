import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { resolveCanonicalEmail, sanitizeHandle } from './src/utils/mailIdentity.ts';

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

// Ephemeral in-memory edge buffer (Zero permanent retention: purged immediately upon client ACK)
const ephemeralQueue: Map<string, EphemeralMailPacket> = new Map();

// Daily outbound sender quota tracker per user to protect imy.li reputation
const outboundQuotaCounter: Map<string, { date: string; count: number }> = new Map();
const DAILY_OUTBOUND_LIMIT = 25;

let totalPurgedSinceBoot = 0;

function seedInitialEphemeralPacketForUser(rawUser: string) {
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
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // 1. GET /api/mail/queue?username=fadhil
  app.get('/api/mail/queue', (req, res) => {
    const rawUser = String(req.query.username || 'fadhil');
    const user = sanitizeHandle(rawUser);

    const pending = Array.from(ephemeralQueue.values()).filter(
      (pkt) => pkt.canonicalUser === user
    );

    const today = new Date().toISOString().slice(0, 10);
    const quotaRec = outboundQuotaCounter.get(user);
    const usedToday = quotaRec && quotaRec.date === today ? quotaRec.count : 0;

    res.json({
      ok: true,
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

  // 2. POST /api/mail/ack — Immediately purges pulled packet IDs from the ephemeral queue
  app.post('/api/mail/ack', (req, res) => {
    const packetIds: string[] = Array.isArray(req.body?.packetIds)
      ? req.body.packetIds
      : [];
    const purgedIds: string[] = [];

    for (const id of packetIds) {
      if (ephemeralQueue.has(id)) {
        ephemeralQueue.delete(id);
        purgedIds.push(id);
        totalPurgedSinceBoot += 1;
      }
    }

    const receiptCode = `PURGED-CF-${Date.now().toString(36).toUpperCase()}-${purgedIds.length}`;
    res.json({
      ok: true,
      purgedCount: purgedIds.length,
      purgedIds,
      remainingInServerQueue: ephemeralQueue.size,
      receiptCode,
      purgedAt: new Date().toISOString(),
    });
  });

  // 3. POST /api/mail/simulate-inbound — Simulate an incoming email via Cloudflare Email Routing
  app.post('/api/mail/simulate-inbound', (req, res) => {
    const toAddress = String(req.body?.toAddress || 'fadhil@imy.li').trim();
    const fromName = String(req.body?.fromName || 'Dimas Aditya').trim();
    const fromAddress = String(
      req.body?.fromAddress || 'dimas@proton.me'
    ).trim();
    const subject = String(
      req.body?.subject || 'Pengujian Cloudflare Email Routing + Alias Normalizer'
    ).trim();
    const bodyText = String(
      req.body?.bodyText ||
        `Halo!\n\nPesan ini dikirim ke ${toAddress} untuk menguji normalisasi alias (+ / .) dan antrean transit tanpa penyimpanan server permanen.`
    ).trim();

    const resolved = resolveCanonicalEmail(toAddress, [
      'imy.li',
      'vz.gay',
      'mail.vz.gay',
      'imy.pw',
    ]);

    const packetId = `cf-pkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const packet: EphemeralMailPacket = {
      id: packetId,
      rfcMessageId: `<inbound-${Date.now()}@${resolved.domain}>`,
      canonicalUser: resolved.canonicalUsername,
      fromName,
      fromAddress,
      toAddress: resolved.rawInput.trim().toLowerCase(),
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
      queuedPacket: packet,
      resolvedIdentity: resolved,
    });
  });

  // 4. POST /api/mail/send — Dispatch outbound email via Cloudflare Email Sending relay
  app.post('/api/mail/send', (req, res) => {
    const senderUser = sanitizeHandle(String(req.body?.senderUser || 'fadhil'));
    const fromAddress = String(
      req.body?.fromAddress || `${senderUser}@imy.li`
    ).toLowerCase();
    const toAddress = String(req.body?.toAddress || '').trim().toLowerCase();
    const subject = String(req.body?.subject || '(Tanpa Subjek)').trim();
    const bodyText = String(req.body?.bodyText || '').trim();

    if (!toAddress || !toAddress.includes('@')) {
      res.status(400).json({
        ok: false,
        error: 'Alamat tujuan email tidak valid.',
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
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

    const rfcMessageId = `<out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@imy.li>`;

    // If recipient is an @imy.li address, also route into ephemeral inbound queue using canonical resolution
    const resolvedRecipient = resolveCanonicalEmail(toAddress, [
      'imy.li',
      'vz.gay',
      'mail.vz.gay',
      'imy.pw',
    ]);
    let routedLoopbackPacket: EphemeralMailPacket | null = null;

    if (resolvedRecipient.isSupportedDomain) {
      const pktId = `cf-loop-${Date.now()}`;
      routedLoopbackPacket = {
        id: pktId,
        rfcMessageId,
        canonicalUser: resolvedRecipient.canonicalUsername,
        fromName: senderUser,
        fromAddress,
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
      dispatchedVia: 'Cloudflare Email Sending Worker (send_email binding)',
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
    res.json({ ok: true, username: user });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
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
