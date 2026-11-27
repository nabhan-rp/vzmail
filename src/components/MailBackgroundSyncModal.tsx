import {
  Bell,
  BellOff,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  computeNextSyncDelayMs,
  detectDeviceResourceProfile,
  formatSyncIntervalLabel,
  getNotificationPermissionState,
  requestMailNotificationPermission,
  type BackgroundSyncMode,
  type MailBackgroundSyncPrefs,
} from '../utils/mailBackgroundSync';

interface MailBackgroundSyncModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  prefs: MailBackgroundSyncPrefs;
  onUpdatePrefs: (next: MailBackgroundSyncPrefs) => void;
  lastSyncedAt: string | null;
  periodicSyncRegistered: boolean;
  syncingNow: boolean;
  onSyncNow: () => Promise<void>;
}

const MANUAL_INTERVAL_OPTIONS: {
  mode: BackgroundSyncMode;
  labelId: string;
  labelEn: string;
}[] = [
  { mode: 'interval_30s', labelId: '30 dtk', labelEn: '30s' },
  { mode: 'interval_60s', labelId: '60 dtk', labelEn: '60s' },
  { mode: 'interval_3m', labelId: '3 mnt', labelEn: '3 min' },
  { mode: 'interval_5m_saver', labelId: 'Hemat (5 mnt)', labelEn: 'Saver (5m)' },
];

