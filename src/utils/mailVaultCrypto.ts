import type {
  ImyBioProfile,
  ImyShortlink,
  LocalMailMessage,
  MailAttachment,
} from './localMailDb';
import {
  sanitizeExternalLinksArray,
  type MailExternalLink,
} from './mailExternalLinks';
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

export type VaultEncryptedFormat = 'anf' | 'cvp' | 'enc';
export type VaultPackagingMode = 'standard' | 'polyglot_pdf' | 'polyglot_zip';

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

export interface VzAnfStandardContainer {
  v: 4;
  format: 'vz-anf-v1';
  mode: 'standard';
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  fileName: string;
  mimeType: string;
  originalSize: number;
  encryptedAt: string;
  vzApp: 'mail.vz.gay+links.vz.gay';
  vzDocType: 'mailbox-vault';
  vzDocTitle: string;
  ownerUser: string;
  content: string;
}

export interface VzAnfPolyglotMetadata {
  v: 4;
  format: 'vz-anf-v1';
  mode: 'polyglot';
  stealthCarrier: 'pdf' | 'zip';
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  headerOffset: number;
  salt: string;
  iv: string;
  fileName: string;
  mimeType: string;
  originalSize: number;
  encryptedAt: string;
  vzApp: 'mail.vz.gay+links.vz.gay';
  vzDocType: 'mailbox-vault';
  ownerUser: string;
}

export interface CipherVaultProStandardContainer {
  v: 3;
  mode: 'BINARY' | 'DOCUMENT_TEXT';
  fileName: string;
  fileType: string;
  content: string;
  iv: string;
  salt: string;
  iterations?: number;
}

export interface CipherVaultProPolyglotMetadata {
  v?: 3;
  iv: string;
  salt: string;
  fileName: string;
  fileType: string;
  mode: 'DOCUMENT_TEXT' | 'BINARY';
  headerOffset?: number;
  stealthCarrier?: 'pdf' | 'zip';
  iterations?: number;
}

export interface DecryptedVaultPayload {
  ownerUser: string;
  exportedAt: string;
  messages: LocalMailMessage[];
  bioProfile?: ImyBioProfile;
  shortlinks?: ImyShortlink[];
}

export interface EncryptedVaultExportArtifact {
  filename: string;
  mimeType: string;
  data: string | Uint8Array;
  format: VaultEncryptedFormat;
  packagingMode: VaultPackagingMode;
  iterations: number;
  byteLength: number;
}

export interface AutoDecryptVaultResult {
  payload: DecryptedVaultPayload;
  detectedFormat: VaultEncryptedFormat;
  detectedMode: 'standard' | 'polyglot';
  iterations: number;
}

export const ANF_PBKDF2_ITERATIONS = 200_000;
export const CVP_PBKDF2_ITERATIONS = 100_000;
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const PIN_VAULT_PBKDF2_ITERATIONS = 150_000;

const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;

export const VZ_ANF_POLYGLOT_SIG = '---VZ_ANF_v1_SIG---';
export const CV_PRO_POLYGLOT_SIG = '---CV_PRO_v3_SIG---';
const PIN_VAULT_STORAGE_PREFIX = 'vz-anf-pin-vault-v1';

const ALLOWED_FOLDERS: ReadonlySet<LocalMailMessage['folder']> = new Set([
  'inbox',
  'sent',
  'drafts',
  'archive',
  'trash',
]);

/**
 * 256-word high-entropy recovery dictionary aligned with CipherVault Pro & VZ Desk 12-word mnemonic keys.
 */
