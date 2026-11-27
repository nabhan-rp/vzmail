import { AlertTriangle, Check, Copy, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import { copyTextSafely } from '../utils/clipboard';

export interface ConfirmSecondaryAction {
  label: string;
  onClick: () => void | Promise<void>;
  tone?: 'neutral' | 'danger';
}

interface ConfirmActionModalProps {
  isOpen: boolean;
  lang: Language;
  title: string;
  description: string;
  details?: string;
  tone?: 'danger' | 'warning';
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * When set, enables GitHub-style type-to-confirm protection.
   * User must type this exact phrase before the primary confirm button unlocks.
   */
  requireTypedText?: string;
  typedPromptLabel?: string;
  secondaryAction?: ConfirmSecondaryAction;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmActionModal({
  isOpen,
  lang,
  title,
  description,
  details,
  tone = 'danger',
  confirmLabel,
  cancelLabel,
  requireTypedText,
  typedPromptLabel,
  secondaryAction,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  const [typedValue, setTypedValue] = useState('');
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTypedValue('');
    setCopiedPhrase(false);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      if (requireTypedText) {
        inputRef.current?.focus();
      }
    }, 40);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, loading, onCancel, requireTypedText]);

  if (!isOpen) return null;

  const expectedNormalized = requireTypedText
    ? requireTypedText.trim().toLowerCase()
    : '';
  const isPhraseMatched =
    !requireTypedText || typedValue.trim().toLowerCase() === expectedNormalized;

  const isDanger = tone === 'danger';

  const handleCopyPhrase = () => {
    if (!requireTypedText) return;
    void copyTextSafely(requireTypedText);
    setCopiedPhrase(true);
    window.setTimeout(() => setCopiedPhrase(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-action-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        onClick={() => {
          if (!loading) onCancel();
        }}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Dialog Card */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#252A36] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60'
              }`}
            >
              {isDanger ? (
                <ShieldAlert className="w-4.5 h-4.5" />
              ) : (
                <AlertTriangle className="w-4.5 h-4.5" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="confirm-action-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display leading-snug"
              >
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label={lang === 'id' ? 'Tutup dialog' : 'Close dialog'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1D222E] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {description}
          </p>

          {details && (
            <div className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {details}
            </div>
          )}

          {requireTypedText && (
            <div className="space-y-2 pt-1">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {typedPromptLabel ||
                  (lang === 'id'
                    ? 'Ketik kalimat berikut untuk melanjutkan konfirmasi:'
                    : 'Type the following phrase to confirm this action:')}
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#0B0D11] border border-slate-200 dark:border-[#2A303D]">
                <code className="text-xs font-mono font-semibold text-slate-900 dark:text-white select-all break-all">
                  {requireTypedText}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPhrase}
                  title={lang === 'id' ? 'Salin teks konfirmasi' : 'Copy confirmation phrase'}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer shrink-0"
                >
                  {copiedPhrase ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isPhraseMatched && !loading) {
                    e.preventDefault();
                    void onConfirm();
                  }
                }}
                placeholder={requireTypedText}
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono bg-white dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2D3444] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#FAFAFA] dark:bg-[#0D1016] border-t border-slate-200 dark:border-[#232732] flex flex-col gap-2">
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="min-h-[38px] px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#181D27] hover:bg-slate-100 dark:hover:bg-[#222836] border border-slate-200 dark:border-[#2A303E] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelLabel || (lang === 'id' ? 'Batal' : 'Cancel')}
            </button>

            {secondaryAction && (
              <button
                type="button"
                disabled={loading || !isPhraseMatched}
                onClick={() => void secondaryAction.onClick()}
                className={`min-h-[38px] px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  secondaryAction.tone === 'danger'
                    ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60'
                    : 'text-slate-800 dark:text-slate-100 bg-slate-200/80 dark:bg-[#222836] hover:bg-slate-300/80 dark:hover:bg-[#2C3446]'
                }`}
              >
                {secondaryAction.label}
              </button>
            )}

            <button
              type="button"
              disabled={loading || !isPhraseMatched}
              onClick={() => void onConfirm()}
              className={`min-h-[38px] px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {loading
                ? lang === 'id'
                  ? 'Memproses...'
                  : 'Processing...'
                : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
