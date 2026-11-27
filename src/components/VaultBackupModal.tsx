import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
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
  ANF_PBKDF2_ITERATIONS,
  clearMnemonicPinVault,
  CVP_PBKDF2_ITERATIONS,
  decryptVaultAuto,
  DEFAULT_PBKDF2_ITERATIONS,
  encryptVaultWithFormat,
  generateCipherVaultMnemonic,
  hasStoredMnemonicPinVault,
  isValidPinCode,
  parseEmlToMessage,
  parseMboxToMessages,
  saveMnemonicToPinVault,
  serializeToEml,
  serializeToMbox,
  triggerBrowserDownload,
  unlockMnemonicFromPinVault,
  type VaultEncryptedFormat,
  type VaultPackagingMode,
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
  const [exportFormat, setExportFormat] = useState<VaultEncryptedFormat>('anf');
  const [packagingMode, setPackagingMode] =
    useState<VaultPackagingMode>('standard');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [showImportPassphrase, setShowImportPassphrase] = useState(false);

  // 12-word Mnemonic + PIN Vault state
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [copiedMnemonic, setCopiedMnemonic] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [hasSavedPinVault, setHasSavedPinVault] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPassphrase('');
      setImportPassphrase('');
      setPinCode('');
      setCopiedMnemonic(false);
      return;
    }
    setHasSavedPinVault(hasStoredMnemonicPinVault(username));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, username]);

  if (!isOpen) return null;

  const resetMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const formatMeta: Record<
    VaultEncryptedFormat,
    {
      ext: string;
      badge: string;
      iterations: number;
      titleId: string;
      titleEn: string;
      descId: string;
      descEn: string;
    }
  > = {
    anf: {
      ext: '.anf',
      badge: 'vz-anf-v1 · VZ Ecosystem',
      iterations: ANF_PBKDF2_ITERATIONS,
      titleId: '.anf — Advanced/Archival Neural File (Standar Ekosistem VZ)',
      titleEn: '.anf — Advanced/Archival Neural File (VZ Ecosystem Standard)',
      descId:
        'Format enkripsi resmi ekosistem VZ yang dapat dibuka lintas layanan VZ seperti VZ Mail (mail.vz.gay) dan VZ Desk (desk.vz.gay). Mendukung mode Standard JSON dan Polyglot Stealth.',
      descEn:
        'Official VZ ecosystem archive format interoperable across VZ Mail (mail.vz.gay) and VZ Desk (desk.vz.gay). Supports Standard JSON and Polyglot Stealth modes.',
    },
    cvp: {
      ext: '.cvp',
      badge: 'CipherVault Pro v3',
      iterations: CVP_PBKDF2_ITERATIONS,
      titleId: '.cvp — Standar Bawaan CipherVault Pro',
      titleEn: '.cvp — Native CipherVault Pro Standard',
      descId:
        'Kompatibel langsung dengan mesin kriptografi CipherVault Pro (chipervaultro.app.vz.gay) untuk dekripsi dan inspeksi kontainer v3 (Standard JSON maupun Polyglot Stealth).',
      descEn:
        'Directly compatible with CipherVault Pro (chipervaultro.app.vz.gay) for v3 container encryption and inspection in both Standard JSON and Polyglot Stealth modes.',
    },
    enc: {
      ext: '.enc',
      badge: 'vz.myvault.enc.v1',
      iterations: DEFAULT_PBKDF2_ITERATIONS,
      titleId: '.enc — Standar Kompatibilitas Umum (MyVault JSON)',
      titleEn: '.enc — Universal Compatibility Standard (MyVault JSON)',
      descId:
        'Kontainer JSON AES-256-GCM + PBKDF2-SHA256 (310.000 iterasi) terbuka agar tetap kompatibel dengan utilitas dekripsi Web Crypto standar dan rilis VZ Mail sebelumnya.',
      descEn:
        'Open JSON AES-256-GCM + PBKDF2-SHA256 (310,000 iterations) container for broad compatibility with external Web Crypto decryption tools and legacy VZ Mail backups.',
    },
  };

  const activeFormatInfo = formatMeta[exportFormat];

  const handleGenerateMnemonic = () => {
    resetMessages();
    const phrase = generateCipherVaultMnemonic(12);
    setGeneratedMnemonic(phrase);
    setPassphrase(phrase);
    setImportPassphrase(phrase);
    setCopiedMnemonic(false);
    setStatusMessage(
      lang === 'id'
        ? 'Frasa kunci 12-kata CipherVault Pro berhasil dibuat dan diterapkan ke kolom kunci ekspor & impor.'
        : 'Generated a 12-word CipherVault Pro recovery phrase and applied it to export & import key fields.'
    );
  };

  const handleCopyMnemonic = async () => {
    const target = generatedMnemonic || passphrase;
    if (!target.trim()) return;
    try {
      await navigator.clipboard.writeText(target.trim());
      setCopiedMnemonic(true);
      setTimeout(() => setCopiedMnemonic(false), 2200);
    } catch {
      setErrorMessage(
        lang === 'id'
          ? 'Gagal menyalin frasa ke papan klip browser.'
          : 'Failed to copy phrase to clipboard.'
      );
    }
  };

  const handleSavePinVault = async () => {
    resetMessages();
    const phraseToSave = (generatedMnemonic || passphrase).trim();
    if (phraseToSave.length < 8) {
      setErrorMessage(
        lang === 'id'
          ? 'Buat frasa 12-kata atau isi kata sandi minimal 8 karakter terlebih dahulu sebelum mengunci dengan PIN.'
          : 'Generate a 12-word phrase or enter a passphrase (min 8 chars) before locking with a PIN.'
      );
      return;
    }
    if (!isValidPinCode(pinCode)) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan PIN 4 hingga 6 digit angka.'
          : 'Enter a 4 to 6 digit numeric PIN.'
      );
      return;
    }
    setBusy(true);
    try {
      await saveMnemonicToPinVault(phraseToSave, pinCode, username);
      setHasSavedPinVault(true);
      setStatusMessage(
        lang === 'id'
          ? 'Frasa kunci berhasil dienkripsi ke brankas PIN lokal perangkat ini (PBKDF2 150.000 iterasi).'
          : 'Recovery phrase encrypted into this device’s local PIN vault (PBKDF2 150,000 iterations).'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockPinVault = async () => {
    resetMessages();
    if (!isValidPinCode(pinCode)) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan PIN 4 hingga 6 digit angka untuk membuka brankas.'
          : 'Enter your 4 to 6 digit numeric PIN to unlock.'
      );
      return;
    }
    setBusy(true);
    try {
      const unlockedPhrase = await unlockMnemonicFromPinVault(pinCode, username);
      setGeneratedMnemonic(unlockedPhrase);
      setPassphrase(unlockedPhrase);
      setImportPassphrase(unlockedPhrase);
      setStatusMessage(
        lang === 'id'
          ? 'Brankas PIN terbuka! Frasa kunci otomatis diisi ke kolom ekspor & dekripsi.'
          : 'PIN vault unlocked! Recovery phrase populated into export & decryption fields.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClearPinVault = () => {
    clearMnemonicPinVault(username);
    setHasSavedPinVault(false);
    setPinCode('');
    setStatusMessage(
      lang === 'id'
        ? 'Brankas PIN lokal pada perangkat ini telah dihapus.'
        : 'Cleared local PIN vault from this device.'
    );
  };

  const handleExportMbox = async () => {
    resetMessages();
    setBusy(true);
    try {
      const msgs = await getMessagesForUser(username);
      if (msgs.length === 0) {
        setErrorMessage(
          lang === 'id'
            ? 'Belum ada pesan lokal untuk diekspor.'
            : 'No local messages available to export.'
        );
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
        setErrorMessage(
          lang === 'id'
            ? 'Belum ada pesan lokal untuk diekspor.'
            : 'No local messages available to export.'
        );
        return;
      }
      const eml = serializeToEml(msgs[0]);
      triggerBrowserDownload(`${msgs[0].id}.eml`, eml, 'message/rfc822');
      setStatusMessage(
        lang === 'id'
          ? 'Berhasil mengekspor pesan terbaru ke RFC 5322 (.eml).'
          : 'Exported latest email to RFC 5322 (.eml).'
      );
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportEncryptedVault = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (passphrase.trim().length < 8) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan kata sandi atau frasa 12-kata minimal 8 karakter.'
          : 'Please enter a passphrase or 12-word phrase of at least 8 characters.'
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

      const activeMode: VaultPackagingMode =
        exportFormat === 'enc' ? 'standard' : packagingMode;

      const artifact = await encryptVaultWithFormat(
        {
          ownerUser: username,
          exportedAt: new Date().toISOString(),
          messages,
          bioProfile,
          shortlinks,
        },
        passphrase.trim(),
        {
          format: exportFormat,
          packagingMode: activeMode,
        }
      );

      triggerBrowserDownload(
        artifact.filename,
        artifact.data,
        artifact.mimeType
      );

      const modeLabel =
        activeMode === 'standard'
          ? 'Standard JSON'
          : activeMode === 'polyglot_zip'
            ? 'Polyglot Stealth (ZIP Carrier)'
            : 'Polyglot Stealth (PDF Carrier)';

      setStatusMessage(
        lang === 'id'
          ? `Berhasil mengenkripsi ${messages.length} email + profil bio + shortlinks ke ${artifact.filename} (${activeFormatInfo.badge} · ${modeLabel} · PBKDF2 ${artifact.iterations.toLocaleString()} iterasi).`
          : `Encrypted ${messages.length} emails + bio profile + shortlinks into ${artifact.filename} (${activeFormatInfo.badge} · ${modeLabel} · PBKDF2 ${artifact.iterations.toLocaleString()} iterations).`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
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
      const lowerName = file.name.toLowerCase();
      const rawBuffer = await file.arrayBuffer();
      const rawBytes = new Uint8Array(rawBuffer);

      // Detect whether file has Polyglot signature even if renamed
      const rawTextPreview = new TextDecoder().decode(
        rawBytes.subarray(
          Math.max(0, rawBytes.byteLength - 4096),
          rawBytes.byteLength
        )
      );
      const isEncryptedVaultFile =
        lowerName.endsWith('.anf') ||
        lowerName.endsWith('.cvp') ||
        lowerName.endsWith('.enc') ||
        lowerName.endsWith('.json') ||
        rawTextPreview.includes('---VZ_ANF_v1_SIG---') ||
        rawTextPreview.includes('---CV_PRO_v3_SIG---');

      if (isEncryptedVaultFile) {
        const effectiveKey = (importPassphrase || passphrase).trim();
        if (!effectiveKey) {
          setErrorMessage(
            lang === 'id'
              ? 'Masukkan kata sandi atau frasa 12-kata dekripsi terlebih dahulu sebelum memilih berkas .anf / .cvp / .enc.'
              : 'Enter the decryption passphrase or 12-word key before selecting an .anf / .cvp / .enc file.'
          );
          return;
        }
        const result = await decryptVaultAuto(rawBytes, effectiveKey, username);
        const { payload, detectedFormat, detectedMode, iterations } = result;

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
        const fmtUpper = `.${detectedFormat.toUpperCase()}`;
        const modeDesc =
          detectedMode === 'polyglot' ? 'Polyglot Stealth' : 'Standard JSON';
        setStatusMessage(
          lang === 'id'
            ? `Berhasil mendekripsi & memulihkan ${payload.messages.length} email dari kontainer ${fmtUpper} (${modeDesc} · PBKDF2 ${iterations.toLocaleString()} iterasi)!`
            : `Decrypted & restored ${payload.messages.length} emails from ${fmtUpper} container (${modeDesc} · PBKDF2 ${iterations.toLocaleString()} iterations)!`
        );
      } else if (lowerName.endsWith('.mbox')) {
        const text = new TextDecoder().decode(rawBytes);
        const parsed = parseMboxToMessages(text, username);
        await saveMessagesBatch(parsed);
        onImported();
        setStatusMessage(
          lang === 'id'
            ? `Berhasil mengimpor ${parsed.length} email dari arsip .mbox ke IndexedDB lokal.`
            : `Imported ${parsed.length} emails from .mbox archive into local IndexedDB.`
        );
      } else if (lowerName.endsWith('.eml')) {
        const text = new TextDecoder().decode(rawBytes);
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
            ? 'Gunakan berkas berformat .anf, .cvp, .enc, .mbox, atau .eml.'
            : 'Please select a .anf, .cvp, .enc, .mbox, or .eml file.'
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setErrorMessage(
        lang === 'id'
          ? `Gagal mendekripsi atau memproses berkas. Pastikan kata sandi / frasa 12-kata benar dan format berkas valid.${detail ? ` (${detail})` : ''}`
          : `Failed to decrypt or process file. Verify your passphrase / 12-word phrase and file format.${detail ? ` (${detail})` : ''}`
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
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-3xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-[#232732] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <FileArchive className="w-4 h-4 shrink-0" />
              <span>VZ Ecosystem Neural Vault</span>
              <span aria-hidden="true">·</span>
              <span>CipherVault Pro Engine</span>
              <span aria-hidden="true">·</span>
              <span>.anf / .cvp / .enc</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Backup & Enkripsi Ekosistem VZ (.anf, .cvp, .enc, .mbox, .eml)'
                : 'VZ Ecosystem Encrypted Backup & Portability (.anf, .cvp, .enc, .mbox, .eml)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? 'Standar enkripsi lokal VZ Mail kini terintegrasi dengan arsitektur CipherVault Pro (chipervaultro.app.vz.gay) dan VZ Desk (desk.vz.gay) menggunakan format .anf (Advanced/Archival Neural File), ditambah opsi kompatibilitas .cvp dan .enc.'
                : 'VZ Mail local backup is powered by the CipherVault Pro (chipervaultro.app.vz.gay) and VZ Desk (desk.vz.gay) standard using .anf (Advanced/Archival Neural File), alongside .cvp and .enc compatibility.'}
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
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Section 01: Encrypted Ecosystem Vault (.anf / .cvp / .enc) */}
        <form
          onSubmit={handleExportEncryptedVault}
          className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                01.{' '}
                {lang === 'id'
                  ? 'Ekspor Vault Terenkripsi AES-256-GCM (.anf / .cvp / .enc)'
                  : 'AES-256-GCM Encrypted Vault Export (.anf / .cvp / .enc)'}
              </span>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              AES-256-GCM · PBKDF2-SHA256 ·{' '}
              {activeFormatInfo.iterations.toLocaleString()} iter
            </div>
          </div>

          {/* 3-Format Segmented Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['anf', 'cvp', 'enc'] as const).map((fmt) => {
              const active = exportFormat === fmt;
              const labelMap: Record<VaultEncryptedFormat, string> = {
                anf:
                  lang === 'id'
                    ? '.anf (Ekosistem VZ)'
                    : '.anf (VZ Ecosystem)',
                cvp: '.cvp (CipherVault Pro)',
                enc:
                  lang === 'id'
                    ? '.enc (Standar Umum)'
                    : '.enc (Standard JSON)',
              };
              const subMap: Record<VaultEncryptedFormat, string> = {
                anf: 'Mail & Desk · 200k iter',
                cvp: 'CipherVault v3 · 100k iter',
                enc: 'MyVault Compatible · 310k iter',
              };
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    setExportFormat(fmt);
                    if (fmt === 'enc') setPackagingMode('standard');
                  }}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#161B24] border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-white'
                      : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold font-mono flex items-center justify-between">
                    <span>{labelMap[fmt]}</span>
                    {fmt === 'anf' && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {subMap[fmt]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Format explanation */}
          <div className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              {lang === 'id'
                ? activeFormatInfo.titleId
                : activeFormatInfo.titleEn}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? activeFormatInfo.descId
                : activeFormatInfo.descEn}
            </p>

            {/* Standard JSON vs Polyglot Stealth mode selector for .anf and .cvp */}
            {exportFormat !== 'enc' && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#1E232D] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {lang === 'id'
                    ? 'Mode Kontainer (.anf / .cvp):'
                    : 'Container Mode (.anf / .cvp):'}
                </span>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0D11] rounded-lg border border-slate-200/80 dark:border-[#232732]">
                  {(
                    [
                      {
                        id: 'standard',
                        labelId: 'Standard JSON',
                        labelEn: 'Standard JSON',
                      },
                      {
                        id: 'polyglot_pdf',
                        labelId: 'Polyglot Stealth (PDF)',
                        labelEn: 'Polyglot Stealth (PDF)',
                      },
                      {
                        id: 'polyglot_zip',
                        labelId: 'Polyglot Stealth (ZIP)',
                        labelEn: 'Polyglot Stealth (ZIP)',
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPackagingMode(m.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        packagingMode === m.id
                          ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {lang === 'id' ? m.labelId : m.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 12-Word Mnemonic Generator & Local PIN Vault (CipherVault Pro & VZ Desk standard) */}
          <div className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  {lang === 'id'
                    ? 'Generator Frasa 12-Kata (Mnemonic CipherVault Pro) & Brankas PIN'
                    : '12-Word Recovery Phrase Generator (CipherVault Pro) & PIN Lock'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGenerateMnemonic}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>
                    {lang === 'id'
                      ? 'Buat Frasa 12-Kata'
                      : 'Generate 12-Word Phrase'}
                  </span>
                </button>
                {(generatedMnemonic || passphrase.trim().includes(' ')) && (
                  <button
                    type="button"
                    onClick={handleCopyMnemonic}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedMnemonic ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>
                      {copiedMnemonic
                        ? lang === 'id'
                          ? 'Tersalin'
                          : 'Copied'
                        : lang === 'id'
                          ? 'Salin Frasa'
                          : 'Copy Phrase'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {generatedMnemonic && (
              <div className="p-2.5 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] font-mono text-xs text-slate-800 dark:text-slate-200 leading-relaxed select-all">
                {generatedMnemonic}
              </div>
            )}

            {/* Local 4-6 Digit PIN Vault Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinCode}
                onChange={(e) =>
                  setPinCode(e.target.value.replace(/\D+/g, '').slice(0, 6))
                }
                placeholder={
                  lang === 'id'
                    ? 'PIN 4-6 digit (opsional)...'
                    : '4-6 digit PIN (optional)...'
                }
                className="sm:w-44 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSavePinVault}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] border border-slate-200 dark:border-[#2A303D] rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {lang === 'id' ? 'Simpan dengan PIN' : 'Lock Phrase with PIN'}
                  </span>
                </button>
                {hasSavedPinVault && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleUnlockPinVault}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900/60 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Unlock className="w-3 h-3" />
                      <span>
                        {lang === 'id' ? 'Buka dengan PIN' : 'Unlock with PIN'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleClearPinVault}
                      title={
                        lang === 'id'
                          ? 'Hapus brankas PIN lokal'
                          : 'Clear local PIN vault'
                      }
                      className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Passphrase Input & Submit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
            <div className="relative sm:col-span-2">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={
                  lang === 'id'
                    ? `Kata sandi kustom atau frasa 12-kata (${activeFormatInfo.ext})...`
                    : `Custom passphrase or 12-word phrase (${activeFormatInfo.ext})...`
                }
                className="w-full pl-3 pr-9 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((v) => !v)}
                aria-label="Toggle passphrase visibility"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassphrase ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {lang === 'id'
                  ? `Ekspor Vault (${activeFormatInfo.ext})`
                  : `Export Vault (${activeFormatInfo.ext})`}
              </span>
            </button>
          </div>
        </form>

        {/* Section 02 & 03 Grid: Standard Email Exports (.mbox / .eml) + Auto-Detect Restore */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Section 02: Open Email Client Standards (.mbox / .eml) */}
          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-white font-display">
              02.{' '}
              {lang === 'id'
                ? 'Ekspor Email Terbuka (.mbox / .eml)'
                : 'Standard Email Exports (.mbox / .eml)'}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {lang === 'id'
                ? 'Format terbuka RFC 5322 & Unix MBOX tanpa enkripsi kontainer yang kompatibel dengan Thunderbird, Apple Mail, dan klien desktop lainnya.'
                : 'Unencrypted open RFC 5322 & Unix MBOX standards compatible with Thunderbird, Apple Mail, and desktop clients.'}
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

          {/* Section 03: Universal Auto-Detect Import & Restore */}
          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                03.{' '}
                {lang === 'id'
                  ? 'Impor & Dekripsi Otomatis (.anf / .cvp / .enc / .mbox / .eml)'
                  : 'Auto-Detect Import & Restore (.anf / .cvp / .enc / .mbox / .eml)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {lang === 'id'
                ? 'Deteksi otomatis kontainer .anf (VZ Mail & VZ Desk), .cvp (CipherVault Pro v3), dan .enc (MyVault) baik mode Standard JSON maupun Polyglot Stealth.'
                : 'Automatically detects .anf (VZ Mail & VZ Desk), .cvp (CipherVault Pro v3), and .enc (MyVault) archives in both Standard JSON and Polyglot Stealth modes.'}
            </p>
            <div className="space-y-2">
              <div className="relative">
                <input
                  type={showImportPassphrase ? 'text' : 'password'}
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  placeholder={
                    lang === 'id'
                      ? 'Kata sandi atau frasa 12-kata dekripsi (.anf / .cvp / .enc)...'
                      : 'Decryption passphrase or 12-word phrase (.anf / .cvp / .enc)...'
                  }
                  className="w-full pl-3 pr-9 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowImportPassphrase((v) => !v)}
                  aria-label="Toggle import passphrase visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showImportPassphrase ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#191E28] border border-slate-300 dark:border-[#2E3646] hover:border-blue-500 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {lang === 'id'
                    ? 'Pilih Berkas (.anf / .cvp / .enc / .mbox / .eml)'
                    : 'Choose File (.anf / .cvp / .enc / .mbox / .eml)'}
                </span>
                <input
                  type="file"
                  accept=".anf,.cvp,.enc,.mbox,.eml,.json,.pdf,.zip"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