const CIPHERVAULT_MNEMONIC_WORDS: readonly string[] = [
  'anchor', 'apollo', 'arcade', 'arctic', 'argon', 'armor', 'arrow', 'ash',
  'atlas', 'atom', 'aurora', 'avalon', 'axiom', 'azure', 'beacon', 'beryl',
  'binary', 'bison', 'blade', 'blaze', 'bloom', 'bolt', 'Boreal', 'breeze',
  'bridge', 'bronze', 'bunker', 'byte', 'cabin', 'canyon', 'carbon', 'cargo',
  'castle', 'cedar', 'celest', 'chisel', 'chrome', 'cipher', 'citadel', 'civic',
  'cliff', 'cloud', 'cobalt', 'comet', 'compass', 'copper', 'coral', 'Mortex',
  'cosmos', 'crater', 'crest', 'crimson', 'crown', 'crystal', 'cyber', 'cyclone',
  'dagger', 'dawn', 'delta', 'desert', 'diamond', 'dipole', 'domain', 'dragon',
  'drift', 'dynamo', 'eagle', 'echo', 'eclipse', 'eden', 'ember', 'emerald',
  'empire', 'enigma', 'epoch', 'equinox', 'ether', 'everest', 'falcon', 'fathom',
  'fiber', 'fjord', 'flame', 'flint', 'flux', 'focus', 'forge', 'fortress',
  'fossil', 'fractal', 'frost', 'fusion', 'galaxy', 'garnet', 'genesis', 'geyser',
  'glacier', 'Granite', 'gravity', 'grid', 'harbor', 'haven', 'helium', 'helix',
  'herald', 'horizon', 'hunter', 'hybrid', 'hydra', 'iceberg', 'ignite', 'impact',
  'impulse', 'indigo', 'infinit', 'ingot', 'ion', 'iron', 'island', 'ivory',
  'jade', 'jasper', 'javelin', 'jet', 'joule', 'jungle', 'jupiter', 'karma',
  'kernel', 'keystone', 'kinetic', 'knight', 'krypton', 'lagoon', 'lancer', 'laser',
  'lattice', 'lava', 'ledger', 'legacy', 'legend', 'liberty', 'light', 'lithium',
  'lotus', 'lunar', 'lynx', 'magnet', 'magma', 'mantle', 'marble', 'matrix',
  'meadow', 'mercury', 'meridian', 'meteor', 'mirage', 'monarch', 'monolith', 'mosaic',
  'nebula', 'nectar', 'neon', 'neptune', 'neural', 'neutron', 'nexus', 'nickel',
  'nimbus', 'noble', 'nomad', 'nordic', 'nova', 'nucleus', 'oasis', 'obsidian',
  'ocean', 'octave', 'odyssey', 'omega', 'onyx', 'opal', 'orbit', 'orchid',
  'orion', 'osmium', 'outpost', 'oxygen', 'paladin', 'paradox', 'paragon', 'pearl',
  'pegasus', 'pendulum', 'phantom', 'phoenix', 'photon', 'pioneer', 'pillar', 'plasma',
  'platinum', 'pluto', 'polar', 'portal', 'prism', 'pulsar', 'pyramid', 'python',
  'quantum', 'quartz', 'quasar', 'quest', 'quiver', 'radar', 'radium', 'raptor',
  'raven', 'reactor', 'realm', 'redwood', 'reef', 'relic', 'relay', 'ridge',
  'ripple', 'river', 'rocket', 'ruby', 'runic', 'saber', 'safari', 'saffron',
  'sapphire', 'saturn', 'scepter', 'scout', 'sector', 'seismic', 'sentinel', 'sequoia',
  'seraph', 'shadow', 'shield', 'sierra', 'signal', 'silicon', 'silver', 'sirius',
  'solace', 'solar', 'solstice', 'sonar', 'spark', 'spectra', 'sphere', 'sphinx',
  'spire', 'spirit', 'sprint', 'starlight', 'stealth', 'steel', 'stellar', 'stone',
  'storm', 'strata', 'stream', 'summit', 'zenith', 'zephyr', 'zircon', 'zodiac',
].map((w) => w.toLowerCase());

/**
 * Generates a cryptographically random 12-word recovery phrase compatible with CipherVault Pro & VZ Desk.
 */
export function generateCipherVaultMnemonic(wordCount = 12): string {
  const safeCount = Math.max(8, Math.min(24, Math.floor(wordCount)));
  const randomValues = new Uint32Array(safeCount);
  globalThis.crypto.getRandomValues(randomValues);
  const words: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    const idx = randomValues[i] % CIPHERVAULT_MNEMONIC_WORDS.length;
    words.push(CIPHERVAULT_MNEMONIC_WORDS[idx]);
  }
  return words.join(' ');
}

