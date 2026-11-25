import type { SocialPlatformId } from '../utils/linksModel';

interface SocialIconGlyphProps {
  platform: SocialPlatformId;
  className?: string;
}

export function SocialIconGlyph({
  platform,
  className = 'w-4 h-4',
}: SocialIconGlyphProps) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
          <polygon points="10,9.5 15.5,12 10,14.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'threads':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M19 12a7 7 0 1 0-2.5 5.4" />
          <path d="M15.5 12c0 2-1.5 3.5-3.5 3.5S8.5 14 8.5 12s1.5-3.5 3.5-3.5 3.5 1.5 3.5 3.5v1.5a2 2 0 0 0 4 0V12" />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M15 3h-3a4 4 0 0 0-4 4v3H6v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2V3z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 11v5" />
          <path d="M8 8v.01" />
          <path d="M12 16v-5" />
          <path d="M16 16v-3a2 2 0 0 0-4 0" />
        </svg>
      );
    case 'github':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9 19c-4.5 1.5-4.5-2.5-6-3m12 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V22" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" />
          <path d="M9.5 9.2c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.6 1.4c.1.2.1.4-.1.6l-.4.5c-.1.2-.1.3 0 .5.4.7 1.1 1.4 1.9 1.8.2.1.3.1.5 0l.5-.4c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3 0 .5-.5.7-.6.3-1.8.3-3.3-.4-1.5-.7-2.8-2-3.5-3.5-.7-1.5-.7-2.7-.4-3.3z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M21 4L3 11.2l6.2 2.2L17 8.5l-5.6 6.4V20l3.2-3.1 4.1 2.7L21 4z" />
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M8.5 7.5A11 11 0 0 1 15.5 7.5" />
          <path d="M18.5 6.5c1.5 2.5 2 6.5 1.5 10.5-1.5 1.2-3.2 1.8-5 2l-1-1.5" />
          <path d="M5.5 6.5C4 9 3.5 13 4 17c1.5 1.2 3.2 1.8 5 2l1-1.5" />
          <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'spotify':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 9.8c2.8-.8 6-.6 8.5.7" />
          <path d="M8.5 12.8c2.3-.6 4.8-.4 6.8.6" />
          <path d="M9.2 15.6c1.7-.4 3.6-.3 5.1.4" />
        </svg>
      );
    case 'twitch':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M5 3h15v11l-4 4h-4l-3 3v-3H5V3z" />
          <path d="M11 8v4" />
          <path d="M15 8v4" />
        </svg>
      );
    case 'dribbble':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 3.6c3.3 4.2 5.4 9.1 6.4 16.4" />
          <path d="M19.8 7.8c-3.5 2.7-8.1 3.7-16.5 3.5" />
          <path d="M20.8 13.8c-4.5-.9-8.8.4-12.5 5.4" />
        </svg>
      );
    case 'email':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      );
    case 'website':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8" />
          <path d="M3.6 15h16.8" />
          <path d="M12 3a13 13 0 0 1 0 18" />
          <path d="M12 3a13 13 0 0 0 0 18" />
        </svg>
      );
  }
}
