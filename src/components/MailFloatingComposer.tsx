import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Eye,
  EyeOff,
  File as FileIcon,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  MAIL_ATTACHMENT_MAX_COUNT,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../utils/linksModel';
import {
  MAIL_EXTERNAL_LINKS_MAX_COUNT,
  formatFileSizeLabel,
  getExternalProviderDisplayName,
  normalizeAndClassifyExternalLink,
  type MailExternalLink,
} from '../utils/mailExternalLinks';
import type { VzFilesUploadProgress } from '../utils/vzFilesUploader';

export type ComposeWindowMode = 'closed' | 'floating' | 'minimized' | 'fullscreen';

export interface PendingComposeAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Raw File object when newly attached in current session */
  file?: File;
  /** Base64 copy persisted locally for drafts reloaded from IndexedDB */
  localDataBase64?: string;
}

export interface ComposeFeedbackState {
  kind: 'idle' | 'sending' | 'error' | 'success';
  message: string;
}

interface AliasOption {
  address: string;
  rule: string;
}

interface MailFloatingComposerProps {
  mode: ComposeWindowMode;
  onChangeMode: (mode: ComposeWindowMode) => void;
  lang: Language;
  primaryEmail: string;
  aliasExamples: AliasOption[];
  fromAlias: string;
  onChangeFromAlias: (val: string) => void;
  to: string;
  onChangeTo: (val: string) => void;
  subject: string;
  onChangeSubject: (val: string) => void;
  body: string;
  onChangeBody: (val: string) => void;
  attachments: PendingComposeAttachment[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  externalLinks: MailExternalLink[];
  onAddExternalLink: (link: MailExternalLink) => void;
  onRemoveExternalLink: (id: string) => void;
  onToggleExternalLinkInline: (id: string) => void;
  oversizedFiles: File[];
  onClearOversizedFiles: () => void;
  onUploadFileToVzFiles: (file: File) => Promise<void>;
  vzUploadProgress: VzFilesUploadProgress | null;
  editingDraftId: string | null;
  sending: boolean;
  feedback: ComposeFeedbackState;
  onClearFeedback: () => void;
  quotaUsed: number;
  quotaLimit: number;
  onSend: (e: React.FormEvent) => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
}

function formatAttachmentBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function MailFloatingComposer({
  mode,
  onChangeMode,
  lang,
  primaryEmail,
  aliasExamples,
  fromAlias,
  onChangeFromAlias,
  to,
  onChangeTo,
  subject,
  onChangeSubject,
  body,
  onChangeBody,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  externalLinks,
  onAddExternalLink,
  onRemoveExternalLink,
  onToggleExternalLinkInline,
  oversizedFiles,
  onClearOversizedFiles,
  onUploadFileToVzFiles,
  vzUploadProgress,
  editingDraftId,
  sending,
  feedback,
  onClearFeedback,
  quotaUsed,
  quotaLimit,
  onSend,
  onSaveDraft,
  onDiscard,
}: MailFloatingComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const vzFilesInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Inline "Add Link / Direct Media" drawer state
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkLabelInput, setLinkLabelInput] = useState('');
  const [linkInputError, setLinkInputError] = useState<string | null>(null);

  const previewClassifiedLink = useMemo(() => {
    const trimmed = linkUrlInput.trim();
    if (!trimmed) return null;
    return normalizeAndClassifyExternalLink(trimmed, {
      label: linkLabelInput.trim() || undefined,
    });
  }, [linkUrlInput, linkLabelInput]);

  if (mode === 'closed') return null;

  const isUploadingVzFiles = vzUploadProgress !== null;
  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  const attachmentRatio = Math.min(
    100,
    Math.round((totalAttachmentBytes / MAIL_ATTACHMENT_MAX_TOTAL_BYTES) * 100)
  );
  const isOverAttachmentLimit = totalAttachmentBytes > MAIL_ATTACHMENT_MAX_TOTAL_BYTES;
  const totalMediaCount = attachments.length + externalLinks.length;