export function isValidPinCode(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

function getPinVaultStorageKey(username?: string): string {
  const clean = username ? sanitizeHandle(username) : 'default';
  return `${PIN_VAULT_STORAGE_PREFIX}:${clean}`;
}

export function hasStoredMnemonicPinVault(username?: string): boolean {
  try {
    const raw =
      globalThis.localStorage.getItem(getPinVaultStorageKey(username)) ||
      globalThis.localStorage.getItem(PIN_VAULT_STORAGE_PREFIX);
    return Boolean(raw);
  } catch {
    return false;
  }
}

export function clearMnemonicPinVault(username?: string): void {
  try {
    globalThis.localStorage.removeItem(getPinVaultStorageKey(username));
    globalThis.localStorage.removeItem(PIN_VAULT_STORAGE_PREFIX);
  } catch {
    // ignore storage errors
  }
}

/**
 * Encrypts and stores a 12-word mnemonic phrase locally under a 4-6 digit PIN (PBKDF2 150,000 iter + AES-256-GCM).
 */
export async function saveMnemonicToPinVault(
  mnemonic: string,
  pin: string,
  username?: string
): Promise<void> {
  const cleanPin = pin.trim();
  if (!isValidPinCode(cleanPin)) {
    throw new Error('PIN harus terdiri dari 4 hingga 6 digit angka.');
  }
  const cleanPhrase = mnemonic.trim();
  if (cleanPhrase.length < 8) {
    throw new Error('Frasa kunci atau mnemonic minimal 8 karakter.');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(cleanPin, salt, PIN_VAULT_PBKDF2_ITERATIONS);
  const enc = new TextEncoder();
  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(cleanPhrase)
  );

  const record = JSON.stringify({
    v: 1,
    format: 'vz-anf-pin-vault-v1',
    iterations: PIN_VAULT_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    cipher: bytesToBase64(new Uint8Array(cipherBuffer)),
    savedAt: new Date().toISOString(),
  });

  globalThis.localStorage.setItem(getPinVaultStorageKey(username), record);
  // Also write to shared default key for VZ Desk same-origin / ecosystem compatibility
  globalThis.localStorage.setItem(PIN_VAULT_STORAGE_PREFIX, record);
}

/**
 * Unlocks a stored 12-word mnemonic phrase from the local PIN vault using the user's 4-6 digit PIN.
 */
export async function unlockMnemonicFromPinVault(
  pin: string,
  username?: string
): Promise<string> {
  const cleanPin = pin.trim();
  if (!isValidPinCode(cleanPin)) {
    throw new Error('Masukkan PIN 4 hingga 6 digit angka.');
  }
  const raw =
    globalThis.localStorage.getItem(getPinVaultStorageKey(username)) ||
    globalThis.localStorage.getItem(PIN_VAULT_STORAGE_PREFIX);
  if (!raw) {
    throw new Error('Belum ada frasa 12-kata yang disimpan di brankas PIN perangkat ini.');
  }

  const parsed = JSON.parse(raw) as {
    iterations?: number;
    salt?: string;
    iv?: string;
    cipher?: string;
  };
  if (
    !isSafePlainObject(parsed) ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.cipher !== 'string'
  ) {
    throw new Error('Data brankas PIN rusak atau tidak dikenali.');
  }

  const iterations = Number(parsed.iterations) || PIN_VAULT_PBKDF2_ITERATIONS;
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error('Parameter iterasi brankas PIN tidak valid.');
  }

  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const cipher = base64ToBytes(parsed.cipher);
  const key = await deriveAesGcmKey(cleanPin, salt, iterations);

  try {
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      cipher as unknown as BufferSource
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('PIN salah. Gagal membuka brankas frasa 12-kata.');
  }
}

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
  const clean = base64.trim();
  const binary = atob(clean);
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
 * Builds a valid synthetic PDF or ZIP carrier header for Polyglot Stealth mode (.anf & .cvp).
 */
