import { AlertTriangle, ArrowRight, Link2, Pencil, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  sanitizeShortlinkSlugInput,
  type ShortlinkRecord,
} from '../utils/linksModel';

export type OldSlugAction = 'disable' | 'keep_alias';

export interface EditShortlinkPayload {
  newSlug: string;
  targetUrl: string;
  title: string;
  oldSlugAction: OldSlugAction;
}

interface EditShortlinkModalProps {
  isOpen: boolean;
  lang: Language;
  domain: string;
  item: ShortlinkRecord | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (original: ShortlinkRecord, payload: EditShortlinkPayload) => Promise<void>;
}

export function EditShortlinkModal({
  isOpen,
  lang,
  domain,
  item,
  saving,
  error,
  onClose,
  onSave,
}: EditShortlinkModalProps) {
  const [slugInput, setSlugInput] = useState('');
  const [targetUrlInput, setTargetUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [oldSlugAction, setOldSlugAction] = useState<OldSlugAction>('disable');
  const [localError, setLocalError] = useState<string | null>(null);

  const slugFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen || !item) return;
    setSlugInput(item.slug);
    setTargetUrlInput(item.targetUrl);
    setTitleInput(item.title || '');
    setOldSlugAction('disable');
    setLocalError(null);
    const timer = window.setTimeout(() => {
      slugFieldRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saving]);

  const normalizedDraftSlug = useMemo(() => {
    return slugInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }, [slugInput]);

  if (!isOpen || !item) return null;

  const isSlugChanged = normalizedDraftSlug !== item.slug;
  const previewSlug = normalizedDraftSlug || item.slug;
  const hasAnyChange =
    isSlugChanged ||
    targetUrlInput.trim() !== item.targetUrl ||
    titleInput.trim() !== (item.title || '').trim();

  const displayedError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const validatedSlug =
      normalizedDraftSlug === item.slug
        ? item.slug
        : sanitizeShortlinkSlugInput(slugInput);

    if (!validatedSlug) {
      setLocalError(
        lang === 'id'
          ? 'Slug harus 2–48 karakter (huruf kecil, angka, tanda hubung) dan bukan kata sistem.'
          : 'Slug must be 2–48 characters (lowercase letters, numbers, hyphens) and not a reserved word.'
      );
      slugFieldRef.current?.focus();
      return;
    }

    const trimmedUrl = targetUrlInput.trim();
    if (!trimmedUrl) {
      setLocalError(
        lang === 'id'
          ? 'URL tujuan tidak boleh kosong.'
          : 'Destination URL cannot be empty.'
      );
      return;
    }

    await onSave(item, {
      newSlug: validatedSlug,
      targetUrl: trimmedUrl,
      title: titleInput.trim(),
      oldSlugAction: validatedSlug !== item.slug ? oldSlugAction : 'disable',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-shortlink-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#252A36] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="edit-shortlink-modal-title"
                className="text-sm font-bold text-slate-900 dark:text-white font-display truncate"
              >
                {lang === 'id' ? 'Edit Shortlink SSO' : 'Edit SSO Shortlink'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {lang === 'id'
                  ? 'Perbarui slug, URL tujuan, atau label catatan secara langsung'
                  : 'Update slug, destination URL, or label directly'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={lang === 'id' ? 'Tutup modal' : 'Close modal'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2430] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Live Shortlink Preview */}
          <div className="rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  {lang === 'id' ? 'Pratinjau Tautan Hasil' : 'Live Link Preview'}
                </span>
              </span>
              <span className="font-mono tabular-nums">
                {item.clicks.toLocaleString()}{' '}
                {lang === 'id' ? 'klik dipertahankan' : 'clicks preserved'}
              </span>
            </div>
            <div className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400 break-all">
              https://{domain}/s/{previewSlug}
            </div>
            {isSlugChanged && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span className="line-through opacity-75">/s/{item.slug}</span>
                <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  /s/{previewSlug}
                </span>
              </div>
            )}
          </div>

          {/* Slug Input */}
          <div className="space-y-1">
            <label
              htmlFor="edit-shortlink-slug"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {lang === 'id' ? 'Custom Slug' : 'Custom Slug'}
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 dark:border-[#2A303D] bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
              <span className="px-3 py-2 text-xs font-mono text-slate-500 border-r border-slate-200 dark:border-[#232732] select-none shrink-0">
                {domain}/s/
              </span>
              <input
                ref={slugFieldRef}
                id="edit-shortlink-slug"
                type="text"
                autoComplete="off"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  setLocalError(null);
                }}
                placeholder="promo-baru"
                maxLength={48}
                className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? '2–48 karakter (huruf kecil, angka, dan tanda hubung).'
                : '2–48 characters (lowercase letters, numbers, and hyphens).'}
            </p>
          </div>

          {/* Destination URL Input */}
          <div className="space-y-1">
            <label
              htmlFor="edit-shortlink-target"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {lang === 'id' ? 'URL Tujuan' : 'Destination URL'}
            </label>
            <input
              id="edit-shortlink-target"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={targetUrlInput}
              onChange={(e) => {
                setTargetUrlInput(e.target.value);
                setLocalError(null);
              }}
              placeholder="https://contoh.com/halaman"
              className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Label / Note Input */}
          <div className="space-y-1">
            <label
              htmlFor="edit-shortlink-title"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              {lang === 'id' ? 'Label / Catatan (Opsional)' : 'Label / Note (Optional)'}
            </label>
            <input
              id="edit-shortlink-title"
              type="text"
              maxLength={120}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={
                lang === 'id'
                  ? 'Contoh: Tautan Brosur Resmi'
                  : 'Example: Official Campaign Link'
              }
              className="w-full min-h-[40px] px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Conditional Old Slug Policy Selector (only when slug actually changes) */}
          {isSlugChanged && (
            <div className="space-y-2 pt-1">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'id'
                  ? `Tindakan untuk slug lama (/s/${item.slug})`
                  : `Action for previous slug (/s/${item.slug})`}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    oldSlugAction === 'disable'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/25'
                      : 'border-slate-200 dark:border-[#252A36] hover:bg-slate-50 dark:hover:bg-[#171B24]'
                  }`}
                >
                  <input
                    type="radio"
                    name="oldSlugAction"
                    value="disable"
                    checked={oldSlugAction === 'disable'}
                    onChange={() => setOldSlugAction('disable')}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div className="space-y-0.5 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? 'Nonaktifkan slug lama (Disarankan)'
                        : 'Deactivate old slug (Recommended)'}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {lang === 'id'
                        ? `Tautan /s/${item.slug} dihapus dari backend dan langsung berhenti redirect. Seluruh jumlah klik dipindahkan ke /s/${previewSlug}.`
                        : `Removes /s/${item.slug} from the backend so it stops redirecting immediately. All click history moves to /s/${previewSlug}.`}
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    oldSlugAction === 'keep_alias'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/25'
                      : 'border-slate-200 dark:border-[#252A36] hover:bg-slate-50 dark:hover:bg-[#171B24]'
                  }`}
                >
                  <input
                    type="radio"
                    name="oldSlugAction"
                    value="keep_alias"
                    checked={oldSlugAction === 'keep_alias'}
                    onChange={() => setOldSlugAction('keep_alias')}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div className="space-y-0.5 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'id'
                        ? 'Pertahankan slug lama sebagai alias redirect'
                        : 'Keep old slug as a redirect alias'}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {lang === 'id'
                        ? `Tautan /s/${previewSlug} menjadi link utama (membawa hitungan klik), sedangkan /s/${item.slug} tetap aktif mengarahkan ke URL tujuan terbaru.`
                        : `/s/${previewSlug} becomes the primary link (keeping clicks), while /s/${item.slug} stays active redirecting to the latest destination URL.`}
                    </p>
                  </div>
                </label>
              </div>

              {oldSlugAction === 'disable' && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {lang === 'id'
                      ? `Perhatian: siapa pun yang membuka ${domain}/s/${item.slug} setelah disimpan tidak lagi diarahkan.`
                      : `Note: anyone visiting ${domain}/s/${item.slug} after saving will no longer be redirected.`}
                  </span>
                </div>
              )}
            </div>
          )}

          {displayedError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
              {displayedError}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-[#232732]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[38px] px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {lang === 'id' ? 'Batal' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving || !hasAnyChange}
              className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
            >
              {saving
                ? lang === 'id'
                  ? 'Menyimpan...'
                  : 'Saving...'
                : lang === 'id'
                  ? 'Simpan Perubahan'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
