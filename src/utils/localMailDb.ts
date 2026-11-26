import {
  INITIAL_MAIL_DOMAINS,
  resolveCanonicalEmail,
  sanitizeHandle,
  type MailDomainOption,
} from './mailIdentity';
import {
  generateSecureId,
  sanitizeExternalUrl,
  sanitizeSlug,
} from './mailSecurity';

export type MailFolder =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'starred'
  | 'plus_aliases'
  | 'archive'
  | 'trash';

export interface MailAddressParty {
  name: string;
  address: string;
}

export interface MailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentText?: string;
  /** Local offline binary payload (base64) stored on device after sending or downloading from R2 */
  localDataBase64?: string;
  /** Ephemeral R2 attachment ID for one-time WhatsApp-style download before auto-purge */
  ephemeralId?: string;
  /** Owner canonical username for ephemeral R2 lookup */
  ephemeralOwner?: string;
  /** ISO expiration timestamp (max 7 days in R2 before permanent purge) */
  expiresAt?: string;
  /** Lifecycle status: saved locally on device, waiting in ephemeral R2, or purged/expired */
  storageStatus?: 'local_saved' | 'ephemeral_r2' | 'expired_purged';
}

export interface LocalMailMessage {
  id: string;
  rfcMessageId: string;
  ownerUser: string; // canonical username e.g. 'fadhil'
  threadId: string; // correspondent email address for conversational view
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';
  direction: 'inbound' | 'outbound';
  from: MailAddressParty;
  to: MailAddressParty[];
  cc: MailAddressParty[];
  deliveredToAlias: string; // e.g. 'fa.dhil+github@imy.li' or 'fadhil@imy.li'
  plusTag: string | null;
  dotNormalized: boolean;
  subject: string;
  bodyText: string;
  timestamp: string; // ISO 8601
  read: boolean;
  starred: boolean;
  verifiedSpfDkim: boolean;
  dmarcPolicy: 'pass (p=quarantine)' | 'pass (p=reject)' | 'local-relay';
  ephemeralQueueReceipt?: string; // Proof that server purged message upon local pull
  chatBridgeChannel?: string | null; // Optional bridge link with chat.vz.gay
  attachments: MailAttachment[];
}

export interface BioLinkCardItem {
  id: string;
  title: string;
  url: string;
  subtitle: string;
  category: 'social' | 'project' | 'document' | 'contact';
  clicks: number;
  enabled: boolean;
}

export interface ImyBioProfile {
  username: string; // e.g. 'fadhil' -> fadhil.imy.li
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  showPublicEmailButton: boolean;
  publicEmailAlias: string; // e.g. 'fadhil+contact@imy.li' or 'fadhil@imy.li'
  themeVariant: 'slate_minimal' | 'cobalt_swiss' | 'carbon_mono';
  links: BioLinkCardItem[];
  updatedAt: string;
}

export interface ImyShortlink {
  slug: string; // e.g. 'cv' -> imy.li/s/cv
  ownerUser: string;
  title: string;
  targetUrl: string;
  clicks: number;
  createdAt: string;
  safeBrowsingVerified: boolean;
}

const DB_NAME = 'vz_mail_links_local_db_v1';
const DB_VERSION = 1;

// Singleton cached DB promise to avoid leaking IDBDatabase connections on every call
let cachedDbPromise: Promise<IDBDatabase | null> | null = null;

// Graceful in-memory fallback when IndexedDB is unavailable (e.g. strict private browsing / sandboxed iframe)
const memoryFallback = {
  messages: new Map<string, LocalMailMessage>(),
  bioProfiles: new Map<string, ImyBioProfile>(),
  shortlinks: new Map<string, ImyShortlink>(),
  domains: new Map<string, MailDomainOption>(),
};

function openLocalDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  cachedDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by_owner', 'ownerUser', { unique: false });
        }
        if (!db.objectStoreNames.contains('bio_profiles')) {
          db.createObjectStore('bio_profiles', { keyPath: 'username' });
        }
        if (!db.objectStoreNames.contains('shortlinks')) {
          const slStore = db.createObjectStore('shortlinks', { keyPath: 'slug' });
          slStore.createIndex('by_owner', 'ownerUser', { unique: false });
        }
        if (!db.objectStoreNames.contains('domains')) {
          db.createObjectStore('domains', { keyPath: 'domain' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          cachedDbPromise = null;
        };
        db.onclose = () => {
          cachedDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        cachedDbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        cachedDbPromise = null;
        resolve(null);
      };
    } catch {
      cachedDbPromise = null;
      resolve(null);
    }
  });

  return cachedDbPromise;
}

export function buildDefaultSeedMessages(
  rawUsername: string,
  domain = 'imy.li'
): LocalMailMessage[] {
  const user = sanitizeHandle(rawUsername);
  const primaryEmail = `${user}@${domain}`;
  const mid = Math.max(1, Math.floor(user.length / 2));
  const dotAlias =
    user.length > 2
      ? `${user.slice(0, mid)}.${user.slice(mid)}@${domain}`
      : `${user}@${domain}`;

  return [
    {
      id: `msg-${user}-welcome-edge`,
      rfcMessageId: `<edge-welcome-001@mail.vz.gay>`,
      ownerUser: user,
      threadId: 'postmaster@mail.vz.gay',
      folder: 'inbox',
      direction: 'inbound',
      from: { name: 'VZ Mail Edge Relay', address: 'postmaster@mail.vz.gay' },
      to: [{ name: user, address: primaryEmail }],
      cc: [],
      deliveredToAlias: primaryEmail,
      plusTag: null,
      dotNormalized: false,
      subject: `Kotak surat lokal ${primaryEmail} aktif — Zero Server Retention`,
      bodyText: `Halo ${user},\n\nKotak surat ${primaryEmail} Anda kini aktif dan terhubung dengan akun SSO accounts.vz.gay.\n\nPrinsip Privasi & Penyimpanan Lokal VZ Mail:\n1. Zero Server Mailbox Retention: Cloudflare Email Routing hanya menangkap paket masuk sementara di edge queue dan langsung menghapusnya (POP-and-Purge) begitu perangkat Anda menarik pesan ke IndexedDB lokal.\n2. Alias Otomatis (+ dan .): Anda dapat langsung menerima email ke ${dotAlias} atau ${user}+newsletter@${domain} tanpa konfigurasi tambahan.\n3. Terhubung dengan VZ Links: Handle ${user} Anda otomatis berpasangan 1:1 dengan halaman bio ${user}.imy.li serta shortlink imy.li/s/.\n4. Backup Lintas Perangkat: Gunakan menu Local Vault untuk mengekspor arsip ke .eml, .mbox, atau kontainer terenkripsi AES-256-GCM (.enc MyVault).`,
      timestamp: '2026-11-24T01:15:00.000Z',
      read: false,
      starred: true,
      verifiedSpfDkim: true,
      dmarcPolicy: 'pass (p=reject)',
      ephemeralQueueReceipt: 'PURGED-CF-EDGE-9F4A2C11',
      chatBridgeChannel: 'chat.vz.gay/#system-onboarding',
      attachments: [
        {
          id: 'att-dns-guide',
          filename: `imy-li-architecture-${user}.txt`,
          mimeType: 'text/plain',
          sizeBytes: 512,
          contentText: `VZ Mail & VZ Links 2-in-1 Edge Architecture\nCanonical Identity: ${primaryEmail}\nPaired Static Bio: https://${user}.imy.li\nShortlink Namespace: https://imy.li/s/*\nStorage: Browser IndexedDB (Local-First)\nEdge Queue Retention: 0 seconds after client ACK`,
        },
      ],
    },
    {
      id: `msg-${user}-plus-github`,
      rfcMessageId: `<gh-release-2026-11@github.com>`,
      ownerUser: user,
      threadId: 'noreply@github.com',
      folder: 'inbox',
      direction: 'inbound',
      from: { name: 'GitHub Notifications', address: 'noreply@github.com' },
      to: [{ name: user, address: `${user}+github@${domain}` }],
      cc: [],
      deliveredToAlias: `${user}+github@${domain}`,
      plusTag: 'github',
      dotNormalized: false,
      subject: `[cloudflare/workers-sdk] Release v4 — Email Routing & send_email bindings`,
      bodyText: `Email ini dikirim ke alamat alias plus Anda (${user}+github@${domain}) dan secara otomatis dinormalisasi ke kotak masuk utama ${primaryEmail} dengan label filter +github.\n\nHighlights:\n- Native Cloudflare Email Routing worker handler email(message, env, ctx)\n- Outbound send_email binding without VPS SMTP servers\n- Wildcard route *.imy.li and imy.li/s/* multi-service dispatch`,
      timestamp: '2026-11-24T02:40:00.000Z',
      read: false,
      starred: false,
      verifiedSpfDkim: true,
      dmarcPolicy: 'pass (p=reject)',
      ephemeralQueueReceipt: 'PURGED-CF-EDGE-7B83E104',
      chatBridgeChannel: null,
      attachments: [],
    },
    {
      id: `msg-${user}-dot-alias-team`,
      rfcMessageId: `<chat-thread-882@chat.vz.gay>`,
      ownerUser: user,
      threadId: 'rina@imy.li',
      folder: 'inbox',
      direction: 'inbound',
      from: { name: 'Rina Prameswari', address: 'rina@imy.li' },
      to: [{ name: user, address: dotAlias }],
      cc: [],
      deliveredToAlias: dotAlias,
      plusTag: null,
      dotNormalized: dotAlias !== primaryEmail,
      subject: `Sinkronisasi halaman bio ${user}.imy.li & shortlink produk`,
      bodyText: `Hai ${user}! Aku barusan kirim pesan ini ke variasi titik ${dotAlias} buat ngetes canonical normalizer kita.\n\nOh ya, halaman statis ${user}.imy.li dan shortlink imy.li/s/kit sudah siap disambungkan dari tab VZ Links di atas. Kalau mau balas cepat lewat gelembung chat juga langsung nyambung ke utas ini ya!`,
      timestamp: '2026-11-24T04:12:00.000Z',
      read: true,
      starred: true,
      verifiedSpfDkim: true,
      dmarcPolicy: 'pass (p=quarantine)',
      ephemeralQueueReceipt: 'PURGED-CF-EDGE-3D19A882',
      chatBridgeChannel: 'chat.vz.gay/dm/rina',
      attachments: [],
    },
    {
      id: `msg-${user}-outbound-reply`,
      rfcMessageId: `<local-sent-101@${domain}>`,
      ownerUser: user,
      threadId: 'rina@imy.li',
      folder: 'sent',
      direction: 'outbound',
      from: { name: user, address: primaryEmail },
      to: [{ name: 'Rina Prameswari', address: 'rina@imy.li' }],
      cc: [],
      deliveredToAlias: 'rina@imy.li',
      plusTag: null,
      dotNormalized: false,
      subject: `Re: Sinkronisasi halaman bio ${user}.imy.li & shortlink produk`,
      bodyText: `Siap Rina! Pesan ke ${dotAlias} masuk dengan mulus ke penyimpanan lokal perangkatku dan antrean di edge Worker sudah langsung terhapus (0 byte tersisa di server).`,
      timestamp: '2026-11-24T04:18:30.000Z',
      read: true,
      starred: false,
      verifiedSpfDkim: true,
      dmarcPolicy: 'local-relay',
      chatBridgeChannel: 'chat.vz.gay/dm/rina',
      attachments: [],
    },
  ];
}