function buildPolyglotCarrierHeader(carrier: 'pdf' | 'zip'): Uint8Array {
  if (carrier === 'zip') {
    // Minimal PKZIP local header + empty entry "vz_neural_vault.txt"
    const entryName = new TextEncoder().encode('vz_neural_vault.txt');
    const header = new Uint8Array(30 + entryName.byteLength);
    // Local file header signature PK\x03\x04
    header[0] = 0x50;
    header[1] = 0x4b;
    header[2] = 0x03;
    header[3] = 0x04;
    // Version needed to extract (2.0)
    header[4] = 0x14;
    header[5] = 0x00;
    // File name length
    header[26] = entryName.byteLength & 0xff;
    header[27] = (entryName.byteLength >> 8) & 0xff;
    header.set(entryName, 30);
    return header;
  }

  // Default: valid minimal PDF-1.7 header comment & catalog stub
  const pdfStub = [
    '%PDF-1.7',
    '%VZ-ANF-CipherVaultPro-Polyglot-Container',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [] /Count 0 >>',
    'endobj',
    'trailer',
    '<< /Root 1 0 R >>',
    '%%EOF',
    '',
  ].join('\n');
  return new TextEncoder().encode(pdfStub);
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, arr) => sum + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Finds the last index of an ASCII signature sequence inside a binary Uint8Array.
 */
