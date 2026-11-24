import {
  CheckCircle2,
  Download,
  FileArchive,
  KeyRound,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import {
  getMessagesForUser,
  getOrSeedBioProfile,
  getOrSeedShortlinks,
  saveBioProfile,
  saveMessagesBatch,
  saveShortlink,
} from '../utils/localMailDb';
import {
  decryptVaultFromEnc,
  encryptVaultToEnc,
  parseEmlToMessage,
  parseMboxToMessages,
  serializeToEml,
  serializeToMbox,
  triggerBrowserDownload,
} from '../utils/mailVaultCrypto';

interface VaultBackupModalProps {
  isOpen: boolean;
  lang: Language;
  username: string;
  onClose: () => void;
  onImported: () => void;
}

export function VaultBackupModal({
  isOpen,
  lang,
  username,
  onClose,
  onImported,
}: VaultBackupModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPassphrase('');
      setImportPassphrase('');
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleExportMbox = async () => {
    resetMessages();
    setBusy(true);
    try {
      const msgs = await getMessagesForUser(username);
      if (msgs.length === 0) {
        setErrorMessage('Belum ada pesan lokal untuk diekspor.');
        return;
      }
      const mbox = serializeToMbox(msgs);
      triggerBrowserDownload(
        `vz-mail-${username}-${new Date().toISOString().slice(0, 10)}.mbox`,
        mbox,
        'application/mbox'
      );
      setStatusMessage(
        lang === 'id'
          ? `Berhasil mengekspor ${msgs.length} pesan ke format standar .mbox.`
          : `Exported ${msgs.length} messages to standard .mbox archive.`
      );
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportLatestEml = async () => {
    resetMessages();
    setBusy(true);
    try {
      const msgs = await getMessagesForUser(username);
      if (msgs.length === 0) {
        setErrorMessage('Belum ada pesan lokal untuk diekspor.');
        return;
      }
      const eml = serializeToEml(msgs[0]);
      triggerBrowserDownload(
        `${msgs[0].id}.eml`,
        eml,
        'message/rfc822'
      );
      setStatusMessage(
        lang === 'id'
          ? `Berhasil mengekspor pesan terbaru ke RFC 5322 (.eml).`
          : `Exported latest email to RFC 5322 (.eml).`
      );
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportEncryptedEnc = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (passphrase.trim().length < 8) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan kata sandi enkripsi minimal 8 karakter.'
          : 'Please enter an encryption passphrase of at least 8 characters.'
      );
      return;
    }

    setBusy(true);
    try {
      const [messages, bioProfile, shortlinks] = await Promise.all([
        getMessagesForUser(username),
        getOrSeedBioProfile(username),
        getOrSeedShortlinks(username),
      ]);

      const encJson = await encryptVaultToEnc(
        {
          ownerUser: username,
          exportedAt: new Date().toISOString(),
          messages,
          bioProfile,
          shortlinks,
        },
        passphrase.trim()
      );

      triggerBrowserDownload(
        `vz-myvault-${username}-${new Date().toISOString().slice(0, 10)}.enc`,
        encJson,
        'application/octet-stream'
      );

      setStatusMessage(
        lang === 'id'
          ? `Berhasil mengenkripsi ${messages.length} email + profil bio + shortlinks ke AES-256-GCM (.enc MyVault).`
          : `Encrypted ${messages.length} emails + bio profile + shortlinks into AES-256-GCM (.enc MyVault).`
      );
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    resetMessages();
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage(
        lang === 'id'
          ? 'Ukuran berkas terlalu besar (maksimum 25 MB).'
          : 'File exceeds the 25 MB browser import limit.'
      );
      e.target.value = '';
      return;
    }
    setBusy(true);

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.enc')) {
        if (!importPassphrase.trim()) {
          setErrorMessage(
            lang === 'id'
              ? 'Isi kata sandi dekripsi .enc terlebih dahulu sebelum memilih berkas .enc.'
              : 'Enter the .enc decryption passphrase before selecting the .enc file.'
          );
          return;
        }
        const payload = await decryptVaultFromEnc(
          text,
          importPassphrase.trim(),
          username
        );
        if (payload.messages && payload.messages.length > 0) {
          await saveMessagesBatch(payload.messages);
        }
        if (payload.bioProfile) {
          await saveBioProfile(payload.bioProfile);
        }
        if (payload.shortlinks) {
          for (const sl of payload.shortlinks) {
            await saveShortlink(sl);
          }
        }
        onImported();
        setStatusMessage(
          lang === 'id'
            ? `Berhasil mendekripsi & memulihkan ${payload.messages.length} email dari kontainer .enc MyVault!`
            : `Decrypted & restored ${payload.messages.length} emails from .enc MyVault container!`
        );
      } else if (lowerName.endsWith('.mbox')) {
        const parsed = parseMboxToMessages(text, username);
        await saveMessagesBatch(parsed);
        onImported();
        setStatusMessage(
          lang === 'id'
            ? `Berhasil mengimpor ${parsed.length} email dari arsip .mbox ke IndexedDB lokal.`
            : `Imported ${parsed.length} emails from .mbox archive into local IndexedDB.`
        );
      } else if (lowerName.endsWith('.eml')) {
        const parsed = parseEmlToMessage(text, username);
        await saveMessagesBatch([parsed]);
        onImported();
        setStatusMessage(
          lang === 'id'
            ? `Berhasil mengimpor berkas .eml ("${parsed.subject}") ke IndexedDB lokal.`
            : `Imported .eml file ("${parsed.subject}") into local IndexedDB.`
        );
      } else {
        setErrorMessage(
          lang === 'id'
            ? 'Gunakan berkas berformat .eml, .mbox, atau .enc.'
            : 'Please select a .eml, .mbox, or .enc file.'
        );
      }
    } catch {
      setErrorMessage(
        lang === 'id'
          ? 'Gagal memproses berkas. Pastikan kata sandi .enc benar atau format berkas valid.'
          : 'Failed to process file. Verify your .enc passphrase or file format.'
      );
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Local Vault Backup"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-[#232732] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <FileArchive className="w-4 h-4" />
              <span>Local-First Portability · MyVault Compatible</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Backup & Migrasi Perangkat (.eml, .mbox, .enc)'
                : 'Local Vault & Cross-Device Portability (.eml, .mbox, .enc)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? 'Karena VZ Mail tidak menyimpan kotak masuk di server, gunakan cadangan lokal ini untuk pindah perangkat atau diimpor ke Thunderbird.'
                : 'Because VZ Mail keeps zero server mailbox storage, use these portable archives to migrate between devices or import into desktop mail clients.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {/* Export Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-white font-display">
              01. Standard Email Exports (.eml / .mbox)
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {lang === 'id'
                ? 'Format terbuka RFC 5322 & Unix MBOX yang kompatibel dengan Thunderbird, Apple Mail, dan klien desktop lainnya.'
                : 'Open RFC 5322 & Unix MBOX standards compatible with Thunderbird, Apple Mail, and desktop clients.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleExportMbox}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Full Mailbox (.mbox)</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleExportLatestEml}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Latest Email (.eml)</span>
              </button>
            </div>
          </div>

          <form
            onSubmit={handleExportEncryptedEnc}
            className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3"
          >
            <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>02. MyVault AES-256-GCM (.enc)</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {lang === 'id'
                ? 'Enkripsi seluruh email lokal + profil bio + shortlink menggunakan Web Crypto API (PBKDF2 310k + AES-256-GCM).'
                : 'Encrypt all local emails + bio profile + shortlinks using browser Web Crypto API (PBKDF2 310k + AES-256-GCM).'}
            </p>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={
                lang === 'id'
                  ? 'Kata sandi enkripsi (.enc)...'
                  : 'Encryption passphrase (.enc)...'
              }
              className="w-full px-3 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Export Encrypted Vault (.enc)</span>
            </button>
          </form>
        </div>

        {/* Import / Restore Section */}
        <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
          <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              03. {lang === 'id' ? 'Impor & Pulihkan ke IndexedDB Lokal' : 'Import & Restore to Local IndexedDB'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <input
              type="password"
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.target.value)}
              placeholder={
                lang === 'id'
                  ? 'Kata sandi dekripsi (khusus berkas .enc)'
                  : 'Decryption passphrase (required for .enc)'
              }
              className="px-3 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
            />
            <label className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#191E28] border border-slate-300 dark:border-[#2E3646] hover:border-blue-500 rounded-lg cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {lang === 'id'
                  ? 'Pilih Berkas (.eml / .mbox / .enc)'
                  : 'Choose File (.eml / .mbox / .enc)'}
              </span>
              <input
                type="file"
                accept=".eml,.mbox,.enc,.json"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