export function MailBackgroundSyncModal({
  open,
  onClose,
  lang,
  prefs,
  onUpdatePrefs,
  lastSyncedAt,
  periodicSyncRegistered,
  syncingNow,
  onSyncNow,
}: MailBackgroundSyncModalProps) {
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermissionState());
  const [requestingPermission, setRequestingPermission] = useState(false);

  const profile = detectDeviceResourceProfile();

  useEffect(() => {
    if (!open) return;
    setNotifPermission(getNotificationPermissionState());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isManualMode =
    prefs.mode === 'interval_30s' ||
    prefs.mode === 'interval_60s' ||
    prefs.mode === 'interval_3m' ||
    prefs.mode === 'interval_5m_saver';

  const activeDelayMs = computeNextSyncDelayMs(prefs.mode, profile, false);
  const hiddenDelayMs = computeNextSyncDelayMs(prefs.mode, profile, true);

  const handleToggleBackgroundSync = () => {
    if (prefs.enabled) {
      // Turning OFF Background Sync also enforces Notifications OFF
      onUpdatePrefs({
        ...prefs,
        enabled: false,
        notificationsEnabled: false,
      });
    } else {
      // Opting IN defaults to Adaptive Low-RAM mode if none chosen yet
      onUpdatePrefs({
        ...prefs,
        enabled: true,
        mode: prefs.mode || 'adaptive',
      });
    }
  };

  const handleToggleNotifications = async () => {
    if (!prefs.enabled) return;

    if (prefs.notificationsEnabled) {
      onUpdatePrefs({ ...prefs, notificationsEnabled: false });
      return;
    }

    setRequestingPermission(true);
    try {
      const perm = await requestMailNotificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        onUpdatePrefs({ ...prefs, notificationsEnabled: true });
      }
    } finally {
      setRequestingPermission(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        lang === 'id'
          ? 'Pengaturan Background Sync & Notifikasi'
          : 'Background Sync & Notifications Settings'
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[65] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="w-full sm:max-w-xl max-h-[90dvh] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
                {lang === 'id'
                  ? 'Background Sync Hemat RAM & Notifikasi'
                  : 'Low-RAM Background Sync & Notifications'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {lang === 'id'
                  ? 'Opt-in penuh · ramah baterai & HP low-end'
                  : 'Strictly opt-in · battery & low-end phone friendly'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'id' ? 'Tutup pengaturan sync' : 'Close sync settings'}
            className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* 1. Master Opt-In Background Sync Switch */}
          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Aktifkan Background Sync (Opt-In)'
                    : 'Enable Background Sync (Opt-In)'}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {lang === 'id'
                    ? 'Mengecek antrean email masuk secara ringan (metadata-only, tanpa WebSocket persisten). Mati secara bawaan demi kontrol penuh pengguna.'
                    : 'Checks incoming queue lightly (metadata-only, no persistent WebSockets). Off by default for full user control.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.enabled}
                onClick={handleToggleBackgroundSync}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  prefs.enabled
                    ? 'bg-blue-600'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span className="sr-only">
                  {lang === 'id' ? 'Toggle Background Sync' : 'Toggle Background Sync'}
                </span>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                    prefs.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Device RAM/CPU Profile Line (clean unboxed metadata) */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-[#232732] flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {profile.isLowEndDevice
                  ? lang === 'id'
                    ? 'Profil Perangkat Ringan terdeteksi (otomatis hemat RAM)'
                    : 'Low-end / power-saving device detected (auto RAM throttle)'
                  : lang === 'id'
                    ? 'Profil Perangkat Standar'
                    : 'Standard Device Profile'}
              </span>
              {profile.deviceMemoryGb !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    ~{profile.deviceMemoryGb} GB RAM
                  </span>
                </>
              )}
              {profile.saveData && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Save-Data ON
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 2. Sync Mode Selection (Visible when Background Sync ON) */}
          {prefs.enabled && (
            <div className="p-4 rounded-xl bg-white dark:bg-[#171B24] border border-slate-200 dark:border-[#232732] space-y-3">
              <div className="font-semibold text-slate-900 dark:text-white">
                {lang === 'id'
                  ? 'Mode Penjadwalan Sinkronisasi'
                  : 'Sync Scheduling Mode'}
              </div>

              <div className="space-y-2">
                {/* Mode 1: Adaptive Low-RAM (Default) */}
                <button
                  type="button"
                  onClick={() => onUpdatePrefs({ ...prefs, mode: 'adaptive' })}
                  className={`w-full min-h-[48px] text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    prefs.mode === 'adaptive'
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-600'
                      : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732] hover:bg-slate-100 dark:hover:bg-[#1B202B]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? '1. Adaptif Hemat RAM (Default)'
                        : '1. Adaptive Low-RAM (Default)'}
                    </span>
                    {prefs.mode === 'adaptive' && (
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {lang === 'id'
                      ? '60 dtk saat tab aktif; otomatis melambat di HP RAM kecil / Hemat Data / tab tersembunyi, dan berhenti saat offline.'
                      : '60s when active; automatically slows on low-RAM / Save-Data / hidden tabs, and pauses offline.'}
                  </p>
                </button>

                {/* Mode 2: Manual Interval */}
                <div
                  className={`p-3 rounded-lg border transition-colors ${
                    isManualMode
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-600'
                      : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isManualMode) {
                        onUpdatePrefs({ ...prefs, mode: 'interval_60s' });
                      }
                    }}
                    className="w-full text-left flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? '2. Interval Manual Pilihan Anda'
                        : '2. Custom Manual Interval'}
                    </span>
                    {isManualMode && (
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </button>
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {MANUAL_INTERVAL_OPTIONS.map((opt) => {
                      const active = prefs.mode === opt.mode;
                      return (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() => onUpdatePrefs({ ...prefs, mode: opt.mode })}
                          className={`min-h-[38px] px-2 py-1.5 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-[#13161C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#1F2532]'
                          }`}
                        >
                          {lang === 'id' ? opt.labelId : opt.labelEn}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mode 3: Tab-Resume + Periodic Sync PWA Only */}
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePrefs({ ...prefs, mode: 'tab_and_periodic_only' })
                  }
                  className={`w-full min-h-[48px] text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    prefs.mode === 'tab_and_periodic_only'
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 dark:border-blue-600'
                      : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732] hover:bg-slate-100 dark:hover:bg-[#1B202B]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? '3. Hanya Saat Kembali ke Tab + Periodic Sync PWA'
                        : '3. Tab Resume + PWA Periodic Sync Only'}
                    </span>
                    {prefs.mode === 'tab_and_periodic_only' && (
                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {lang === 'id'
                      ? 'Nol timer latar belakang saat aplikasi terbuka (paling irit RAM). Sinkronisasi hanya berjalan ketika Anda kembali membuka tab atau dipicu PWA.'
                      : 'Zero background polling timers while open (lowest RAM footprint). Syncs only when returning to the tab or via PWA Periodic Sync.'}
                  </p>
                </button>
              </div>

              {/* Auto-pull checkbox */}
              <label className="pt-2 border-t border-slate-200 dark:border-[#232732] flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={prefs.autoPullOnSync}
                  onChange={(e) =>
                    onUpdatePrefs({ ...prefs, autoPullOnSync: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                />
                <span className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {lang === 'id'
                    ? 'Otomatis Tarik & Purge paket baru ke IndexedDB lokal saat terdeteksi (jika tidak dicentang, hanya memperbarui angka antrean).'
                    : 'Automatically Pull & Purge newly detected packets into local IndexedDB (if unchecked, only refreshes queue count).'}
                </span>
              </label>

              {/* Effective timing readout */}
              <div className="pt-2 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <Wifi className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>
                  {lang === 'id' ? 'Aktif:' : 'Active:'}{' '}
                  {formatSyncIntervalLabel(activeDelayMs, lang)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {lang === 'id' ? 'Latar belakang:' : 'Hidden:'}{' '}
                  {formatSyncIntervalLabel(hiddenDelayMs, lang)}
                </span>
                {periodicSyncRegistered && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      PWA Periodic Sync OK
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 3. Opt-In Notifications Switch (Strictly requires Background Sync ON) */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 transition-opacity ${
              prefs.enabled
                ? 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732]'
                : 'bg-slate-50/70 dark:bg-[#0E1117] border-dashed border-slate-300 dark:border-[#282E3D] opacity-75'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  {prefs.notificationsEnabled && prefs.enabled ? (
                    <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span>
                    {lang === 'id'
                      ? 'Notifikasi Email Masuk (Opt-In)'
                      : 'Incoming Mail Notifications (Opt-In)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {!prefs.enabled
                    ? lang === 'id'
                      ? 'Aktifkan Background Sync terlebih dahulu untuk menyalakan notifikasi. Anda juga dapat menjalankan Background Sync tanpa notifikasi.'
                      : 'Enable Background Sync first to turn on notifications. You can also run Background Sync silently without notifications.'
                    : lang === 'id'
                      ? 'Menampilkan pengirim & subjek saja saat email baru masuk (isi email tidak pernah disimpan di cache Service Worker).'
                      : 'Shows sender & subject only when new mail arrives (email bodies are never persisted in Service Worker cache).'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                disabled={!prefs.enabled || requestingPermission || notifPermission === 'unsupported'}
                aria-checked={prefs.enabled && prefs.notificationsEnabled}
                onClick={() => void handleToggleNotifications()}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  !prefs.enabled || notifPermission === 'unsupported'
                    ? 'bg-slate-200 dark:bg-slate-800 cursor-not-allowed'
                    : prefs.notificationsEnabled
                      ? 'bg-emerald-600 cursor-pointer'
                      : 'bg-slate-300 dark:bg-slate-700 cursor-pointer'
                }`}
              >
                <span className="sr-only">
                  {lang === 'id' ? 'Toggle Notifikasi Email' : 'Toggle Mail Notifications'}
                </span>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                    prefs.enabled && prefs.notificationsEnabled
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {prefs.enabled && notifPermission === 'denied' && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                {lang === 'id'
                  ? 'Izin notifikasi diblokir oleh browser Anda. Buka Setelan Situs browser untuk mengizinkan notifikasi.'
                  : 'Notification permission is blocked by your browser. Open browser Site Settings to allow notifications.'}
              </div>
            )}
            {prefs.enabled && notifPermission === 'unsupported' && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'id'
                  ? 'Browser ini tidak mendukung Web Notification API (di iOS, tambahkan aplikasi ke Layar Utama terlebih dahulu).'
                  : 'This browser does not support Web Notifications (on iOS, install to Home Screen first).'}
              </div>
            )}
          </div>

          {/* Footer Status & Manual Trigger */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-mono tabular-nums">
                {lastSyncedAt
                  ? `${lang === 'id' ? 'Sync terakhir:' : 'Last sync:'} ${new Date(
                      lastSyncedAt
                    ).toLocaleTimeString()}`
                  : lang === 'id'
                    ? 'Belum pernah sinkronisasi'
                    : 'Not synced yet'}
              </span>
            </div>
            <button
              type="button"
              disabled={syncingNow}
              onClick={() => void onSyncNow()}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
              <span>{lang === 'id' ? 'Sinkronkan Sekarang' : 'Sync Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
