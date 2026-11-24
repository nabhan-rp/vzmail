import type {
  ImyBioProfile,
  ImyShortlink,
  LocalMailMessage,
} from './localMailDb';
import { resolveCanonicalEmail, sanitizeHandle } from './mailIdentity';

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
  iterations = 100000
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
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

export function serializeToEml(msg: LocalMailMessage): string {
  const dateHeader = new Date(msg.timestamp).toUTCString();
  const toHeader = msg.to
    .map((p) => (p.name ? `"${p.name}" <${p.address}>` : p.address))
    .join(', ');
  const ccHeader =
    msg.cc && msg.cc.length > 0
      ? `\r\nCc: ${msg.cc.map((p) => `${p.name} <${p.address}>`).join(', ')}`
      : '';
  const plusHeader = msg.plusTag ? `\r\nX-VZ-Plus-Tag: ${msg.plusTag}` : '';
  const receiptHeader = msg.ephemeralQueueReceipt
    ? `\r\nX-VZ-Zero-Retention-Receipt: ${msg.ephemeralQueueReceipt}`
    : '';

  return [
    `Message-ID: ${msg.rfcMessageId}`,
    `Date: ${dateHeader}`,
    `From: "${msg.from.name}" <${msg.from.address}>`,
    `To: ${toHeader}${ccHeader}`,
    `Delivered-To: ${msg.deliveredToAlias}`,
    `Subject: ${msg.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `X-VZ-Folder: ${msg.folder}`,
    `X-VZ-Owner: ${msg.ownerUser}${plusHeader}${receiptHeader}`,
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

  const headers: Record<string, string> = {};
  for (const line of headerBlock.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      headers[key] = val;
    }
  }

  const extractParty = (raw: string | undefined, fallback: string) => {
    if (!raw) return { name: fallback.split('@')[0], address: fallback };
    const angleMatch = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
    if (angleMatch) {
      const addr = angleMatch[2].trim().toLowerCase();
      const name = (angleMatch[1] || addr.split('@')[0]).trim();
      return { name, address: addr };
    }
    const clean = raw.trim().toLowerCase();
    return { name: clean.split('@')[0], address: clean };
  };

  const owner = sanitizeHandle(headers['x-vz-owner'] || defaultOwner);
  const fromParty = extractParty(headers['from'], 'external@imy.li');
  const toParty = extractParty(headers['to'], `${owner}@imy.li`);
  const deliveredAlias = (
    headers['delivered-to'] || toParty.address
  ).toLowerCase();
  const resolved = resolveCanonicalEmail(deliveredAlias, ['imy.li', 'vz.gay']);
  const parsedDate = headers['date'] ? new Date(headers['date']) : new Date();
  const timestamp = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const direction =
    fromParty.address.startsWith(`${owner}@`) ||
    resolveCanonicalEmail(fromParty.address).canonicalUsername === owner
      ? 'outbound'
      : 'inbound';

  return {
    id: `msg-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rfcMessageId:
      headers['message-id'] || `<imported-${Date.now()}@mail.vz.gay>`,
    ownerUser: owner,
    threadId: direction === 'inbound' ? fromParty.address : toParty.address,
    folder:
      (headers['x-vz-folder'] as LocalMailMessage['folder']) ||
      (direction === 'outbound' ? 'sent' : 'inbox'),
    direction,
    from: fromParty,
    to: [toParty],
    cc: [],
    deliveredToAlias: deliveredAlias,
    plusTag: headers['x-vz-plus-tag'] || resolved.plusTag,
    dotNormalized: resolved.dotCount > 0,
    subject: headers['subject'] || '(Imported .eml Message)',
    bodyText: bodyBlock || '(No message content)',
    timestamp,
    read: true,
    starred: false,
    verifiedSpfDkim: true,
    dmarcPolicy: 'pass (p=reject)',
    ephemeralQueueReceipt:
      headers['x-vz-zero-retention-receipt'] || 'IMPORTED-LOCAL-EML',
    chatBridgeChannel: null,
    attachments: [],
  };
}

export function serializeToMbox(messages: LocalMailMessage[]): string {
  return messages
    .map((m) => {
      const asctime = new Date(m.timestamp).toUTCString();
      const eml = serializeToEml(m).replace(/\r\n/g, '\n');
      const escapedBody = eml.replace(/\nFrom /g, '\n>From ');
      return `From ${m.from.address} ${asctime}\n${escapedBody}`;
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
    if (withoutFromLine.trim()) {
      results.push(parseEmlToMessage(withoutFromLine, defaultOwner));
    }
  }
  return results;
}

export async function encryptVaultToEnc(
  payload: DecryptedVaultPayload,
  passphrase: string
): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100000;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintextBytes
  );

  const container: MyVaultEncryptedContainer = {
    format: 'vz.myvault.enc.v1',
    app: 'mail.vz.gay+links.vz.gay',
    exportedAt: new Date().toISOString(),
    ownerUser: payload.ownerUser,
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
  };

  return JSON.stringify(container, null, 2);
}

export async function decryptVaultFromEnc(
  encFileContent: string,
  passphrase: string
): Promise<DecryptedVaultPayload> {
  const container = JSON.parse(encFileContent) as MyVaultEncryptedContainer;
  if (container.format !== 'vz.myvault.enc.v1') {
    throw new Error('Format berkas .enc tidak dikenali (bukan vz.myvault.enc.v1)');
  }

  const salt = base64ToBytes(container.saltBase64);
  const iv = base64ToBytes(container.ivBase64);
  const ciphertext = base64ToBytes(container.ciphertextBase64);

  const key = await deriveAesGcmKey(
    passphrase,
    salt,
    container.iterations || 100000
  );

  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plainBuffer)) as DecryptedVaultPayload;
}

export function triggerBrowserDownload(
  filename: string,
  content: string,
  mimeType = 'application/octet-stream'
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
