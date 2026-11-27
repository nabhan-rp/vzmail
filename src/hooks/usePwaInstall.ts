import { useCallback, useEffect, useState } from 'react';

export type OperatingSystem =
  | 'ios'
  | 'android'
  | 'windows'
  | 'mac'
  | 'linux'
  | 'chromeos'
  | 'unknown';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function detectOperatingSystem(): OperatingSystem {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // iPadOS 13+ reports Macintosh desktop UA with multi-touch support
  if (
    window.navigator.platform === 'MacIntel' &&
    typeof window.navigator.maxTouchPoints === 'number' &&
    window.navigator.maxTouchPoints > 1
  ) {
    return 'ios';
  }
  if (/android/.test(ua)) return 'android';
  if (/cros/.test(ua)) return 'chromeos';
  if (/win/.test(ua)) return 'windows';
  if (/mac/.test(ua)) return 'mac';
  if (/linux/.test(ua)) return 'linux';
  return 'unknown';
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    isStandaloneMode()
  );
  const [os, setOs] = useState<OperatingSystem>(() => detectOperatingSystem());

  useEffect(() => {
    setOs(detectOperatingSystem());
    setIsInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic mini-infobar on mobile Chrome
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  const isIos = os === 'ios';
  const canPromptNative = Boolean(deferredPrompt);

  const promptInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'ios_guide' | 'already_installed' | 'unsupported'
  > => {
    if (isInstalled) {
      return 'already_installed';
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return 'accepted';
        }
        return 'dismissed';
      } catch (err) {
        console.warn('[PWA] Prompt error:', err);
      }
    }

    if (isIos) {
      return 'ios_guide';
    }

    return 'unsupported';
  }, [deferredPrompt, isInstalled, isIos]);

  return {
    os,
    isIos,
    isInstalled,
    canPromptNative,
    promptInstall,
  };
}
