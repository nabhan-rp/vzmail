/**
 * Multi-browser & multi-User-Agent compatibility utilities.
 * Detects social/messaging In-App WebViews (WhatsApp, Instagram, TikTok, Facebook, LINE,
 * Telegram, Discord, Threads, Reddit, Shopee, Gojek, Grab, etc.) where OAuth/SSO redirects,
 * IndexedDB persistence, and Blob downloads can be restricted, plus UA capabilities.
 */

export interface InAppBrowserInfo {
  isInApp: boolean;
  appName: string | null;
  platform: 'ios' | 'android' | 'other';
}

export interface BrowserEnvironment {
  isMobile: boolean;
  isIos: boolean;
  isIpad: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isSamsungInternet: boolean;
  isEdge: boolean;
  isStandalonePwa: boolean;
  inApp: InAppBrowserInfo;
}

export function detectInAppBrowser(userAgent?: string): InAppBrowserInfo {
  if (typeof window === 'undefined' && !userAgent) {
    return { isInApp: false, appName: null, platform: 'other' };
  }

  const ua = userAgent || window.navigator.userAgent || '';
  const lower = ua.toLowerCase();

  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const platform: InAppBrowserInfo['platform'] = isIos
    ? 'ios'
    : isAndroid
      ? 'android'
      : 'other';

  const patterns: Array<{ re: RegExp; name: string }> = [
    { re: /whatsapp/i, name: 'WhatsApp' },
    { re: /instagram/i, name: 'Instagram' },
    { re: /barcelona/i, name: 'Threads' },
    { re: /musical_ly|tiktok|bytedancewebview|trill/i, name: 'TikTok' },
    { re: /fban|fbav|fb_iab|fb4a|fbiab/i, name: 'Facebook' },
    { re: /\bline\//i, name: 'LINE' },
    { re: /telegram/i, name: 'Telegram' },
    { re: /discord/i, name: 'Discord' },
    { re: /snapchat/i, name: 'Snapchat' },
    { re: /twitter|x-client/i, name: 'X (Twitter)' },
    { re: /linkedinapp/i, name: 'LinkedIn' },
    { re: /reddit/i, name: 'Reddit' },
    { re: /pinterest/i, name: 'Pinterest' },
    { re: /shopee/i, name: 'Shopee' },
    { re: /gojek/i, name: 'Gojek' },
    { re: /grab/i, name: 'Grab' },
    { re: /slack/i, name: 'Slack' },
    { re: /notion/i, name: 'Notion' },
    { re: /micromessenger/i, name: 'WeChat' },
    { re: /kakaotalk/i, name: 'KakaoTalk' },
  ];

  for (const entry of patterns) {
    if (entry.re.test(ua)) {
      return { isInApp: true, appName: entry.name, platform };
    }
  }

  // Generic Android WebView marker (`; wv)`) or MIUI/Xiaomi/UC embedded WebViews when not standalone PWA
  if (
    isAndroid &&
    (/;\s*wv\)/i.test(ua) ||
      (/\bversion\/\d/i.test(ua) && /\bchrome\/\d/i.test(ua) && /mobile/i.test(ua) && !/samsungbrowser/i.test(ua)))
  ) {
    return { isInApp: true, appName: 'In-App WebView', platform };
  }

  // Generic iOS embedded WKWebView / UIWebView (has AppleWebKit & Mobile but lacks Safari token and major iOS browsers)
  if (
    isIos &&
    lower.includes('applewebkit') &&
    lower.includes('mobile') &&
    !lower.includes('safari/') &&
    !lower.includes('crios/') &&
    !lower.includes('fxios/') &&
    !lower.includes('edgios/') &&
    !lower.includes('opios/') &&
    !lower.includes('duckduckgo/')
  ) {
    const isStandalone =
      typeof window !== 'undefined' &&
      ((window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia?.('(display-mode: standalone)')?.matches === true);
    if (!isStandalone) {
      return { isInApp: true, appName: 'In-App Browser', platform };
    }
  }

  return { isInApp: false, appName: null, platform };
}

export function getBrowserEnvironment(userAgent?: string): BrowserEnvironment {
  const ua =
    userAgent ||
    (typeof window !== 'undefined' ? window.navigator.userAgent : '') ||
    '';
  const lower = ua.toLowerCase();

  const isIpad =
    /ipad/i.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1);
  const isIos = /iphone|ipod/i.test(ua) || isIpad;
  const isAndroid = /android/i.test(ua);
  const isMobile = isIos || isAndroid || /mobile|tablet/i.test(ua);

  const isSamsungInternet = /samsungbrowser/i.test(ua);
  const isEdge = /edg|edga|edgios/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isChrome =
    (/chrome|crios/i.test(ua) && !isEdge && !isSamsungInternet && !/opr\//i.test(ua));
  const isSafari =
    lower.includes('safari') &&
    !isChrome &&
    !isEdge &&
    !isFirefox &&
    !isSamsungInternet &&
    !lower.includes('android');

  const isStandalonePwa =
    typeof window !== 'undefined' &&
    ((window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)')?.matches === true);

  return {
    isMobile,
    isIos,
    isIpad,
    isAndroid,
    isSafari,
    isChrome,
    isFirefox,
    isSamsungInternet,
    isEdge,
    isStandalonePwa,
    inApp: detectInAppBrowser(ua),
  };
}

/**
 * Builds an Android Chrome Intent URI for escaping embedded WebViews safely.
 * Restricts schemes strictly to https / http to prevent intent injection.
 */
export function buildAndroidExternalBrowserIntentUrl(currentUrl: string): string | null {
  try {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const withoutScheme = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    const scheme = parsed.protocol.replace(':', '');
    return `intent://${withoutScheme}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
  } catch {
    return null;
  }
}
