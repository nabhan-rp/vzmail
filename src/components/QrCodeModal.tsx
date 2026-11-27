import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Mail,
  QrCode,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import { copyTextSafely } from '../utils/clipboard';
import type { BioQrDesignConfig } from '../utils/linksModel';
import {
  buildMailtoPayload,
  buildVCardPayload,
  getQrContrastRatio,
} from '../utils/qrPayloads';
import {
  StylizedQrCode,
  downloadQrPng,
  downloadQrSvg,
} from './StylizedQrCode';

export interface LinkQrModalProps {
  isOpen: boolean;
  lang: Language;
  title: string;
  subtitle?: string;
  url: string;
  filenameBase: string;
  design?: Partial<BioQrDesignConfig>;
  centerImageUrl?: string;
  monogramText?: string;
  onClose: () => void;
}

export function QrCodeModal({
  isOpen,
  lang,
  title,
  subtitle,
  url,
  filenameBase,
  design,
  centerImageUrl,
  monogramText,
  onClose,
}: LinkQrModalProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isExternalHttp = /^https?:\/\//i.test(url);

  const handleCopy = () => {
    void copyTextSafely(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPng = async () => {
    setDownloading('png');
    try {
      await downloadQrPng(svgRef.current, filenameBase, 1024);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadSvg = async () => {
    setDownloading('svg');
    try {
      await downloadQrSvg(svgRef.current, filenameBase);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-display">
              <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="truncate">{title}</span>
            </div>
            {subtitle && (
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'id' ? 'Tutup' : 'Close'}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-center p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732]">
            <StylizedQrCode
              ref={svgRef}
              value={url}
              design={design}
              centerImageUrl={centerImageUrl}
              monogramText={monogramText}
              size={240}
              ariaLabel={`QR Code ${title}`}
            />
          </div>

          <div className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">
              {url}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[32px] px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#181D27] border border-slate-200 dark:border-[#2A303E] hover:bg-slate-100 dark:hover:bg-[#232A38] rounded-md inline-flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span>{lang === 'id' ? 'Disalin' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{lang === 'id' ? 'Salin' : 'Copy'}</span>
                  </>
                )}
              </button>
              {isExternalHttp && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={lang === 'id' ? 'Buka Tautan' : 'Open Link'}
                  className="min-h-[32px] w-8 inline-flex items-center justify-center text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-[#181D27] border border-slate-200 dark:border-[#2A303E] rounded-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={downloading !== null}
              onClick={() => void handleDownloadPng()}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {downloading === 'png'
                  ? lang === 'id'
                    ? 'Membuat PNG...'
                    : 'Generating...'
                  : lang === 'id'
                    ? 'Unduh PNG (HD)'
                    : 'Download PNG (HD)'}
              </span>
            </button>
            <button
              type="button"
              disabled={downloading !== null}
              onClick={() => void handleDownloadSvg()}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] border border-slate-200 dark:border-[#2A303E] disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {downloading === 'svg'
                  ? lang === 'id'
                    ? 'Membuat SVG...'
                    : 'Generating...'
                  : lang === 'id'
                    ? 'Unduh SVG Vektor'
                    : 'Download Vector SVG'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface MailQrModalProps {
  isOpen: boolean;
  lang: Language;
  primaryEmail: string;
  username: string;
  displayName: string;
  domain: string;
  discoveredPlusTags: string[];
  initialEmail?: string;
  onClose: () => void;
}

export function MailQrModal({
  isOpen,
  lang,
  primaryEmail,
  username,
  displayName,
  domain,
  discoveredPlusTags,
  initialEmail,
  onClose,
}: MailQrModalProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [format, setFormat] = useState<'mailto' | 'vcard'>('mailto');
  const [selectedEmail, setSelectedEmail] = useState(initialEmail || primaryEmail);
  const [customAliasTag, setCustomAliasTag] = useState('');
  const [mailtoSubject, setMailtoSubject] = useState('');
  const [mailtoBody, setMailtoBody] = useState('');
  const [vcardName, setVcardName] = useState(displayName || username);
  const [includeBioUrl, setIncludeBioUrl] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedEmail(initialEmail || primaryEmail);
      setVcardName(displayName || username);
      setCustomAliasTag('');
    }
  }, [isOpen, initialEmail, primaryEmail, displayName, username]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const aliasOptions = useMemo(() => {
    const list = new Set<string>();
    list.add(primaryEmail);
    if (initialEmail && initialEmail.includes('@')) {
      list.add(initialEmail.toLowerCase());
    }
    for (const tag of discoveredPlusTags) {
      const cleaned = tag.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
      if (cleaned) {
        list.add(`${username}+${cleaned}@${domain}`);
      }
    }
    if (username.length >= 4) {
      list.add(`${username.slice(0, 2)}.${username.slice(2)}@${domain}`);
    }
    return Array.from(list);
  }, [primaryEmail, initialEmail, discoveredPlusTags, username, domain]);

  const effectiveEmail = useMemo(() => {
    const customTrim = customAliasTag.trim().toLowerCase();
    if (!customTrim) return selectedEmail || primaryEmail;
    if (customTrim.includes('@')) return customTrim;
    const cleanTag = customTrim.replace(/^\+/, '').replace(/[^a-z0-9._-]/g, '');
    if (!cleanTag) return selectedEmail || primaryEmail;
    return `${username}+${cleanTag}@${domain}`;
  }, [customAliasTag, selectedEmail, primaryEmail, username, domain]);

  const qrPayload = useMemo(() => {
    if (format === 'vcard') {
      return buildVCardPayload({
        fullName: vcardName.trim() || username,
        email: effectiveEmail,
        bioUrl: includeBioUrl ? `https://${username}.${domain}` : undefined,
        note: `VZ Mail (${effectiveEmail})`,
      });
    }
    return buildMailtoPayload({
      email: effectiveEmail,
      subject: mailtoSubject,
      body: mailtoBody,
    });
  }, [
    format,
    vcardName,
    username,
    effectiveEmail,
    includeBioUrl,
    domain,
    mailtoSubject,
    mailtoBody,
  ]);

  if (!isOpen) return null;

  const qrDesign: BioQrDesignConfig = {
    fgColor: '#0F172A',
    bgColor: '#FFFFFF',
    dotStyle: 'rounded',
    cornerStyle: 'rounded',
    frameStyle: 'bottom_bar',
    frameText:
      format === 'vcard'
        ? `CONTACT · ${effectiveEmail.slice(0, 30)}`
        : effectiveEmail.slice(0, 40),
    frameColor: '#1D4ED8',
    frameTextColor: '#FFFFFF',
    centerLogoMode: 'monogram',
  };

  const filenameBase = `${format}-${effectiveEmail.replace(/[@+]/g, '-')}`;

  const handleCopy = () => {
    void copyTextSafely(format === 'mailto' ? effectiveEmail : qrPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="VZ Mail QR Code"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 sticky top-0 bg-white dark:bg-[#13161C] z-10">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-display">
              <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'id'
                  ? 'QR Code Email & Alias VZ Mail'
                  : 'VZ Mail Email & Alias QR Code'}
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {effectiveEmail}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'id' ? 'Tutup' : 'Close'}
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Controls */}
          <div className="md:col-span-7 space-y-4">
            {/* Format Switcher: mailto: vs vCard */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'id' ? 'Format Pindai QR' : 'QR Scan Format'}
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg">
                <button
                  type="button"
                  onClick={() => setFormat('mailto')}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    format === 'mailto'
                      ? 'bg-white dark:bg-[#191E28] text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-[#2A303E]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>mailto: {lang === 'id' ? 'Kirim Email' : 'Compose'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('vcard')}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    format === 'vcard'
                      ? 'bg-white dark:bg-[#191E28] text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-[#2A303E]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <UserRoundPlus className="w-3.5 h-3.5" />
                  <span>vCard {lang === 'id' ? 'Kontak' : 'Contact'}</span>
                </button>
              </div>
            </div>

            {/* Address / Existing Alias Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="mail-qr-alias-select"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                {lang === 'id'
                  ? 'Pilih Alamat Utama atau Alias Tersimpan'
                  : 'Select Primary Email or Existing Alias'}
              </label>
              <select
                id="mail-qr-alias-select"
                value={selectedEmail}
                onChange={(e) => {
                  setSelectedEmail(e.target.value);
                  setCustomAliasTag('');
                }}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {aliasOptions.map((addr) => (
                  <option key={addr} value={addr}>
                    {addr}
                    {addr === primaryEmail
                      ? lang === 'id'
                        ? ' (Utama)'
                        : ' (Primary)'
                      : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Custom +Tag / Dot Alias Input */}
            <div className="space-y-1">
              <label
                htmlFor="mail-qr-custom-tag"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                {lang === 'id'
                  ? 'Atau buat alias +tag instan (opsional):'
                  : 'Or enter an instant +tag alias (optional):'}
              </label>
              <div className="flex items-center rounded-lg border border-slate-300 dark:border-[#2A303D] bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
                <span className="px-2.5 py-2 text-xs font-mono text-slate-500 border-r border-slate-200 dark:border-[#232732] shrink-0">
                  {username}+
                </span>
                <input
                  id="mail-qr-custom-tag"
                  type="text"
                  value={customAliasTag}
                  onChange={(e) => setCustomAliasTag(e.target.value)}
                  placeholder="kartunama / event / bisnis"
                  className="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
                />
                <span className="px-2.5 py-2 text-xs font-mono text-slate-500 border-l border-slate-200 dark:border-[#232732] shrink-0">
                  @{domain}
                </span>
              </div>
            </div>

            {/* Format-specific fields */}
            {format === 'mailto' ? (
              <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-[#232732]">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {lang === 'id'
                      ? 'Subjek Email Awal (Opsional)'
                      : 'Pre-filled Subject (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={mailtoSubject}
                    onChange={(e) => setMailtoSubject(e.target.value)}
                    placeholder={
                      lang === 'id'
                        ? 'Contoh: Halo, saya dari acara...'
                        : 'Example: Hello from the conference...'
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {lang === 'id'
                      ? 'Isi Pesan Awal (Opsional)'
                      : 'Pre-filled Message Body (Optional)'}
                  </label>
                  <textarea
                    rows={2}
                    value={mailtoBody}
                    onChange={(e) => setMailtoBody(e.target.value)}
                    placeholder={
                      lang === 'id'
                        ? 'Pesan singkat otomatis saat QR dipindai...'
                        : 'Short pre-filled message when scanned...'
                    }
                    className="w-full px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-[#232732]">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {lang === 'id' ? 'Nama Kontak di vCard' : 'Contact Name in vCard'}
                  </label>
                  <input
                    type="text"
                    value={vcardName}
                    onChange={(e) => setVcardName(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeBioUrl}
                    onChange={(e) => setIncludeBioUrl(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>
                    {lang === 'id'
                      ? `Sertakan tautan Bio https://${username}.${domain}`
                      : `Include Bio link https://${username}.${domain}`}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Right Live Preview & Actions */}
          <div className="md:col-span-5 space-y-3">
            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex items-center justify-center">
              <StylizedQrCode
                ref={svgRef}
                value={qrPayload}
                design={qrDesign}
                monogramText={vcardName || username}
                size={210}
                ariaLabel={`QR ${format} for ${effectiveEmail}`}
              />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={downloading !== null}
                onClick={async () => {
                  setDownloading('png');
                  try {
                    await downloadQrPng(svgRef.current, filenameBase, 1024);
                  } finally {
                    setDownloading(null);
                  }
                }}
                className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {downloading === 'png'
                    ? lang === 'id'
                      ? 'Membuat PNG...'
                      : 'Generating...'
                    : lang === 'id'
                      ? 'Unduh PNG (HD)'
                      : 'Download PNG (HD)'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={downloading !== null}
                  onClick={async () => {
                    setDownloading('svg');
                    try {
                      await downloadQrSvg(svgRef.current, filenameBase);
                    } finally {
                      setDownloading(null);
                    }
                  }}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>SVG</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{lang === 'id' ? 'Disalin' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{lang === 'id' ? 'Salin' : 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QrContrastNotice({
  fgColor,
  bgColor,
  lang,
}: {
  fgColor: string;
  bgColor: string;
  lang: Language;
}) {
  const ratio = getQrContrastRatio(fgColor, bgColor);
  if (ratio >= 3.5) return null;
  return (
    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <span>
        {lang === 'id'
          ? `Kontras warna QR rendah (${ratio.toFixed(1)}:1). Gunakan kombinasi warna gelap dan terang (minimal 3.5:1) agar mudah dipindai kamera.`
          : `Low QR contrast (${ratio.toFixed(1)}:1). Use stronger dark-on-light contrast (at least 3.5:1) for reliable camera scanning.`}
      </span>
    </div>
  );
}
