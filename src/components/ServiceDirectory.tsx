import { ArrowUpRight, ChevronRight, Plus } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { ServiceCategory, VzService } from '../data/services';
import { ServiceIcon } from './ServiceIcon';

export type DirectoryFilter = 'all' | 'live' | ServiceCategory;

interface ServiceDirectoryProps {
  lang: Language;
  services: VzService[];
  filter: DirectoryFilter;
  onFilterChange: (filter: DirectoryFilter) => void;
  searchQuery: string;
  isVerifiedAdult21: boolean;
  onSelectService: (service: VzService) => void;
}

export function ServiceDirectory({
  lang,
  services,
  filter,
  onFilterChange,
  searchQuery,
  isVerifiedAdult21,
  onSelectService,
}: ServiceDirectoryProps) {
  const t = UI_COPY[lang].directory;

  const filterTabs: { id: DirectoryFilter; label: string }[] = [
    { id: 'all', label: t.tabs.all },
    { id: 'live', label: t.tabs.live },
    { id: 'productivity', label: t.tabs.productivity },
    { id: 'web_business', label: t.tabs.web_business },
    { id: 'developer_cloud', label: t.tabs.developer_cloud },
    { id: 'media_content', label: t.tabs.media_content },
    { id: 'education', label: t.tabs.education },
    { id: 'system_community', label: t.tabs.system_community },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredServices = services.filter((svc) => {
    if (svc.ageRestricted && !isVerifiedAdult21) {
      return false;
    }

    const matchesCategory =
      filter === 'all'
        ? true
        : filter === 'live'
          ? svc.status === 'live' || (svc.liveChildren && svc.liveChildren.length > 0)
          : svc.category === filter || Boolean(svc.secondaryCategories?.includes(filter));

    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      svc.primaryDomain,
      ...(svc.altDomains ?? []),
      svc.name[lang],
      svc.shortType[lang],
      svc.description[lang],
      ...(svc.clientDomainPatterns ?? []),
      ...(svc.liveChildren?.map((c) => `${c.name} ${c.domain} ${c.altDomain ?? ''}`) ?? []),
      ...(svc.highlights?.map((h) => `${h.label[lang]} ${h.value[lang]}`) ?? []),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  return (
    <section id="services" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-14">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 sm:pb-8 border-b border-slate-200 dark:border-[#232732]">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t.sectionTitle}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.sectionSubtitle}
          </p>
          {isVerifiedAdult21 && (
            <p className="mt-2 font-mono text-xs text-emerald-700 dark:text-emerald-400">
              {t.adultUnlockedHint}
            </p>
          )}
        </div>

        {/* Mobile Category Select Dropdown */}
        <div className="sm:hidden w-full">
          <label htmlFor="mobile-category-select" className="sr-only">
            {t.sectionTitle}
          </label>
          <select
            id="mobile-category-select"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as DirectoryFilter)}
            className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-[#151922] border border-slate-300 dark:border-[#282E3D] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
          >
            {filterTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tablet & Desktop Interactive Category Tabs */}
        <div
          role="tablist"
          aria-label={t.sectionTitle}
          className="hidden sm:flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#151922] border border-slate-200/80 dark:border-[#232732] self-start lg:self-auto"
        >
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#232938] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty Search Result State */}
      {filteredServices.length === 0 ? (
        <div className="mt-8 p-10 rounded-xl border border-slate-200 dark:border-[#232732] bg-white dark:bg-[#13161C] text-center">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            {t.emptyFilterTitle}
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {t.emptyFilterDesc}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`https://search.vz.gay/search?q=${encodeURIComponent(searchQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>{t.searchWebFallback}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((service) => {
            const isLive = service.status === 'live';
            const statusText = t.statusLabels[service.status];
            const domainCount = service.clientDomainPatterns?.length ?? 0;
            const liveChildrenCount = service.liveChildren?.length ?? 0;
            const targetHref = service.launchUrl || `https://${service.primaryDomain}`;

            if (isLive) {
              return (
                <a
                  key={service.id}
                  href={targetHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between p-6 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-blue-500/60 dark:hover:border-blue-400/60 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <ServiceIcon name={service.iconName} />
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors shrink-0" />
                    </div>

                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                      {service.name[lang]}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-blue-600 dark:text-blue-400">
                      {service.primaryDomain}
                      {service.altDomains && service.altDomains.length > 0
                        ? ` · alias: ${service.altDomains.join(', ')}`
                        : ''}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {statusText}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{service.shortType[lang]}</span>
                    </div>

                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {service.description[lang]}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
                    <span>{t.openService}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </a>
              );
            }

            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onSelectService(service)}
                className="group text-left flex flex-col justify-between p-6 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-slate-300 dark:hover:border-[#343B4C] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#1C202B] text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                      <ServiceIcon name={service.iconName} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0" />
                  </div>

                  <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                    {service.name[lang]}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {service.primaryDomain}
                    {service.altDomains && service.altDomains.length > 0
                      ? ` / ${service.altDomains.join(', ')}`
                      : ''}
                  </p>

                  {/* Zero-pill unboxed metadata with middle dots */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span
                      className={`font-medium ${
                        service.status === 'coming_soon'
                          ? 'text-violet-700 dark:text-violet-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {statusText}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{service.shortType[lang]}</span>
                    {domainCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {domainCount} {t.clientDomainsCount}
                        </span>
                      </>
                    )}
                    {liveChildrenCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {liveChildrenCount} {t.liveAppsCount}
                        </span>
                      </>
                    )}
                  </div>

                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {service.description[lang]}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {t.viewDetails}
                  </span>
                  {service.sponsor && (
                    <span className="text-slate-400 dark:text-slate-500 truncate">
                      {t.sponsoredBy} {service.sponsor}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Extensible Roadmap Card when viewing All without narrow search */}
          {filter === 'all' && !normalizedQuery && (
            <div className="flex flex-col justify-between p-6 rounded-xl border border-dashed border-slate-300 dark:border-[#2C3240] bg-transparent">
              <div>
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#171B24] text-slate-500 dark:text-slate-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                  {t.moreServicesTitle}
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t.moreServicesDesc}
                </p>
              </div>
              <p className="mt-5 pt-4 border-t border-slate-200/70 dark:border-[#232732] font-mono text-xs text-slate-400 dark:text-slate-500">
                *.vz.gay
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
