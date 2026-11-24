import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Copy, ShieldAlert, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { VzService } from '../data/services';
import { ServiceIcon } from './ServiceIcon';

interface ServiceModalProps {
  service: VzService | null;
  lang: Language;
  onClose: () => void;
}

export function ServiceModal({ service, lang, onClose }: ServiceModalProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const t = UI_COPY[lang];

  useEffect(() => {
    if (!service) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [service, onClose]);

  if (!service) return null;

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedText(value);
      window.setTimeout(() => setCopiedText(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const launchHref = service.launchUrl || `https://${service.primaryDomain}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl p-5 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232732]">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-[#1D222E] text-slate-800 dark:text-slate-100 flex items-center justify-center shrink-0">
              <ServiceIcon name={service.iconName} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="service-modal-title"
                className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {service.name[lang]}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={`font-medium ${
                    service.status === 'coming_soon'
                      ? 'text-violet-700 dark:text-violet-400'
                      : service.status === 'live'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {t.directory.statusLabels[service.status]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{service.shortType[lang]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">
                  {service.primaryDomain}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.serviceModal.close}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-5 space-y-5">
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
            {service.description[lang]}
          </p>

          {/* Compliance / Regional Restriction Notice (e.g., 21zone.vz.gay) */}
          {service.complianceNotice && (
            <div className="p-4 sm:p-5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <h3 className="font-display text-sm font-semibold">
                  {service.complianceNotice.title[lang]}
                </h3>
              </div>
              <ul className="space-y-2 text-xs sm:text-sm text-amber-950/90 dark:text-amber-200/90 leading-relaxed list-disc pl-4">
                {service.complianceNotice.items.map((item, idx) => (
                  <li key={idx}>{item[lang]}</li>
                ))}
              </ul>
            </div>
          )}

          <div
            className={`p-4 rounded-xl border text-xs sm:text-sm leading-relaxed ${
              service.status === 'coming_soon'
                ? 'bg-violet-50/70 dark:bg-violet-950/25 border-violet-200 dark:border-violet-900/60 text-violet-950 dark:text-violet-200'
                : 'bg-slate-50 dark:bg-[#0E1117] border-slate-200/80 dark:border-[#232732] text-slate-600 dark:text-slate-300'
            }`}
          >
            {service.status === 'coming_soon'
              ? t.serviceModal.comingSoonNotice
              : t.serviceModal.devNotice}
          </div>

          {/* Primary & Alias Domains */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232732]">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t.serviceModal.primaryDomainLabel}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-slate-900 dark:text-white truncate">
                  {service.primaryDomain}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(service.primaryDomain)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                >
                  {copiedText === service.primaryDomain ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{t.serviceModal.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t.serviceModal.copyDomain}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {service.altDomains && service.altDomains.length > 0 && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232732]">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.serviceModal.altDomainsLabel}
                </div>
                <div className="mt-1.5 font-mono text-sm text-slate-900 dark:text-white">
                  {service.altDomains.join(', ')}
                </div>
              </div>
            )}

            {service.sponsor && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#232732]">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.serviceModal.sponsorLabel}
                </div>
                <a
                  href={`https://${service.sponsor}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <span>{service.sponsor}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Architecture & Privacy Notes */}
          {service.architectureNotes && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t.serviceModal.architectureLabel}
              </h3>
              <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {service.architectureNotes[lang]}
              </p>
            </div>
          )}

          {/* Structured Highlights (NurDB Studio, VZ Desk Modes, etc.) */}
          {service.highlights && service.highlights.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t.serviceModal.highlightsLabel}
              </h3>
              <div className="mt-2 space-y-2.5">
                {service.highlights.map((hl, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732]"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {hl.label[lang]}
                    </div>
                    <div className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {hl.value[lang]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Client Domain Patterns */}
          {service.clientDomainPatterns && service.clientDomainPatterns.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t.serviceModal.clientDomainsLabel}
              </h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {service.clientDomainPatterns.map((pattern) => (
                  <div
                    key={pattern}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732]"
                  >
                    <span className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                      {pattern}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(pattern)}
                      className="text-xs text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer shrink-0"
                      aria-label={`${t.serviceModal.copyDomain} ${pattern}`}
                    >
                      {copiedText === pattern ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 301 Redirect Rules */}
          {service.redirectRules && service.redirectRules.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t.serviceModal.redirectsLabel}
              </h3>
              <div className="mt-2 space-y-2">
                {service.redirectRules.map((rule) => (
                  <div
                    key={rule.from}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] font-mono text-xs"
                  >
                    <span className="text-slate-500 dark:text-slate-400">{rule.code}</span>
                    <span className="text-slate-900 dark:text-white">{rule.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-blue-600 dark:text-blue-400">{rule.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Sub-apps / Demos */}
          {service.liveChildren && service.liveChildren.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t.serviceModal.liveChildrenLabel}
              </h3>
              <div className="mt-2 divide-y divide-slate-200 dark:divide-[#232732] rounded-xl border border-slate-200 dark:border-[#232732] bg-slate-50/50 dark:bg-[#0E1117]">
                {service.liveChildren.map((child) => (
                  <div
                    key={child.domain}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {child.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {child.description[lang]}
                      </div>
                      {child.altDomain && (
                        <a
                          href={`https://${child.altDomain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block font-mono text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2"
                        >
                          {child.altDomain}
                        </a>
                      )}
                    </div>

                    <a
                      href={`https://${child.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                    >
                      <span>{child.domain}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors cursor-pointer"
          >
            {t.serviceModal.close}
          </button>
          <a
            href={launchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.serviceModal.launchLive}</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
