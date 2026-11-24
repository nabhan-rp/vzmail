import { UI_COPY, type Language } from '../data/i18n';

interface FooterProps {
  lang: Language;
  onOpenSso: () => void;
}

export function Footer({ lang, onOpenSso }: FooterProps) {
  const t = UI_COPY[lang].footer;

  return (
    <footer className="border-t border-slate-200 dark:border-[#232732] bg-white dark:bg-[#101319]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-display font-bold text-slate-900 dark:text-white">vz.gay</span>
            <span aria-hidden="true">·</span>
            <span>{t.rights}</span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t.umbrellaNote}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <a
            href="https://search.vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.searchLink}
          </a>
          <a
            href="https://files.vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.filesLink}
          </a>
          <button
            type="button"
            onClick={onOpenSso}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.ssoLink}
          </button>
          <a
            href="https://myaccount.vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.dashboardLink}
          </a>
          <a
            href="https://jajanserver.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.sponsorLink}
          </a>
        </div>
      </div>
    </footer>
  );
}
