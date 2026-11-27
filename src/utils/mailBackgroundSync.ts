/**
 * Low-RAM Adaptive Background Sync, Opt-In Notifications, and Purge Tombstone Engine for VZ Mail.
 * Designed specifically to keep memory/CPU/battery footprint tiny on low-end & older phones.
 */

import type { OutboundEmailFormat } from './mailExternalLinks';

export type BackgroundSyncMode =
  | 'adaptive'
  | 'interval_30s'
  | 'interval_60s'
  | 'interval_3m'
  | 'interval_5m_saver'
  | 'tab_and_periodic_only';

export interface MailBackgroundSyncPrefs {
  /** Opt-in master switch (default: false) */
  enabled: boolean;
  /** Sync scheduling mode (default: 'adaptive') */
  mode: BackgroundSyncMode;
  /** Opt-in browser notifications (strictly requires enabled === true; default: false) */
  notificationsEnabled: boolean;
  /** Automatically pull & purge newly detected packets into local IndexedDB (default: true) */
  autoPullOnSync: boolean;
}

export interface DeviceResourceProfile {
  deviceMemoryGb: number | null;
  cpuCores: number | null;
  saveData: boolean;
  effectiveConnection: string | null;
  isLowEndDevice: boolean;
  periodicSyncSupported: boolean;
  notificationsSupported: boolean;
}

export const DEFAULT_BACKGROUND_SYNC_PREFS: MailBackgroundSyncPrefs = {
  enabled: false,
  mode: 'adaptive',
  notificationsEnabled: false,
  autoPullOnSync: true,
};

const BG_SYNC_PREFS_PREFIX = 'vz_mail_bg_sync_prefs_v1:';
const RECENT_ACK_PREFIX = 'vz_mail_recent_ack_v1:';
const INITIAL_SEED_DONE_PREFIX = 'vz_mail_seed_done_v1:';
const OUTBOUND_FORMAT_PREFIX = 'vz_mail_outbound_format_v1:';
const RECENT_ACK_TTL_MS = 90_000; // 90s grace window to outlast Cloudflare KV eventual consistency (~60s)

const VALID_SYNC_MODES = new Set<BackgroundSyncMode>([
  'adaptive',
  'interval_30s',
  'interval_60s',
  'interval_3m',
  'interval_5m_saver',
  'tab_and_periodic_only',
]);

export function sanitizeBackgroundSyncPrefs(
  raw: Partial<MailBackgroundSyncPrefs> | null | undefined
): MailBackgroundSyncPrefs {
  const enabled = Boolean(raw?.enabled);
  const rawMode = raw?.mode as BackgroundSyncMode | undefined;
  const mode: BackgroundSyncMode =
    rawMode && VALID_SYNC_MODES.has(rawMode) ? rawMode : 'adaptive';
  // Enforce strict dependency: notifications CANNOT be active when Background Sync is OFF
  const notificationsEnabled = enabled ? Boolean(raw?.notificationsEnabled) : false;
  const autoPullOnSync =
    typeof raw?.autoPullOnSync === 'boolean' ? raw.autoPullOnSync : true;

  return {
    enabled,
    mode,
    notificationsEnabled,
    autoPullOnSync,
  };
}

export function readBackgroundSyncPrefs(user: string): MailBackgroundSyncPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_BACKGROUND_SYNC_PREFS };
  try {
    const raw = localStorage.getItem(`${BG_SYNC_PREFS_PREFIX}${user}`);
    if (!raw) return { ...DEFAULT_BACKGROUND_SYNC_PREFS };
    return sanitizeBackgroundSyncPrefs(JSON.parse(raw) as Partial<MailBackgroundSyncPrefs>);
  } catch {
    return { ...DEFAULT_BACKGROUND_SYNC_PREFS };
  }
}

