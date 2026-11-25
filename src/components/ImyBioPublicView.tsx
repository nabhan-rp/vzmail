import { ArrowLeft, Edit3, ExternalLink, Globe, Link2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  BIO_THEMES,
  SOCIAL_PLATFORMS,
  type BioLinkItem,
  type BioPageRecord,
  type BioWorkspaceData,
} from '../utils/linksModel';
import { sanitizeHandle } from '../utils/mailIdentity';
import type { ActiveHostView } from './MailLinksTopBar';
import { SocialIconGlyph } from './SocialIconGlyph';

interface ImyBioPublicViewProps {
  lang: Language;
  session: SsoSession;
  overrideUser?: string | null;
  pageSlug?: string;
  onChangePageSlug?: (nextSlug: string) => void;
  onSelectHost: (host: ActiveHostView) => void;
}

export function ImyBioPublicView({
  lang,
  session,
  overrideUser,
  pageSlug = '',
  onChangePageSlug,
  onSelectHost,
}: ImyBioPublicViewProps) {
  const user = useMemo(() => {
    if (overrideUser && overrideUser.trim()) {
      return sanitizeHandle(overrideUser);
    }
    if (session.isAuthenticated && session.username) {
      return sanitizeHandle(session.username);
    }
    return '';
  }, [overrideUser, session.isAuthenticated, session.username]);

  const domain = session.primaryDomain || 'imy.li';
  const isOwner = Boolean(session.isAuthenticated && user && session.username === user);

  const [workspace, setWorkspace] = useState<BioWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const loadPublicBio = useCallback(async () => {
    if (!user) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/links/bio/${encodeURIComponent(user)}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        configured?: boolean;
        data?: BioWorkspaceData | null;
      } | null;

      if (res.ok && json?.ok && json.configured && json.data) {
        setWorkspace(json.data);
      } else {
        setWorkspace(null);
      }
    } catch {
      setFetchError(true);
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadPublicBio();
  }, [loadPublicBio]);

  const activePage: BioPageRecord | null = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.pages.find(
        (p) => p.pageSlug === pageSlug && p.isPublished !== false
      ) || null
    );
  }, [workspace, pageSlug]);

  const otherPublishedPages = useMemo(() => {
    if (!workspace) return [];
    return workspace.pages.filter(
      (p) => p.isPublished !== false && p.pageSlug !== pageSlug
    );
  }, [workspace, pageSlug]);

  const filledSocials = useMemo(() => {
    if (!workspace) return [];
    return SOCIAL_PLATFORMS.filter((platform) => {
      const val = workspace.socials[platform.id];
      return typeof val === 'string' && val.trim().length > 0;
    });
  }, [workspace]);

  const handleLinkClick = (link: BioLinkItem) => {
    if (!user || !activePage) return;
    // Fire real click increment without blocking navigation
    const payload = JSON.stringify({
      username: user,
      pageSlug: activePage.pageSlug,
      linkId: link.id,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(
        '/api/links/bio-click',
        new Blob([payload], { type: 'application/json' })
      );
    } else {
      fetch('/api/links/bio-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-112px)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-[#191E28] mx-auto animate-pulse" />
          <div className="h-6 w-40 rounded-lg bg-slate-200 dark:bg-[#191E28] mx-auto animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-[#191E28] animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-[#191E28] animate-pulse" />
        </div>
      </div>
    );
  }

  // Honest unconfigured / empty state (zero mock or demo data)
  if (!user || !workspace || !activePage) {
    const requestedPath = user
      ? pageSlug
        ? `${user}.${domain}/${pageSlug}`
        : `${user}.${domain}`
      : `username.${domain}`;

    return (
      <div className="min-h-[calc(100vh-112px)] flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-md bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl p-7 text-center space-y-5">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1B202B] text-slate-500 dark:text-slate-300 flex items-center justify-center mx-auto">
            <Globe className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-mono text-slate-500">{requestedPath}</div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {fetchError
                ? lang === 'id'
                  ? 'Gagal Memuat Halaman Bio'
                  : 'Failed to Load Bio Page'
                : workspace && pageSlug
                  ? lang === 'id'
                    ? `Halaman /${pageSlug} Tidak Ditemukan`
                    : `Page /${pageSlug} Not Found`
                  : lang === 'id'
                    ? 'Halaman Bio Belum Dikonfigurasi'
                    : 'Bio Page Not Configured Yet'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {workspace && pageSlug
                ? lang === 'id'
                  ? `Pemilik ${user}.${domain} belum membuat sub-halaman /${pageSlug}.`
                  : `The owner of ${user}.${domain} has not published /${pageSlug}.`
                : isOwner
                  ? lang === 'id'
                    ? `Anda belum menyimpan profil, ikon sosmed, atau tautan untuk ${user}.${domain}. Atur sekarang melalui Studio VZ Links.`
                    : `You have not saved a profile, social icons, or links for ${user}.${domain} yet. Set it up now in VZ Links Studio.`
                  : lang === 'id'
                    ? `Pemilik halaman ${requestedPath} belum menambahkan tautan publik apa pun.`
                    : `The owner of ${requestedPath} has not published any links yet.`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            {workspace && pageSlug && onChangePageSlug && (
              <button
                type="button"
                onClick={() => onChangePageSlug('')}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? `Ke ${user}.${domain}` : `Go to ${user}.${domain}`}</span>
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => onSelectHost('links.vz.gay')}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Atur di Studio Bio' : 'Edit in Bio Studio'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const theme = BIO_THEMES[activePage.themeId] || BIO_THEMES.midnight_slate;
  const buttonRadiusClass =
    activePage.buttonStyle === 'sharp' ? 'rounded-md' : 'rounded-xl';
  const visibleLinks = activePage.links.filter((l) => l.enabled);

  return (
    <div
      className={`min-h-[calc(100vh-112px)] px-4 py-10 sm:py-14 flex flex-col items-center justify-between transition-colors ${theme.pageBgClass}`}
    >
      <div className="w-full max-w-[540px] space-y-6">
        {/* Owner-only subtle edit link (zero technical telemetry for public visitors) */}
        {(isOwner || activePage.pageSlug !== '') && (
          <div className="flex items-center justify-between gap-2 text-xs">
            {activePage.pageSlug !== '' ? (
              <button
                type="button"
                onClick={() => onChangePageSlug?.('')}
                className={`inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer ${theme.mutedClass}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{user}.{domain}</span>
              </button>
            ) : (
              <span />
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => onSelectHost('links.vz.gay')}
                className={`inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer ${theme.mutedClass}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Edit Halaman' : 'Edit Page'}</span>
              </button>
            )}
          </div>
        )}

        {/* Main Public Bio Card */}
        <article
          className={`rounded-2xl border p-6 sm:p-8 space-y-6 ${theme.cardClass}`}
        >
          {/* Profile Header */}
          <header className="flex flex-col items-center text-center space-y-3">
            {workspace.avatarUrl ? (
              <img
                src={workspace.avatarUrl}
                alt={workspace.displayName || user}
                className="w-20 h-20 rounded-2xl object-cover border border-white/15"
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-2xl flex items-center justify-center text-xl font-bold font-display ${theme.avatarClass}`}
              >
                {(workspace.displayName || user).slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="space-y-1">
              <h1 className={`text-xl sm:text-2xl font-bold font-display ${theme.titleClass}`}>
                {activePage.pageSlug === ''
                  ? workspace.displayName || user
                  : activePage.title || `/${activePage.pageSlug}`}
              </h1>

              {activePage.pageSlug === '' && workspace.headline && (
                <div className={`text-xs sm:text-sm font-medium ${theme.mutedClass}`}>
                  {workspace.headline}
                </div>
              )}

              {(activePage.pageSlug === '' ? workspace.bio : activePage.description) && (
                <p
                  className={`text-xs sm:text-sm leading-relaxed max-w-[44ch] mx-auto pt-0.5 ${theme.bodyClass}`}
                >
                  {activePage.pageSlug === ''
                    ? workspace.bio
                    : activePage.description}
                </p>
              )}
            </div>

            {/* Social Media Icons — ONLY configured/filled platforms are shown */}
            {activePage.showSocials && filledSocials.length > 0 && (
              <nav
                aria-label="Social Media Links"
                className="flex flex-wrap items-center justify-center gap-2 pt-1"
              >
                {filledSocials.map((platform) => {
                  const href = workspace.socials[platform.id]!;
                  const isMailto = href.startsWith('mailto:');
                  return (
                    <a
                      key={platform.id}
                      href={href}
                      target={isMailto ? undefined : '_blank'}
                      rel={isMailto ? undefined : 'noopener noreferrer'}
                      aria-label={platform.label}
                      title={platform.label}
                      className={`w-10 h-10 rounded-xl border inline-flex items-center justify-center transition-colors ${theme.socialBtnClass}`}
                    >
                      <SocialIconGlyph platform={platform.id} className="w-4 h-4" />
                    </a>
                  );
                })}
              </nav>
            )}
          </header>

          {/* Links Stack */}
          <div className="space-y-3">
            {visibleLinks.length === 0 ? (
              <div
                className={`p-6 rounded-xl border border-dashed text-center text-xs ${theme.dividerClass} ${theme.mutedClass}`}
              >
                {lang === 'id'
                  ? 'Belum ada tautan yang ditambahkan pada halaman ini.'
                  : 'No links have been added to this page yet.'}
              </div>
            ) : (
              visibleLinks.map((link) => {
                const isMailto = link.url.startsWith('mailto:');
                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target={isMailto ? undefined : '_blank'}
                    rel={isMailto ? undefined : 'noopener noreferrer'}
                    onClick={() => handleLinkClick(link)}
                    className={`w-full px-4 py-3.5 border flex items-center justify-between gap-3 transition-colors ${buttonRadiusClass} ${
                      activePage.buttonStyle === 'outline'
                        ? theme.linkOutlineClass
                        : theme.linkSolidClass
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {link.title}
                      </div>
                      {link.subtitle && (
                        <div className="text-xs opacity-75 truncate mt-0.5">
                          {link.subtitle}
                        </div>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-70 shrink-0" />
                  </a>
                );
              })
            )}
          </div>

          {/* Multi-Page Switcher when user has additional published pages */}
          {otherPublishedPages.length > 0 && (
            <div className={`pt-4 border-t space-y-2 ${theme.dividerClass}`}>
              <div className={`text-[11px] font-medium text-center ${theme.mutedClass}`}>
                {lang === 'id' ? 'Halaman Lainnya' : 'More Pages'}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {otherPublishedPages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChangePageSlug?.(p.pageSlug)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${theme.socialBtnClass}`}
                  >
                    {p.pageSlug === '' ? `${user}.${domain}` : `/${p.pageSlug}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Minimal Footer */}
      <div className={`pt-8 text-xs font-mono flex items-center gap-1.5 ${theme.mutedClass}`}>
        <Link2 className="w-3.5 h-3.5" />
        <span>
          {activePage.pageSlug
            ? `${user}.${domain}/${activePage.pageSlug}`
            : `${user}.${domain}`}
        </span>
      </div>
    </div>
  );
}
