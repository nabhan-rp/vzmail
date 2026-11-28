import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  DEFAULT_TURNSTILE_SITE_KEY,
  TURNSTILE_SHORTLINK_ACTION,
} from '../utils/turnstileVerify';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          action?: string;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
          appearance?: 'always' | 'execute' | 'interaction-only';
          language?: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'timeout-callback'?: () => void;
          'error-callback'?: (errorCode?: string | number) => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScriptOnce(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No browser window'));
  }
  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve();
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-vz-turnstile="1"]'
    );
    if (existing) {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          turnstileScriptPromise = null;
          reject(new Error('Failed to load Cloudflare Turnstile script'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.vzTurnstile = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error('Failed to load Cloudflare Turnstile script'));
    };
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function isLocalPreviewBrowserHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.webcontainer.io') ||
    host.endsWith('.local')
  );
}

export function resolveClientTurnstileSiteKey(): string {
  const fromEnv = (
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_TURNSTILE_SITE_KEY || ''
  ).trim();
  return fromEnv || DEFAULT_TURNSTILE_SITE_KEY;
}

function shouldForceTurnstileInDev(): boolean {
  const envObj = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env;
  if (envObj?.VITE_TURNSTILE_FORCE_IN_DEV === 'true') return true;
  // Cloudflare official dummy test keys always start with 1x0000000000 or 2x0000000000 or 3x0000000000
  const siteKey = resolveClientTurnstileSiteKey();
  return /^[123]x0{10}/.test(siteKey);
}

export type TurnstileWidgetStatus =
  | 'loading'
  | 'ready'
  | 'verified'
  | 'expired'
  | 'error'
  | 'local_preview';

interface TurnstileWidgetProps {
  lang: Language;
  /** Increment to force-reset the single-use Turnstile token after submit or error. */
  resetTrigger: number;
  action?: string;
  onTokenChange: (token: string | null) => void;
  onStatusChange?: (status: TurnstileWidgetStatus) => void;
}

