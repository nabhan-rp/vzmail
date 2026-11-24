import { ChevronRight } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import {
  VZ_DESK_APPS,
  deskToolToService,
  type VzDeskGroupId,
  type VzService,
} from '../data/services';
import { ServiceIcon } from './ServiceIcon';

interface VzDeskSectionProps {
  lang: Language;
  searchQuery: string;
  onSelectService: (service: VzService) => void;
}

const GROUP_ORDER: VzDeskGroupId[] = [
  'documents_publishing',
  'visual_3d',
  'analytics_math',
  'communication',
];

export function VzDeskSection({
  lang,
  searchQuery,
  onSelectService,
}: VzDeskSectionProps) {
  const t = UI_COPY[lang].vzDesk;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchingApps = VZ_DESK_APPS.filter((tool) => {
    if (!normalizedQuery) return true;
    const haystack = [
      tool.domain,
      tool.name[lang],
      tool.reference[lang],
      tool.description[lang],
      tool.formatNote[lang],
      'vz desk',
      'desk.vz.gay',
      'nurdb',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return (
    <section
      id="vz-desk"
      className="border-t border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0B0D11]"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs text-blue-600 dark:text-blue-400">
            desk.vz.gay · 17 apps
          </p>
          <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t.sectionTitle}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.sectionSubtitle}
          </p>
        </div>

        {/* Architectural Summary Strip */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {t.summaryStrip.map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732]"
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {item.label}
              </div>
              <div className="mt-1 font-mono text-xs sm:text-sm text-slate-900 dark:text-white">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {matchingApps.length === 0 ? (
          <div className="mt-8 p-6 rounded-xl border border-slate-200 dark:border-[#232732] bg-white dark:bg-[#13161C] text-sm text-slate-500 dark:text-slate-400">
            {t.noMatch}
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {GROUP_ORDER.map((groupId) => {
              const items = matchingApps.filter((tool) => tool.group === groupId);
              if (items.length === 0) return null;

              return (
                <div key={groupId}>
                  <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-slate-200/80 dark:border-[#232732]">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      {t.groups[groupId]}
                    </h3>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {items.length}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => onSelectService(deskToolToService(tool))}
                        className="group text-left p-5 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-slate-300 dark:hover:border-[#343B4C] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-[#1C202B] text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                              <ServiceIcon name={tool.iconName} className="w-4 h-4" />
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0" />
                          </div>

                          <div className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                              {tool.name[lang]}
                            </h4>
                            <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                              {tool.domain}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {tool.reference[lang]}
                          </p>

                          <p className="mt-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {tool.description[lang]}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate pr-2">{tool.formatNote[lang]}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 whitespace-nowrap shrink-0">
                            {t.inspectTool}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
