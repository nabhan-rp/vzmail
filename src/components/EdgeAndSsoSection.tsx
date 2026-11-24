import { useState } from 'react';
import { ArrowUpRight, Server } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';

interface EdgeAndSsoSectionProps {
  lang: Language;
  onOpenSso: () => void;
}

const EDGE_IMAGE_PATH = '/src/assets/images/edge_cloud_architecture_1795413602779.jpg';

export function EdgeAndSsoSection({ lang, onOpenSso }: EdgeAndSsoSectionProps) {
  const [imgError, setImgError] = useState(false);
  const t = UI_COPY[lang].edgeAndSso;

  return (
    <section
      id="infrastructure"
      className="border-t border-slate-200 dark:border-[#232732] max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16"
    >
      <div className="max-w-2xl">
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
          {t.sectionTitle}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.sectionSubtitle}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Infrastructure Visual */}
        <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232732] bg-slate-900 relative min-h-[260px]">
          {!imgError ? (
            <img
              src={EDGE_IMAGE_PATH}
              alt={t.imageAlt}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-800 to-slate-950">
              <Server className="w-8 h-8 text-blue-400 mb-3" />
              <p className="font-display text-sm font-semibold text-white">
                {t.imageCaption}
              </p>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
            <p className="text-xs font-medium text-white">{t.imageCaption}</p>
          </div>
        </div>

        {/* 2x2 Account & Ecosystem Grid */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {t.cards.map((card, idx) => {
            const isSso = idx === 0;
            const isDashboard = idx === 1;
            return (
              <div
                key={card.title}
                className="p-5 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex flex-col justify-between"
              >
                <div>
                  <p className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    {card.meta}
                  </p>
                  <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.desc}
                  </p>
                </div>

                {isSso && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={onOpenSso}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      accounts.vz.gay
                    </button>
                  </div>
                )}

                {isDashboard && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between gap-2">
                    <a
                      href="https://myaccount.vz.gay"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <span>myaccount.vz.gay</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sponsor Attribution Row */}
      <div className="mt-6 p-5 sm:p-6 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            {t.sponsorHeading}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t.sponsorText}
          </p>
        </div>
        <a
          href="https://jajanserver.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#1C202B] dark:hover:bg-[#252B3B] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <span>{t.visitSponsor}</span>
          <ArrowUpRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}