  const headerTitle = subject.trim()
    ? subject.trim()
    : editingDraftId
      ? lang === 'id'
        ? 'Edit Draf Lokal'
        : 'Edit Local Draft'
      : lang === 'id'
        ? 'Pesan Baru'
        : 'New Message';

  const handleAddExternalLinkClick = () => {
    setLinkInputError(null);
    const trimmed = linkUrlInput.trim();
    if (!trimmed) {
      setLinkInputError(
        lang === 'id'
          ? 'Tempel URL Google Drive, VZ Files, Imgur, atau tautan file langsung.'
          : 'Paste a Google Drive, VZ Files, Imgur, or direct file URL.'
      );
      return;
    }
    if (externalLinks.length >= MAIL_EXTERNAL_LINKS_MAX_COUNT) {
      setLinkInputError(
        lang === 'id'
          ? `Maksimal ${MAIL_EXTERNAL_LINKS_MAX_COUNT} tautan eksternal per email.`
          : `Maximum ${MAIL_EXTERNAL_LINKS_MAX_COUNT} external links per email.`
      );
      return;
    }
    const normalized = normalizeAndClassifyExternalLink(trimmed, {
      label: linkLabelInput.trim() || undefined,
    });
    if (!normalized) {
      setLinkInputError(
        lang === 'id'
          ? 'URL tidak valid atau tidak diizinkan. Gunakan alamat https:// publik.'
          : 'Invalid or disallowed URL. Use a public https:// link.'
      );
      return;
    }
    onAddExternalLink(normalized);
    setLinkUrlInput('');
    setLinkLabelInput('');
    setLinkPanelOpen(false);
  };

