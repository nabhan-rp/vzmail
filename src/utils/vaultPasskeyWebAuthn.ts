/**
 * Client-side Zero-Knowledge WebAuthn Biometrics & Passkeys (+ PRF Extension) Engine for VZ Vault.
 *
 * Inspired by CipherVault Pro (`vault.vz.gay` / `chipervaultpro`):
 * - 100% client-side, offline-PWA friendly, zero server credential storage
 * - Strict assertion verification: clientDataJSON (type, challenge, origin),
 *   authenticatorData (SHA-256 rpIdHash, UP + UV flags)
 * - WebAuthn PRF extension support: derives non-extractable HKDF-SHA256 -> AES-256-GCM
 *   keys for sealing recovery phrases and deriving deterministic hardware-backed backup keys
 * - Graceful non-PRF fallback: standard user-verified WebAuthn biometric unlock still works
 */

import { sanitizeHandle } from './mailIdentity';
import { isSafePlainObject } from './mailSecurity';
import type { VaultAutoLockMinutes, VaultPinLockMode } from './mailVaultCrypto';

export type PasskeyAuthenticatorType = 'platform' | 'cross-platform';

export interface VaultPasskeyCredential {
  id: string;
  label: string;
  authenticatorType: PasskeyAuthenticatorType;
  transports: string[];
  prfSupported: boolean;
  prfSaltBase64: string;
  rpId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface VaultPasskeyConfig {
  enabled: boolean;
  lockMode: Exclude<VaultPinLockMode, 'off'>;
  autoLockMinutes: VaultAutoLockMinutes;
  lockOnTabHidden: boolean;
  credentials: VaultPasskeyCredential[];
  updatedAt: string;
}

export interface VaultBiometricPhraseLockerMeta {
  credentialId: string;
  credentialLabel: string;
  updatedAt: string;
}

interface StoredBiometricPhraseLocker extends VaultBiometricPhraseLockerMeta {
  version: 1;
  prfSaltBase64: string;
  hkdfSaltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

export interface WebAuthnCapabilityReport {
  supported: boolean;
  secureContext: boolean;
  platformAuthenticatorAvailable: boolean;
  conditionalMediationAvailable: boolean;
  inIframe: boolean;
  rpId: string;
  origin: string;
  reasonId: string | null;
  reasonEn: string | null;
}

interface WebAuthnPrfExtensionOutput {
  enabled?: boolean;
  results?: {
    first?: BufferSource;
    second?: BufferSource;
  };
}

interface AuthenticationExtensionsWithPrf {
  prf?: WebAuthnPrfExtensionOutput;
}

const PASSKEY_CONFIG_PREFIX = 'vz_vault_passkeys_v1';
const BIOMETRIC_LOCKER_PREFIX = 'vz_vault_bio_phrase_locker_v1';
const MAX_PASSKEYS_PER_USER = 8;

function getPasskeyConfigKey(username?: string): string {
  const safeUser = username ? sanitizeHandle(username) : 'default';
  return `${PASSKEY_CONFIG_PREFIX}:${safeUser}`;
}

function getBiometricLockerKey(username?: string): string {
  const safeUser = username ? sanitizeHandle(username) : 'default';
  return `${BIOMETRIC_LOCKER_PREFIX}:${safeUser}`;
}

function assertWebCryptoReady(): void {
  if (
    typeof globalThis === 'undefined' ||
    !globalThis.crypto ||
    !globalThis.crypto.subtle
  ) {
    throw new Error(
      'Web Crypto API memerlukan koneksi HTTPS aman agar Biometrik / Passkey dapat digunakan.'
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLen));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  return base64ToBytes(b64u);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function toUint8Array(buf: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (buf instanceof Uint8Array) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new Uint8Array(buf);
}

function resolveCurrentRpId(): string {
  if (typeof window === 'undefined' || !window.location) return 'localhost';
  const host = window.location.hostname.toLowerCase();
  if (!host) return 'localhost';
  return host;
}

function resolveCurrentOrigin(): string {
  if (typeof window === 'undefined' || !window.location) return 'https://localhost';
  return window.location.origin;
}

function isRunningInsideIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

function normalizeAutoLockMinutes(raw: unknown): VaultAutoLockMinutes {
  if (raw === 1 || raw === 5 || raw === 15) return raw;
  return 5;
}

function normalizeLockMode(raw: unknown): Exclude<VaultPinLockMode, 'off'> {
  return raw === 'sensitive_actions' ? 'sensitive_actions' : 'full_vault_autolock';
}

function buildDefaultPasskeyConfig(): VaultPasskeyConfig {
  return {
    enabled: false,
    lockMode: 'full_vault_autolock',
    autoLockMinutes: 5,
    lockOnTabHidden: true,
    credentials: [],
    updatedAt: '',
  };
}

function savePasskeyConfigRaw(
  username: string | undefined,
  config: VaultPasskeyConfig
): VaultPasskeyConfig {
  const normalized: VaultPasskeyConfig = {
    ...config,
    enabled: config.credentials.length > 0,
    updatedAt: config.updatedAt || new Date().toISOString(),
  };
  try {
    globalThis.localStorage.setItem(
      getPasskeyConfigKey(username),
      JSON.stringify(normalized)
    );
  } catch {
    // Ignore storage quota or private WebView limits
  }
  return normalized;
}

export function getVaultPasskeyConfig(username?: string): VaultPasskeyConfig {
  const fallback = buildDefaultPasskeyConfig();
  try {
    const raw = globalThis.localStorage.getItem(getPasskeyConfigKey(username));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<VaultPasskeyConfig>;
    if (!isSafePlainObject(parsed)) return fallback;

    const rawCreds = Array.isArray(parsed.credentials) ? parsed.credentials : [];
    const credentials: VaultPasskeyCredential[] = [];
    for (const item of rawCreds) {
      if (!isSafePlainObject(item)) continue;
      if (typeof item.id !== 'string' || item.id.length < 8) continue;
      if (typeof item.prfSaltBase64 !== 'string' || item.prfSaltBase64.length < 16) continue;
      credentials.push({
        id: item.id,
        label:
          typeof item.label === 'string' && item.label.trim().length > 0
            ? item.label.trim().slice(0, 60)
            : 'Device Passkey',
        authenticatorType:
          item.authenticatorType === 'cross-platform' ? 'cross-platform' : 'platform',
        transports: Array.isArray(item.transports)
          ? item.transports.filter((t): t is string => typeof t === 'string').slice(0, 6)
          : [],
        prfSupported: Boolean(item.prfSupported),
        prfSaltBase64: item.prfSaltBase64,
        rpId: typeof item.rpId === 'string' && item.rpId ? item.rpId : resolveCurrentRpId(),
        createdAt:
          typeof item.createdAt === 'string' && item.createdAt
            ? item.createdAt
            : new Date().toISOString(),
        lastUsedAt: typeof item.lastUsedAt === 'string' ? item.lastUsedAt : null,
      });
    }

    return {
      enabled: credentials.length > 0,
      lockMode: normalizeLockMode(parsed.lockMode),
      autoLockMinutes: normalizeAutoLockMinutes(parsed.autoLockMinutes),
      lockOnTabHidden: parsed.lockOnTabHidden !== false,
      credentials: credentials.slice(0, MAX_PASSKEYS_PER_USER),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return fallback;
  }
}

export function updateVaultPasskeySettings(
  username: string | undefined,
  patch: Partial<
    Pick<VaultPasskeyConfig, 'lockMode' | 'autoLockMinutes' | 'lockOnTabHidden'>
  >
): VaultPasskeyConfig {
  const current = getVaultPasskeyConfig(username);
  return savePasskeyConfigRaw(username, {
    ...current,
    lockMode: patch.lockMode ? normalizeLockMode(patch.lockMode) : current.lockMode,
    autoLockMinutes:
      patch.autoLockMinutes !== undefined
        ? normalizeAutoLockMinutes(patch.autoLockMinutes)
        : current.autoLockMinutes,
    lockOnTabHidden:
      typeof patch.lockOnTabHidden === 'boolean'
        ? patch.lockOnTabHidden
        : current.lockOnTabHidden,
    updatedAt: new Date().toISOString(),
  });
}

export function suggestDefaultPasskeyLabel(
  authenticatorType: PasskeyAuthenticatorType,
  lang: 'id' | 'en' = 'id'
): string {
  if (authenticatorType === 'cross-platform') {
    return lang === 'id' ? 'Security Key / Passkey Lintas Perangkat' : 'Security Key / Cross-Device Passkey';
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/i.test(ua)) return 'iPhone Face ID / Touch ID';
  if (/iPad/i.test(ua)) return 'iPad Biometrics';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'MacBook Touch ID';
  if (/Android/i.test(ua)) return lang === 'id' ? 'Biometrik Android' : 'Android Biometrics';
  if (/Windows/i.test(ua)) return 'Windows Hello';
  return lang === 'id' ? 'Biometrik Perangkat Ini' : 'This Device Biometrics';
}

export async function detectWebAuthnCapabilities(): Promise<WebAuthnCapabilityReport> {
  const secureContext =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const inIframe = isRunningInsideIframe();
  const rpId = resolveCurrentRpId();
  const origin = resolveCurrentOrigin();

  const hasWebAuthn =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials) &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function';

  if (!secureContext) {
    return {
      supported: false,
      secureContext: false,
      platformAuthenticatorAvailable: false,
      conditionalMediationAvailable: false,
      inIframe,
      rpId,
      origin,
      reasonId: 'Biometrik & Passkey memerlukan HTTPS aman (atau localhost).',
      reasonEn: 'Biometrics & Passkeys require a secure HTTPS context (or localhost).',
    };
  }

  if (!hasWebAuthn) {
    return {
      supported: false,
      secureContext: true,
      platformAuthenticatorAvailable: false,
      conditionalMediationAvailable: false,
      inIframe,
      rpId,
      origin,
      reasonId:
        'Browser atau WebView ini belum mendukung WebAuthn / Passkey. Buka di Chrome, Safari, atau Edge utama.',
      reasonEn:
        'This browser or WebView does not support WebAuthn / Passkeys. Open in Chrome, Safari, or Edge.',
    };
  }

  let platformAuthenticatorAvailable = false;
  let conditionalMediationAvailable = false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      platformAuthenticatorAvailable =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    platformAuthenticatorAvailable = false;
  }

  try {
    const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
      isConditionalMediationAvailable?: () => Promise<boolean>;
    };
    if (typeof pkc.isConditionalMediationAvailable === 'function') {
      conditionalMediationAvailable = await pkc.isConditionalMediationAvailable();
    }
  } catch {
    conditionalMediationAvailable = false;
  }

