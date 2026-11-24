import type { MouseEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  Globe,
  LayoutGrid,
  ShieldCheck,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import {
  VZ_DESK_APPS,
  VZ_SERVICES,
  deskToolToService,
  type VzService,
} from '../data/services';
import { filterToPath } from '../hooks/usePathRouter';
import type { DirectoryFilter } from './ServiceDirectory';
import { ServiceIcon } from './ServiceIcon';

interface HomeOverviewProps {
  lang: Language;
  searchQuery: string;
  isVerifiedAdult21: boolean;
  onNavigate: (to: string) => void;
  onSelectService: (service: VzService) => void;
}

const HOME_COPY = {
  id: {
    searchMatchTitle: 'Hasil Pencarian Cepat di Ekosistem vz.gay',
    viewAllResults: 'Lihat semua di /services',
    noQuickMatch: 'Tidak ada layanan lokal yang cocok. Tekan Enter pada kotak pencarian untuk mencari di search.vz.gay.',
    liveTitle: 'Layanan Utama yang Sudah Aktif',
    liveSubtitle: 'Layanan ekosistem vz.gay yang sudah online dan dapat langsung diakses sekarang.',
    viewAllLive: 'Lihat semua aplikasi aktif',
    exploreTitle: 'Jelajahi Bagian Portal',
    exploreSubtitle:
      'Setiap bagian kini dipisahkan pada halaman mandiri agar pemuatan halaman utama tetap ringan dan cepat.',
    cards: [
      {
        path: '/services',
        meta: '/services',
        title: 'Direktori Layanan Ekosistem',
        desc: 'Telusuri 30+ layanan aktif dan yang sedang dikembangkan lintas 7 kategori.',
      },
      {
        path: '/desk',
        meta: '/desk',
        title: 'VZ Desk Suite (17 Aplikasi)',
        desc: 'Suite produktivitas, dokumen, spreadsheet, desain 3D, analitik, dan komunikasi.',
      },
      {
        path: '/live-domains',
        meta: '/live-domains',
        title: 'Sub-Aplikasi Aktif & Peta Domain',
        desc: 'Akses sub-aplikasi yang sudah berjalan beserta matriks opsi domain klien & 301.',
      },
      {
        path: '/about',
        meta: '/about',
        title: 'SSO Terpadu & Identitas Mitra',
        desc: 'Autentikasi tunggal accounts.vz.gay, myaccount.vz.gay, dan naungan galbay.',
      },
    ],
    categoryTitle: 'Pintasan Kategori Direktori',
    openRoute: 'Buka Halaman',
  },
  en: {
    searchMatchTitle: 'Instant Ecosystem Matches',
    viewAllResults: 'View all in /services',
    noQuickMatch: 'No local service match. Press Enter in the search bar to search the web on search.vz.gay.',
    liveTitle: 'Active Core Services',
    liveSubtitle: 'Top-level vz.gay ecosystem platforms that are live and ready to launch right now.',
    viewAllLive: 'View all live sub-apps',
    exploreTitle: 'Explore Portal Destinations',
    exploreSubtitle:
      'Each section lives on its own dedicated route and is only loaded when you open it.',
    cards: [
      {
        path: '/services',
        meta: '/services',
        title: 'Ecosystem Service Directory',
        desc: 'Browse 30+ live and upcoming services organized across 7 focused categories.',
      },
      {
        path: '/desk',
        meta: '/desk',
        title: 'VZ Desk Suite (17 Apps)',
        desc: 'Unified cloud productivity, documents, spreadsheets, 3D/design, analytics, and chat.',
      },
      {
        path: '/live-domains',
        meta: '/live-domains',
        title: 'Live Sub-Apps & Domain Matrix',
        desc: 'Launch active tools under VZ Play & Codeplace and inspect client domain routing.',
      },
      {
        path: '/about',
        meta: '/about',
        title: 'Unified SSO & Partner Identity',
        desc: 'Single sign-on via accounts.vz.gay, myaccount.vz.gay, and galbay corporate umbrella.',
      },
    ],
    categoryTitle: 'Direct Category Routes',
    openRoute: 'Open Page',
  },
} as const;

export function HomeOverview({
  lang,
  searchQuery,
  isVerifiedAdult21,
  onNavigate,
  onSelectService,
}: HomeOverviewProps) {
  const t = HOME_COPY[lang];
  const dirCopy = UI_COPY[lang].directory;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const handleRouteClick = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    onNavigate(path);
  };

  const liveServices = VZ_SERVICES.filter((svc) => svc.status === 'live');

  // When user types a query on `/`, show instant matches across services + VZ Desk tools
  const allSearchableServices: VzService[] = [
    ...VZ_SERVICES.filter((svc) => !svc.ageRestricted || isVerifiedAdult21),
    ...VZ_DESK_APPS.map(deskToolToService),
  ];

  const instantMatches = normalizedQuery
    ? allSearchableServices
        .filter((svc) => {
          const haystack = [
            svc.primaryDomain,
            ...(svc.altDomains ?? []),
            svc.name[lang],
            svc.shortType[lang],
            svc.description[lang],
            ...(svc.clientDomainPatterns ?? []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .slice(0, 6)
    : [];

  const categoryRoutes: { filter: DirectoryFilter; label: string; path: string }[] = [
    { filter: 'live', label: dirCopy.tabs.live, path: filterToPath('live') },
    { filter: 'productivity', label: dirCopy.tabs.productivity, path: filterToPath('productivity') },
    { filter: 'web_business', label: dirCopy.tabs.web_business, path: filterToPath('web_business') },
    { filter: 'developer_cloud', label: dirCopy.tabs.developer_cloud, path: filterToPath('developer_cloud') },
    { filter: 'media_content', label: dirCopy.tabs.media_content, path: filterToPath('media_content') },
    { filter: 'education', label: dirCopy.tabs.education, path: filterToPath('education') },
    { filter: 'system_community', label: dirCopy.tabs.system_community, path: filterToPath('system_community') },
  ];

  const routeIcons = [LayoutGrid, Briefcase, Globe, ShieldCheck];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12 sm:space-y-14">
      {/* Instant Search Preview when user types on Home (/) */}
      {normalizedQuery.length > 0 && (
        <section className="p-6 rounded-xl bg-white dark:bg-[#13161C] border border-blue-500/40 dark:border-blue-400/40">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#232732]">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {t.searchMatchTitle}
            </h2>
            <a
              href="/services"
              onClick={(e) => handleRouteClick(e, '/services')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>{t.viewAllResults}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {instantMatches.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{t.noQuickMatch}</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {instantMatches.map((svc) => {
                const isLive = svc.status === 'live';
                const targetHref = svc.launchUrl || `https://${svc.primaryDomain}`;
                if (isLive) {
                  return (
                    <a
                      key={svc.id}
                      href={targetHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-lg bg-[#FAFAFA] dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] hover:border-blue-500/60 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {svc.name[lang]}
                        </div>
                        <div className="font-mono text-xs text-blue-600 dark:text-blue-400 truncate">
                          {svc.primaryDomain}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {svc.shortType[lang]}
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </a>
                  );
                }
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => onSelectService(svc)}
                    className="text-left p-4 rounded-lg bg-[#FAFAFA] dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] hover:border-slate-300 dark:hover:border-[#343B4C] transition-colors flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {svc.name[lang]}
                      </div>
                      <div className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                        {svc.primaryDomain}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                        {svc.shortType[lang]}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 1. Route Gateway Cards (/services, /desk, /live-domains, /about) */}
      <section>
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t.exploreTitle}
          </h2>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            {t.exploreSubtitle}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.cards.map((card, idx) => {
            const IconComponent = routeIcons[idx] || LayoutGrid;
            return (
              <a
                key={card.path}
                href={card.path}
                onClick={(e) => handleRouteClick(e, card.path)}
                className="group p-5 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-blue-500/60 dark:hover:border-blue-400/60 transition-colors duration-150 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                      {card.meta}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.desc}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
                  <span>{t.openRoute}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </a>
            );
          })}
        </div>

        {/* Category Sub-Route Shortcuts (/services/web, /services/edu, etc.) */}
        <div className="mt-5 pt-5 border-t border-slate-200/80 dark:border-[#232732] flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
            {t.categoryTitle}:
          </span>
          {categoryRoutes.map((cat) => (
            <a
              key={cat.path}
              href={cat.path}
              onClick={(e) => handleRouteClick(e, cat.path)}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-blue-500/60 dark:hover:border-blue-400/60 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{cat.label}</span>
              <span className="ml-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                {cat.path}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* 2. Live Core Services Spotlight */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232732]">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.liveTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.liveSubtitle}</p>
          </div>
          <a
            href="/live-domains"
            onClick={(e) => handleRouteClick(e, '/live-domains')}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
          >
            <span>{t.viewAllLive}</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveServices.map((service) => {
            const targetHref = service.launchUrl || `https://${service.primaryDomain}`;
            return (
              <a
                key={service.id}
                href={targetHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-5 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] hover:border-blue-500/60 dark:hover:border-blue-400/60 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <ServiceIcon name={service.iconName} className="w-4 h-4" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors shrink-0" />
                  </div>
                  <h3 className="mt-3.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                    {service.name[lang]}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-blue-600 dark:text-blue-400">
                    {service.primaryDomain}
                    {service.altDomains && service.altDomains.length > 0
                      ? ` · ${service.altDomains[0]}`
                      : ''}
                  </p>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {service.description[lang]}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1E232D] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{service.shortType[lang]}</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {dirCopy.statusLabels.live}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
