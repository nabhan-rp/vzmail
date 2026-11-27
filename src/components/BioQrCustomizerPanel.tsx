import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  QrCode,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import { copyTextSafely } from '../utils/clipboard';
import {
  BIO_QR_PRESETS,
  getDefaultQrDesignForTheme,
  sanitizeHexColor,
  type BioQrDesignConfig,
  type BioThemeId,
  type QrCenterLogoMode,
  type QrCornerStyle,
  type QrDotStyle,
  type QrFrameStyle,
} from '../utils/linksModel';
import { QrContrastNotice } from './QrCodeModal';
import {
  StylizedQrCode,
  downloadQrPng,
  downloadQrSvg,
} from './StylizedQrCode';

interface BioQrCustomizerPanelProps {
  lang: Language;
  publicUrl: string;
  pageLabel: string;
  themeId: BioThemeId;
  design: BioQrDesignConfig;
  effectiveAvatarUrl: string;
  monogramText: string;
  hasUnsaved: boolean;
  saving: boolean;
  disabledSave: boolean;
  onChangeDesign: (next: BioQrDesignConfig) => void;
  onSaveToServer: () => void;
}

function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D]">
        <input
          type="color"
          value={sanitizeHexColor(value, '#0F172A')}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          maxLength={7}
          onChange={(e) => {
            const raw = e.target.value.toUpperCase();
            if (/^#[0-9A-F]{0,6}$/.test(raw)) {
              onChange(raw);
            }
          }}
          onBlur={() => onChange(sanitizeHexColor(value, '#0F172A'))}
          className="w-full min-w-0 text-xs font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
        />
      </div>
    </div>
  );
}

