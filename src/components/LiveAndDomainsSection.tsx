import { useState } from 'react';
import { ArrowUpRight, Layers } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import { CLIENT_DOMAIN_MATRIX, VZ_SERVICES } from '../data/services';

interface LiveAndDomainsSectionProps {
  lang: Language;
}

const HUB_IMAGE_PATH = '/src/assets/images/ecosystem_hub_visual_1795413602107.jpg';

export function LiveAndDomainsSection({ lang }: LiveAndDomainsSectionProps) {
  const [imgError, setImgError] = useState(false);
  const t = UI_COPY[lang].liveAndDomains;

  const liveSubAppMap = new Map<
    string,
    {
      name: string;
      domain: string;
      altDomain?: string;
      kind: 'app' | 'game' | 'demo';
      description: { id: string; en: string };
      parentDomains: string[];
    }
  >();

  for (const svc of VZ_SERVICES) {
    for (const child of svc.liveChildren ?? []) {
      const existing = liveSubAppMap.get(child.domain);
      if (existing) {
        if (!existing.parentDomains.includes(svc.primaryDomain)) {
          existing.parentDomains.push(svc.primaryDomain);
        }
      } else {
        liveSubAppMap.set(child.domain, {
          ...child,
          parentDomains: [svc.primaryDomain],
        });
      }
    }
  }

  const liveSubApps = Array.from(liveSubAppMap.values());

  return (
    <section
      id="live-apps"
      className="border-t border-slate-200 dark:border-[#232732] bg-white dark:bg-[#101319]"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t.sectionTitle}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.sectionSubtitle}
          </p>
        </div>

        {/* 2-Column Split: Generated Visual + Live Apps List */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232732] bg-slate-100 dark:bg-[#151922] relative min-h-[240px]">
            {!imgError ? (
              <img
                src={HUB_IMAGE_PATH}
                alt={t.imageAlt}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#151922] dark:to-[#0E1118]">
                <Layers className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-3" />
                <p className="font-display text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t.imageCaption}
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/45 to-transparent">
              <p className="text-xs font-medium text-white">{t.imageCaption}</p>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#13161C] p-6 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {t.liveSpotlightTitle}
              </h3>

              <div className="mt-4 divide-y divide-slate-200/80 dark:divide-[#232732]">
                {liveSubApps.map((app) => (
                  <div
                    key={app.domain}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-slate-900 dark:text-white">
                          {app.name}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {app.parentDomains.join(' · ')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        {app.description[lang]}
                      </p>
                      {app.altDomain && (
                        <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                          Mirror:{' '}
                          <a
                            href={`https://${app.altDomain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2"
                          >
                            {app.altDomain}
                          </a>
                        </p>
                      )}
                    </div>

                    <a
                      href={`https://${app.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      <span>{app.domain}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Client Domain & 301 Redirect Matrix */}
        <div id="domains" className="mt-12">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t.matrixTitle}
          </h3>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#13161C]">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#232732] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">{t.colService}</th>
                  <th className="py-3.5 px-5">{t.colDomains}</th>
                  <th className="py-3.5 px-5">{t.colRouting}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-[#232732] text-sm">
                {CLIENT_DOMAIN_MATRIX.map((row) => (
                  <tr
                    key={row.service}
                    className="hover:bg-white dark:hover:bg-[#171B24] transition-colors"
                  >
                    <td className="py-3.5 px-5 align-top">
                      <div className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                        {row.service}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? row.roleId : row.roleEn}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 align-top font-mono text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {row.patterns.join('  ·  ')}
                    </td>
                    <td className="py-3.5 px-5 align-top text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {lang === 'id' ? row.routingNoteId : row.routingNoteEn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
