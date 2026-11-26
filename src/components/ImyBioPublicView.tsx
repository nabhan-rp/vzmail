import { ArrowLeft, Edit3, ExternalLink, Globe, Link2, LogIn, QrCode, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  BIO_THEMES,
  SOCIAL_PLATFORMS,
  getDefaultQrDesignForTheme,
  type BioLinkItem,
  type BioPageRecord,
  type BioWorkspaceData,
} from '../utils/linksModel';
import { sanitizeHandle } from '../utils/mailIdentity';
import { applyClientSeo } from '../utils/applyClientSeo';
import { buildServiceSeoMeta } from '../utils/seoConfig';
import type { ActiveHostView } from './MailLinksTopBar';
import { QrCodeModal } from './QrCodeModal';
import { SocialIconGlyph } from './SocialIconGlyph';

interface ImyBioPublicViewProps {
  lang: Language;
  session: SsoSession;
  overrideUser?: string | null;
  pageSlug?: string;
  standaloneMode?: boolean;
  onChangePageSlug?: (nextSlug: string) => void;
  onSelectHost: (host: ActiveHostView) => void;
  onLoginWithAuth0?: () => void;
}

export function ImyBioPublicView({
  lang,
  session,
  overrideUser,
  pageSlug = '',
  standaloneMode = false,
  onChangePageSlug,
  onSelectHost,
  onLoginWithAuth0,
}: ImyBioPublicViewProps) {
  const user = useMemo(() => {
    if (overrideUser && overrideUser.trim()) {
      const cleaned = sanitizeHandle(overrideUser);
      if (cleaned && cleaned !== 'username') {
        return cleaned;
      }
    }
    if (session.isAuthenticated && session.username) {
      const cleaned = sanitizeHandle(session.username);
      if (cleaned && cleaned !== 'username') {
        return cleaned;
      }
    }
    return '';
  }, [overrideUser, session.isAuthenticated, session.username]);

  const domain = session.primaryDomain || 'imy.li';
  const isOwner = Boolean(session.isAuthenticated && user && session.username === user);

  const [workspace, setWorkspace] = useState<BioWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

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

  const effectiveAvatarUrl = activePage?.avatarUrl || workspace?.avatarUrl || '';

  useEffect(() => {
    setAvatarError(false);
  }, [effectiveAvatarUrl]);

  // Synchronize client <head> SEO & ProfilePage JSON-LD with owner's real Bio data & opt-in indexingMode
  useEffect(() => {
    if (loading) return;
    const hostname =
      typeof window !== 'undefined' ? window.location.hostname : `${user || 'links'}.${domain}`;
    applyClientSeo(
      buildServiceSeoMeta({
        routeKind: 'bio_public',
        hostname,
        lang,
        bioUsername: user || null,
        bioPageSlug: pageSlug,
        bioWorkspace: workspace,
        bioActivePage: activePage,
      })
    );
  }, [loading, user, domain, lang, pageSlug, workspace, activePage]);

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

  const containerHeightClass = standaloneMode
    ? 'min-h-screen'
    : 'min-h-[calc(100vh-112px)]';

  if (loading) {
    return (
      <div className={`${containerHeightClass} flex items-center justify-center px-4 py-12`}>
        <div className="w-full max-w-md space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-[#191E28] mx-auto animate-pulse" />
          <div className="h-6 w-40 rounded-lg bg-slate-200 dark:bg-[#191E28] mx-auto animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-[#191E28] animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-slate-200 dark:bg-[#191E28] animate-pulse" />
        </div>
      </div>
    );
  }

  // Default placeholder tab (username.imy.li while unauthenticated): invite user to sign in & create their own Bio page
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-112px)] flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl p-7 sm:p-8 text-center space-y-6">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#1B202B] text-xs font-mono text-blue-600 dark:text-blue-400">
              <span>https://username.{domain}</span>
              <span aria-hidden="true">·</span>
              <span>/$PAGE</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Buat Halaman Link-in-Bio Anda Sendiri'
                : 'Create Your Own Link-in-Bio Page'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? `Masuk dengan akun SSO Universal (accounts.vz.gay) untuk mengklaim subdomain pribadi namaanda.${domain} beserta sub-halaman tak terbatas (namaanda.${domain}/$PAGE), tema per halaman, foto profil AVIF, dan pasangan 1:1 dengan email namaanda@${domain}.`
                : `Sign in with your Universal SSO account (accounts.vz.gay) to claim your personal yourname.${domain} subdomain with unlimited sub-pages (yourname.${domain}/$PAGE), per-page color themes, AVIF profile photo, and 1:1 pairing with yourname@${domain}.`}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-left space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 font-mono">
              <span className="text-slate-500">
                {lang === 'id' ? 'Subdomain Utama:' : 'Primary Subdomain:'}
              </span>
              <span className="text-slate-900 dark:text-white font-semibold">
                https://username.{domain}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 font-mono">
              <span className="text-slate-500">
                {lang === 'id' ? 'Multi-Page Gratis:' : 'Free Multi-Page:'}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                username.{domain}/promo, /event, /links
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 font-mono">
              <span className="text-slate-500">
                {lang === 'id' ? 'Pasangan Email 1:1:' : '1:1 Paired Email:'}
              </span>
              <span className="text-blue-600 dark:text-blue-400">
                username@{domain}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (onLoginWithAuth0) {
                  onLoginWithAuth0();
                } else {
                  onSelectHost('links.vz.gay');
                }
              }}
              className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {lang === 'id'
                  ? 'Masuk & Buat Link Bio Sendiri'
                  : 'Sign In & Create Your Bio Link'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectHost('links.vz.gay')}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>
                {lang === 'id' ? 'Ke Studio VZ Links' : 'Go to VZ Links Studio'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Temporary deactivation state (owner deactivated Bio without deleting data)
  if (user && workspace && workspace.isDeactivated) {
    return (
      <div className={`${containerHeightClass} flex flex-col items-center justify-between px-4 py-14`}>
        <div className="my-auto w-full max-w-md bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl p-7 text-center space-y-5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center mx-auto">
            <Globe className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-mono text-slate-500">
              {pageSlug ? `${user}.${domain}/${pageSlug}` : `${user}.${domain}`}
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Halaman Bio Dinonaktifkan Sementara'
                : 'Bio Page Temporarily Deactivated'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {isOwner
                ? lang === 'id'
                  ? `Halaman ${user}.${domain} dan semua sub-halamannya saat ini disembunyikan dari publik. Seluruh tautan Anda masih aman tersimpan dan dapat diaktifkan kembali kapan saja di Studio Bio.`
                  : `Your ${user}.${domain} profile and sub-pages are currently hidden from public visitors. All your data remains safely stored and can be reactivated anytime in Bio Studio.`
                : lang === 'id'
                  ? `Pemilik ${user}.${domain} sedang menonaktifkan halaman ini untuk sementara waktu.`
                  : `The owner of ${user}.${domain} has temporarily deactivated this page.`}
            </p>
          </div>

          {isOwner && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => onSelectHost('links.vz.gay')}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  {lang === 'id'
                    ? 'Aktifkan Kembali di Studio Bio'
                    : 'Reactivate in Bio Studio'}
                </span>
              </button>
            </div>
          )}
        </div>

        <footer className="pt-8 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <a
            href="https://links.vz.gay"
            className="hover:underline font-medium"
          >
            {lang === 'id' ? 'Buat Bio Anda di links.vz.gay' : 'Create your Bio on links.vz.gay'}
          </a>
        </footer>
      </div>
    );
  }

  // Honest unconfigured / empty state for a specific user handle (zero mock or demo data)
  if (!workspace || !activePage) {
    const requestedPath = pageSlug
      ? `${user}.${domain}/${pageSlug}`
      : `${user}.${domain}`;

    return (
      <div className={`${containerHeightClass} flex flex-col items-center justify-between px-4 py-14`}>
        <div className="my-auto w-full max-w-md bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl p-7 text-center space-y-5">
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
            {isOwner ? (
              <button
                type="button"
                onClick={() => onSelectHost('links.vz.gay')}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Atur di Studio Bio' : 'Edit in Bio Studio'}</span>
              </button>
            ) : (
              <a
                href="https://links.vz.gay"
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Kelola / Buat Bio di links.vz.gay' : 'Manage / Create Bio on links.vz.gay'}</span>
              </a>
            )}
          </div>
        </div>

        <footer className="pt-8 text-xs text-slate-500 dark:text-slate-400">
          <a href="https://links.vz.gay" className="hover:underline font-medium">
            {lang === 'id' ? 'Ditenagai VZ Links (links.vz.gay)' : 'Powered by VZ Links (links.vz.gay)'}
          </a>
        </footer>
      </div>
    );
  }

  const theme = BIO_THEMES[activePage.themeId] || BIO_THEMES.midnight_slate;
  const buttonRadiusClass =
    activePage.buttonStyle === 'sharp' ? 'rounded-md' : 'rounded-xl';
  const visibleLinks = activePage.links.filter((l) => l.enabled);
  const publicPath = activePage.pageSlug
    ? `${user}.${domain}/${activePage.pageSlug}`
    : `${user}.${domain}`;
  const publicFullUrl = `https://${publicPath}`;
  const resolvedQrDesign =
    activePage.qrDesign ||
    getDefaultQrDesignForTheme(activePage.themeId, publicPath);

  return (
    <div
      className={`${containerHeightClass} px-4 pt-8 pb-8 sm:pt-12 sm:pb-10 flex flex-col items-center justify-between transition-colors ${theme.pageBgClass}`}
    >
      <div className="w-full max-w-[540px] space-y-5 my-auto">
        {/* Top Utility Row: Back to Root (if sub-page) + Public QR Code Button + Owner Edit (preview mode) */}
        <div className="flex items-center justify-between gap-2 text-xs">
          {activePage.pageSlug !== '' ? (
            <button
              type="button"
              onClick={() => onChangePageSlug?.('')}
              className={`min-h-[40px] inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer ${theme.mutedClass}`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{user}.{domain}</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl border inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${theme.socialBtnClass}`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>

            {isOwner && !standaloneMode && (
              <button
                type="button"
                onClick={() => onSelectHost('links.vz.gay')}
                className={`min-h-[40px] inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer ${theme.mutedClass}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Edit Halaman' : 'Edit Page'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Public Bio Card */}
        <article
          className={`rounded-2xl border p-6 sm:p-8 space-y-6 ${theme.cardClass}`}
        >
          {/* Profile Header */}
          <header className="flex flex-col items-center text-center space-y-3">
            {effectiveAvatarUrl && !avatarError ? (
              <img
                src={effectiveAvatarUrl}
                alt={
                  activePage.pageSlug === ''
                    ? workspace.displayName || user
                    : activePage.title || activePage.pageSlug
                }
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
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

      {/* Minimal Thin Footer to links.vz.gay */}
      <footer
        className={`pt-8 text-xs flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center ${theme.mutedClass}`}
      >
        <span className="font-mono inline-flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          <span>{publicPath}</span>
        </span>
        <span aria-hidden="true">·</span>
        <a
          href="https://links.vz.gay"
          className="hover:underline font-medium"
        >
          {lang === 'id'
            ? 'Buat Bio Anda di links.vz.gay'
            : 'Create your Bio on links.vz.gay'}
        </a>
      </footer>

      {/* Public Bio Custom QR Code Modal */}
      <QrCodeModal
        isOpen={qrModalOpen}
        lang={lang}
        title={
          activePage.pageSlug === ''
            ? workspace.displayName || user
            : activePage.title || `/${activePage.pageSlug}`
        }
        subtitle={publicPath}
        url={publicFullUrl}
        filenameBase={`bio-qr-${publicPath}`}
        design={resolvedQrDesign}
        centerImageUrl={!avatarError ? effectiveAvatarUrl : ''}
        monogramText={workspace.displayName || user}
        onClose={() => setQrModalOpen(false)}
      />
    </div>
  );
}