  return {
    supported: true,
    secureContext: true,
    platformAuthenticatorAvailable,
    conditionalMediationAvailable,
    inIframe,
    rpId,
    origin,
    reasonId: inIframe
      ? 'Aplikasi berjalan di dalam iframe preview. Jika prompt biometrik diblokir browser, buka langsung di tab penuh (mail.vz.gay) atau gunakan Kunci PIN.'
      : null,
    reasonEn: inIframe
      ? 'Running inside an embedded iframe preview. If the browser blocks passkey prompts here, open directly in a full tab (mail.vz.gay) or use PIN Lock.'
      : null,
  };
}

export function getFriendlyWebAuthnError(
  err: unknown,
  lang: 'id' | 'en',
  inIframe: boolean
): { cancelled: boolean; message: string } {
  const domErr = err as { name?: string; message?: string } | null;
  const name = domErr?.name || '';
  const rawMsg = domErr?.message || '';

  if (name === 'NotAllowedError' || name === 'AbortError') {
    if (inIframe && /permissions|feature|policy|publickey-credentials/i.test(rawMsg)) {
      return {
        cancelled: false,
        message:
          lang === 'id'
            ? 'Prompt Biometrik/Passkey dibatasi di dalam iframe preview. Buka langsung di tab browser penuh (mail.vz.gay) atau gunakan Kunci PIN.'
            : 'Biometric/Passkey prompts are restricted inside an embedded iframe. Open in a full browser tab (mail.vz.gay) or use PIN Lock.',
      };
    }
    return {
      cancelled: true,
      message:
        lang === 'id'
          ? 'Verifikasi biometrik / passkey dibatalkan atau waktu habis. Anda dapat mencoba lagi.'
          : 'Biometric / passkey prompt was cancelled or timed out. You can try again.',
    };
  }

  if (name === 'SecurityError') {
    return {
      cancelled: false,
      message:
        lang === 'id'
          ? 'Domain/iframe saat ini tidak mengizinkan WebAuthn. Pastikan mengakses via HTTPS di tab utama.'
          : 'Current origin or iframe policy blocked WebAuthn. Access via HTTPS in a top-level browser tab.',
    };
  }

  if (name === 'InvalidStateError') {
    return {
      cancelled: false,
      message:
        lang === 'id'
          ? 'Authenticator ini sudah terdaftar sebelumnya pada VZ Vault.'
          : 'This authenticator is already registered with VZ Vault.',
    };
  }

  if (name === 'NotSupportedError') {
    return {
      cancelled: false,
      message:
        lang === 'id'
          ? 'Perangkat atau browser ini tidak mendukung jenis authenticator yang dipilih.'
          : 'This device or browser does not support the selected authenticator type.',
    };
  }

  return {
    cancelled: false,
    message:
      rawMsg ||
      (lang === 'id'
        ? 'Gagal memproses verifikasi Biometrik / Passkey.'
        : 'Failed to process Biometric / Passkey verification.'),
  };
}

/**
 * Cryptographically verifies WebAuthn `get()` assertion clientDataJSON & authenticatorData:
 * - `clientDataJSON.type === 'webauthn.get'`
 * - exact challenge match (constant-time)
 * - exact origin match
 * - SHA-256(expectedRpId) === authenticatorData[0..31] (constant-time)
 * - UP (0x01) AND UV (0x04) flags must both be set
 */
async function assertStrictWebAuthnAssertion(
  assertion: PublicKeyCredential,
  expectedChallenge: Uint8Array,
  expectedRpId: string,
  expectedOrigin: string
): Promise<void> {
  assertWebCryptoReady();
  const response = assertion.response as AuthenticatorAssertionResponse;
  if (!response || !response.clientDataJSON || !response.authenticatorData) {
    throw new Error('Respons WebAuthn tidak lengkap.');
  }

  // 1. Validate clientDataJSON
  const clientDataText = new TextDecoder().decode(toUint8Array(response.clientDataJSON));
  const clientData = JSON.parse(clientDataText) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  if (clientData.type !== 'webauthn.get') {
    throw new Error('Tipe respons WebAuthn tidak valid.');
  }
  if (typeof clientData.challenge !== 'string') {
    throw new Error('Challenge WebAuthn tidak ditemukan.');
  }
  const returnedChallenge = base64UrlToBytes(clientData.challenge);
  if (!constantTimeEqual(returnedChallenge, expectedChallenge)) {
    throw new Error('Challenge WebAuthn tidak cocok (kemungkinan replay ditolak).');
  }
  if (clientData.origin !== expectedOrigin) {
    throw new Error('Origin WebAuthn tidak cocok dengan domain aktif.');
  }

  // 2. Validate authenticatorData (rpIdHash + UP/UV flags)
  const authData = toUint8Array(response.authenticatorData);
  if (authData.byteLength < 37) {
    throw new Error('Data authenticator WebAuthn terlalu pendek.');
  }
  const rpIdBytes = new TextEncoder().encode(expectedRpId);
  const expectedRpIdHash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', rpIdBytes as unknown as BufferSource)
  );
  const actualRpIdHash = authData.subarray(0, 32);
  if (!constantTimeEqual(actualRpIdHash, expectedRpIdHash)) {
    throw new Error('RP ID hash pada authenticator tidak cocok dengan domain aktif.');
  }

  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    throw new Error(
      'Verifikasi biometrik/PIN perangkat (User Verification) wajib berhasil untuk membuka VZ Vault.'
    );
  }
}

