import {
  ArrowLeft,
  ExternalLink,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  getOrSeedBioProfile,
  saveBioProfile,
  type ImyBioProfile,
} from '../utils/localMailDb';
import { isValidEmailAddress, sanitizeExternalUrl } from '../utils/mailSecurity';
import type { ActiveHostView } from './MailLinksTopBar';

interface ImyBioPublicViewProps {
  lang: Language;
  session: SsoSession;
  overrideUser?: string | null;
  onSelectHost: (host: ActiveHostView) => void;
}

export function ImyBioPublicView({
  lang,
  session,
  overrideUser,
  onSelectHost,
}: ImyBioPublicViewProps) {
  const user =
    overrideUser || (session.isAuthenticated ? session.username : 'fadhil');
  const domain = session.primaryDomain || 'imy.li';
  const [profile, setProfile] = useState<ImyBioProfile | null>(null);
  const [clickedNotice, setClickedNotice] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrSeedBioProfile(user)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch(() => {
        // Handled by loading fallback
      });
    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [user]);

  const handleLinkClick = async (linkId: string, rawUrl: string) => {
    if (!profile) return;
    const safeUrl = sanitizeExternalUrl(rawUrl, { allowMailto: true });
    if (!safeUrl) {
      setClickedNotice(
        lang === 'id'
          ? 'Tautan diblokir karena skema URL tidak aman.'
          : 'Blocked unsafe link URL scheme.'
      );
      return;
    }

    const updated: ImyBioProfile = {
      ...profile,
      links: profile.links.map((l) =>
        l.id === linkId ? { ...l, clicks: l.clicks + 1 } : l
      ),
    };
    await saveBioProfile(updated);
    setProfile(updated);
    setClickedNotice(safeUrl);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setClickedNotice(null), 3500);

    if (safeUrl.startsWith('mailto:')) {
      window.location.href = safeUrl;
    } else {
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <div className="h-64 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] animate-pulse" />
      </div>
    );
  }

  const safePublicEmail = isValidEmailAddress(profile.publicEmailAlias)
    ? profile.publicEmailAlias.trim().toLowerCase()
    : `${user}@${domain}`;

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Subdomain Host Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#232732] text-xs">
        <div className="font-mono text-slate-600 dark:text-slate-400">
          <span>https://{user}.{domain}</span>
          <span aria-hidden="true"> · </span>
          <span>Static Curated HTML</span>
          <span aria-hidden="true"> · </span>
          <span>Zero Session Cookies (PSL-Safe)</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectHost('links.vz.gay')}
            className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>
              {lang === 'id' ? 'Edit di links.vz.gay' : 'Edit on links.vz.gay'}
            </span>
          </button>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
            /
          </span>
          <button
            type="button"
            onClick={() => onSelectHost('mail.vz.gay')}
            className="font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
          >
            mail.vz.gay
          </button>
        </div>
      </div>

      {/* Centered Clean Curated Static Bio Card */}
      <article className="max-w-xl mx-auto bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-14 h-14 rounded-xl bg-blue-600 text-white font-display font-bold text-xl flex items-center justify-center">
              {user.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-right font-mono text-xs text-slate-500">
              <div>{user}.{domain}</div>
              <div>{user}@{domain}</div>
            </div>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display">
              {profile.displayName}
            </h1>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              {profile.headline}
            </p>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {profile.bio}
          </p>
        </div>

        {/* Paired Direct Email CTA */}
        {profile.showPublicEmailButton && (
          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  {lang === 'id'
                    ? 'Kontak Langsung via VZ Mail'
                    : 'Direct Contact via VZ Mail'}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-500">
                {safePublicEmail}
              </div>
            </div>

            <a
              href={`mailto:${safePublicEmail}`}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg text-center whitespace-nowrap shrink-0"
            >
              {lang === 'id' ? 'Kirim Email' : 'Send Email'}
            </a>
          </div>
        )}

        {/* Curated Links Stack */}
        <div className="space-y-2.5">
          {profile.links.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLinkClick(item.id, item.url)}
              className="w-full text-left p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] hover:bg-blue-50/70 dark:hover:bg-[#171E2E] border border-slate-200 dark:border-[#232732] hover:border-blue-300 dark:hover:border-blue-800 transition-colors flex items-center justify-between gap-4 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {item.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {item.subtitle}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums truncate">
                  {item.url} · {item.clicks} clicks
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>

        {clickedNotice && (
          <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg px-3 py-2 break-all">
            Verified safe redirect -&gt; {clickedNotice}
          </div>
        )}

        <footer className="pt-4 border-t border-slate-200 dark:border-[#232732] flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Static PSL-Safe Page</span>
          </span>
          <span>Powered by links.vz.gay &amp; mail.vz.gay</span>
        </footer>
      </article>
    </div>
  );
}
