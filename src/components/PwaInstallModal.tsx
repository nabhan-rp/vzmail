import {
  Apple,
  CheckCircle2,
  Download,
  ExternalLink,
  Laptop,
  Monitor,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import type { Language } from '../data/i18n';
import type { OperatingSystem } from '../hooks/usePwaInstall';

interface PwaInstallModalProps {
  isOpen: boolean;
  lang: Language;
  onClose: () => void;
  service: 'mail' | 'links';
  os: OperatingSystem;
  isIos: boolean;
  isInstalled: boolean;
  canPromptNative: boolean;
  onPromptInstall: () => Promise<string>;
}

export function PwaInstallModal({
  isOpen,
  lang,
  onClose,
  service,
  os,
  isIos,
  isInstalled,
  canPromptNative,
  onPromptInstall,
}: PwaInstallModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMail = service === 'mail';
  const appName = isMail ? 'VZ Mail' : 'VZ Links';
  const appDomain = isMail ? 'mail.vz.gay' : 'links.vz.gay';
  const appIcon = isMail ? '/icons/mail-192.png' : '/icons/links-192.png';
  const accentColor = isMail ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400';
  const buttonBg = isMail
    ? 'bg-blue-600 hover:bg-blue-700 text-white'
    : 'bg-purple-600 hover:bg-purple-700 text-white';

  const getOsLabel = () => {
    switch (os) {
      case 'ios':
        return 'iOS (iPhone / iPad)';
      case 'android':
        return 'Android';
      case 'windows':
        return 'Windows 10 / 11';
      case 'mac':
        return 'macOS';
      case 'chromeos':
        return 'ChromeOS';
      case 'linux':
        return 'Linux';
      default:
        return 'Desktop & Mobile';
    }
  };

  const getOsIcon = () => {
    switch (os) {
      case 'ios':
        return <Apple className="w-4 h-4" />;
      case 'android':
        return <Smartphone className="w-4 h-4" />;
      case 'windows':
      case 'mac':
      case 'linux':
      case 'chromeos':
        return <Laptop className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${appName} PWA`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl max-w-lg w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-[#232732] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={appIcon}
              alt={appName}
              className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-800 object-cover shadow-xs shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  {appName}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1E232E] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  PWA Multi-OS
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                https://{appDomain}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Installed State Notification */}
        {isInstalled ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold">
                {lang === 'id'
                  ? 'Aplikasi Sudah Terpasang'
                  : 'App is Already Installed'}
              </span>
              <p className="text-[11px] opacity-90 mt-0.5">
                {lang === 'id'
                  ? `${appName} sudah berjalan dalam mode standalone di perangkat Anda.`
                  : `${appName} is currently running in standalone mode on your device.`}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Native One-Click Prompt for Android / Windows / macOS / Linux */}
            {canPromptNative && (
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-300">
                    {getOsIcon()}
                    <span>
                      {lang === 'id'
                        ? `Terdeteksi ${getOsLabel()}`
                        : `Detected ${getOsLabel()}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                    1-Click Ready
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onPromptInstall();
                    if (res === 'accepted') {
                      onClose();
                    }
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${buttonBg}`}
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {lang === 'id'
                      ? `Pasang ${appName} Sekarang`
                      : `Install ${appName} Now`}
                  </span>
                </button>
              </div>
            )}

            {/* iOS Safari Guide (When on iOS or no native prompt) */}
            {isIos ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Apple className="w-4 h-4" />
                  <span>
                    {lang === 'id'
                      ? 'Cara Memasang di iOS / iPadOS (Safari):'
                      : 'How to Install on iOS / iPadOS (Safari):'}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181C24] border border-slate-200 dark:border-[#232732]">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {lang === 'id' ? 'Ketuk tombol Bagikan' : 'Tap the Share button'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        {lang === 'id'
                          ? 'Ikon kotak dengan panah ke atas ('
                          : 'Square box with arrow up ('}
                        <Share2 className="w-3.5 h-3.5 inline text-blue-500" />
                        {lang === 'id'
                          ? ') di bilah bawah Safari.'
                          : ') on the bottom toolbar.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181C24] border border-slate-200 dark:border-[#232732]">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {lang === 'id'
                          ? 'Pilih "Tambah ke Layar Utama"'
                          : 'Select "Add to Home Screen"'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {lang === 'id'
                          ? 'Gulir menu ke bawah hingga menemukan opsi ini.'
                          : 'Scroll down until you see this option.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181C24] border border-slate-200 dark:border-[#232732]">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {lang === 'id'
                          ? 'Ketuk "Tambah" di Pojok Kanan Atas'
                          : 'Tap "Add" in top-right corner'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {lang === 'id'
                          ? `${appName} akan muncul di layar utama layaknya aplikasi iOS native.`
                          : `${appName} will now appear on your home screen like a native app.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : !canPromptNative ? (
              /* Desktop Browser Menu Fallback (Chrome / Edge / Brave / Firefox) */
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181C24] border border-slate-200 dark:border-[#232732] space-y-2 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-blue-500" />
                  <span>
                    {lang === 'id'
                      ? 'Pasang lewat Bilah Browser:'
                      : 'Install via Browser Address Bar:'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                  {lang === 'id'
                    ? 'Klik ikon komputer/unduh di sebelah kanan address bar browser Anda (Chrome / Edge / Brave) atau buka Menu browser (⋮) lalu pilih "Pasang VZ Mail / VZ Links".'
                    : 'Click the install/computer icon in the right side of your address bar (Chrome / Edge / Brave), or open browser Menu (⋮) and select "Install VZ Mail / VZ Links".'}
                </p>
              </div>
            ) : null}
          </>
        )}

        {/* Multi-OS Feature Checklist */}
        <div className="border-t border-slate-100 dark:border-[#232732] pt-4 space-y-2.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {lang === 'id'
                ? 'Fitur PWA Multi-Platform'
                : 'Multi-Platform PWA Capabilities'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-3.5 h-3.5 ${accentColor}`} />
              <span>Android, iOS, Win, Mac, Linux</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-3.5 h-3.5 ${accentColor}`} />
              <span>{lang === 'id' ? 'Bekerja Offline (App Shell)' : 'Offline App Shell'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-3.5 h-3.5 ${accentColor}`} />
              <span>{lang === 'id' ? 'Privat 100% (IndexedDB lokal)' : '100% Local IndexedDB'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-3.5 h-3.5 ${accentColor}`} />
              <span>{lang === 'id' ? 'Tampilan Standalone Bersih' : 'Standalone Window Mode'}</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#232732] text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            Service Worker: active (v1.3)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-[#1E232E] transition-colors cursor-pointer text-slate-700 dark:text-slate-300 font-medium"
          >
            {lang === 'id' ? 'Tutup' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
