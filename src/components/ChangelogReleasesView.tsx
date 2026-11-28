import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileCode2,
  Link2,
  Mail,
  RotateCcw,
  Scissors,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CHANGELOG_CATEGORY_LABELS,
  CHANGELOG_RELEASE_DATE,
  CHANGELOG_RELEASES,
  CHANGELOG_STAGE_LABELS,
  CHANGELOG_VERSION,
  type ChangelogCategoryId,
  type ChangelogReleaseStage,
  type ChangelogServiceId,
} from '../data/changelogReleases';
import type { Language } from '../data/i18n';
import type { ActiveHostView } from './MailLinksTopBar';

type ServiceFilter = 'all' | ChangelogServiceId;
type CategoryFilter = 'all' | ChangelogCategoryId;

interface ChangelogReleasesViewProps {
  lang: Language;
  onSelectHost: (host: ActiveHostView) => void;
  onBack: () => void;
}

const CATEGORY_ORDER: readonly ChangelogCategoryId[] = [
  'core',
  'privacy_security',
  'ux_tools',
  'seo_infra',
];

function getStageTextTone(stage: ChangelogReleaseStage): string {
  switch (stage) {
    case 'dev':
      return 'text-blue-600 dark:text-blue-400';
    case 'beta':
      return 'text-amber-600 dark:text-amber-400';
    case 'alpha':
      return 'text-slate-600 dark:text-slate-400';
  }
}

function getStageNodeTone(stage: ChangelogReleaseStage, isLatest: boolean): string {
  if (isLatest) {
    return 'bg-blue-600 border-blue-200 dark:bg-blue-400 dark:border-blue-950';
  }
  switch (stage) {
    case 'dev':
      return 'bg-white dark:bg-[#0B0D11] border-blue-600 dark:border-blue-400';
    case 'beta':
      return 'bg-white dark:bg-[#0B0D11] border-amber-500 dark:border-amber-400';
    case 'alpha':
      return 'bg-white dark:bg-[#0B0D11] border-slate-400 dark:border-slate-500';
  }
}