export function writeBackgroundSyncPrefs(
  user: string,
  prefs: MailBackgroundSyncPrefs
): MailBackgroundSyncPrefs {
  const clean = sanitizeBackgroundSyncPrefs(prefs);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${BG_SYNC_PREFS_PREFIX}${user}`, JSON.stringify(clean));
    } catch {
      // ignore quota/private-mode errors
    }
  }
  return clean;
}

export function readPreferredOutboundFormat(user: string): OutboundEmailFormat {
  if (typeof window === 'undefined') return 'minimal_html';
  try {
    const raw = localStorage.getItem(`${OUTBOUND_FORMAT_PREFIX}${user}`);
    if (raw === 'plain_text' || raw === 'minimal_html' || raw === 'rich_card') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'minimal_html';
}

export function writePreferredOutboundFormat(
  user: string,
  format: OutboundEmailFormat
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${OUTBOUND_FORMAT_PREFIX}${user}`, format);
  } catch {
    // ignore
  }
}

export function detectDeviceResourceProfile(): DeviceResourceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceMemoryGb: null,
      cpuCores: null,
      saveData: false,
      effectiveConnection: null,
      isLowEndDevice: false,
      periodicSyncSupported: false,
      notificationsSupported: false,
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  };

  const deviceMemoryGb =
    typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
      ? nav.deviceMemory
      : null;
  const cpuCores =
    typeof navigator.hardwareConcurrency === 'number' &&
    Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null;
  const saveData = Boolean(nav.connection?.saveData);
  const effectiveConnection = nav.connection?.effectiveType || null;
  const isSlowNetwork =
    effectiveConnection === 'slow-2g' || effectiveConnection === '2g';

  const isLowEndDevice = Boolean(
    saveData ||
      isSlowNetwork ||
      (deviceMemoryGb !== null && deviceMemoryGb <= 2) ||
      (cpuCores !== null && cpuCores <= 4 && (deviceMemoryGb === null || deviceMemoryGb <= 4))
  );

  const periodicSyncSupported =
    'serviceWorker' in navigator &&
    'PeriodicSyncManager' in window;
  const notificationsSupported = typeof Notification !== 'undefined';

  return {
    deviceMemoryGb,
    cpuCores,
    saveData,
    effectiveConnection,
    isLowEndDevice,
    periodicSyncSupported,
    notificationsSupported,
  };
}

/**
 * Computes the next lightweight poll delay in milliseconds, or `null` when polling timer
 * should stay completely dormant (e.g., `tab_and_periodic_only` mode or device offline).
 */
export function computeNextSyncDelayMs(
  mode: BackgroundSyncMode,
  profile: DeviceResourceProfile,
  isDocumentHidden: boolean
): number | null {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }
  if (mode === 'tab_and_periodic_only') {
    return null;
  }

  const lowPowerFactor = profile.isLowEndDevice || profile.saveData;

  switch (mode) {
    case 'adaptive':
      if (lowPowerFactor) {
        return isDocumentHidden ? 360_000 : 180_000; // 3 min active / 6 min hidden on low-end
      }
      return isDocumentHidden ? 240_000 : 60_000; // 60s active / 4 min hidden on standard
    case 'interval_30s':
      if (lowPowerFactor) {
        return isDocumentHidden ? 240_000 : 60_000;
      }
      return isDocumentHidden ? 120_000 : 30_000;
    case 'interval_60s':
      return isDocumentHidden ? 180_000 : 60_000;
    case 'interval_3m':
      return isDocumentHidden ? 360_000 : 180_000;
    case 'interval_5m_saver':
      return isDocumentHidden ? 600_000 : 300_000;
    default:
      return 60_000;
  }
}

export function formatSyncIntervalLabel(ms: number | null, lang: 'id' | 'en'): string {
  if (ms === null) {
    return lang === 'id' ? 'Saat kembali ke tab / PWA' : 'On tab resume / PWA';
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return lang === 'id' ? `${sec} detik` : `${sec}s`;
  }
  const mins = Math.round(sec / 60);
  return lang === 'id' ? `${mins} menit` : `${mins} min`;
}