function findLastSubarrayIndex(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.byteLength === 0 || haystack.byteLength < needle.byteLength) {
    return -1;
  }
  for (let i = haystack.byteLength - needle.byteLength; i >= 0; i--) {
    let matched = true;
    for (let j = 0; j < needle.byteLength; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
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

/**
 * Legacy / Standard .enc (vz.myvault.enc.v1, PBKDF2 310,000 iterations + AES-256-GCM).
 */
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
 * Encrypts a VZ Mail Vault into .anf (Advanced/Archival Neural File, vz-anf-v1, 200k iter),
 * .cvp (CipherVault Pro v3, 100k iter), or .enc (Standard MyVault, 310k iter),
 * supporting both Standard JSON and Polyglot Stealth (PDF/ZIP carrier) modes.
 */
export async function encryptVaultWithFormat(
  payload: DecryptedVaultPayload,
  passphrase: string,
  options: {
    format: VaultEncryptedFormat;
    packagingMode?: VaultPackagingMode;
  }
): Promise<EncryptedVaultExportArtifact> {
  const format = options.format;
  const packagingMode: VaultPackagingMode =
    format === 'enc' ? 'standard' : options.packagingMode || 'standard';
  const safeOwner = sanitizeHandle(payload.ownerUser);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const innerFileName = `vz-mail-vault-${safeOwner}-${dateStamp}.json`;

  if (format === 'enc') {
    const encJson = await encryptVaultToEnc(payload, passphrase);
    const byteLength = new TextEncoder().encode(encJson).byteLength;
    return {
      filename: `vz-myvault-${safeOwner}-${dateStamp}.enc`,
      mimeType: 'application/octet-stream',
      data: encJson,
      format: 'enc',
      packagingMode: 'standard',
      iterations: DEFAULT_PBKDF2_ITERATIONS,
      byteLength,
    };
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations =
    format === 'anf' ? ANF_PBKDF2_ITERATIONS : CVP_PBKDF2_ITERATIONS;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));
  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintextBytes
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  if (format === 'anf') {
    if (packagingMode === 'standard') {
      const container: VzAnfStandardContainer = {
        v: 4,
        format: 'vz-anf-v1',
        mode: 'standard',
        cipher: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        fileName: innerFileName,
        mimeType: 'application/vnd.vz-mail.vault+json',
        originalSize: plaintextBytes.byteLength,
        encryptedAt: new Date().toISOString(),
        vzApp: 'mail.vz.gay+links.vz.gay',
        vzDocType: 'mailbox-vault',
        vzDocTitle: `VZ Mail Vault (${safeOwner}@imy.li)`,
        ownerUser: safeOwner,
        content: bytesToBase64(cipherBytes),
      };
      const jsonText = JSON.stringify(container, null, 2);
      return {
        filename: `vz-mail-${safeOwner}-${dateStamp}.anf`,
        mimeType: 'application/octet-stream',
        data: jsonText,
        format: 'anf',
        packagingMode: 'standard',
        iterations,
        byteLength: enc.encode(jsonText).byteLength,
      };
    }

    const carrier: 'pdf' | 'zip' =
      packagingMode === 'polyglot_zip' ? 'zip' : 'pdf';
    const headerBytes = buildPolyglotCarrierHeader(carrier);
    const sigBytes = enc.encode(VZ_ANF_POLYGLOT_SIG);
    const meta: VzAnfPolyglotMetadata = {
      v: 4,
      format: 'vz-anf-v1',
      mode: 'polyglot',
      stealthCarrier: carrier,
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations,
      headerOffset: headerBytes.byteLength,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      fileName: innerFileName,
      mimeType: 'application/vnd.vz-mail.vault+json',
      originalSize: plaintextBytes.byteLength,
      encryptedAt: new Date().toISOString(),
      vzApp: 'mail.vz.gay+links.vz.gay',
      vzDocType: 'mailbox-vault',
      ownerUser: safeOwner,
    };
    const metaBytes = enc.encode(JSON.stringify(meta));
    const binaryOut = concatUint8Arrays([
      headerBytes,
      cipherBytes,
      sigBytes,
      metaBytes,
    ]);

    return {
      filename: `vz-mail-${safeOwner}-${dateStamp}.anf`,
      mimeType: 'application/octet-stream',
      data: binaryOut,
      format: 'anf',
      packagingMode,
      iterations,
      byteLength: binaryOut.byteLength,
    };
  }

  // format === 'cvp' (CipherVault Pro v3)
  if (packagingMode === 'standard') {
    const container: CipherVaultProStandardContainer = {
      v: 3,
      mode: 'BINARY',
      fileName: innerFileName,
      fileType: 'application/json',
      content: bytesToBase64(cipherBytes),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
      iterations,
    };
    const jsonText = JSON.stringify(container, null, 2);
    return {
      filename: `vz-ciphervault-${safeOwner}-${dateStamp}.cvp`,
      mimeType: 'application/octet-stream',
      data: jsonText,
      format: 'cvp',
      packagingMode: 'standard',
      iterations,
      byteLength: enc.encode(jsonText).byteLength,
    };
  }

  const carrier: 'pdf' | 'zip' =
    packagingMode === 'polyglot_zip' ? 'zip' : 'pdf';
  const headerBytes = buildPolyglotCarrierHeader(carrier);
  const sigBytes = enc.encode(CV_PRO_POLYGLOT_SIG);
  const meta: CipherVaultProPolyglotMetadata = {
    v: 3,
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    fileName: innerFileName,
    fileType: 'application/json',
    mode: 'DOCUMENT_TEXT',
    headerOffset: headerBytes.byteLength,
    stealthCarrier: carrier,
    iterations,
  };
  const metaBytes = enc.encode(JSON.stringify(meta));
  const binaryOut = concatUint8Arrays([
    headerBytes,
    cipherBytes,
    sigBytes,
    metaBytes,
  ]);

  return {
    filename: `vz-ciphervault-${safeOwner}-${dateStamp}.cvp`,
    mimeType: 'application/octet-stream',
    data: binaryOut,
    format: 'cvp',
    packagingMode,
    iterations,
    byteLength: binaryOut.byteLength,
  };
}

function sanitizeAttachmentsArray(
  raw: unknown
): MailAttachment[] {
  if (!Array.isArray(raw)) return [];
  const results: MailAttachment[] = [];
  for (const item of raw) {
    if (!isSafePlainObject(item)) continue;
    const filename = stripHeaderInjection(
      String(item.filename || 'attachment.bin'),
      180
    );
    const mimeType = stripHeaderInjection(
      String(item.mimeType || 'application/octet-stream'),
      120
    );
    const sizeBytes = Number.isFinite(Number(item.sizeBytes))
      ? Math.max(0, Number(item.sizeBytes))
      : 0;
    const storageStatus =
      item.storageStatus === 'ephemeral_r2' ||
      item.storageStatus === 'expired_purged'
        ? item.storageStatus
        : 'local_saved';
    results.push({
      id:
        typeof item.id === 'string' && item.id.trim()
          ? item.id.slice(0, 96)
          : generateSecureId('att'),
      filename,
      mimeType,
      sizeBytes,
      contentText:
        typeof item.contentText === 'string' ? item.contentText : undefined,
      localDataBase64:
        typeof item.localDataBase64 === 'string'
          ? item.localDataBase64
          : undefined,
      ephemeralId:
        typeof item.ephemeralId === 'string'
          ? stripHeaderInjection(item.ephemeralId, 128)
          : undefined,
      ephemeralOwner:
        typeof item.ephemeralOwner === 'string'
          ? sanitizeHandle(item.ephemeralOwner)
          : undefined,
      expiresAt:
        typeof item.expiresAt === 'string' ? item.expiresAt : undefined,
      storageStatus,
    });
  }
  return results;
}

/**
 * Validates and sanitizes a decrypted vault payload before committing to local IndexedDB.
 */
function sanitizeDecryptedVaultPayload(
  raw: unknown,
  fallbackOwner: string
): DecryptedVaultPayload {
  if (!isSafePlainObject(raw)) {
    throw new Error('Isi kontainer Vault tidak valid.');
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

    const externalLinks: MailExternalLink[] = sanitizeExternalLinksArray(
      entry.externalLinks
    );
    const attachments = sanitizeAttachmentsArray(entry.attachments);

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
          : 'RESTORED-VZ-VAULT',
      chatBridgeChannel:
        typeof entry.chatBridgeChannel === 'string'
          ? stripHeaderInjection(entry.chatBridgeChannel, 128)
          : null,
      attachments,
      ...(externalLinks.length > 0 ? { externalLinks } : {}),
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

/**
 * Decodes plaintext bytes that may either be a VZ Mail Vault JSON payload,
 * a single RFC 5322 .eml message, or an .mbox archive encrypted inside CipherVault Pro / VZ Desk.
 */
function parseDecryptedInnerContent(
  plainBuffer: ArrayBuffer,
  fallbackOwner: string
): DecryptedVaultPayload {
  const text = new TextDecoder().decode(plainBuffer).trim();
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text) as unknown;
    return sanitizeDecryptedVaultPayload(parsed, fallbackOwner);
  }
  if (text.startsWith('From ') && text.includes('\n')) {
    const messages = parseMboxToMessages(text, fallbackOwner);
    return {
      ownerUser: sanitizeHandle(fallbackOwner),
      exportedAt: new Date().toISOString(),
      messages,
    };
  }
  if (/^(Message-ID|Date|From|To|Subject|MIME-Version):/im.test(text)) {
    const message = parseEmlToMessage(text, fallbackOwner);
    return {
      ownerUser: sanitizeHandle(fallbackOwner),
      exportedAt: new Date().toISOString(),
      messages: [message],
    };
  }
  throw new Error('Konten terdekripsi bukan struktur Vault VZ Mail (.json / .mbox / .eml) yang valid.');
}

export async function decryptVaultFromEnc(
  encFileContent: string,
  passphrase: string,
  fallbackOwner = 'fadhil'
): Promise<DecryptedVaultPayload> {
  const bytes = new TextEncoder().encode(encFileContent);
  const result = await decryptVaultAuto(bytes, passphrase, fallbackOwner);
  return result.payload;
}

/**
 * Universal Auto-Detect Decryptor for .anf (vz-anf-v1 Standard & Polyglot),
 * .cvp (CipherVault Pro v3 Standard & Polyglot), and .enc (vz.myvault.enc.v1).
 */
export async function decryptVaultAuto(
  fileInput: Uint8Array | ArrayBuffer | string,
  passphrase: string,
  fallbackOwner = 'fadhil'
): Promise<AutoDecryptVaultResult> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const fileBytes =
    typeof fileInput === 'string'
      ? enc.encode(fileInput)
      : fileInput instanceof Uint8Array
        ? fileInput
        : new Uint8Array(fileInput);

  // 1. Check for VZ Ecosystem .anf Polyglot signature (---VZ_ANF_v1_SIG---)
  const anfSigBytes = enc.encode(VZ_ANF_POLYGLOT_SIG);
  const anfSigIndex = findLastSubarrayIndex(fileBytes, anfSigBytes);
  if (anfSigIndex >= 0) {
    const metaStart = anfSigIndex + anfSigBytes.byteLength;
    const metaJson = dec.decode(fileBytes.subarray(metaStart)).trim();
    const meta = JSON.parse(metaJson) as Partial<VzAnfPolyglotMetadata>;
    if (
      !isSafePlainObject(meta) ||
      typeof meta.salt !== 'string' ||
      typeof meta.iv !== 'string'
    ) {
      throw new Error('Trailer metadata Polyglot .anf (vz-anf-v1) tidak valid.');
    }

    const iterations = Number(meta.iterations) || ANF_PBKDF2_ITERATIONS;
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error('Parameter iterasi PBKDF2 .anf di luar batas aman.');
    }

    const headerOffset =
      Number.isInteger(Number(meta.headerOffset)) && Number(meta.headerOffset) >= 0
        ? Number(meta.headerOffset)
        : 0;
    const salt = base64ToBytes(meta.salt);
    const iv = base64ToBytes(meta.iv);
    const ciphertext = fileBytes.subarray(headerOffset, anfSigIndex);

    if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
      throw new Error('Parameter kriptografi Polyglot .anf tidak valid.');
    }

    const key = await deriveAesGcmKey(passphrase, salt, iterations);
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    return {
      payload: parseDecryptedInnerContent(plainBuffer, fallbackOwner),
      detectedFormat: 'anf',
      detectedMode: 'polyglot',
      iterations,
    };
  }

  // 2. Check for CipherVault Pro v3 Polyglot signature (---CV_PRO_v3_SIG---)
  const cvpSigBytes = enc.encode(CV_PRO_POLYGLOT_SIG);
  const cvpSigIndex = findLastSubarrayIndex(fileBytes, cvpSigBytes);
  if (cvpSigIndex >= 0) {
    const metaStart = cvpSigIndex + cvpSigBytes.byteLength;
    const metaJson = dec.decode(fileBytes.subarray(metaStart)).trim();
    const meta = JSON.parse(metaJson) as Partial<CipherVaultProPolyglotMetadata>;
    if (
      !isSafePlainObject(meta) ||
      typeof meta.salt !== 'string' ||
      typeof meta.iv !== 'string'
    ) {
      throw new Error('Trailer metadata Polyglot CipherVault Pro (.cvp) tidak valid.');
    }

    const iterations = Number(meta.iterations) || CVP_PBKDF2_ITERATIONS;
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error('Parameter iterasi PBKDF2 .cvp di luar batas aman.');
    }

    const salt = base64ToBytes(meta.salt);
    const iv = base64ToBytes(meta.iv);
    const key = await deriveAesGcmKey(passphrase, salt, iterations);

    const candidateOffsets: number[] = [];
    if (
      Number.isInteger(Number(meta.headerOffset)) &&
      Number(meta.headerOffset) > 0
    ) {
      candidateOffsets.push(Number(meta.headerOffset));
    }
    candidateOffsets.push(0);

    let lastError: unknown = null;
    for (const offset of candidateOffsets) {
      try {
        const ciphertext = fileBytes.subarray(offset, cvpSigIndex);
        if (ciphertext.byteLength < 16) continue;
        const plainBuffer = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as unknown as BufferSource },
          key,
          ciphertext as unknown as BufferSource
        );
        return {
          payload: parseDecryptedInnerContent(plainBuffer, fallbackOwner),
          detectedFormat: 'cvp',
          detectedMode: 'polyglot',
          iterations,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Gagal mendekripsi berkas Polyglot .cvp.');
  }

  // 3. Standard JSON Containers (.anf vz-anf-v1, .cvp v3, or .enc vz.myvault.enc.v1)
  const textContent = dec.decode(fileBytes).trim();
  const container = JSON.parse(textContent) as Record<string, unknown>;
  if (!isSafePlainObject(container)) {
    throw new Error('Format kontainer JSON Vault tidak dikenali.');
  }

  // 3a. VZ Ecosystem .anf Standard JSON (vz-anf-v1, v: 4)
  if (container.format === 'vz-anf-v1' || container.v === 4) {
    if (
      typeof container.salt !== 'string' ||
      typeof container.iv !== 'string' ||
      typeof container.content !== 'string'
    ) {
      throw new Error('Struktur berkas .anf (vz-anf-v1) tidak lengkap.');
    }
    const iterations = Number(container.iterations) || ANF_PBKDF2_ITERATIONS;
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error('Parameter iterasi PBKDF2 .anf tidak aman.');
    }
    const salt = base64ToBytes(container.salt);
    const iv = base64ToBytes(container.iv);
    const ciphertext = base64ToBytes(container.content);
    const key = await deriveAesGcmKey(passphrase, salt, iterations);
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    return {
      payload: parseDecryptedInnerContent(plainBuffer, fallbackOwner),
      detectedFormat: 'anf',
      detectedMode: 'standard',
      iterations,
    };
  }

  // 3b. CipherVault Pro v3 Standard JSON (.cvp)
  if (
    container.v === 3 &&
    typeof container.salt === 'string' &&
    typeof container.iv === 'string' &&
    typeof container.content === 'string'
  ) {
    const iterations = Number(container.iterations) || CVP_PBKDF2_ITERATIONS;
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error('Parameter iterasi PBKDF2 .cvp tidak aman.');
    }
    const salt = base64ToBytes(container.salt);
    const iv = base64ToBytes(container.iv);
    const ciphertext = base64ToBytes(container.content);
    const key = await deriveAesGcmKey(passphrase, salt, iterations);
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    return {
      payload: parseDecryptedInnerContent(plainBuffer, fallbackOwner),
      detectedFormat: 'cvp',
      detectedMode: 'standard',
      iterations,
    };
  }

  // 3c. Standard MyVault .enc (vz.myvault.enc.v1)
  if (
    container.format === 'vz.myvault.enc.v1' &&
    container.kdf === 'PBKDF2-SHA256' &&
    container.cipher === 'AES-256-GCM' &&
    typeof container.saltBase64 === 'string' &&
    typeof container.ivBase64 === 'string' &&
    typeof container.ciphertextBase64 === 'string'
  ) {
    const iterations = Number(container.iterations);
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw new Error('Parameter iterasi PBKDF2 .enc tidak aman atau di luar batas.');
    }
    const salt = base64ToBytes(container.saltBase64);
    const iv = base64ToBytes(container.ivBase64);
    const ciphertext = base64ToBytes(container.ciphertextBase64);

    if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) {
      throw new Error('Parameter kriptografi (salt/iv/ciphertext) .enc tidak valid.');
    }

    const key = await deriveAesGcmKey(passphrase, salt, iterations);
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    return {
      payload: parseDecryptedInnerContent(plainBuffer, fallbackOwner),
      detectedFormat: 'enc',
      detectedMode: 'standard',
      iterations,
    };
  }

  throw new Error(
    'Format berkas tidak dikenali. Gunakan berkas .anf (vz-anf-v1), .cvp (CipherVault Pro v3), atau .enc (MyVault).'
  );
}

export function triggerBrowserDownload(
  filename: string,
  content: string | Uint8Array,
  mimeType = 'application/octet-stream'
) {
  const safeFilename =
    filename.replace(/[/\\:*?"<>|]/g, '_').slice(0, 128) || 'export.txt';
  const blobPart: BlobPart =
    typeof content === 'string'
      ? content
      : (content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength
        ) as ArrayBuffer);
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
