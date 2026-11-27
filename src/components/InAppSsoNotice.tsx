import { Check, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  buildAndroidExternalBrowserIntentUrl,
  detectInAppBrowser,
} from '../utils/browserCompat';
import { copyTextSafely } from '../utils/clipboard';

interface InAppSsoNoticeProps {
  lang: Language;
  compact?: boolean;
}

/**
 * Contextual inline SSO guidance shown directly beside Auth0 SSO Sign-In buttons
 * whenever the user opens VZ Mail or VZ Links inside an external app's embedded WebView.
 */
export function InAppSsoNotice({ lang, compact = false }: InAppSsoNoticeProps) {
  const info = useMemo(() => detectInAppBrowser(), []);
  const [copied, setCopied] = useState(false);

  if (!info.isInApp) {
    return null;
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const androidIntentUrl =
    info.platform === 'android'
      ? buildAndroidExternalBrowserIntentUrl(currentUrl)
      : null;

  const handleCopy = async () => {
    const ok = await copyTextSafely(currentUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="note"
      className={`rounded-lg border border-amber-300/80 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed min-w-0">
          <span className="font-semibold">
            {lang === 'id'
              ? `Browser internal ${info.appName || 'aplikasi'} terdeteksi:`
              : `${info.appName || 'In-app'} browser detected:`}
          </span>{' '}
          {info.platform === 'ios'
            ? lang === 'id'
              ? 'Login SSO Auth0 (Google/Passkey) dapat diblokir di WebView. Ketuk ikon Kompas / Menu (•••) lalu pilih "Buka di Safari" sebelum masuk.'
              : 'Auth0 SSO login (Google/Passkey) may be blocked inside WebViews. Tap Compass / Menu (•••) and choose "Open in Safari" before signing in.'
            : lang === 'id'
              ? 'Login SSO Auth0 dapat ditolak oleh WebView aplikasi. Gunakan tombol di bawah untuk membuka di Chrome / browser utama.'
              : 'Auth0 SSO login may be rejected inside app WebViews. Use the button below to open in Chrome or your system browser.'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {androidIntentUrl && (
          <a
            href={androidIntentUrl}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span>
              {lang === 'id' ? 'Buka di Browser Utama' : 'Open System Browser'}
            </span>
          </a>
        )}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#161922] text-amber-900 dark:text-amber-100 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{lang === 'id' ? 'URL Disalin' : 'URL Copied'}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 shrink-0" />
              <span>{lang === 'id' ? 'Salin URL Login' : 'Copy Login URL'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
