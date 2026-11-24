import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';

export type ActiveHostView =
  | 'mail.vz.gay'
  | 'links.vz.gay'
  | 'bio_public'
  | 'shortlinks'
  | 'worker_console';

interface MailLinksTopBarProps {
  lang: Language;
  activeHost: ActiveHostView;
  onSelectHost: (host: ActiveHostView) => void;
  session: SsoSession;
  onOpenSso: () => void;
  onOpenCompose: () => void;
}

export function MailLinksTopBar({
  lang,
  activeHost,
  onSelectHost,
  session,
  onOpenSso,
  onOpenCompose,
}: MailLinksTopBarProps) {
  const handle = session.isAuthenticated ? session.username : 'username';

  const brandWordmark =
    activeHost === 'links.vz.gay' || activeHost === 'shortlinks'
      ? 'VZ Links'
      : activeHost === 'bio_public'
        ? `${handle}.imy.li`
        : 'VZ Mail';

  const navItems: { id: ActiveHostView; label: string }[] = [
    {
      id: 'mail.vz.gay',
      label: 'mail.vz.gay',
    },
    {
      id: 'links.vz.gay',
      label: 'links.vz.gay',
    },
    {
      id: 'bio_public',
      label: `${handle}.imy.li`,
    },
    {
      id: 'shortlinks',
      label: 'imy.li/s/',
    },
    {
      id: 'worker_console',
      label: lang === 'id' ? 'Worker & Domain' : 'Worker & Domains',
    },
  ];

  const handlePrimaryAction = () => {
    if (!session.isAuthenticated) {
      onOpenSso();
      return;
    }
    if (activeHost === 'mail.vz.gay' && session.mailActivated) {
      onOpenCompose();
      return;
    }
    onOpenSso();
  };

  const primaryLabel = !session.isAuthenticated
    ? lang === 'id'
      ? 'Masuk SSO (accounts.vz.gay)'
      : 'SSO Sign In (accounts.vz.gay)'
    : activeHost === 'mail.vz.gay' && session.mailActivated
      ? lang === 'id'
        ? '+ Tulis Email'
        : '+ Compose Mail'
      : `SSO: ${session.username}@${session.primaryDomain}`;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0B0D11]/95 backdrop-blur border-b border-slate-200 dark:border-[#232732]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectHost(
              activeHost === 'links.vz.gay' ? 'links.vz.gay' : 'mail.vz.gay'
            );
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
        >
          {brandWordmark}
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Service Host Navigation"
          className="flex items-center gap-5 sm:gap-6 overflow-x-auto text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          {navItems.map((item) => {
            const isActive = activeHost === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectHost(item.id);
                }}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 font-semibold'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:underline underline-offset-4'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handlePrimaryAction}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
