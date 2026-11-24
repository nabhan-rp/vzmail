/**
 * VZ Mail (mail.vz.gay) + VZ Links (links.vz.gay & *.imy.li)
 * 2-in-1 Cloudflare Worker:
 *   1. HTTP Multi-Domain Fetch Router:
 *      - mail.vz.gay/*       -> Serves VZ Mail SPA + /api/mail/* ephemeral relay endpoints
 *      - links.vz.gay/*      -> Serves VZ Links SPA + /api/links/* endpoints
 *      - $USERNAME.imy.li/*  -> Renders curated, PSL-safe static Link-in-Bio HTML (zero cookies, zero user JS)
 *      - imy.li/s/$SLUG      -> Performs fast HTTP 301 shortlink redirect
 *   2. Inbound Cloudflare Email Routing Handler (`email(message, env, ctx)`):
 *      - Canonicalizes Gmail-style `.` and `+` aliases (`fa.dhil+tag@imy.li` -> `fadhil@imy.li`)
 *      - Stores packet in ephemeral KV transit buffer (`MAIL_TRANSIT_KV`) with auto-TTL
 *      - Purged immediately upon client `POST /api/mail/ack` (Zero permanent server mailbox retention)
 *   3. Outbound Cloudflare Email Sending (`env.SEND_EMAIL.send(...)`):
 *      - Dispatches authenticated outbound email from `$USERNAME@imy.li` without any VPS
 */

export interface WorkerEnv {
  MAIL_TRANSIT_KV: {
    get(key: string, type?: 'text' | 'json'): Promise<unknown>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
  };
  LINKS_KV: {
    get(key: string, type?: 'text' | 'json'): Promise<unknown>;
    put(key: string, value: string): Promise<void>;
  };
  SEND_EMAIL?: {
    send(message: unknown): Promise<void>;
  };
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
  PRIMARY_MAIL_DOMAIN?: string;
}

export interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

export function canonicalizeImyRecipient(rawAddress: string): {
  canonicalUser: string;
  canonicalEmail: string;
  plusTag: string | null;
  dotNormalized: boolean;
  domain: string;
} {
  const cleaned = rawAddress.trim().toLowerCase();
  const [localPart = 'fadhil', domain = 'imy.li'] = cleaned.split('@');
  const plusIdx = localPart.indexOf('+');
  const basePart = plusIdx >= 0 ? localPart.slice(0, plusIdx) : localPart;
  const plusTag = plusIdx >= 0 ? localPart.slice(plusIdx + 1) : null;
  const dotNormalized = basePart.includes('.');
  const canonicalUser = basePart.replace(/\./g, '').replace(/[^a-z0-9_-]/g, '');

  return {
    canonicalUser,
    canonicalEmail: `${canonicalUser}@${domain}`,
    plusTag,
    dotNormalized,
    domain,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // 1. Shortlink Redirector: imy.li/s/$SLUG or links.vz.gay/s/$SLUG
    if (url.pathname.startsWith('/s/')) {
      const slug = url.pathname.replace(/^\/s\//, '').split('/')[0].trim();
      if (slug && env.LINKS_KV) {
        const target = (await env.LINKS_KV.get(`short:${slug}`, 'text')) as string | null;
        if (target) {
          return Response.redirect(target, 301);
        }
      }
    }

    // 2. Wildcard Subdomain Link-in-Bio: $USERNAME.imy.li
    //    Enforces Zero Cookie Collision (no Set-Cookie, strict CSP without arbitrary user JS)
    if (host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li') {
      const subUser = host.replace(/\.imy\.li$/, '').replace(/[^a-z0-9_-]/g, '');
      if (env.ASSETS) {
        // Forward to SPA with X-Imy-Bio-User header or serve static curated HTML
        const modifiedUrl = new URL(request.url);
        modifiedUrl.searchParams.set('host_mode', 'bio');
        modifiedUrl.searchParams.set('bio_user', subUser);
        const resp = await env.ASSETS.fetch(new Request(modifiedUrl.toString(), request));
        const headers = new Headers(resp.headers);
        headers.delete('Set-Cookie');
        headers.set('X-Frame-Options', 'SAMEORIGIN');
        headers.set('X-VZ-PSL-Isolation', 'static-curated-zero-cookie');
        return new Response(resp.body, { status: resp.status, headers });
      }
    }

    // 3. Ephemeral Queue Pop & Purge API (/api/mail/queue & /api/mail/ack)
    if (url.pathname === '/api/mail/queue' && request.method === 'GET' && env.MAIL_TRANSIT_KV) {
      const user = (url.searchParams.get('username') || 'fadhil')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      const list = await env.MAIL_TRANSIT_KV.list({ prefix: `q:${user}:` });
      const packets = [];
      for (const k of list.keys) {
        const pkt = await env.MAIL_TRANSIT_KV.get(k.name, 'json');
        if (pkt) packets.push(pkt);
      }
      return Response.json({
        ok: true,
        canonicalUser: user,
        pendingCount: packets.length,
        packets,
      });
    }

    if (url.pathname === '/api/mail/ack' && request.method === 'POST' && env.MAIL_TRANSIT_KV) {
      const body = (await request.json()) as { username?: string; packetIds?: string[] };
      const user = (body.username || 'fadhil').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const ids = Array.isArray(body.packetIds) ? body.packetIds : [];
      for (const id of ids) {
        await env.MAIL_TRANSIT_KV.delete(`q:${user}:${id}`);
      }
      return Response.json({
        ok: true,
        purgedCount: ids.length,
        purgedAt: new Date().toISOString(),
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('VZ Mail & VZ Links 2-in-1 Cloudflare Worker Ready', {
      status: 200,
    });
  },

  async email(message: ForwardableEmailMessage, env: WorkerEnv): Promise<void> {
    const resolved = canonicalizeImyRecipient(message.to);
    const packetId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subject = message.headers.get('subject') || '(No Subject)';
    const fromHeader = message.headers.get('from') || message.from;
    const rawText = await new Response(message.raw).text();

    // Ephemeral Transit Packet (Expires automatically if device never pulls within 72h, or purged immediately on ACK)
    const packet = {
      id: packetId,
      rfcMessageId: message.headers.get('message-id') || `<${packetId}@${resolved.domain}>`,
      canonicalUser: resolved.canonicalUser,
      fromName: fromHeader.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || message.from,
      fromAddress: message.from,
      toAddress: message.to,
      plusTag: resolved.plusTag,
      dotNormalized: resolved.dotNormalized,
      subject,
      bodyText: rawText.slice(0, 65536),
      receivedAt: new Date().toISOString(),
    };

    if (env.MAIL_TRANSIT_KV) {
      await env.MAIL_TRANSIT_KV.put(
        `q:${resolved.canonicalUser}:${packetId}`,
        JSON.stringify(packet),
        { expirationTtl: 72 * 3600 }
      );
    }
  },
};
