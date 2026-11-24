import { ArrowRight, Link2, Mail, X } from 'lucide-react';
import type { Language } from '../data/i18n';
import type { CrossServiceOffer } from '../hooks/useSsoSession';
import type { ActiveHostView } from './MailLinksTopBar';

interface CrossServiceOfferBarProps {
  lang: Language;
  username: string;
  domain: string;
  crossOffer: CrossServiceOffer;
  onAcceptLinksOffer: () => void;
  onAcceptMailOffer: () => void;
  onDismiss: () => void;
  onSelectHost: (host: ActiveHostView) => void;
}

export function CrossServiceOfferBar({
  lang,
  username,
  domain,
  crossOffer,
  onAcceptLinksOffer,
  onAcceptMailOffer,
  onDismiss,
  onSelectHost,
}: CrossServiceOfferBarProps) {
  if (!crossOffer) return null;

  if (crossOffer === 'offer_links_after_mail') {
    return (
      <div className="bg-blue-50/90 dark:bg-[#111827] border-b border-blue-200 dark:border-blue-900/60">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
            <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold">
                {lang === 'id'
                  ? `Kotak surat ${username}@${domain} Anda sudah aktif!`
                  : `Your ${username}@${domain} mailbox is now active!`}
              </span>{' '}
              <span>
                {lang === 'id'
                  ? `Ingin sekalian membuat halaman Link-in-Bio ${username}.${domain} & Shortlink ${domain}/s/ di VZ Links?`
                  : `Would you also like to create your paired ${username}.${domain} Link-in-Bio & ${domain}/s/ shortlinks on VZ Links?`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onAcceptLinksOffer();
                onSelectHost('links.vz.gay');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>
                {lang === 'id'
                  ? `Ya, Buat ${username}.${domain}`
                  : `Yes, Create ${username}.${domain}`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'id' ? 'Nanti Saja' : 'Maybe Later'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close prompt"
              className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50/90 dark:bg-[#111827] border-b border-blue-200 dark:border-blue-900/60">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
          <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <span className="font-semibold">
              {lang === 'id'
                ? `Halaman Link-in-Bio ${username}.${domain} Anda sudah aktif!`
                : `Your ${username}.${domain} Link-in-Bio is now active!`}
            </span>{' '}
            <span>
              {lang === 'id'
                ? `Ingin sekalian mengonfigurasi kotak surat email ${username}@${domain} (Local-First tanpa penyimpanan server) di VZ Mail?`
                : `Would you also like to configure your paired ${username}@${domain} local-first email mailbox on VZ Mail?`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onAcceptMailOffer();
              onSelectHost('mail.vz.gay');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>
              {lang === 'id'
                ? `Ya, Aktifkan ${username}@${domain}`
                : `Yes, Configure ${username}@${domain}`}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {lang === 'id' ? 'Nanti Saja' : 'Maybe Later'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close prompt"
            className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