export function buildDefaultBioProfile(rawUsername: string): ImyBioProfile {
  const user = sanitizeHandle(rawUsername);
  const displayCap = user.charAt(0).toUpperCase() + user.slice(1);
  return {
    username: user,
    displayName: `${displayCap} · Ecosystem Creator`,
    headline: `Digital Identity, Software Engineering & Curated Notes on ${user}.imy.li`,
    bio: `Halaman profil statis resmi terisolasi tanpa cookie lintas-subdomain (PSL-safe) yang berpasangan 1:1 dengan alamat surat elektronik ${user}@imy.li.`,
    location: 'Indonesia · vz.gay Network',
    showPublicEmailButton: true,
    publicEmailAlias: `${user}+hello@imy.li`,
    themeVariant: 'cobalt_swiss',
    updatedAt: new Date().toISOString(),
    links: [
      {
        id: 'link-1',
        title: `Kirim Email ke ${user}+hello@imy.li`,
        url: `mailto:${user}+hello@imy.li`,
        subtitle: 'Terenkripsi lokal & otomatis difilter dengan tag +hello',
        category: 'contact',
        clicks: 42,
        enabled: true,
      },
      {
        id: 'link-2',
        title: 'Portofolio & Katalog Proyek (Shortlink)',
        url: `https://imy.li/s/${user}-work`,
        subtitle: `Dialihkan cepat melalui imy.li/s/${user}-work`,
        category: 'project',
        clicks: 128,
        enabled: true,
      },
      {
        id: 'link-3',
        title: 'Ekosistem SaaS Terpadu vz.gay',
        url: 'https://vz.gay',
        subtitle: 'Portal layanan produktivitas, VZ Desk, dan SSO accounts.vz.gay',
        category: 'social',
        clicks: 89,
        enabled: true,
      },
    ],
  };
}