  // MINIMIZED DOCK BAR (Gmail / Hotmail style bottom-right bar)
  if (mode === 'minimized') {
    return (
      <div
        role="region"
        aria-label={lang === 'id' ? 'Jendela Tulis Email (Diperkecil)' : 'Minimized Email Composer'}
        className="fixed bottom-16 lg:bottom-0 right-3 sm:right-6 z-50 w-72 sm:w-80 bg-slate-900 dark:bg-[#181D27] text-white border border-slate-700 dark:border-[#2C3344] rounded-t-xl lg:rounded-b-none rounded-b-xl shadow-2xl overflow-hidden"
      >
        <div className="h-11 px-3.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChangeMode('floating')}
            className="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-xs font-semibold truncate">{headerTitle}</span>
            {totalMediaCount > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
                ({totalMediaCount})
              </span>
            )}
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangeMode('floating')}
              aria-label={lang === 'id' ? 'Kembalikan jendela' : 'Restore composer'}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('closed')}
              aria-label={lang === 'id' ? 'Tutup jendela' : 'Close composer'}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isFullscreen = mode === 'fullscreen';

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  const windowShell = (
    <div
      role="dialog"
      aria-modal={isFullscreen ? 'true' : 'false'}
      aria-label={lang === 'id' ? 'Tulis Email VZ Mail' : 'Compose VZ Mail'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={
        isFullscreen
          ? 'w-full max-w-4xl h-[min(88vh,780px)] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#252B38] rounded-2xl shadow-2xl flex flex-col overflow-hidden'
          : 'fixed bottom-16 lg:bottom-0 right-2 sm:right-6 z-50 w-[min(590px,calc(100vw-1rem))] max-h-[min(84vh,670px)] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#282F3E] rounded-t-2xl lg:rounded-b-none rounded-b-2xl shadow-2xl flex flex-col overflow-hidden'
      }
    >
      {/* Top Window Chrome Bar */}
      <div className="px-4 py-2.5 bg-slate-900 dark:bg-[#181D27] text-white flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold truncate font-display">
              {headerTitle}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-300 truncate">
              {editingDraftId
                ? lang === 'id'
                  ? 'Mengedit Draf Lokal'
                  : 'Editing Local Draft'
                : lang === 'id'
                  ? 'Mode Mengambang · Bebas baca email lain'
                  : 'Floating Mode · Read other emails freely'}{' '}
              · {quotaUsed}/{quotaLimit}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onChangeMode('minimized')}
            title={lang === 'id' ? 'Perkecil (Minimize)' : 'Minimize'}
            aria-label={lang === 'id' ? 'Perkecil jendela' : 'Minimize composer'}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onChangeMode(isFullscreen ? 'floating' : 'fullscreen')}
            title={
              isFullscreen
                ? lang === 'id'
                  ? 'Keluar Layar Penuh'
                  : 'Exit Fullscreen'
                : lang === 'id'
                  ? 'Layar Penuh (Fullscreen)'
                  : 'Fullscreen'
            }
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('closed')}
            title={lang === 'id' ? 'Tutup (isi tetap tersimpan sementara)' : 'Close'}
            aria-label={lang === 'id' ? 'Tutup jendela' : 'Close composer'}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline Status / Error Feedback Banner (ALWAYS visible inside composer!) */}
      {feedback.kind !== 'idle' && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`px-4 py-2.5 border-b text-xs flex items-start justify-between gap-3 shrink-0 ${
            feedback.kind === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/70 text-rose-800 dark:text-rose-200'
              : feedback.kind === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/70 text-blue-800 dark:text-blue-200'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            {feedback.kind === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            ) : feedback.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0 mt-0.5" />
            )}
            <div className="space-y-1.5 min-w-0">
              <p className="leading-snug break-words font-medium">
                {feedback.message}
              </p>
              {feedback.kind === 'error' && (
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-[#171C26] text-slate-800 dark:text-slate-100 border border-rose-300 dark:border-rose-800 rounded-md hover:bg-rose-100/70 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                >
                  <Save className="w-3 h-3" />
                  <span>
                    {lang === 'id'
                      ? 'Simpan ke Draf Lokal agar tidak hilang'
                      : 'Save to Local Drafts so nothing is lost'}
                  </span>
                </button>
              )}
            </div>
          </div>
          {feedback.kind !== 'sending' && (
            <button
              type="button"
              onClick={onClearFeedback}
              aria-label="Dismiss status"
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Composer Form Body */}
      <form onSubmit={onSend} className="flex-1 flex flex-col min-h-0">
        <div
          className={`flex-1 overflow-y-auto p-4 space-y-3 transition-colors ${
            dragActive ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''
          }`}
        >
          {/* From Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 pb-2 border-b border-slate-200 dark:border-[#232732]">
            <label
              htmlFor="vz-compose-from"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-16 shrink-0"
            >
              {lang === 'id' ? 'Dari' : 'From'}
            </label>
            <select
              id="vz-compose-from"
              value={fromAlias}
              onChange={(e) => onChangeFromAlias(e.target.value)}
              disabled={sending}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#282F3E] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            >
              <option value={primaryEmail}>{primaryEmail} (Utama)</option>
              {aliasExamples.map((ex) => (
                <option key={ex.address} value={ex.address}>
                  {ex.address} ({ex.rule})
                </option>
              ))}
            </select>
          </div>

          {/* To Recipient */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 pb-2 border-b border-slate-200 dark:border-[#232732]">
            <label
              htmlFor="vz-compose-to"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-16 shrink-0"
            >
              {lang === 'id' ? 'Kepada' : 'To'}
            </label>
            <input
              id="vz-compose-to"
              type="email"
              required
              disabled={sending}
              value={to}
              onChange={(e) => onChangeTo(e.target.value)}
              placeholder={
                lang === 'id'
                  ? 'nama@gmail.com atau pengguna@imy.li'
                  : 'name@gmail.com or user@imy.li'
              }
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Subject */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 pb-2 border-b border-slate-200 dark:border-[#232732]">
            <label
              htmlFor="vz-compose-subject"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-16 shrink-0"
            >
              {lang === 'id' ? 'Subjek' : 'Subject'}
            </label>
            <input
              id="vz-compose-subject"
              type="text"
              required
              disabled={sending}
              value={subject}
              onChange={(e) => onChangeSubject(e.target.value)}
              placeholder={lang === 'id' ? 'Subjek email...' : 'Email subject...'}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs sm:text-sm font-medium bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Message Body */}
          <textarea
            id="vz-compose-body"
            rows={isFullscreen ? 12 : 6}
            required
            disabled={sending}
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            placeholder={
              lang === 'id'
                ? 'Tulis isi pesan Anda di sini... Seret file (<=10 MB ke R2, atau >10 MB langsung ke VZ Files) atau sisipkan tautan Google Drive / Imgur.'
                : 'Write your message here... Drag & drop files (<=10 MB via R2, or >10 MB via VZ Files) or insert Google Drive / Imgur links.'
            }
            className="w-full min-h-[125px] flex-1 px-2.5 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 resize-y leading-relaxed"
          />

          {/* Smart >10 MB Action Banner — Offers instant upload to VZ Files (https://files.vz.gay) */}
          {oversizedFiles.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-50/90 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-900/70 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <CloudUpload className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>
                      {lang === 'id'
                        ? 'File melebihi batas lampiran 10 MB — Kirim via VZ Files (files.vz.gay)!'
                        : 'File exceeds 10 MB limit — Send via VZ Files (files.vz.gay)!'}
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
                    {lang === 'id'
                      ? 'Agar penyimpanan R2 tetap 0 byte dan email lolos server penerima, unggah file besar langsung ke layanan VZ Files (https://files.vz.gay) atau tempel tautan Google Drive.'
                      : 'Keep R2 storage lean and bypass email size limits by uploading large files straight to VZ Files (https://files.vz.gay) or pasting a Google Drive link.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearOversizedFiles}
                  aria-label="Dismiss large file suggestion"
                  className="p-1 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                {oversizedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white dark:bg-[#141925] border border-blue-200/80 dark:border-blue-900/60"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {file.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        {formatFileSizeLabel(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isUploadingVzFiles || sending}
                      onClick={() => void onUploadFileToVzFiles(file)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>
                        {lang === 'id'
                          ? 'Unggah ke VZ Files'
                          : 'Upload to VZ Files'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setLinkPanelOpen(true)}
                  className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Link2 className="w-3 h-3" />
                  <span>
                    {lang === 'id'
                      ? 'Atau sisipkan tautan Google Drive / Cloud'
                      : 'Or insert Google Drive / Cloud link'}
                  </span>
                </button>
                <span aria-hidden="true" className="text-blue-300 dark:text-blue-700">·</span>
                <a
                  href="https://files.vz.gay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline inline-flex items-center gap-1"
                >
                  <span>files.vz.gay</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Live VZ Files Upload Progress Bar */}
          {vzUploadProgress && (
            <div className="p-3 rounded-xl bg-slate-900 dark:bg-[#0D1119] text-white border border-slate-700 dark:border-[#263044] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-medium truncate">
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                  <span className="truncate">{vzUploadProgress.detail}</span>
                </span>
                <span className="font-mono tabular-nums font-bold text-blue-300 shrink-0">
                  {vzUploadProgress.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.max(4, vzUploadProgress.percent))}%` }}
                />
              </div>
            </div>
          )}

          {/* Inline "Insert Link / Direct Media (Imgur, Google Drive, VZ Files)" Panel */}
          {linkPanelOpen && (
            <div className="p-3 rounded-xl bg-[#FAFAFA] dark:bg-[#0E121A] border border-slate-200 dark:border-[#262E3F] space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    {lang === 'id'
                      ? 'Sisipkan Tautan File / Media Langsung (>10 MB / Imgur / Drive)'
                      : 'Insert File Link / Direct Media (>10 MB / Imgur / Drive)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLinkPanelOpen(false);
                    setLinkInputError(null);
                  }}
                  aria-label="Close link panel"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="url"
                  value={linkUrlInput}
                  onChange={(e) => {
                    setLinkUrlInput(e.target.value);
                    setLinkInputError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExternalLinkClick();
                    }
                  }}
                  placeholder="https://i.imgur.com/...png atau drive.google.com/..."
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#131822] border border-slate-200 dark:border-[#2A3244] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
                <input
                  type="text"
                  value={linkLabelInput}
                  onChange={(e) => setLinkLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExternalLinkClick();
                    }
                  }}
                  placeholder={
                    lang === 'id'
                      ? 'Nama tampilan (opsional, mis. Video Final 4K)'
                      : 'Display title (optional, e.g. Final Video 4K)'
                  }
                  className="w-full px-2.5 py-2 text-xs bg-white dark:bg-[#131822] border border-slate-200 dark:border-[#2A3244] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              {previewClassifiedLink && (
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-[#141924] border border-slate-200 dark:border-[#262E3F]">
                  {previewClassifiedLink.renderInline && previewClassifiedLink.directMediaUrl ? (
                    <img
                      src={previewClassifiedLink.directMediaUrl}
                      alt={previewClassifiedLink.label}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-[#2B3345] shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 inline-flex items-center justify-center shrink-0">
                      <Link2 className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {previewClassifiedLink.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {getExternalProviderDisplayName(previewClassifiedLink.provider)} ·{' '}
                      {previewClassifiedLink.renderInline
                        ? lang === 'id'
                          ? 'Gambar langsung — otomatis tampil inline di email'
                          : 'Direct image — renders inline in email'
                        : lang === 'id'
                          ? 'Ditampilkan sebagai kartu tautan rapi di email'
                          : 'Rendered as a clickable link card in email'}
                    </div>
                  </div>
                </div>
              )}

              {linkInputError && (
                <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  {linkInputError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href="https://files.vz.gay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>
                    {lang === 'id'
                      ? 'Butuh hosting file besar gratis? Buka files.vz.gay'
                      : 'Need free large file hosting? Open files.vz.gay'}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={handleAddExternalLinkClick}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Sisipkan Tautan' : 'Insert Link'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Attached External Links & Direct Inline Media Preview Chips */}
          {externalLinks.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {lang === 'id'
                  ? `Tautan File & Media Langsung (${externalLinks.length})`
                  : `External File Links & Direct Media (${externalLinks.length})`}
              </div>
              {externalLinks.map((link) => {
                const canInline = Boolean(link.directMediaUrl);
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {link.renderInline && link.directMediaUrl ? (
                        <img
                          src={link.directMediaUrl}
                          alt={link.label}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded object-cover border border-blue-200 dark:border-blue-900 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-white dark:bg-[#151B27] border border-blue-200/70 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 inline-flex items-center justify-center shrink-0">
                          {canInline ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {link.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {getExternalProviderDisplayName(link.provider)}
                          {link.sizeLabel ? ` · ${link.sizeLabel}` : ''}
                          {link.renderInline
                            ? lang === 'id'
                              ? ' · Tampil Inline'
                              : ' · Inline Preview'
                            : ''}{' '}
                          · {link.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {canInline && (
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => onToggleExternalLinkInline(link.id)}
                          title={
                            link.renderInline
                              ? lang === 'id'
                                ? 'Ubah ke kartu tautan saja'
                                : 'Switch to link card only'
                              : lang === 'id'
                                ? 'Tampilkan gambar inline di email'
                                : 'Show image inline in email'
                          }
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer"
                        >
                          {link.renderInline ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => onRemoveExternalLink(link.id)}
                        aria-label={`Remove ${link.label}`}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Attachments List & 10 MB Ephemeral R2 Capacity Indicator */}
          <div className="space-y-2">
            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#FAFAFA] dark:bg-[#0E1117] border border-slate-200 dark:border-[#252B38] text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {att.filename}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                        {formatAttachmentBytes(att.sizeBytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => onRemoveAttachment(att.id)}
                      aria-label={`Remove ${att.filename}`}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {lang === 'id'
                  ? `Lampiran R2 (<=10 MB, maks ${MAIL_ATTACHMENT_MAX_COUNT} file) · File >10 MB pakai VZ Files (files.vz.gay) atau Link Drive/Imgur`
                  : `R2 attachments (<=10 MB, max ${MAIL_ATTACHMENT_MAX_COUNT} files) · For >10 MB use VZ Files (files.vz.gay) or Drive/Imgur links`}
              </span>
              {attachments.length > 0 && (
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    isOverAttachmentLimit
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {formatAttachmentBytes(totalAttachmentBytes)} / 10.00 MB ({attachmentRatio}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Hidden Regular R2 File Input (<= 10 MB; >10 MB auto-offers VZ Files) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {/* Hidden Direct VZ Files Upload Input (for >10 MB or any file to files.vz.gay) */}
        <input
          ref={vzFilesInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void onUploadFileToVzFiles(file);
              e.target.value = '';
            }
          }}
        />

        {/* Bottom Action Bar */}
        <div className="px-4 py-3 bg-[#FAFAFA] dark:bg-[#0E1117] border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="submit"
              disabled={sending || isUploadingVzFiles || isOverAttachmentLimit}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {sending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{lang === 'id' ? 'Mengirim...' : 'Sending...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Kirim Email' : 'Send Email'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={sending || attachments.length >= MAIL_ATTACHMENT_MAX_COUNT}
              onClick={() => fileInputRef.current?.click()}
              title={lang === 'id' ? 'Lampirkan File (maks 10 MB via R2)' : 'Attach File (max 10 MB via R2)'}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2532] border border-slate-200 dark:border-[#2A303E] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {lang === 'id' ? 'File' : 'File'}
              </span>
            </button>

            <button
              type="button"
              disabled={sending || isUploadingVzFiles || externalLinks.length >= MAIL_EXTERNAL_LINKS_MAX_COUNT}
              onClick={() => vzFilesInputRef.current?.click()}
              title={
                lang === 'id'
                  ? 'Unggah File Besar (>10 MB) ke VZ Files (files.vz.gay)'
                  : 'Upload Large File (>10 MB) to VZ Files (files.vz.gay)'
              }
              className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">VZ Files</span>
            </button>

            <button
              type="button"
              disabled={sending || externalLinks.length >= MAIL_EXTERNAL_LINKS_MAX_COUNT}
              onClick={() => setLinkPanelOpen((prev) => !prev)}
              title={
                lang === 'id'
                  ? 'Sisipkan Link Google Drive, Imgur, atau Direct Media'
                  : 'Insert Google Drive, Imgur, or Direct Media Link'
              }
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
                linkPanelOpen
                  ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                  : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2532] border-slate-200 dark:border-[#2A303E]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {lang === 'id' ? 'Link / Media' : 'Link / Media'}
              </span>
            </button>

            <button
              type="button"
              disabled={sending}
              onClick={onSaveDraft}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2532] border border-slate-200 dark:border-[#2A303E] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {lang === 'id' ? 'Draf' : 'Draft'}
              </span>
            </button>
          </div>

          <button
            type="button"
            disabled={sending}
            onClick={onDiscard}
            title={lang === 'id' ? 'Buang pesan ini' : 'Discard message'}
            aria-label={lang === 'id' ? 'Buang pesan' : 'Discard message'}
            className="min-h-[40px] px-2 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );

  if (isFullscreen) {
    return (
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget && !sending) {
            onChangeMode('floating');
          }
        }}
        className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      >
        {windowShell}
      </div>
    );
  }

  return windowShell;
}
