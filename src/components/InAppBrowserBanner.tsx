import { Check, Copy, ExternalLink, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  buildAndroidExternalBrowserIntentUrl,
  detectInAppBrowser,
} from '../utils/browserCompat';
import { copyTextSafely } from '../utils/clipboard';

interface InAppBrowserBannerProps {
  lang: Language;
}

const DISMISS_KEY = 'vz_inapp_banner_dismissed_v1';

export function InAppBrowserBanner({ lang }: InAppBrowserBannerProps) {
  const info = useMemo(() => detectInAppBrowser(), []);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = useState(false);

  if (!info.isInApp || dismissed) {
    return null;
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const androidIntentUrl =
    info.platform === 'android'
      ? buildAndroidExternalBrowserIntentUrl(currentUrl)
      : null;

  const handleCopyUrl = async () => {
    const ok = await copyTextSafely(currentUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore storage errors inside restricted WebViews
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800/70 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 text-amber-950 dark:text-amber-100"
    >
      <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed min-w-0">
            <p className="font-semibold">
              {lang === 'id'
                ? `Anda membuka halaman ini di browser internal ${info.appName || 'aplikasi'}`
                : `You are viewing this page inside ${info.appName || 'an in-app'} browser`}
            </p>
            <p className="text-[11px] text-amber-800 dark:text-amber-200/90 mt-0.5">
              {info.platform === 'ios'
                ? lang === 'id'
                  ? 'Login SSO Auth0, penyimpanan lokal IndexedDB, dan unduhan berkas (.anf/.eml/QR) bekerja paling stabil di Safari. Ketuk ikon Kompas atau Menu (•••) lalu pilih "Buka di Safari".'
                  : 'Auth0 SSO login, local IndexedDB storage, and file downloads (.anf/.eml/QR) work best in Safari. Tap the Compass or Menu (•••) icon and choose "Open in Safari".'
                : lang === 'id'
                  ? 'Login SSO Auth0, penyimpanan lokal IndexedDB, dan unduhan berkas (.anf/.eml/QR) sering dibatasi di WebView. Buka di Chrome atau browser utama perangkat Anda.'
                  : 'Auth0 SSO login, local IndexedDB storage, and file downloads (.anf/.eml/QR) may be restricted inside WebViews. Open in Chrome or your system browser.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
          {androidIntentUrl && (
            <a
              href={androidIntentUrl}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'id' ? 'Buka di Browser' : 'Open Browser'}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => void handleCopyUrl()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#161922] text-amber-900 dark:text-amber-100 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{lang === 'id' ? 'Disalin' : 'Copied'}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'id' ? 'Salin URL' : 'Copy URL'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={lang === 'id' ? 'Tutup peringatan' : 'Dismiss warning'}
            className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
