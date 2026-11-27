import { Globe, Link2, Mail, Scissors } from 'lucide-react';
import type { Language } from '../data/i18n';
import type { ActiveHostView } from './MailLinksTopBar';

interface MobileBottomNavProps {
  lang: Language;
  activeHost: ActiveHostView;
  onSelectHost: (host: ActiveHostView) => void;
}

export function MobileBottomNav({
  lang,
  activeHost,
  onSelectHost,
}: MobileBottomNavProps) {
  const tabs: {
    id: ActiveHostView;
    label: string;
    icon: typeof Mail;
  }[] = [
    {
      id: 'mail.vz.gay',
      label: 'Mail',
      icon: Mail,
    },
    {
      id: 'links.vz.gay',
      label: 'Links',
      icon: Link2,
    },
    {
      id: 'bio_public',
      label: 'Bio',
      icon: Globe,
    },
    {
      id: 'shortlinks',
      label: lang === 'id' ? 'Shortlink' : 'Short',
      icon: Scissors,
    },
  ];

  return (
    <nav
      aria-label={lang === 'id' ? 'Navigasi Cepat Mobile' : 'Mobile Quick Navigation'}
      className="md:hidden fixed bottom-0 inset-x-0 w-full max-w-[100vw] overflow-hidden z-30 bg-white/95 dark:bg-[#0B0D11]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#232732] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[0_-4px_16px_rgba(15,23,42,0.06)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.35)]"
    >
      <div className="grid grid-cols-4 h-14 w-full max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeHost === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectHost(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-w-0 min-h-[44px] px-1 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-blue-600 dark:bg-blue-400"
                />
              )}
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] leading-tight whitespace-nowrap truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