export function TurnstileWidget({
  lang,
  resetTrigger,
  action = TURNSTILE_SHORTLINK_ACTION,
  onTokenChange,
  onStatusChange,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onStatusChangeRef = useRef(onStatusChange);

  onTokenChangeRef.current = onTokenChange;
  onStatusChangeRef.current = onStatusChange;

  const isLocalPreview = isLocalPreviewBrowserHost() && !shouldForceTurnstileInDev();
  const [status, setStatus] = useState<TurnstileWidgetStatus>(
    isLocalPreview ? 'local_preview' : 'loading'
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [manualRetryCounter, setManualRetryCounter] = useState(0);

  const updateStatus = useCallback((next: TurnstileWidgetStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  // Local preview mode: avoid Cloudflare 110200 domain mismatch error on localhost / *.run.app
  useEffect(() => {
    if (!isLocalPreview) return;
    updateStatus('local_preview');
    onTokenChangeRef.current(null);
  }, [isLocalPreview, updateStatus]);

  // Mount & render real Cloudflare Turnstile widget on production domains
  useEffect(() => {
    if (isLocalPreview) return;

    let cancelled = false;
    const siteKey = resolveClientTurnstileSiteKey();
    const isDark =
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark');

    updateStatus('loading');
    setErrorDetail(null);
    onTokenChangeRef.current(null);

    void loadTurnstileScriptOnce()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        const api = window.turnstile;
        if (!container || !api || typeof api.render !== 'function') {
          updateStatus('error');
          setErrorDetail(
            lang === 'id'
              ? 'Skrip verifikasi Cloudflare Turnstile belum siap.'
              : 'Cloudflare Turnstile verification script is not ready.'
          );
          return;
        }

        // Clean any previous widget instance before rendering
        if (widgetIdRef.current) {
          try {
            api.remove(widgetIdRef.current);
          } catch {
            // Ignore remove race
          }
          widgetIdRef.current = null;
        }
        container.innerHTML = '';

        const widgetId = api.render(container, {
          sitekey: siteKey,
          action,
          theme: isDark ? 'dark' : 'light',
          size: 'flexible',
          appearance: 'always',
          language: lang === 'id' ? 'id' : 'en',
          callback: (token: string) => {
            if (cancelled) return;
            setErrorDetail(null);
            onTokenChangeRef.current(token);
            updateStatus('verified');
          },
          'expired-callback': () => {
            if (cancelled) return;
            onTokenChangeRef.current(null);
            updateStatus('expired');
          },
          'timeout-callback': () => {
            if (cancelled) return;
            onTokenChangeRef.current(null);
            updateStatus('expired');
          },
          'error-callback': (code?: string | number) => {
            if (cancelled) return;
            onTokenChangeRef.current(null);
            updateStatus('error');
            const codeSuffix = code ? ` (${String(code)})` : '';
            setErrorDetail(
              lang === 'id'
                ? `Verifikasi Cloudflare Turnstile gagal dimuat${codeSuffix}. Pastikan pemblokir skrip tidak memblokir challenges.cloudflare.com.`
                : `Cloudflare Turnstile verification failed to load${codeSuffix}. Ensure script blockers do not block challenges.cloudflare.com.`
            );
          },
        });

        widgetIdRef.current = widgetId;
        updateStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        onTokenChangeRef.current(null);
        updateStatus('error');
        setErrorDetail(
          lang === 'id'
            ? 'Gagal memuat verifikasi anti-bot Cloudflare Turnstile. Periksa koneksi atau nonaktifkan pemblokir iklan.'
            : 'Failed to load Cloudflare Turnstile anti-bot check. Check your connection or disable script blockers.'
        );
      });

    return () => {
      cancelled = true;
      onTokenChangeRef.current(null);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore unmount cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [action, isLocalPreview, lang, manualRetryCounter, updateStatus]);

  // Reset single-use token whenever parent increments resetTrigger (after submit or error)
  useEffect(() => {
    if (isLocalPreview || resetTrigger === 0) return;
    onTokenChangeRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        setErrorDetail(null);
        updateStatus('ready');
      } catch {
        setManualRetryCounter((c) => c + 1);
      }
    }
  }, [isLocalPreview, resetTrigger, updateStatus]);

  const handleRetry = () => {
    setErrorDetail(null);
    onTokenChangeRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        updateStatus('ready');
        return;
      } catch {
        // Fallback to full remount
      }
    }
    setManualRetryCounter((c) => c + 1);
  };

  if (isLocalPreview) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-[#232732] bg-slate-50/80 dark:bg-[#0D1016] px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">
            {lang === 'id'
              ? 'Proteksi Anti-Bot Cloudflare Turnstile aktif otomatis di domain produksi (imy.li / links.vz.gay). Mode preview lokal dilewati otomatis.'
              : 'Cloudflare Turnstile anti-bot protection runs automatically on production domains (imy.li / links.vz.gay). Bypassed automatically in local preview.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0D1016] p-3.5 space-y-2.5 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
          {status === 'verified' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : status === 'error' || status === 'expired' ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span>
            {status === 'verified'
              ? lang === 'id'
                ? 'Verifikasi anti-bot selesai — siap menyingkat URL'
                : 'Anti-bot verification complete — ready to shorten'
              : status === 'expired'
                ? lang === 'id'
                  ? 'Sesi verifikasi kedaluwarsa — muat ulang untuk melanjutkan'
                  : 'Verification expired — refresh to continue'
                : status === 'error'
                  ? lang === 'id'
                    ? 'Verifikasi Cloudflare Turnstile perlu dimuat ulang'
                    : 'Cloudflare Turnstile check needs reload'
                  : lang === 'id'
                    ? 'Verifikasi keamanan publik (Cloudflare Turnstile)'
                    : 'Public security check (Cloudflare Turnstile)'}
          </span>
        </div>

        {(status === 'expired' || status === 'error') && (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 border border-blue-200 dark:border-blue-900/60 rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{lang === 'id' ? 'Muat Ulang' : 'Retry'}</span>
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full max-w-full min-h-[65px] flex items-center"
        aria-live="polite"
      />

      {errorDetail && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
          {errorDetail}
        </p>
      )}
    </div>
  );
}