export function ChangelogReleasesView({
  lang,
  onSelectHost,
  onBack,
}: ChangelogReleasesViewProps) {
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const uniqueVersionCount = useMemo(() => {
    return new Set(CHANGELOG_RELEASES.map((rel) => rel.version)).size;
  }, []);

  const serviceCounts = useMemo(() => {
    const mailCount = CHANGELOG_RELEASES.filter((rel) =>
      rel.affectedServices.includes('vz-mail')
    ).length;
    const linksCount = CHANGELOG_RELEASES.filter((rel) =>
      rel.affectedServices.includes('vz-links')
    ).length;
    return {
      all: CHANGELOG_RELEASES.length,
      'vz-mail': mailCount,
      'vz-links': linksCount,
    };
  }, []);

  const filteredReleases = useMemo(() => {
    return CHANGELOG_RELEASES.filter((rel) => {
      if (serviceFilter === 'all') return true;
      return rel.affectedServices.includes(serviceFilter);
    })
      .map((rel) => {
        const matchedHighlights =
          categoryFilter === 'all'
            ? rel.highlights
            : rel.highlights.filter((item) => item.category === categoryFilter);
        return {
          release: rel,
          highlights: matchedHighlights,
        };
      })
      .filter((entry) => entry.highlights.length > 0);
  }, [serviceFilter, categoryFilter]);

  const totalVisibleChanges = useMemo(() => {
    return filteredReleases.reduce(
      (sum, entry) => sum + entry.highlights.length,
      0
    );
  }, [filteredReleases]);

  const hasActiveFilters = serviceFilter !== 'all' || categoryFilter !== 'all';

  const formattedDate = useMemo(() => {
    try {
      const date = new Date(`${CHANGELOG_RELEASE_DATE}T00:00:00Z`);
      return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    } catch {
      return CHANGELOG_RELEASE_DATE;
    }
  }, [lang]);

  const handleResetFilters = () => {
    setServiceFilter('all');
    setCategoryFilter('all');
  };

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Editorial Pre-1.0 Header */}
      <header className="space-y-6 pb-8 border-b border-slate-200 dark:border-[#232732]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Kembali ke Layanan' : 'Back to Service'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {CHANGELOG_VERSION}
            </span>
            <span aria-hidden="true">·</span>
            <span>{CHANGELOG_STAGE_LABELS.dev[lang]}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={CHANGELOG_RELEASE_DATE}>{formattedDate}</time>
            <span aria-hidden="true">·</span>
            <span>
              {uniqueVersionCount}{' '}
              {lang === 'id' ? 'tonggak versi' : 'milestones'}
            </span>
          </div>
        </div>

        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {lang === 'id'
              ? 'Catatan Perubahan Pengembangan Aktif · PT Galeri Langkah Bahagia Yuwana (galbay)'
              : 'Active Development Changelog · PT Galeri Langkah Bahagia Yuwana (galbay)'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display text-balance">
            {lang === 'id'
              ? `Timeline Changelog ${CHANGELOG_VERSION} — VZ Mail & VZ Links`
              : `Changelog Timeline ${CHANGELOG_VERSION} — VZ Mail & VZ Links`}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Riwayat pengembangan lengkap prarilis dari v0.1.0-alpha hingga v0.9.0-dev untuk ekosistem 2-in-1 Cloudflare Worker: email lokal Zero-Retention VZ Mail (mail.vz.gay) serta Link-in-Bio multi-halaman, pemendek URL imy.li/s/, QR Studio, dan kontrol privasi SEO/AI VZ Links (links.vz.gay & *.imy.li).'
              : 'Complete pre-1.0 development history from v0.1.0-alpha through v0.9.0-dev for the 2-in-1 Cloudflare Worker suite: zero-retention local-first VZ Mail (mail.vz.gay) and multi-page Link-in-Bio, imy.li/s/ shortener, QR Studio, and opt-in Search/AI controls on VZ Links (links.vz.gay & *.imy.li).'}
          </p>
        </div>

        {/* Dual Filter Controls: Service + Category */}
        <div className="space-y-3 pt-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Service Filter Segmented Control */}
            <div
              role="tablist"
              aria-label={
                lang === 'id' ? 'Filter layanan' : 'Filter by service'
              }
              className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] self-start overflow-x-auto max-w-full"
            >
              {(
                [
                  {
                    id: 'all' as const,
                    label: lang === 'id' ? 'Semua Layanan' : 'All Services',
                    count: serviceCounts.all,
                  },
                  {
                    id: 'vz-mail' as const,
                    label: 'VZ Mail',
                    count: serviceCounts['vz-mail'],
                  },
                  {
                    id: 'vz-links' as const,
                    label: 'VZ Links',
                    count: serviceCounts['vz-links'],
                  },
                ] as const
              ).map((tab) => {
                const active = serviceFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setServiceFilter(tab.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white border border-slate-200 dark:border-[#2E3545]'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-70">
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Public AI / Machine Discovery Links */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">
              <a
                href="/llms.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>/llms.txt</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="/llms-full.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>/llms-full.txt</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="/sitemap.xml"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>/sitemap.xml</span>
                <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Category Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label={
                lang === 'id'
                  ? 'Filter kategori perubahan'
                  : 'Filter by change category'
              }
              className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5"
            >
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                aria-pressed={categoryFilter === 'all'}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-[#13161C] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#232732] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'id' ? 'Semua Kategori' : 'All Categories'}
              </button>
              {CATEGORY_ORDER.map((catId) => {
                const active = categoryFilter === catId;
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => setCategoryFilter(catId)}
                    aria-pressed={active}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                        : 'bg-white dark:bg-[#13161C] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#232732] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {CHANGELOG_CATEGORY_LABELS[catId][lang]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>
                {lang === 'id'
                  ? `${filteredReleases.length} entri · ${totalVisibleChanges} perubahan`
                  : `${filteredReleases.length} entries · ${totalVisibleChanges} changes`}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-sans font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{lang === 'id' ? 'Reset' : 'Reset'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Chronological Timeline */}
      {filteredReleases.length === 0 ? (
        <div className="p-8 sm:p-10 rounded-xl bg-white dark:bg-[#11151E] border border-slate-200 dark:border-[#232732] text-center space-y-4">
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Belum ada perubahan untuk kombinasi filter ini'
                : 'No changes match this filter combination'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {lang === 'id'
                ? 'Coba pilih kategori lain atau kembalikan filter ke semua layanan untuk melihat seluruh timeline prarilis dari v0.1.0-alpha hingga v0.9.0-dev.'
                : 'Try another category or reset filters to view the full pre-1.0 timeline from v0.1.0-alpha through v0.9.0-dev.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Reset Filter' : 'Reset Filters'}</span>
          </button>
        </div>
      ) : (
        <ol className="relative space-y-6 sm:space-y-8">
          {/* Continuous Vertical Timeline Spine */}
          <div
            aria-hidden="true"
            className="hidden sm:block absolute left-[11px] top-3 bottom-3 w-px bg-slate-200 dark:bg-[#232732]"
          />

          {filteredReleases.map(({ release, highlights }, index) => {
            const isLatest =
              index === 0 &&
              release.version === CHANGELOG_VERSION.replace(/^v/, '');
            const coversMail = release.affectedServices.includes('vz-mail');
            const coversLinks = release.affectedServices.includes('vz-links');
            const isPrimaryMail = release.serviceId === 'vz-mail';

            return (
              <li
                key={`${release.serviceId}-${release.version}`}
                className="relative sm:pl-9"
              >
                {/* Static Timeline Milestone Node */}
                <span
                  aria-hidden="true"
                  className={`hidden sm:block absolute left-[5px] top-6 w-[13px] h-[13px] rounded-full border-2 ${getStageNodeTone(
                    release.stage,
                    isLatest
                  )}`}
                />

                <article className="rounded-xl bg-white dark:bg-[#11151E] border border-slate-200 dark:border-[#232732] overflow-hidden">
                  {/* Release Header */}
                  <div className="p-5 sm:p-6 space-y-4 border-b border-slate-200 dark:border-[#232732]">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            v{release.version}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-sans font-semibold ${getStageTextTone(
                              release.stage
                            )}`}
                          >
                            {CHANGELOG_STAGE_LABELS[release.stage][lang]}
                          </span>
                          {isLatest && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans font-semibold text-blue-600 dark:text-blue-400">
                                {lang === 'id' ? 'Terbaru' : 'Latest'}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <time dateTime={release.releaseDate}>
                            {release.releaseDate}
                          </time>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans text-slate-700 dark:text-slate-300 font-medium">
                            {release.serviceName}
                          </span>
                        </div>

                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white font-display tracking-tight text-balance">
                          {release.codename[lang]}
                        </h2>

                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-words">
                          {release.domains.join(' · ')}
                        </p>
                      </div>

                      {/* Quick Service Launch Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {coversMail && (
                          <button
                            type="button"
                            onClick={() => onSelectHost('mail.vz.gay')}
                            className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                              isPrimaryMail
                                ? 'text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
                                : 'text-slate-700 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#171C27] hover:bg-slate-100 dark:hover:bg-[#1E2534] border border-slate-200 dark:border-[#282F3E]'
                            }`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>VZ Mail</span>
                          </button>
                        )}
                        {coversLinks && (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectHost('links.vz.gay')}
                              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                                !isPrimaryMail
                                  ? 'text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
                                  : 'text-slate-700 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#171C27] hover:bg-slate-100 dark:hover:bg-[#1E2534] border border-slate-200 dark:border-[#282F3E]'
                              }`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>VZ Links</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectHost('shortlinks')}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-[#FAFAFA] dark:bg-[#171C27] hover:bg-slate-100 dark:hover:bg-[#1E2534] border border-slate-200 dark:border-[#282F3E] rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Scissors className="w-3.5 h-3.5" />
                              <span>imy.li/s/</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-4xl">
                      {release.summary[lang]}
                    </p>
                  </div>

                  {/* Flat Hairline-Separated Highlights List (No Cards-Within-Cards) */}
                  <div className="divide-y divide-slate-200/80 dark:divide-[#232732]">
                    {highlights.map((item, idx) => (
                      <section
                        key={item.id}
                        className="px-5 sm:px-6 py-4 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {CHANGELOG_CATEGORY_LABELS[item.category][lang]}
                          </span>
                          <span className="font-mono tabular-nums text-[11px]">
                            v{release.version} · {String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white font-display">
                          {item.title[lang]}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {item.description[lang]}
                        </p>
                      </section>
                    ))}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
