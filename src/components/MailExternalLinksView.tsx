import {
  Cloud,
  ExternalLink,
  File as FileIcon,
  HardDrive,
  Image as ImageIcon,
  Link2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  extractInlineMediaLinksFromText,
  getExternalProviderDisplayName,
  type MailExternalLink,
} from '../utils/mailExternalLinks';

interface MailExternalLinksViewProps {
  bodyText: string;
  externalLinks?: MailExternalLink[];
  lang: Language;
  /** True when rendered inside a solid blue outbound chat bubble */
  invertedBubble?: boolean;
}

export function MailExternalLinksView({
  bodyText,
  externalLinks = [],
  lang,
  invertedBubble = false,
}: MailExternalLinksViewProps) {
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>({});

  const combinedLinks = useMemo(() => {
    const autoInline = extractInlineMediaLinksFromText(bodyText, externalLinks);
    return [...externalLinks, ...autoInline];
  }, [bodyText, externalLinks]);

  if (combinedLinks.length === 0) return null;

  const inlineImages = combinedLinks.filter(
    (l) => l.renderInline && l.directMediaUrl && !failedImageIds[l.id]
  );
  const linkCards = combinedLinks.filter(
    (l) => !(l.renderInline && l.directMediaUrl && !failedImageIds[l.id])
  );

  const renderProviderIcon = (provider: MailExternalLink['provider']) => {
    if (provider === 'vzfiles') {
      return <HardDrive className="w-3.5 h-3.5 shrink-0" />;
    }
    if (
      provider === 'gdrive' ||
      provider === 'dropbox' ||
      provider === 'onedrive' ||
      provider === 'mega'
    ) {
      return <Cloud className="w-3.5 h-3.5 shrink-0" />;
    }
    if (provider === 'imgur' || provider === 'direct_image') {
      return <ImageIcon className="w-3.5 h-3.5 shrink-0" />;
    }
    if (provider === 'direct_media') {
      return <FileIcon className="w-3.5 h-3.5 shrink-0" />;
    }
    return <Link2 className="w-3.5 h-3.5 shrink-0" />;
  };

  return (
    <div className="pt-2 space-y-2.5">
      {/* Inline Direct Media Previews (Imgur, direct .png/.jpg/.webp/.gif/.avif) */}
      {inlineImages.length > 0 && (
        <div className="space-y-2">
          {inlineImages.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg overflow-hidden border ${
                invertedBubble
                  ? 'border-blue-400/50 bg-blue-700/40'
                  : 'border-slate-200 dark:border-[#262C3B] bg-white dark:bg-[#141821]'
              }`}
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-950/5 dark:bg-black/30"
              >
                <img
                  src={item.directMediaUrl || item.url}
                  alt={item.label}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImageIds((prev) => ({ ...prev, [item.id]: true }))
                  }
                  className="block w-full max-h-[360px] object-contain mx-auto"
                />
              </a>
              <div
                className={`px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] border-t ${
                  invertedBubble
                    ? 'border-blue-500/50 text-blue-100'
                    : 'border-slate-200 dark:border-[#242A37] text-slate-600 dark:text-slate-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <ImageIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="opacity-75 font-mono shrink-0">
                    · {getExternalProviderDisplayName(item.provider)}
                  </span>
                </span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 font-semibold underline shrink-0 ${
                    invertedBubble
                      ? 'text-white'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <span>{lang === 'id' ? 'Buka' : 'Open'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* External Cloud & VZ Files (>10 MB) Link Cards */}
      {linkCards.length > 0 && (
        <div className="space-y-1.5">
          {linkCards.map((item) => {
            const providerName = getExternalProviderDisplayName(item.provider);
            const isVzFiles = item.provider === 'vzfiles';
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors ${
                  invertedBubble
                    ? 'bg-blue-700/80 hover:bg-blue-800 border-blue-400/50 text-white'
                    : isVzFiles
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100/80 dark:hover:bg-blue-950/50 border-blue-200 dark:border-blue-900/60 text-slate-900 dark:text-slate-100'
                      : 'bg-white dark:bg-[#151922] hover:bg-slate-50 dark:hover:bg-[#1C2230] border-slate-200 dark:border-[#262C3B] text-slate-900 dark:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      invertedBubble
                        ? 'text-blue-100'
                        : isVzFiles
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {renderProviderIcon(item.provider)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">
                      {item.label}
                    </span>
                    <span
                      className={`block text-[10px] font-mono truncate ${
                        invertedBubble
                          ? 'text-blue-100/90'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {providerName}
                      {item.sizeLabel ? ` · ${item.sizeLabel}` : ''} · {item.url}
                    </span>
                  </span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${
                    invertedBubble
                      ? 'text-white'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  <span>
                    {isVzFiles
                      ? 'VZ Files'
                      : lang === 'id'
                        ? 'Buka'
                        : 'Open'}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