/**
 * Registers a new Biometric / Passkey credential in VZ Vault and probes WebAuthn PRF support.
 */
export async function registerVaultPasskey(
  username: string | undefined,
  options: {
    label?: string;
    authenticatorType: PasskeyAuthenticatorType;
    lockMode?: Exclude<VaultPinLockMode, 'off'>;
    autoLockMinutes?: VaultAutoLockMinutes;
    lockOnTabHidden?: boolean;
    lang?: 'id' | 'en';
  }
): Promise<{ config: VaultPasskeyConfig; credential: VaultPasskeyCredential }> {
  assertWebCryptoReady();
  const lang = options.lang ?? 'id';
  const caps = await detectWebAuthnCapabilities();
  if (!caps.supported) {
    throw new Error(
      (lang === 'id' ? caps.reasonId : caps.reasonEn) ||
        'WebAuthn tidak didukung di browser ini.'
    );
  }

  const current = getVaultPasskeyConfig(username);
  if (current.credentials.length >= MAX_PASSKEYS_PER_USER) {
    throw new Error(
      lang === 'id'
        ? `Maksimal ${MAX_PASSKEYS_PER_USER} Passkey per akun pada perangkat ini. Hapus salah satu terlebih dahulu.`
        : `Maximum of ${MAX_PASSKEYS_PER_USER} Passkeys per account reached on this device. Remove one first.`
    );
  }

  const safeUser = username ? sanitizeHandle(username) : 'vault-user';
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const prfSalt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const rpId = caps.rpId;

  const excludeCredentials: PublicKeyCredentialDescriptor[] = current.credentials
    .filter((c) => c.rpId === rpId)
    .map((c) => ({
      type: 'public-key',
      id: base64UrlToBytes(c.id) as unknown as BufferSource,
    }));

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: challenge as unknown as BufferSource,
    rp: {
      name: 'VZ Vault (CipherVault Standard)',
      id: rpId,
    },
    user: {
      id: userIdBytes as unknown as BufferSource,
      name: `${safeUser}@imy.li`,
      displayName: `VZ Vault · @${safeUser}`,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256)
      { type: 'public-key', alg: -257 }, // RS256 fallback
    ],
    authenticatorSelection: {
      authenticatorAttachment: options.authenticatorType,
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials,
    attestation: 'none',
    timeout: 60_000,
    extensions: {
      prf: {
        eval: {
          first: prfSalt as unknown as BufferSource,
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  let created: Credential | null;
  try {
    created = await navigator.credentials.create({ publicKey: publicKeyOptions });
  } catch (err) {
    const friendly = getFriendlyWebAuthnError(err, lang, caps.inIframe);
    throw new Error(friendly.message);
  }

  if (!created || created.type !== 'public-key') {
    throw new Error(
      lang === 'id'
        ? 'Authenticator tidak mengembalikan kredensial Passkey yang valid.'
        : 'Authenticator did not return a valid Passkey credential.'
    );
  }

  const pkCred = created as PublicKeyCredential;
  const attestationResp = pkCred.response as AuthenticatorAttestationResponse & {
    getTransports?: () => string[];
  };
  const extResults = (
    typeof pkCred.getClientExtensionResults === 'function'
      ? pkCred.getClientExtensionResults()
      : {}
  ) as AuthenticationExtensionsWithPrf;

  const prfSupported = Boolean(
    extResults?.prf?.enabled || extResults?.prf?.results?.first
  );
  const transports =
    typeof attestationResp.getTransports === 'function'
      ? attestationResp.getTransports().slice(0, 6)
      : options.authenticatorType === 'platform'
        ? ['internal']
        : ['usb', 'hybrid'];

  const credentialId = bytesToBase64Url(toUint8Array(pkCred.rawId));
  const cleanLabel =
    options.label && options.label.trim().length > 0
      ? options.label.trim().slice(0, 60)
      : suggestDefaultPasskeyLabel(options.authenticatorType, lang);

  const nowIso = new Date().toISOString();
  const newRecord: VaultPasskeyCredential = {
    id: credentialId,
    label: cleanLabel,
    authenticatorType: options.authenticatorType,
    transports,
    prfSupported,
    prfSaltBase64: bytesToBase64(prfSalt),
    rpId,
    createdAt: nowIso,
    lastUsedAt: nowIso,
  };

  const nextCredentials = [
    newRecord,
    ...current.credentials.filter((c) => c.id !== credentialId),
  ].slice(0, MAX_PASSKEYS_PER_USER);

  const savedConfig = savePasskeyConfigRaw(username, {
    enabled: true,
    lockMode: options.lockMode
      ? normalizeLockMode(options.lockMode)
      : current.lockMode,
    autoLockMinutes:
      options.autoLockMinutes !== undefined
        ? normalizeAutoLockMinutes(options.autoLockMinutes)
        : current.autoLockMinutes,
    lockOnTabHidden:
      typeof options.lockOnTabHidden === 'boolean'
        ? options.lockOnTabHidden
        : current.lockOnTabHidden,
    credentials: nextCredentials,
    updatedAt: nowIso,
  });

  return { config: savedConfig, credential: newRecord };
}

/**
 * Prompts the user's enrolled Biometric / Passkey authenticator and performs strict verification.
 * Optionally evaluates the WebAuthn PRF extension to return 32 bytes of hardware-derived entropy.
 */
export async function verifyVaultPasskeyAssertion(
  username: string | undefined,
  options?: {
    credentialId?: string;
    requirePrf?: boolean;
    prfSaltOverrideBase64?: string;
    lang?: 'id' | 'en';
  }
): Promise<
  | {
      ok: true;
      credential: VaultPasskeyCredential;
      prfOutputBytes: Uint8Array | null;
      config: VaultPasskeyConfig;
    }
  | { ok: false; cancelled: boolean; error: string }
> {
  const lang = options?.lang ?? 'id';
  const caps = await detectWebAuthnCapabilities();
  if (!caps.supported) {
    return {
      ok: false,
      cancelled: false,
      error:
        (lang === 'id' ? caps.reasonId : caps.reasonEn) ||
        'WebAuthn tidak tersedia.',
    };
  }

  const current = getVaultPasskeyConfig(username);
  const matchingRpCreds = current.credentials.filter(
    (c) => c.rpId === caps.rpId
  );
  const targetPool = options?.credentialId
    ? matchingRpCreds.filter((c) => c.id === options.credentialId)
    : options?.requirePrf
      ? matchingRpCreds.filter((c) => c.prfSupported)
      : matchingRpCreds;

  if (targetPool.length === 0) {
    return {
      ok: false,
      cancelled: false,
      error: options?.requirePrf
        ? lang === 'id'
          ? 'Belum ada Passkey berkemampuan PRF pada domain ini. Daftarkan Passkey yang mendukung PRF terlebih dahulu.'
          : 'No PRF-capable Passkey is enrolled on this domain yet.'
        : lang === 'id'
          ? `Belum ada Passkey terdaftar untuk domain ${caps.rpId}.`
          : `No Passkeys are enrolled for domain ${caps.rpId}.`,
    };
  }

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const evalByCredential: Record<string, { first: BufferSource }> = {};
  for (const cred of targetPool) {
    const saltBytes = base64ToBytes(
      options?.prfSaltOverrideBase64 || cred.prfSaltBase64
    );
    evalByCredential[cred.id] = {
      first: saltBytes as unknown as BufferSource,
    };
  }

  const primarySaltBytes = base64ToBytes(
    options?.prfSaltOverrideBase64 || targetPool[0].prfSaltBase64
  );

  const allowCredentials: PublicKeyCredentialDescriptor[] = targetPool.map((c) => ({
    type: 'public-key',
    id: base64UrlToBytes(c.id) as unknown as BufferSource,
    transports: c.transports as AuthenticatorTransport[],
  }));

  const getOptions: PublicKeyCredentialRequestOptions = {
    challenge: challenge as unknown as BufferSource,
    rpId: caps.rpId,
    allowCredentials,
    userVerification: 'required',
    timeout: 60_000,
    extensions: {
      prf: {
        eval: { first: primarySaltBytes as unknown as BufferSource },
        evalByCredential,
      },
    } as AuthenticationExtensionsClientInputs,
  };

  let assertionCred: Credential | null;
  try {
    assertionCred = await navigator.credentials.get({ publicKey: getOptions });
  } catch (err) {
    const friendly = getFriendlyWebAuthnError(err, lang, caps.inIframe);
    return {
      ok: false,
      cancelled: friendly.cancelled,
      error: friendly.message,
    };
  }

  if (!assertionCred || assertionCred.type !== 'public-key') {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Verifikasi Passkey tidak mengembalikan respons yang valid.'
          : 'Passkey verification returned an invalid credential response.',
    };
  }

  const pkAssertion = assertionCred as PublicKeyCredential;
  const matchedId = bytesToBase64Url(toUint8Array(pkAssertion.rawId));
  const matchedRecord = targetPool.find((c) => c.id === matchedId);
  if (!matchedRecord) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Kredensial Passkey yang dipilih tidak terdaftar di VZ Vault akun ini.'
          : 'Selected Passkey credential is not enrolled in this VZ Vault account.',
    };
  }

  try {
    await assertStrictWebAuthnAssertion(
      pkAssertion,
      challenge,
      caps.rpId,
      caps.origin
    );
  } catch (err) {
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const extResults = (
    typeof pkAssertion.getClientExtensionResults === 'function'
      ? pkAssertion.getClientExtensionResults()
      : {}
  ) as AuthenticationExtensionsWithPrf;

  const prfFirst = extResults?.prf?.results?.first;
  const prfOutputBytes = prfFirst ? toUint8Array(prfFirst) : null;

  if (options?.requirePrf && (!prfOutputBytes || prfOutputBytes.byteLength < 16)) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Authenticator ini tidak mengembalikan kunci WebAuthn PRF pada browser saat ini. Gunakan mode Frasa Sandi atau browser yang mendukung PRF (Chrome/Edge/Safari 18+).'
          : 'This authenticator did not return WebAuthn PRF key output in the current browser. Use Passphrase mode or a PRF-capable browser (Chrome/Edge/Safari 18+).',
    };
  }

  const nowIso = new Date().toISOString();
  const updatedCredentials = current.credentials.map((c) =>
    c.id === matchedRecord.id
      ? {
          ...c,
          prfSupported: c.prfSupported || Boolean(prfOutputBytes),
          lastUsedAt: nowIso,
        }
      : c
  );
  const updatedConfig = savePasskeyConfigRaw(username, {
    ...current,
    credentials: updatedCredentials,
    updatedAt: nowIso,
  });
  const freshRecord =
    updatedCredentials.find((c) => c.id === matchedRecord.id) || matchedRecord;

  return {
    ok: true,
    credential: freshRecord,
    prfOutputBytes,
    config: updatedConfig,
  };
}