export function buildDefaultShortlinks(rawUsername: string): ImyShortlink[] {
  const user = sanitizeHandle(rawUsername);
  return [
    {
      slug: `${user}-work`,
      ownerUser: user,
      title: `Portofolio & Proyek ${user}`,
      targetUrl: `https://${user}.imy.li`,
      clicks: 128,
      createdAt: '2026-11-23T18:30:00.000Z',
      safeBrowsingVerified: true,
    },
    {
      slug: `${user}-mail`,
      ownerUser: user,
      title: 'Peluncur VZ Mail (mail.vz.gay)',
      targetUrl: 'https://mail.vz.gay',
      clicks: 245,
      createdAt: '2026-11-23T20:10:00.000Z',
      safeBrowsingVerified: true,
    },
    {
      slug: `${user}-account`,
      ownerUser: user,
      title: 'Dasbor SSO & Aktivasi Layanan (myaccount.vz.gay)',
      targetUrl: 'https://myaccount.vz.gay',
      clicks: 64,
      createdAt: '2026-11-24T01:00:00.000Z',
      safeBrowsingVerified: true,
    },
  ];
}

export async function getMessagesForUser(rawUsername: string): Promise<LocalMailMessage[]> {
  const user = sanitizeHandle(rawUsername);
  const db = await openLocalDb();
  if (!db) {
    return Array.from(memoryFallback.messages.values())
      .filter((m) => m.ownerUser === user)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const idx = store.index('by_owner');
    const req = idx.getAll(IDBKeyRange.only(user));
    req.onsuccess = () => {
      const list = (req.result as LocalMailMessage[]) || [];
      list.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function ensureUserMessagesSeeded(
  rawUsername: string,
  domain = 'imy.li'
): Promise<LocalMailMessage[]> {
  const existing = await getMessagesForUser(rawUsername);
  if (existing.length > 0) {
    return existing;
  }
  const seeds = buildDefaultSeedMessages(rawUsername, domain);
  await saveMessagesBatch(seeds);
  return getMessagesForUser(rawUsername);
}

export async function saveMessage(msg: LocalMailMessage): Promise<void> {
  const db = await openLocalDb();
  if (!db) {
    memoryFallback.messages.set(msg.id, msg);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put(msg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMessagesBatch(messages: LocalMailMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const db = await openLocalDb();
  if (!db) {
    for (const msg of messages) {
      memoryFallback.messages.set(msg.id, msg);
    }
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    for (const msg of messages) {
      store.put(msg);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markMessagesAsRead(messages: LocalMailMessage[]): Promise<void> {
  const unread = messages.filter((m) => !m.read);
  if (unread.length === 0) return;
  await saveMessagesBatch(unread.map((m) => ({ ...m, read: true })));
}

export async function deleteMessageFromLocalDb(id: string): Promise<void> {
  const db = await openLocalDb();
  if (!db) {
    memoryFallback.messages.delete(id);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllUserMessages(rawUsername: string): Promise<void> {
  const messages = await getMessagesForUser(rawUsername);
  const db = await openLocalDb();
  if (!db) {
    for (const m of messages) {
      memoryFallback.messages.delete(m.id);
    }
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    for (const m of messages) {
      store.delete(m.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function sanitizeBioProfile(profile: ImyBioProfile): ImyBioProfile {
  return {
    ...profile,
    username: sanitizeHandle(profile.username),
    links: (profile.links || [])
      .map((link) => {
        const safeUrl = sanitizeExternalUrl(link.url, { allowMailto: true });
        return safeUrl ? { ...link, url: safeUrl } : null;
      })
      .filter((item): item is BioLinkCardItem => item !== null),
  };
}

export async function getOrSeedBioProfile(rawUsername: string): Promise<ImyBioProfile> {
  const user = sanitizeHandle(rawUsername);
  const db = await openLocalDb();
  if (!db) {
    const existing = memoryFallback.bioProfiles.get(user);
    if (existing) return existing;
    const seeded = buildDefaultBioProfile(user);
    memoryFallback.bioProfiles.set(user, seeded);
    return seeded;
  }

  const existing = await new Promise<ImyBioProfile | undefined>((resolve, reject) => {
    const tx = db.transaction('bio_profiles', 'readonly');
    const req = tx.objectStore('bio_profiles').get(user);
    req.onsuccess = () => resolve(req.result as ImyBioProfile | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) return sanitizeBioProfile(existing);

  const seeded = buildDefaultBioProfile(user);
  await saveBioProfile(seeded);
  return seeded;
}

export async function saveBioProfile(profile: ImyBioProfile): Promise<void> {
  const sanitized = sanitizeBioProfile(profile);
  const db = await openLocalDb();
  if (!db) {
    memoryFallback.bioProfiles.set(sanitized.username, sanitized);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bio_profiles', 'readwrite');
    tx.objectStore('bio_profiles').put(sanitized);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOrSeedShortlinks(rawUsername: string): Promise<ImyShortlink[]> {
  const user = sanitizeHandle(rawUsername);
  const db = await openLocalDb();

  if (!db) {
    const existing = Array.from(memoryFallback.shortlinks.values()).filter(
      (s) => s.ownerUser === user
    );
    if (existing.length > 0) {
      return existing.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    const seeded = buildDefaultShortlinks(user);
    for (const item of seeded) {
      memoryFallback.shortlinks.set(item.slug, item);
    }
    return seeded;
  }

  // Strictly scope shortlinks to the active SSO user via the `by_owner` index
  const existing = await new Promise<ImyShortlink[]>((resolve, reject) => {
    const tx = db.transaction('shortlinks', 'readonly');
    const idx = tx.objectStore('shortlinks').index('by_owner');
    const req = idx.getAll(IDBKeyRange.only(user));
    req.onsuccess = () => resolve((req.result as ImyShortlink[]) || []);
    req.onerror = () => reject(req.error);
  });

  if (existing.length > 0) {
    return existing.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const seeded = buildDefaultShortlinks(user);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shortlinks', 'readwrite');
    const store = tx.objectStore('shortlinks');
    for (const item of seeded) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return seeded;
}

export async function saveShortlink(item: ImyShortlink): Promise<void> {
  const safeSlug = sanitizeSlug(item.slug);
  const safeTarget = sanitizeExternalUrl(item.targetUrl, {
    allowMailto: false,
    blockPrivateHosts: true,
  });
  if (!safeSlug || !safeTarget) {
    throw new Error('Slug atau URL shortlink tidak valid.');
  }
  const cleanItem: ImyShortlink = {
    ...item,
    slug: safeSlug,
    ownerUser: sanitizeHandle(item.ownerUser),
    targetUrl: safeTarget,
  };

  const db = await openLocalDb();
  if (!db) {
    memoryFallback.shortlinks.set(cleanItem.slug, cleanItem);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shortlinks', 'readwrite');
    tx.objectStore('shortlinks').put(cleanItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteShortlink(slug: string): Promise<void> {
  const db = await openLocalDb();
  if (!db) {
    memoryFallback.shortlinks.delete(slug);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shortlinks', 'readwrite');
    tx.objectStore('shortlinks').delete(slug);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOrSeedDomains(): Promise<MailDomainOption[]> {
  const db = await openLocalDb();
  if (!db) {
    if (memoryFallback.domains.size === 0) {
      for (const d of INITIAL_MAIL_DOMAINS) {
        memoryFallback.domains.set(d.domain, d);
      }
    }
    return Array.from(memoryFallback.domains.values()).sort((a, b) =>
      a.isPrimaryDefault === b.isPrimaryDefault ? 0 : a.isPrimaryDefault ? -1 : 1
    );
  }

  const existing = await new Promise<MailDomainOption[]>((resolve, reject) => {
    const tx = db.transaction('domains', 'readonly');
    const req = tx.objectStore('domains').getAll();
    req.onsuccess = () => resolve((req.result as MailDomainOption[]) || []);
    req.onerror = () => reject(req.error);
  });
  if (existing.length > 0) {
    return existing.sort((a, b) =>
      a.isPrimaryDefault === b.isPrimaryDefault ? 0 : a.isPrimaryDefault ? -1 : 1
    );
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('domains', 'readwrite');
    const store = tx.objectStore('domains');
    for (const d of INITIAL_MAIL_DOMAINS) {
      store.put(d);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return INITIAL_MAIL_DOMAINS;
}

export async function saveDomainOption(domainOpt: MailDomainOption): Promise<void> {
  const db = await openLocalDb();
  if (!db) {
    memoryFallback.domains.set(domainOpt.domain, domainOpt);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('domains', 'readwrite');
    tx.objectStore('domains').put(domainOpt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function normalizeInboundPacketToLocalMessage(
  packet: {
    id: string;
    rfcMessageId?: string;
    fromName: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    bodyText: string;
    receivedAt: string;
    ephemeralQueueReceipt?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      ephemeralId?: string;
      ephemeralOwner?: string;
      expiresAt?: string;
      contentText?: string;
    }>;
  },
  activeDomains: readonly string[] = ['imy.li']
): LocalMailMessage {
  const resolved = resolveCanonicalEmail(packet.toAddress, activeDomains);
  const normalizedAttachments: MailAttachment[] = Array.isArray(packet.attachments)
    ? packet.attachments.map((att) => ({
        id: att.id || generateSecureId('att'),
        filename: att.filename || 'attachment.bin',
        mimeType: att.mimeType || 'application/octet-stream',
        sizeBytes: Number.isFinite(att.sizeBytes) ? att.sizeBytes : 0,
        contentText: att.contentText,
        ephemeralId: att.ephemeralId || att.id,
        ephemeralOwner: att.ephemeralOwner || resolved.canonicalUsername,
        expiresAt: att.expiresAt,
        storageStatus: att.contentText ? 'local_saved' : 'ephemeral_r2',
      }))
    : [];

  return {
    id: packet.id || generateSecureId('msg-in'),
    rfcMessageId: packet.rfcMessageId || `<${packet.id}@imy.li>`,
    ownerUser: resolved.canonicalUsername,
    threadId: packet.fromAddress.toLowerCase(),
    folder: 'inbox',
    direction: 'inbound',
    from: {
      name: packet.fromName || packet.fromAddress.split('@')[0],
      address: packet.fromAddress.toLowerCase(),
    },
    to: [
      {
        name: resolved.canonicalUsername,
        address: packet.toAddress.toLowerCase(),
      },
    ],
    cc: [],
    deliveredToAlias: packet.toAddress.toLowerCase(),
    plusTag: resolved.plusTag,
    dotNormalized: resolved.dotCount > 0,
    subject: packet.subject || '(Tanpa Subjek)',
    bodyText: packet.bodyText,
    timestamp: packet.receivedAt || new Date().toISOString(),
    read: false,
    starred: false,
    verifiedSpfDkim: true,
    dmarcPolicy: 'pass (p=reject)',
    ephemeralQueueReceipt:
      packet.ephemeralQueueReceipt || generateSecureId('PURGED-CF').toUpperCase(),
    chatBridgeChannel: null,
    attachments: normalizedAttachments,
  };
}