/**
 * Registers or unregisters lightweight PWA Periodic Background Sync (`vz-mail-sync`).
 * Safe no-op on browsers that do not implement PeriodicSyncManager (Safari, Firefox).
 */
export async function syncPeriodicSyncRegistration(
  enabled: boolean,
  minIntervalMs = 15 * 60 * 1000
): Promise<{ supported: boolean; registered: boolean }> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PeriodicSyncManager' in window)
  ) {
    return { supported: false, registered: false };
  }

  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      periodicSync?: {
        register: (tag: string, options: { minInterval: number }) => Promise<void>;
        unregister: (tag: string) => Promise<void>;
      };
    };
    if (!reg.periodicSync) {
      return { supported: false, registered: false };
    }
    if (!enabled) {
      await reg.periodicSync.unregister('vz-mail-sync').catch(() => undefined);
      return { supported: true, registered: false };
    }
    await reg.periodicSync.register('vz-mail-sync', {
      minInterval: Math.max(60_000, minIntervalMs),
    });
    return { supported: true, registered: true };
  } catch {
    return { supported: true, registered: false };
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestMailNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Displays a privacy-conscious OS notification for newly arrived email(s).
 * Only displays sender name + subject (never persists sensitive email body in SW caches).
 */
export async function showIncomingMailNotification(params: {
  count: number;
  latestFrom: string;
  latestSubject: string;
  lang: 'id' | 'en';
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const title =
    params.count > 1
      ? params.lang === 'id'
        ? `${params.count} email baru di VZ Mail`
        : `${params.count} new emails in VZ Mail`
      : params.lang === 'id'
        ? `Email baru dari ${params.latestFrom}`
        : `New email from ${params.latestFrom}`;

  const body =
    params.count > 1
      ? params.lang === 'id'
        ? `Terbaru dari ${params.latestFrom}: ${params.latestSubject}`
        : `Latest from ${params.latestFrom}: ${params.latestSubject}`
      : params.latestSubject || (params.lang === 'id' ? '(Tanpa Subjek)' : '(No Subject)');

  const options: NotificationOptions = {
    body: body.slice(0, 140),
    icon: '/icons/mail-192.png',
    badge: '/icons/mail-192.png',
    tag: 'vz-mail-inbound',
    silent: false,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Pull & Purge Ghost-Packet Prevention (90s KV Eventual Consistency Tombstone)
// =============================================================================

function readRecentAckMap(user: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${RECENT_ACK_PREFIX}${user}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, expiresAt] of Object.entries(parsed)) {
      if (typeof expiresAt === 'number' && expiresAt > now) {
        cleaned[id] = expiresAt;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function recordRecentlyAckedPacketIds(user: string, ids: readonly string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const map = readRecentAckMap(user);
    const expiresAt = Date.now() + RECENT_ACK_TTL_MS;
    for (const id of ids) {
      if (id) map[id] = expiresAt;
    }
    // Cap stored tombstones to 120 recent entries to stay ultra-lightweight
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120);
    localStorage.setItem(
      `${RECENT_ACK_PREFIX}${user}`,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // ignore storage limits
  }
}

export function isPacketRecentlyAcked(user: string, packetId: string): boolean {
  if (!packetId) return false;
  const map = readRecentAckMap(user);
  return Boolean(map[packetId] && map[packetId] > Date.now());
}

export function filterOutRecentlyAckedPackets<T extends { id: string }>(
  user: string,
  packets: readonly T[]
): T[] {
  if (packets.length === 0) return [];
  const map = readRecentAckMap(user);
  const now = Date.now();
  return packets.filter((pkt) => !(map[pkt.id] && map[pkt.id] > now));
}

export function hasInitialTransitSeedBeenCompleted(user: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(`${INITIAL_SEED_DONE_PREFIX}${user}`) === '1';
  } catch {
    return false;
  }
}

export function markInitialTransitSeedCompleted(user: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${INITIAL_SEED_DONE_PREFIX}${user}`, '1');
  } catch {
    // ignore
  }
}