export function renameVaultPasskey(
  username: string | undefined,
  credentialId: string,
  nextLabel: string
): VaultPasskeyConfig {
  const cleanLabel = nextLabel.trim().slice(0, 60);
  if (!cleanLabel) return getVaultPasskeyConfig(username);
  const current = getVaultPasskeyConfig(username);
  const nextCredentials = current.credentials.map((c) =>
    c.id === credentialId ? { ...c, label: cleanLabel } : c
  );
  return savePasskeyConfigRaw(username, {
    ...current,
    credentials: nextCredentials,
    updatedAt: new Date().toISOString(),
  });
}

export function removeVaultPasskey(
  username: string | undefined,
  credentialId: string
): VaultPasskeyConfig {
  const current = getVaultPasskeyConfig(username);
  const nextCredentials = current.credentials.filter((c) => c.id !== credentialId);

  // If the Biometric PRF Phrase Locker was bound to the deleted credential, clear it safely
  const locker = readBiometricPhraseLockerRaw(username);
  if (locker && locker.credentialId === credentialId) {
    clearBiometricPhraseLocker(username);
  }

  return savePasskeyConfigRaw(username, {
    ...current,
    enabled: nextCredentials.length > 0,
    credentials: nextCredentials,
    updatedAt: new Date().toISOString(),
  });
}

