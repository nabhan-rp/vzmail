import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  MAIL_ATTACHMENT_MAX_COUNT,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../utils/linksModel';

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
  const [dragActive, setDragActive] = useState(false);

  if (mode === 'closed') return null;

  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  const attachmentRatio = Math.min(
    100,
    Math.round((totalAttachmentBytes / MAIL_ATTACHMENT_MAX_TOTAL_BYTES) * 100)
  );
  const isOverAttachmentLimit = totalAttachmentBytes > MAIL_ATTACHMENT_MAX_TOTAL_BYTES;

  const headerTitle = subject.trim()
    ? subject.trim()
    : editingDraftId
      ? lang === 'id'
        ? 'Edit Draf Lokal'
        : 'Edit Local Draft'
      : lang === 'id'
        ? 'Pesan Baru'
        : 'New Message';

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
            {attachments.length > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
                ({attachments.length})
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
          ? 'w-full max-w-4xl h-[min(86vh,760px)] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#252B38] rounded-2xl shadow-2xl flex flex-col overflow-hidden'
          : 'fixed bottom-16 lg:bottom-0 right-2 sm:right-6 z-50 w-[min(560px,calc(100vw-1rem))] max-h-[min(82vh,640px)] bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#282F3E] rounded-t-2xl lg:rounded-b-none rounded-b-2xl shadow-2xl flex flex-col overflow-hidden'
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
            rows={isFullscreen ? 14 : 7}
            required
            disabled={sending}
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            placeholder={
              lang === 'id'
                ? 'Tulis isi pesan Anda di sini... Anda dapat langsung menyeret file (maks 10 MB) ke area ini untuk melampirkan.'
                : 'Write your message here... You can drag & drop files (max 10 MB) directly onto this area to attach.'
            }
            className="w-full min-h-[140px] flex-1 px-2.5 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 resize-y leading-relaxed"
          />

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
                  ? `Lampiran sementara R2 (maks ${MAIL_ATTACHMENT_MAX_COUNT} file · 10 MB total · hapus otomatis saat diunduh/7 hari)`
                  : `Ephemeral R2 attachments (max ${MAIL_ATTACHMENT_MAX_COUNT} files · 10 MB total · auto-purged on download/7d)`}
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

        {/* Hidden File Input */}
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

        {/* Bottom Action Bar */}
        <div className="px-4 py-3 bg-[#FAFAFA] dark:bg-[#0E1117] border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              disabled={sending || isOverAttachmentLimit}
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
              title={lang === 'id' ? 'Lampirkan File (maks 10 MB)' : 'Attach File (max 10 MB)'}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2532] border border-slate-200 dark:border-[#2A303E] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {lang === 'id' ? 'Lampirkan' : 'Attach'}
              </span>
            </button>

            <button
              type="button"
              disabled={sending}
              onClick={onSaveDraft}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B24] hover:bg-slate-100 dark:hover:bg-[#1F2532] border border-slate-200 dark:border-[#2A303E] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Simpan Draf' : 'Save Draft'}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={sending}
            onClick={onDiscard}
            title={lang === 'id' ? 'Buang pesan ini' : 'Discard message'}
            aria-label={lang === 'id' ? 'Buang pesan' : 'Discard message'}
            className="min-h-[40px] px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-1 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'id' ? 'Buang' : 'Discard'}</span>
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
