import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileCode2,
  Link2,
  Mail,
  Scissors,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CHANGELOG_CATEGORY_LABELS,
  CHANGELOG_RELEASE_DATE,
  CHANGELOG_RELEASES,
  CHANGELOG_VERSION,
  type ChangelogServiceId,
} from '../data/changelogReleases';
import type { Language } from '../data/i18n';
import type { ActiveHostView } from './MailLinksTopBar';

type ServiceFilter = 'all' | ChangelogServiceId;

interface ChangelogReleasesViewProps {
  lang: Language;
  onSelectHost: (host: ActiveHostView) => void;
  onBack: () => void;
}

export function ChangelogReleasesView({
  lang,
  onSelectHost,
  onBack,
}: ChangelogReleasesViewProps) {
  const [filter, setFilter] = useState<ServiceFilter>('all');

  const visibleReleases = useMemo(() => {
    if (filter === 'all') return CHANGELOG_RELEASES;
    return CHANGELOG_RELEASES.filter((rel) => rel.serviceId === filter);
  }, [filter]);

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

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      {/* Editorial Header */}
      <header className="space-y-6 pb-8 border-b border-slate-200 dark:border-[#232732]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Kembali ke Layanan' : 'Back to Service'}</span>
          </button>

          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>{CHANGELOG_VERSION}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={CHANGELOG_RELEASE_DATE}>{formattedDate}</time>
            <span aria-hidden="true"> · </span>
            <span>CHANGELOG.md</span>
          </div>
        </div>

        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
            {lang === 'id'
              ? 'Catatan Rilis Resmi · PT Galeri Langkah Bahagia Yuwana (galbay)'
              : 'Official Release Notes · PT Galeri Langkah Bahagia Yuwana (galbay)'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Changelog Rilis ${CHANGELOG_VERSION} — VZ Mail & VZ Links`
              : `Changelog Releases ${CHANGELOG_VERSION} — VZ Mail & VZ Links`}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            {lang === 'id'
              ? 'Dokumentasi rilis stabil perdana untuk ekosistem 2-in-1 Cloudflare Worker: email lokal privat Zero-Retention VZ Mail (mail.vz.gay) serta Link-in-Bio multi-halaman, pemendek URL, QR Studio, dan kontrol privasi SEO/AI VZ Links (links.vz.gay & *.imy.li).'
              : 'First stable release documentation for the 2-in-1 Cloudflare Worker suite: zero-retention local-first VZ Mail (mail.vz.gay) paired with multi-page Link-in-Bio, URL shortener, custom QR Studio, and opt-in Search/AI controls on VZ Links (links.vz.gay & *.imy.li).'}
          </p>
        </div>

        {/* Service Filter Segmented Controls + AI Discovery Links */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div
            role="tablist"
            aria-label={lang === 'id' ? 'Filter layanan rilis' : 'Filter release service'}
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] self-start"
          >
            {(
              [
                {
                  id: 'all' as const,
                  label: lang === 'id' ? 'Semua Layanan (2)' : 'All Services (2)',
                },
                { id: 'vz-mail' as const, label: 'VZ Mail v1.0.0' },
                { id: 'vz-links' as const, label: 'VZ Links v1.0.0' },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#1E2430] text-slate-900 dark:text-white border border-slate-200 dark:border-[#2E3545]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400">
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors"
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
              className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors"
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
              className="hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition-colors"
            >
              <span>/sitemap.xml</span>
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Release Sections */}
      <div className="space-y-12">
        {visibleReleases.map((release) => {
          const isMail = release.serviceId === 'vz-mail';
          return (
            <article
              key={release.serviceId}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 pb-12 border-b border-slate-200 dark:border-[#232732] last:border-b-0 last:pb-0"
            >
              {/* Left Sticky Release Metadata Column */}
              <div className="lg:col-span-4 lg:sticky lg:top-20 self-start space-y-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                      isMail
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60'
                        : 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-900/60'
                    }`}
                  >
                    {isMail ? <Mail className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                      {release.serviceName}{' '}
                      <span className="font-mono text-base text-blue-600 dark:text-blue-400">
                        v{release.version}
                      </span>
                    </h2>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {release.domains.join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {release.codename[lang]}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {release.summary[lang]}
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectHost(isMail ? 'mail.vz.gay' : 'links.vz.gay')
                    }
                    className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isMail ? (
                      <Mail className="w-3.5 h-3.5" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isMail
                        ? lang === 'id'
                          ? 'Buka VZ Mail'
                          : 'Open VZ Mail'
                        : lang === 'id'
                          ? 'Buka Studio VZ Links'
                          : 'Open VZ Links Studio'}
                    </span>
                  </button>

                  {!isMail && (
                    <button
                      type="button"
                      onClick={() => onSelectHost('shortlinks')}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#13161C] hover:bg-slate-50 dark:hover:bg-[#1A1F29] border border-slate-200 dark:border-[#232732] rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>imy.li/s/</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Structured Highlights List */}
              <div className="lg:col-span-8 space-y-3">
                {release.highlights.map((item, idx) => (
                  <section
                    key={item.id}
                    className="p-5 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span className="uppercase tracking-wider">
                        {CHANGELOG_CATEGORY_LABELS[item.category][lang]}
                      </span>
                      <span>
                        {release.serviceName} · v{release.version} · #{String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display">
                      {item.title[lang]}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.description[lang]}
                    </p>
                  </section>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