// ============================================================================
// WebAuthn PRF Envelope Crypto (HKDF-SHA256 -> AES-256-GCM)
// ============================================================================

async function derivePrfAesWrappingKey(
  prfOutputBytes: Uint8Array,
  hkdfSalt: Uint8Array,
  infoLabel: string
): Promise<CryptoKey> {
  assertWebCryptoReady();
  const hkdfKey = await globalThis.crypto.subtle.importKey(
    'raw',
    prfOutputBytes as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt as unknown as BufferSource,
      info: new TextEncoder().encode(infoLabel) as unknown as BufferSource,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function derivePrfDeterministicBackupSecret(
  prfOutputBytes: Uint8Array,
  prfSalt: Uint8Array,
  rpId: string
): Promise<string> {
  assertWebCryptoReady();
  const hkdfKey = await globalThis.crypto.subtle.importKey(
    'raw',
    prfOutputBytes as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveBits']
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: prfSalt as unknown as BufferSource,
      info: new TextEncoder().encode(
        `vz-vault-prf-backup-key-v1:${rpId}`
      ) as unknown as BufferSource,
    },
    hkdfKey,
    256
  );
  return `vzprf1-${bytesToBase64Url(new Uint8Array(derivedBits))}`;
}

function readBiometricPhraseLockerRaw(
  username?: string
): StoredBiometricPhraseLocker | null {
  try {
    const raw = globalThis.localStorage.getItem(getBiometricLockerKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBiometricPhraseLocker>;
    if (
      !isSafePlainObject(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.prfSaltBase64 !== 'string' ||
      typeof parsed.hkdfSaltBase64 !== 'string' ||
      typeof parsed.ivBase64 !== 'string' ||
      typeof parsed.ciphertextBase64 !== 'string'
    ) {
      return null;
    }
    return {
      version: 1,
      credentialId: parsed.credentialId,
      credentialLabel:
        typeof parsed.credentialLabel === 'string' && parsed.credentialLabel
          ? parsed.credentialLabel
          : 'Passkey (PRF)',
      prfSaltBase64: parsed.prfSaltBase64,
      hkdfSaltBase64: parsed.hkdfSaltBase64,
      ivBase64: parsed.ivBase64,
      ciphertextBase64: parsed.ciphertextBase64,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function hasBiometricPhraseLocker(username?: string): boolean {
  return readBiometricPhraseLockerRaw(username) !== null;
}

export function getBiometricPhraseLockerMeta(
  username?: string
): VaultBiometricPhraseLockerMeta | null {
  const locker = readBiometricPhraseLockerRaw(username);
  if (!locker) return null;
  return {
    credentialId: locker.credentialId,
    credentialLabel: locker.credentialLabel,
    updatedAt: locker.updatedAt,
  };
}

export function clearBiometricPhraseLocker(username?: string): void {
  try {
    globalThis.localStorage.removeItem(getBiometricLockerKey(username));
  } catch {
    // Ignore storage error
  }
}

/**
 * Seals a 12-word recovery phrase or custom backup passphrase locally using
 * a non-extractable AES-256-GCM key derived from the user's WebAuthn PRF Passkey.
 */
export async function sealPhraseWithBiometricPrf(
  username: string | undefined,
  phrase: string,
  options?: { credentialId?: string; lang?: 'id' | 'en' }
): Promise<
  | { ok: true; meta: VaultBiometricPhraseLockerMeta }
  | { ok: false; cancelled: boolean; error: string }
> {
  const lang = options?.lang ?? 'id';
  const cleanPhrase = phrase.trim();
  if (cleanPhrase.length < 8) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Buat frasa 12-kata atau masukkan kata sandi minimal 8 karakter terlebih dahulu.'
          : 'Generate a 12-word phrase or enter a passphrase of at least 8 characters first.',
    };
  }

  const assertion = await verifyVaultPasskeyAssertion(username, {
    credentialId: options?.credentialId,
    requirePrf: true,
    lang,
  });

  if (!assertion.ok) {
    return assertion;
  }
  if (!assertion.prfOutputBytes) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Kunci WebAuthn PRF tidak tersedia pada authenticator ini.'
          : 'WebAuthn PRF output was not available from this authenticator.',
    };
  }

  try {
    const hkdfSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await derivePrfAesWrappingKey(
      assertion.prfOutputBytes,
      hkdfSalt,
      'vz-vault-prf-phrase-locker-v1'
    );
    const plainBytes = new TextEncoder().encode(cleanPhrase);
    const cipherBuf = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      aesKey,
      plainBytes as unknown as BufferSource
    );

    const record: StoredBiometricPhraseLocker = {
      version: 1,
      credentialId: assertion.credential.id,
      credentialLabel: assertion.credential.label,
      prfSaltBase64: assertion.credential.prfSaltBase64,
      hkdfSaltBase64: bytesToBase64(hkdfSalt),
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuf)),
      updatedAt: new Date().toISOString(),
    };

    globalThis.localStorage.setItem(
      getBiometricLockerKey(username),
      JSON.stringify(record)
    );

    return {
      ok: true,
      meta: {
        credentialId: record.credentialId,
        credentialLabel: record.credentialLabel,
        updatedAt: record.updatedAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Prompts biometric verification to unseal the locally PRF-encrypted passphrase/12-word phrase.
 */
export async function unsealPhraseWithBiometricPrf(
  username: string | undefined,
  lang: 'id' | 'en' = 'id'
): Promise<
  | { ok: true; phrase: string; credentialLabel: string }
  | { ok: false; cancelled: boolean; error: string }
> {
  const locker = readBiometricPhraseLockerRaw(username);
  if (!locker) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Belum ada frasa yang disimpan di Brankas Biometrik perangkat ini.'
          : 'No recovery phrase is sealed in this device’s Biometric Locker yet.',
    };
  }

  const assertion = await verifyVaultPasskeyAssertion(username, {
    credentialId: locker.credentialId,
    requirePrf: true,
    prfSaltOverrideBase64: locker.prfSaltBase64,
    lang,
  });

  if (!assertion.ok) {
    return assertion;
  }
  if (!assertion.prfOutputBytes) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Authenticator tidak mengembalikan output PRF untuk membuka frasa.'
          : 'Authenticator did not return PRF output to unseal the phrase.',
    };
  }

  try {
    const aesKey = await derivePrfAesWrappingKey(
      assertion.prfOutputBytes,
      base64ToBytes(locker.hkdfSaltBase64),
      'vz-vault-prf-phrase-locker-v1'
    );
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(locker.ivBase64) as unknown as BufferSource,
      },
      aesKey,
      base64ToBytes(locker.ciphertextBase64) as unknown as BufferSource
    );
    const phrase = new TextDecoder().decode(plainBuf);
    return {
      ok: true,
      phrase,
      credentialLabel: assertion.credential.label,
    };
  } catch {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Gagal mendekripsi frasa dari Brankas Biometrik. Pastikan memakai Passkey yang sama saat mengunci.'
          : 'Failed to decrypt phrase from Biometric Locker. Ensure you use the same Passkey that sealed it.',
    };
  }
}