export function BioQrCustomizerPanel({
  lang,
  publicUrl,
  pageLabel,
  themeId,
  design,
  effectiveAvatarUrl,
  monogramText,
  hasUnsaved,
  saving,
  disabledSave,
  onChangeDesign,
  onSaveToServer,
}: BioQrCustomizerPanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = (partial: Partial<BioQrDesignConfig>) => {
    onChangeDesign({
      ...design,
      ...partial,
    });
  };

  const handleResetToTheme = () => {
    onChangeDesign(getDefaultQrDesignForTheme(themeId, pageLabel));
  };

  const handleCopyUrl = () => {
    void copyTextSafely(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const filenameBase = `qr-${pageLabel.replace(/[^a-z0-9.-]+/gi, '-')}`;

  const dotOptions: { id: QrDotStyle; label: string }[] = [
    { id: 'square', label: lang === 'id' ? 'Kotak' : 'Square' },
    { id: 'rounded', label: lang === 'id' ? 'Membulat' : 'Rounded' },
    { id: 'dots', label: lang === 'id' ? 'Titik' : 'Dots' },
    { id: 'classy', label: lang === 'id' ? 'Klasik' : 'Classy' },
  ];

  const cornerOptions: { id: QrCornerStyle; label: string }[] = [
    { id: 'square', label: lang === 'id' ? 'Tajam' : 'Square' },
    { id: 'rounded', label: lang === 'id' ? 'Membulat' : 'Rounded' },
    { id: 'dot', label: lang === 'id' ? 'Lingkaran' : 'Circle' },
  ];

  const frameOptions: { id: QrFrameStyle; label: string }[] = [
    { id: 'none', label: lang === 'id' ? 'Tanpa Bingkai' : 'No Frame' },
    { id: 'bottom_bar', label: lang === 'id' ? 'Pita Bawah' : 'Bottom Bar' },
    { id: 'card', label: lang === 'id' ? 'Bingkai Kartu' : 'Card Frame' },
  ];

  const centerOptions: { id: QrCenterLogoMode; label: string }[] = [
    {
      id: 'bio_avatar',
      label: effectiveAvatarUrl
        ? lang === 'id'
          ? 'Foto Profil Bio'
          : 'Bio Photo'
        : lang === 'id'
          ? 'Foto Bio / Inisial'
          : 'Bio Photo / Initials',
    },
    { id: 'monogram', label: lang === 'id' ? 'Monogram Inisial' : 'Monogram' },
    { id: 'none', label: lang === 'id' ? 'Tanpa Logo' : 'No Logo' },
  ];

  return (
    <div className="space-y-6">
      {/* Intro & Live QR Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
        <div className="sm:col-span-5 flex flex-col items-center gap-2">
          <div className="p-3 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732]">
            <StylizedQrCode
              ref={svgRef}
              value={publicUrl}
              design={design}
              centerImageUrl={effectiveAvatarUrl}
              monogramText={monogramText}
              size={196}
              ariaLabel={`QR Code ${pageLabel}`}
            />
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 text-center">
            {design.centerLogoMode !== 'none'
              ? 'ECC High (H · 30%)'
              : 'ECC Medium (M · 15%)'}
          </div>
        </div>

        <div className="sm:col-span-7 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white font-display">
              <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'id'
                  ? `Desain QR untuk ${pageLabel}`
                  : `QR Design for ${pageLabel}`}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? 'Kustomisasi warna, gaya dot/sudut, teks bingkai, serta foto profil Bio di tengah QR. Setelah disimpan, tombol QR di halaman publik Bio Anda akan langsung menampilkan desain ini.'
                : 'Customize colors, dot/corner styles, frame text, and center Bio photo. Once saved, the public QR button on your Bio page will display this exact design.'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] text-xs font-mono text-slate-700 dark:text-slate-200">
            <span className="truncate">{publicUrl}</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 shrink-0 cursor-pointer"
              title="Copy URL"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {downloading === 'png'
                  ? lang === 'id'
                    ? 'Memproses...'
                    : 'Exporting...'
                  : 'PNG (HD)'}
              </span>
            </button>

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
              className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#151922] hover:bg-slate-100 dark:hover:bg-[#1E2430] border border-slate-200 dark:border-[#2A303E] disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SVG</span>
            </button>

            <button
              type="button"
              onClick={handleResetToTheme}
              className="min-h-[38px] px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#1B202B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Reset' : 'Reset'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contrast Scannability Warning */}
      <QrContrastNotice
        fgColor={design.fgColor}
        bgColor={design.bgColor}
        lang={lang}
      />

      {/* Preset Palettes */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {lang === 'id' ? 'Preset Desain Cepat' : 'Quick Design Presets'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BIO_QR_PRESETS.map((preset) => {
            const isMatch =
              design.fgColor.toUpperCase() === preset.design.fgColor.toUpperCase() &&
              design.bgColor.toUpperCase() === preset.design.bgColor.toUpperCase() &&
              design.dotStyle === preset.design.dotStyle;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  patch({
                    ...preset.design,
                  })
                }
                className={`p-2.5 rounded-lg border text-left transition-colors flex items-center gap-2 cursor-pointer ${
                  isMatch
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/25'
                    : 'border-slate-200 dark:border-[#232732] hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <span
                  className="w-6 h-6 rounded-md border border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0"
                  style={{ backgroundColor: preset.design.bgColor }}
                >
                  <span
                    className="w-3 h-3 rounded-xs"
                    style={{ backgroundColor: preset.design.fgColor }}
                  />
                </span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Colors */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {lang === 'id' ? 'Warna Kustom' : 'Custom Colors'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ColorPickerField
            label={lang === 'id' ? 'Warna Dot QR' : 'QR Dots Color'}
            value={design.fgColor}
            onChange={(fgColor) => patch({ fgColor })}
          />
          <ColorPickerField
            label={lang === 'id' ? 'Latar QR' : 'QR Background'}
            value={design.bgColor}
            onChange={(bgColor) => patch({ bgColor })}
          />
          <ColorPickerField
            label={lang === 'id' ? 'Warna Bingkai' : 'Frame Color'}
            value={design.frameColor}
            onChange={(frameColor) => patch({ frameColor })}
          />
          <ColorPickerField
            label={lang === 'id' ? 'Teks Bingkai' : 'Frame Text'}
            value={design.frameTextColor}
            onChange={(frameTextColor) => patch({ frameTextColor })}
          />
        </div>
      </div>

      {/* Dot Style & Corner Style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {lang === 'id' ? 'Gaya Dot / Modul' : 'Dot / Module Style'}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {dotOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ dotStyle: opt.id })}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  design.dotStyle === opt.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/25'
                    : 'border-slate-200 dark:border-[#232732] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {lang === 'id' ? 'Gaya Sudut Penanda' : 'Corner Eye Style'}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {cornerOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ cornerStyle: opt.id })}
                className={`min-h-[36px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  design.cornerStyle === opt.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/25'
                    : 'border-slate-200 dark:border-[#232732] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Frame Style & Frame Text */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#232732]">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {lang === 'id' ? 'Gaya Bingkai & Teks Label' : 'Frame Style & Label Text'}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {frameOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ frameStyle: opt.id })}
                className={`min-h-[36px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  design.frameStyle === opt.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/25'
                    : 'border-slate-200 dark:border-[#232732] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {design.frameStyle !== 'none' && (
          <div className="space-y-1">
            <label
              htmlFor="bio-qr-frame-text"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              {lang === 'id'
                ? 'Teks Label pada Bingkai QR (maks. 42 karakter)'
                : 'QR Frame Label Text (max 42 chars)'}
            </label>
            <input
              id="bio-qr-frame-text"
              type="text"
              maxLength={42}
              value={design.frameText}
              onChange={(e) => patch({ frameText: e.target.value })}
              placeholder={pageLabel}
              className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}
      </div>

      {/* Center Bio Avatar / Monogram */}
      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#232732]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              {lang === 'id'
                ? 'Foto Profil / Logo di Tengah QR'
                : 'Center Bio Photo / Logo'}
            </span>
          </div>
          {!effectiveAvatarUrl && design.centerLogoMode === 'bio_avatar' && (
            <span className="text-[11px] text-slate-500">
              {lang === 'id'
                ? 'Belum ada foto Bio — memakai inisial otomatis'
                : 'No Bio photo yet — using initials'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {centerOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => patch({ centerLogoMode: opt.id })}
              className={`min-h-[36px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                design.centerLogoMode === opt.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/25'
                  : 'border-slate-200 dark:border-[#232732] text-slate-700 dark:text-slate-300 hover:border-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Explicit Save Bar for QR Design */}
      <div className="pt-3 border-t border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {hasUnsaved
            ? lang === 'id'
              ? 'Desain QR berubah — klik simpan agar tampil di halaman publik Bio.'
              : 'QR design modified — save so public Bio visitors see it.'
            : lang === 'id'
              ? 'Desain QR sinkron dengan halaman publik Bio Anda.'
              : 'QR design is synced with your public Bio page.'}
        </div>
        <button
          type="button"
          onClick={onSaveToServer}
          disabled={saving || disabledSave}
          className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>
            {saving
              ? lang === 'id'
                ? 'Menyimpan...'
                : 'Saving...'
              : lang === 'id'
                ? 'Simpan Desain QR'
                : 'Save QR Design'}
          </span>
        </button>
      </div>
    </div>
  );
}
