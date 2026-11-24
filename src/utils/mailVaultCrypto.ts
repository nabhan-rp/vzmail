import type {
  ImyBioProfile,
  ImyShortlink,
  LocalMailMessage,
} from './localMailDb';
import {
  DEFAULT_SUPPORTED_DOMAINS,
  resolveCanonicalEmail,
  sanitizeHandle,
} from './mailIdentity';
import {
  generateSecureId,
  isSafePlainObject,
  sanitizeDisplayName,
  sanitizeExternalUrl,
  sanitizeSlug,
  stripHeaderInjection,
} from './mailSecurity';

export interface MyVaultEncryptedContainer {
  format: 'vz.myvault.enc.v1';
  app: 'mail.vz.gay+links.vz.gay';
  exportedAt: string;
  ownerUser: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

export interface DecryptedVaultPayload {
  ownerUser: string;
  exportedAt: string;
  messages: LocalMailMessage[];
  bioProfile?: ImyBioProfile;
  shortlinks?: ImyShortlink[];
}

export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
const MIN_PBKDF2_ITERATIONS = 100_000; // Backward compatibility for v1 vaults
const MAX_PBKDF2_ITERATIONS = 2_000_000; // Guard against CPU DoS from forged .enc files
const ALLOWED_FOLDERS: ReadonlySet<LocalMailMessage['folder']> = new Set([
  'inbox',
  'sent',
  'drafts',
  'archive',
  'trash',
]);

/**
 * Chunked O(n) base64 encoding — avoids O(n^2) string concatenation freezes on large mailboxes.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000; // 32 KB chunks
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Serializes a LocalMailMessage to RFC 5322 `.eml` with strict CRLF header-injection sanitization.
 */
export function serializeToEml(msg: LocalMailMessage): string {
  const parsedDate = new Date(msg.timestamp);
  const dateHeader = Number.isNaN(parsedDate.getTime())
    ? new Date().toUTCString()
    : parsedDate.toUTCString();

  const formatParty = (p: { name?: string; address: string }) => {
    const safeAddr = stripHeaderInjection(p.address, 254);
    const safeName = p.name ? sanitizeDisplayName(p.name, '') : '';
    return safeName ? `"${safeName}" <${safeAddr}>` : safeAddr;
  };

  const toHeader = msg.to.map(formatParty).join(', ');
  const ccHeader =
    msg.cc && msg.cc.length > 0
      ? `\r\nCc: ${msg.cc.map(formatParty).join(', ')}`
      : '';
  const safePlus = msg.plusTag ? stripHeaderInjection(msg.plusTag, 64) : '';
  const plusHeader = safePlus ? `\r\nX-VZ-Plus-Tag: ${safePlus}` : '';
  const safeReceipt = msg.ephemeralQueueReceipt
    ? stripHeaderInjection(msg.ephemeralQueueReceipt, 128)
    : '';
  const receiptHeader = safeReceipt
    ? `\r\nX-VZ-Zero-Retention-Receipt: ${safeReceipt}`
    : '';

  return [
    `Message-ID: ${stripHeaderInjection(msg.rfcMessageId, 256)}`,
    `Date: ${dateHeader}`,
    `From: ${formatParty(msg.from)}`,
    `To: ${toHeader}${ccHeader}`,
    `Delivered-To: ${stripHeaderInjection(msg.deliveredToAlias, 254)}`,
    `Subject: ${stripHeaderInjection(msg.subject, 250)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `X-VZ-Folder: ${ALLOWED_FOLDERS.has(msg.folder) ? msg.folder : 'inbox'}`,
    `X-VZ-Owner: ${sanitizeHandle(msg.ownerUser)}${plusHeader}${receiptHeader}`,
    ``,
    msg.bodyText.replace(/\r?\n/g, '\r\n'),
    ``,
  ].join('\r\n');
}

export function parseEmlToMessage(
  emlContent: string,
  defaultOwner: string
): LocalMailMessage {
  const normalized = emlContent.replace(/\r\n/g, '\n');
  const splitIndex = normalized.indexOf('\n\n');
  const headerBlock =
    splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized;
  const bodyBlock =
    splitIndex >= 0 ? normalized.slice(splitIndex + 2).trim() : '';

  // Unfold RFC 5322 continuation lines (leading whitespace)
  const unfoldedLines: string[] = [];
  for (const line of headerBlock.split('\n')) {
    if (/^[ \t]+/.test(line) && unfoldedLines.length > 0) {
      unfoldedLines[unfoldedLines.length - 1] += ' ' + line.trim();
    } else {
      unfoldedLines.push(line);
    }
  }

  const headers: Record<string, string> = {};
  for (const line of unfoldedLines) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      if (!(key in headers)) {
        headers[key] = val;
      }
    }
  }

  const extractParty = (raw: string | undefined, fallback: string) => {
    if (!raw) return { name: fallback.split('@')[0], address: fallback };
    const angleMatch = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
    if (angleMatch) {
      const addr = stripHeaderInjection(angleMatch[2], 254).toLowerCase();
      const name = sanitizeDisplayName(angleMatch[1] || '', addr.split('@')[0]);
      return { name, address: addr };
    }
    const clean = stripHeaderInjection(raw, 254).toLowerCase();
    return { name: clean.split('@')[0], address: clean };
  };

  const owner = sanitizeHandle(headers['x-vz-owner'] || defaultOwner);
  const fromParty = extractParty(headers['from'], 'external@imy.li');
  const toParty = extractParty(headers['to'], `${owner}@imy.li`);
  const deliveredAlias = stripHeaderInjection(
    headers['delivered-to'] || toParty.address,
    254
  ).toLowerCase();
  const resolved = resolveCanonicalEmail(deliveredAlias, DEFAULT_SUPPORTED_DOMAINS);
  const parsedDate = headers['date'] ? new Date(headers['date']) : new Date();
  const timestamp = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const direction =
    fromParty.address.startsWith(`${owner}@`) ||
    resolveCanonicalEmail(fromParty.address, DEFAULT_SUPPORTED_DOMAINS)
      .canonicalUsername === owner
      ? 'outbound'
      : 'inbound';

  const rawFolder = headers['x-vz-folder'] as LocalMailMessage['folder'] | undefined;
  const safeFolder: LocalMailMessage['folder'] =
    rawFolder && ALLOWED_FOLDERS.has(rawFolder)
      ? rawFolder
      : direction === 'outbound'
        ? 'sent'
        : 'inbox';

  const id = generateSecureId('msg-import');
  return {
    id,
    rfcMessageId: stripHeaderInjection(
      headers['message-id'] || `<${id}@mail.vz.gay>`,
      256
    ),
    ownerUser: owner,
    threadId: direction === 'inbound' ? fromParty.address : toParty.address,
    folder: safeFolder,
    direction,
    from: fromParty,
    to: [toParty],
    cc: [],
    deliveredToAlias: deliveredAlias,
    plusTag: headers['x-vz-plus-tag']
      ? stripHeaderInjection(headers['x-vz-plus-tag'], 48)
      : resolved.plusTag,
    dotNormalized: resolved.dotCount > 0,
    subject:
      stripHeaderInjection(headers['subject'] || '', 250) ||
      '(Imported .eml Message)',
    bodyText: bodyBlock || '(No message content)',
    timestamp,
    read: true,
    starred: false,
    verifiedSpfDkim: true,
    dmarcPolicy: 'pass (p=reject)',
    ephemeralQueueReceipt:
      stripHeaderInjection(headers['x-vz-zero-retention-receipt'] || '', 128) ||
      'IMPORTED-LOCAL-EML',
    chatBridgeChannel: null,
    attachments: [],
  };
}

export function serializeToMbox(messages: LocalMailMessage[]): string {
  return messages
    .map((m) => {
      const parsedDate = new Date(m.timestamp);
      const asctime = Number.isNaN(parsedDate.getTime())
        ? new Date().toUTCString()
        : parsedDate.toUTCString();
      const eml = serializeToEml(m).replace(/\r\n/g, '\n');
      const escapedBody = eml.replace(/\nFrom /g, '\n>From ');
      const safeFromAddr = stripHeaderInjection(m.from.address, 254).replace(/\s+/g, '');
      return `From ${safeFromAddr} ${asctime}\n${escapedBody}`;
    })
    .join('\n\n');
}

export function parseMboxToMessages(
  mboxContent: string,
  defaultOwner: string
): LocalMailMessage[] {
  const normalized = mboxContent.replace(/\r\n/g, '\n');
  const rawChunks = normalized.split(/\n(?=From [^\n]+\n)/g);
  const results: LocalMailMessage[] = [];

  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const withoutFromLine = trimmed.startsWith('From ')
      ? trimmed.slice(trimmed.indexOf('\n') + 1)
      : trimmed;
    const unescaped = withoutFromLine.replace(/\n>From /g, '\nFrom ');
    if (unescaped.trim()) {
      results.push(parseEmlToMessage(unescaped, defaultOwner));
    }
  }
  return results;
}

export async function encryptVaultToEnc(
  payload: DecryptedVaultPayload,
  passphrase: string
): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));
  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintextBytes
  );

  const container: MyVaultEncryptedContainer = {
    format: 'vz.myvault.enc.v1',
    app: 'mail.vz.gay+links.vz.gay',
    exportedAt: new Date().toISOString(),
    ownerUser: sanitizeHandle(payload.ownerUser),
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
  };

  return JSON.stringify(container, null, 2);
}

/**
 * Validates and sanitizes a decrypted vault payload before committing to local IndexedDB.
 */
function sanitizeDecryptedVaultPayload(
  raw: unknown,
  fallbackOwner: string
): DecryptedVaultPayload {
  if (!isSafePlainObject(raw)) {
    throw new Error('Isi kontainer MyVault tidak valid.');
  }

  const ownerUser = sanitizeHandle(
    typeof raw.ownerUser === 'string' ? raw.ownerUser : fallbackOwner
  );
  const exportedAt =
    typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString();

  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];
  const messages: LocalMailMessage[] = [];
  for (const entry of rawMessages) {
    if (!isSafePlainObject(entry)) continue;
    const folder =
      typeof entry.folder === 'string' &&
      ALLOWED_FOLDERS.has(entry.folder as LocalMailMessage['folder'])
        ? (entry.folder as LocalMailMessage['folder'])
        : 'inbox';
    const fromObj = isSafePlainObject(entry.from) ? entry.from : {};
    const fromAddress = stripHeaderInjection(
      String(fromObj.address || 'unknown@imy.li'),
      254
    ).toLowerCase();
    const toList = Array.isArray(entry.to)
      ? entry.to
          .filter(isSafePlainObject)
          .map((p) => ({
            name: sanitizeDisplayName(String(p.name || ''), 'recipient'),
            address: stripHeaderInjection(String(p.address || `${ownerUser}@imy.li`), 254).toLowerCase(),
          }))
      : [{ name: ownerUser, address: `${ownerUser}@imy.li` }];

    messages.push({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.slice(0, 128) : generateSecureId('msg-enc'),
      rfcMessageId: stripHeaderInjection(String(entry.rfcMessageId || `<${generateSecureId('enc')}@imy.li>`), 256),
      ownerUser: sanitizeHandle(typeof entry.ownerUser === 'string' ? entry.ownerUser : ownerUser),
      threadId: stripHeaderInjection(String(entry.threadId || fromAddress), 254).toLowerCase(),
      folder,
      direction: entry.direction === 'outbound' ? 'outbound' : 'inbound',
      from: {
        name: sanitizeDisplayName(String(fromObj.name || ''), fromAddress.split('@')[0]),
        address: fromAddress,
      },
      to: toList,
      cc: [],
      deliveredToAlias: stripHeaderInjection(
        String(entry.deliveredToAlias || `${ownerUser}@imy.li`),
        254
      ).toLowerCase(),
      plusTag: typeof entry.plusTag === 'string' ? stripHeaderInjection(entry.plusTag, 48) : null,
      dotNormalized: Boolean(entry.dotNormalized),
      subject: stripHeaderInjection(String(entry.subject || '(Tanpa Subjek)'), 250),
      bodyText: String(entry.bodyText || ''),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
      read: Boolean(entry.read),
      starred: Boolean(entry.starred),
      verifiedSpfDkim: Boolean(entry.verifiedSpfDkim),
      dmarcPolicy:
        entry.dmarcPolicy === 'pass (p=quarantine)' || entry.dmarcPolicy === 'local-relay'
          ? entry.dmarcPolicy
          : 'pass (p=reject)',
      ephemeralQueueReceipt:
        typeof entry.ephemeralQueueReceipt === 'string'
          ? stripHeaderInjection(entry.ephemeralQueueReceipt, 128)
          : 'RESTORED-MYVAULT-ENC',
      chatBridgeChannel:
        typeof entry.chatBridgeChannel === 'string'
          ? stripHeaderInjection(entry.chatBridgeChannel, 128)
          : null,
      attachments: [],
    });
  }

  let bioProfile: ImyBioProfile | undefined;
  if (isSafePlainObject(raw.bioProfile)) {
    const rawLinks = Array.isArray(raw.bioProfile.links) ? raw.bioProfile.links : [];
    const safeLinks = rawLinks
      .filter(isSafePlainObject)
      .map((l) => {
        const safeUrl = sanitizeExternalUrl(String(l.url || ''), { allowMailto: true });
        if (!safeUrl) return null;
        const cat = l.category;
        return {
          id: typeof l.id === 'string' ? l.id.slice(0, 64) : generateSecureId('link'),
          title: stripHeaderInjection(String(l.title || 'Link'), 120),
          url: safeUrl,
          subtitle: stripHeaderInjection(String(l.subtitle || ''), 200),
          category: (cat === 'social' || cat === 'document' || cat === 'contact'
            ? cat
            : 'project') as 'social' | 'project' | 'document' | 'contact',
          clicks: Number.isFinite(Number(l.clicks)) ? Math.max(0, Number(l.clicks)) : 0,
          enabled: l.enabled !== false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    bioProfile = {
      username: sanitizeHandle(
        typeof raw.bioProfile.username === 'string' ? raw.bioProfile.username : ownerUser
      ),
      displayName: stripHeaderInjection(String(raw.bioProfile.displayName || ownerUser), 120),
      headline: stripHeaderInjection(String(raw.bioProfile.headline || ''), 200),
      bio: String(raw.bioProfile.bio || '').slice(0, 1000),
      location: stripHeaderInjection(String(raw.bioProfile.location || ''), 120),
      showPublicEmailButton: raw.bioProfile.showPublicEmailButton !== false,
      publicEmailAlias: stripHeaderInjection(
        String(raw.bioProfile.publicEmailAlias || `${ownerUser}@imy.li`),
        254
      ),
      themeVariant:
        raw.bioProfile.themeVariant === 'slate_minimal' ||
        raw.bioProfile.themeVariant === 'carbon_mono'
          ? raw.bioProfile.themeVariant
          : 'cobalt_swiss',
      links: safeLinks,
      updatedAt:
        typeof raw.bioProfile.updatedAt === 'string'
          ? raw.bioProfile.updatedAt
          : new Date().toISOString(),
    };
  }

  let shortlinks: ImyShortlink[] | undefined;
  if (Array.isArray(raw.shortlinks)) {
    shortlinks = raw.shortlinks
      .filter(isSafePlainObject)
      .map((s) => {
        const slug = sanitizeSlug(String(s.slug || ''));
        const safeTarget = sanitizeExternalUrl(String(s.targetUrl || ''), {
          allowMailto: false,
          blockPrivateHosts: true,
        });
        if (!slug || !safeTarget) return null;
        return {
          slug,
          ownerUser: sanitizeHandle(typeof s.ownerUser === 'string' ? s.ownerUser : ownerUser),
          title: stripHeaderInjection(String(s.title || slug), 120),
          targetUrl: safeTarget,
          clicks: Number.isFinite(Number(s.clicks)) ? Math.max(0, Number(s.clicks)) : 0,
          createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
          safeBrowsingVerified: Boolean(s.safeBrowsingVerified),
        };
      })
      .filter((x): x is ImyShortlink => x !== null);
  }

  return { ownerUser, exportedAt, messages, bioProfile, shortlinks };
}

export async function decryptVaultFromEnc(
  encFileContent: string,
  passphrase: string,
  fallbackOwner = 'fadhil'
): Promise<DecryptedVaultPayload> {
  const container = JSON.parse(encFileContent) as Partial<MyVaultEncryptedContainer>;
  if (
    !isSafePlainObject(container) ||
    container.format !== 'vz.myvault.enc.v1' ||
    container.kdf !== 'PBKDF2-SHA256' ||
    container.cipher !== 'AES-256-GCM' ||
    typeof container.saltBase64 !== 'string' ||
    typeof container.ivBase64 !== 'string' ||
    typeof container.ciphertextBase64 !== 'string'
  ) {
    throw new Error('Format berkas .enc tidak dikenali (bukan vz.myvault.enc.v1).');
  }

  const iterations = Number(container.iterations);
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error('Parameter iterasi PBKDF2 tidak aman atau di luar batas.');
  }

  const salt = base64ToBytes(container.saltBase64);
  const iv = base64ToBytes(container.ivBase64);
  const ciphertext = base64ToBytes(container.ciphertextBase64);

  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
    throw new Error('Parameter kriptografi (salt/iv/ciphertext) tidak valid.');
  }

  const key = await deriveAesGcmKey(passphrase, salt, iterations);

  const plainBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  const dec = new TextDecoder();
  const parsed = JSON.parse(dec.decode(plainBuffer)) as unknown;
  return sanitizeDecryptedVaultPayload(parsed, fallbackOwner);
}

export function triggerBrowserDownload(
  filename: string,
  content: string,
  mimeType = 'application/octet-stream'
) {
  const safeFilename = filename.replace(/[/\\:*?"<>|]/g, '_').slice(0, 128) || 'export.txt';
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