/**
 * Derives a deterministic high-entropy secret directly from a PRF-capable Passkey
 * for encrypting or decrypting .anf / .cvp / .enc vault backups without typing a password.
 */
export async function deriveBackupPassphraseViaPrf(
  username: string | undefined,
  options?: { credentialId?: string; lang?: 'id' | 'en' }
): Promise<
  | { ok: true; secretKey: string; credentialLabel: string }
  | { ok: false; cancelled: boolean; error: string }
> {
  const lang = options?.lang ?? 'id';
  const assertion = await verifyVaultPasskeyAssertion(username, {
    credentialId: options?.credentialId,
    requirePrf: true,
    lang,
  });

  if (!assertion.ok) {
    return assertion;
  }
  if (!assertion.prfOutputBytes) {
    return {
      ok: false,
      cancelled: false,
      error:
        lang === 'id'
          ? 'Passkey ini tidak mendukung WebAuthn PRF untuk derivasi kunci backup langsung.'
          : 'This Passkey does not support WebAuthn PRF for direct backup key derivation.',
    };
  }

  try {
    const secretKey = await derivePrfDeterministicBackupSecret(
      assertion.prfOutputBytes,
      base64ToBytes(assertion.credential.prfSaltBase64),
      assertion.credential.rpId
    );
    return {
      ok: true,
      secretKey,
      credentialLabel: assertion.credential.label,
    };
  } catch (err) {
    return {
      ok: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
