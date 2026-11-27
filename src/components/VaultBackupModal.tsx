import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  KeyRound,
  Lock,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import { copyTextSafely } from '../utils/clipboard';
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
  changeVaultPinLock,
  clearMnemonicPinVault,
  CVP_PBKDF2_ITERATIONS,
  decryptVaultAuto,
  DEFAULT_PBKDF2_ITERATIONS,
  disableVaultPinLock,
  encryptVaultWithFormat,
  generateCipherVaultMnemonic,
  getVaultPinLockConfig,
  getVaultPinLockFailedAttempts,
  hasStoredMnemonicPinVault,
  isValidPinCode,
  parseEmlToMessage,
  parseMboxToMessages,
  saveMnemonicToPinVault,
  serializeToEml,
  serializeToMbox,
  setVaultFirstSetupPreference,
  setupVaultPinLock,
  triggerBrowserDownload,
  unlockMnemonicFromPinVault,
  updateVaultPinLockSettings,
  VAULT_PIN_LOCK_MAX_ATTEMPTS,
  verifyVaultPinLock,
  type VaultAutoLockMinutes,
  type VaultEncryptedFormat,
  type VaultPackagingMode,
  type VaultPinLockConfig,
  type VaultPinLockMode,
} from '../utils/mailVaultCrypto';

interface VaultBackupModalProps {
  isOpen: boolean;
  lang: Language;
  username: string;
  onClose: () => void;
  onImported: () => void;
}

interface PendingSensitiveAction {
  labelId: string;
  labelEn: string;
  execute: () => void | Promise<void>;
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

  // 12-word Mnemonic + Local Phrase PIN Vault state
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [copiedMnemonic, setCopiedMnemonic] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [hasSavedPinVault, setHasSavedPinVault] = useState(false);

  // VZ Vault 3-Mode Opt-In PIN Lock state
  const [pinConfig, setPinConfig] = useState<VaultPinLockConfig>(() =>
    getVaultPinLockConfig(username)
  );
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Mode 3 First-Open Setup & Settings Panel form state
  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const [setupMode, setSetupMode] =
    useState<Exclude<VaultPinLockMode, 'off'>>('full_vault_autolock');
  const [setupAutoLock, setSetupAutoLock] = useState<VaultAutoLockMinutes>(5);
  const [setupLockOnTabHidden, setSetupLockOnTabHidden] = useState(true);
  const [setupRequireFirst, setSetupRequireFirst] = useState(true);
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');

  // Change / Disable PIN state
  const [currentPinForManage, setCurrentPinForManage] = useState('');
  const [nextPinForChange, setNextPinForChange] = useState('');
  const [confirmPinForChange, setConfirmPinForChange] = useState('');

  // Mode 2 Sensitive Action PIN Gate state
  const [pendingSensitive, setPendingSensitive] =
    useState<PendingSensitiveAction | null>(null);
  const [sensitivePinInput, setSensitivePinInput] = useState('');
  const [sensitivePinError, setSensitivePinError] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const clearSensitiveSecretsInMemory = useCallback(() => {
    setPassphrase('');
    setImportPassphrase('');
    setGeneratedMnemonic('');
    setPinCode('');
    setCopiedMnemonic(false);
    setUnlockPinInput('');
    setSensitivePinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setCurrentPinForManage('');
    setNextPinForChange('');
    setConfirmPinForChange('');
    setPendingSensitive(null);
    setSensitivePinError(null);
  }, []);

  const lockVaultNow = useCallback(
    (reason?: string) => {
      setVaultUnlocked(false);
      setPinSettingsOpen(false);
      clearSensitiveSecretsInMemory();
      if (reason) {
        setUnlockError(null);
        setStatusMessage(reason);
      }
    },
    [clearSensitiveSecretsInMemory]
  );

  // Sync PIN configuration whenever modal opens/closes or user changes
  useEffect(() => {
    if (!isOpen) {
      setVaultUnlocked(false);
      setPinSettingsOpen(false);
      setUnlockError(null);
      setStatusMessage(null);
      setErrorMessage(null);
      clearSensitiveSecretsInMemory();
      return;
    }

    const loaded = getVaultPinLockConfig(username);
    setPinConfig(loaded);
    setSetupMode(
      loaded.mode === 'sensitive_actions'
        ? 'sensitive_actions'
        : 'full_vault_autolock'
    );
    setSetupAutoLock(loaded.autoLockMinutes);
    setSetupLockOnTabHidden(loaded.lockOnTabHidden);
    setSetupRequireFirst(loaded.requireFirstSetup);
    setFailedAttempts(getVaultPinLockFailedAttempts(username));
    setHasSavedPinVault(hasStoredMnemonicPinVault(username));
    setVaultUnlocked(!(loaded.enabled && loaded.mode === 'full_vault_autolock'));
    setUnlockError(null);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingSensitive) {
          setPendingSensitive(null);
          setSensitivePinInput('');
          setSensitivePinError(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, username, clearSensitiveSecretsInMemory, pendingSensitive]);

  // Mode 1: Idle Auto-Lock & Visibility Auto-Lock while Full Vault is unlocked
  useEffect(() => {
    if (
      !isOpen ||
      !pinConfig.enabled ||
      pinConfig.mode !== 'full_vault_autolock' ||
      !vaultUnlocked
    ) {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const timeoutMs = pinConfig.autoLockMinutes * 60 * 1000;
    const armIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        lockVaultNow(
          lang === 'id'
            ? `VZ Vault dikunci otomatis setelah ${pinConfig.autoLockMinutes} menit tidak aktif.`
            : `VZ Vault auto-locked after ${pinConfig.autoLockMinutes} minutes of inactivity.`
        );
      }, timeoutMs);
    };

    armIdleTimer();

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, armIdleTimer, { passive: true });
    }

    const onVisibilityChange = () => {
      if (pinConfig.lockOnTabHidden && document.visibilityState === 'hidden') {
        lockVaultNow(
          lang === 'id'
            ? 'VZ Vault dikunci otomatis saat tab browser disembunyikan.'
            : 'VZ Vault auto-locked when the browser tab was hidden.'
        );
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      for (const evt of activityEvents) {
        window.removeEventListener(evt, armIdleTimer);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    isOpen,
    pinConfig.enabled,
    pinConfig.mode,
    pinConfig.autoLockMinutes,
    pinConfig.lockOnTabHidden,
    vaultUnlocked,
    lang,
    lockVaultNow,
  ]);

  if (!isOpen) return null;

  const resetMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const showFirstOpenSetup =
    !pinConfig.enabled &&
    pinConfig.requireFirstSetup &&
    !pinConfig.firstSetupDismissed;

  const showFullLockScreen =
    pinConfig.enabled &&
    pinConfig.mode === 'full_vault_autolock' &&
    !vaultUnlocked;

  const requiresSensitivePinGate =
    pinConfig.enabled && pinConfig.mode === 'sensitive_actions';

  const runWithSensitivePinGate = (
    labelId: string,
    labelEn: string,
    execute: () => void | Promise<void>
  ) => {
    if (!requiresSensitivePinGate) {
      void execute();
      return;
    }
    setSensitivePinInput('');
    setSensitivePinError(null);
    setPendingSensitive({ labelId, labelEn, execute });
  };

  const handleUnlockFullVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setBusy(true);
    try {
      const res = await verifyVaultPinLock(username, unlockPinInput);
      if (res.ok) {
        setVaultUnlocked(true);
        setUnlockPinInput('');
        setFailedAttempts(0);
        setStatusMessage(
          lang === 'id'
            ? 'VZ Vault terbuka. Auto-lock aktif sesuai pengaturan Anda.'
            : 'VZ Vault unlocked. Auto-lock timer is active.'
        );
      } else {
        setUnlockError(res.error);
        setFailedAttempts(getVaultPinLockFailedAttempts(username));
        setUnlockPinInput('');
        if (res.wiped) {
          const updated = getVaultPinLockConfig(username);
          setPinConfig(updated);
          setHasSavedPinVault(hasStoredMnemonicPinVault(username));
          setVaultUnlocked(true);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSensitivePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSensitive) return;
    setSensitivePinError(null);
    setBusy(true);
    try {
      const res = await verifyVaultPinLock(username, sensitivePinInput);
      if (res.ok) {
        const action = pendingSensitive.execute;
        setPendingSensitive(null);
        setSensitivePinInput('');
        setFailedAttempts(0);
        await action();
      } else {
        setSensitivePinError(res.error);
        setFailedAttempts(getVaultPinLockFailedAttempts(username));
        setSensitivePinInput('');
        if (res.wiped) {
          const updated = getVaultPinLockConfig(username);
          setPinConfig(updated);
          setHasSavedPinVault(hasStoredMnemonicPinVault(username));
          setPendingSensitive(null);
          setErrorMessage(res.error);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVaultPin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!isValidPinCode(newPinInput)) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan PIN baru 4 hingga 6 digit angka.'
          : 'Enter a new 4 to 6 digit numeric PIN.'
      );
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setErrorMessage(
        lang === 'id'
          ? 'Konfirmasi PIN tidak cocok. Silakan periksa kembali.'
          : 'PIN confirmation does not match.'
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await setupVaultPinLock(username, newPinInput, {
        mode: setupMode,
        autoLockMinutes: setupAutoLock,
        lockOnTabHidden: setupLockOnTabHidden,
        requireFirstSetup: setupRequireFirst,
      });
      setPinConfig(saved);
      setVaultUnlocked(true);
      setPinSettingsOpen(false);
      setNewPinInput('');
      setConfirmPinInput('');
      setFailedAttempts(0);
      setStatusMessage(
        lang === 'id'
          ? saved.mode === 'full_vault_autolock'
            ? `Kunci PIN VZ Vault aktif (Mode Layar Kunci Penuh · Auto-Lock ${saved.autoLockMinutes} menit).`
            : 'Kunci PIN VZ Vault aktif (Mode Aksi Sensitif: Ekspor, Impor & Frasa 12-Kata).'
          : saved.mode === 'full_vault_autolock'
            ? `VZ Vault PIN Lock enabled (Full Lock Screen · Auto-Lock ${saved.autoLockMinutes}m).`
            : 'VZ Vault PIN Lock enabled (Sensitive Actions Gate: Export, Import & 12-Word Phrase).'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSkipFirstSetup = () => {
    const updated = setVaultFirstSetupPreference(username, {
      firstSetupDismissed: true,
    });
    setPinConfig(updated);
    setVaultUnlocked(true);
    setStatusMessage(
      lang === 'id'
        ? 'Anda dapat mengaktifkan Kunci PIN VZ Vault kapan saja melalui tombol "Kunci PIN" di kanan atas.'
        : 'You can enable VZ Vault PIN Lock anytime via the "PIN Lock" button in the header.'
    );
  };

  const handleUpdatePinSettings = (
    patch: Partial<
      Pick<
        VaultPinLockConfig,
        'mode' | 'autoLockMinutes' | 'lockOnTabHidden' | 'requireFirstSetup'
      >
    >
  ) => {
    resetMessages();
    const updated = updateVaultPinLockSettings(username, patch);
    setPinConfig(updated);
    setSetupAutoLock(updated.autoLockMinutes);
    setSetupLockOnTabHidden(updated.lockOnTabHidden);
    setSetupRequireFirst(updated.requireFirstSetup);
    setStatusMessage(
      lang === 'id'
        ? 'Pengaturan Kunci PIN VZ Vault berhasil diperbarui.'
        : 'VZ Vault PIN Lock settings updated.'
    );
  };

  const handleChangeExistingPin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!isValidPinCode(nextPinForChange)) {
      setErrorMessage(
        lang === 'id'
          ? 'PIN baru harus 4 hingga 6 digit angka.'
          : 'New PIN must be 4 to 6 numeric digits.'
      );
      return;
    }
    if (nextPinForChange !== confirmPinForChange) {
      setErrorMessage(
        lang === 'id'
          ? 'Konfirmasi PIN baru tidak cocok.'
          : 'New PIN confirmation does not match.'
      );
      return;
    }
    setBusy(true);
    try {
      const updated = await changeVaultPinLock(
        username,
        currentPinForManage,
        nextPinForChange
      );
      setPinConfig(updated);
      setCurrentPinForManage('');
      setNextPinForChange('');
      setConfirmPinForChange('');
      setStatusMessage(
        lang === 'id'
          ? 'PIN VZ Vault berhasil diperbarui dengan PBKDF2-SHA256.'
          : 'VZ Vault PIN updated with PBKDF2-SHA256.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setFailedAttempts(getVaultPinLockFailedAttempts(username));
      const latest = getVaultPinLockConfig(username);
      setPinConfig(latest);
      setHasSavedPinVault(hasStoredMnemonicPinVault(username));
    } finally {
      setBusy(false);
    }
  };

  const handleDisableExistingPin = async () => {
    resetMessages();
    if (!isValidPinCode(currentPinForManage)) {
      setErrorMessage(
        lang === 'id'
          ? 'Masukkan PIN saat ini terlebih dahulu untuk menonaktifkan Kunci PIN.'
          : 'Enter your current PIN first to disable PIN Lock.'
      );
      return;
    }
    setBusy(true);
    try {
      const updated = await disableVaultPinLock(username, currentPinForManage);
      setPinConfig(updated);
      setVaultUnlocked(true);
      setCurrentPinForManage('');
      setNextPinForChange('');
      setConfirmPinForChange('');
      setPinSettingsOpen(false);
      setStatusMessage(
        lang === 'id'
          ? 'Kunci PIN VZ Vault telah dinonaktifkan pada perangkat ini.'
          : 'VZ Vault PIN Lock has been disabled on this device.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setFailedAttempts(getVaultPinLockFailedAttempts(username));
      const latest = getVaultPinLockConfig(username);
      setPinConfig(latest);
      setHasSavedPinVault(hasStoredMnemonicPinVault(username));
    } finally {
      setBusy(false);
    }
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

  const executeGenerateMnemonic = () => {
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

  const handleGenerateMnemonic = () => {
    runWithSensitivePinGate(
      'Buat Frasa 12-Kata Baru',
      'Generate New 12-Word Phrase',
      executeGenerateMnemonic
    );
  };

  const executeCopyMnemonic = async () => {
    const target = generatedMnemonic || passphrase;
    if (!target.trim()) return;
    const copied = await copyTextSafely(target.trim());
    if (copied) {
      setCopiedMnemonic(true);
      setTimeout(() => setCopiedMnemonic(false), 2200);
    } else {
      setErrorMessage(
        lang === 'id'
          ? 'Gagal menyalin frasa ke papan klip browser.'
          : 'Failed to copy phrase to clipboard.'
      );
    }
  };

  const handleCopyMnemonic = () => {
    runWithSensitivePinGate(
      'Salin Frasa 12-Kata',
      'Copy 12-Word Recovery Phrase',
      executeCopyMnemonic
    );
  };

  const executeSavePinVault = async () => {
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

  const handleSavePinVault = () => {
    runWithSensitivePinGate(
      'Simpan Frasa 12-Kata ke Brankas PIN',
      'Save 12-Word Phrase to PIN Vault',
      executeSavePinVault
    );
  };

  const executeUnlockPinVault = async () => {
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
      setHasSavedPinVault(hasStoredMnemonicPinVault(username));
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockPinVault = () => {
    runWithSensitivePinGate(
      'Buka Frasa 12-Kata Tersimpan',
      'Unlock Stored 12-Word Phrase',
      executeUnlockPinVault
    );
  };

  const executeClearPinVault = () => {
    clearMnemonicPinVault(username);
    setHasSavedPinVault(false);
    setPinCode('');
    setStatusMessage(
      lang === 'id'
        ? 'Brankas PIN lokal pada perangkat ini telah dihapus.'
        : 'Cleared local PIN vault from this device.'
    );
  };

  const handleClearPinVault = () => {
    runWithSensitivePinGate(
      'Hapus Brankas Frasa PIN Lokal',
      'Clear Local Phrase PIN Vault',
      executeClearPinVault
    );
  };

  const executeExportMbox = async () => {
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

  const handleExportMbox = () => {
    runWithSensitivePinGate(
      'Ekspor Seluruh Mailbox (.mbox)',
      'Export Full Mailbox (.mbox)',
      executeExportMbox
    );
  };

  const executeExportLatestEml = async () => {
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

  const handleExportLatestEml = () => {
    runWithSensitivePinGate(
      'Ekspor Email Terbaru (.eml)',
      'Export Latest Email (.eml)',
      executeExportLatestEml
    );
  };

  const executeExportEncryptedVault = async () => {
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

  const handleExportEncryptedVault = (e: React.FormEvent) => {
    e.preventDefault();
    runWithSensitivePinGate(
      `Ekspor Vault Terenkripsi (${activeFormatInfo.ext})`,
      `Export Encrypted Vault (${activeFormatInfo.ext})`,
      executeExportEncryptedVault
    );
  };

  const handleTriggerImportFilePicker = () => {
    runWithSensitivePinGate(
      'Impor & Pulihkan Berkas Vault',
      'Import & Restore Vault File',
      () => {
        importFileInputRef.current?.click();
      }
    );
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

  const pinModeSummary = !pinConfig.enabled
    ? lang === 'id'
      ? 'Kunci PIN: Nonaktif'
      : 'PIN Lock: Off'
    : pinConfig.mode === 'full_vault_autolock'
      ? lang === 'id'
        ? `PIN Penuh · Auto-Lock ${pinConfig.autoLockMinutes}m`
        : `Full PIN · Auto-Lock ${pinConfig.autoLockMinutes}m`
      : lang === 'id'
        ? 'PIN Aksi Sensitif'
        : 'Sensitive Action PIN';

  const remainingAttempts = Math.max(
    1,
    VAULT_PIN_LOCK_MAX_ATTEMPTS - failedAttempts
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Local Vault Backup"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-4"
    >
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-3xl w-full p-4 sm:p-6 space-y-5 max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#232732] pb-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <FileArchive className="w-4 h-4 shrink-0" />
              <span>VZ Ecosystem Neural Vault</span>
              <span aria-hidden="true">·</span>
              <span>.anf / .cvp / .enc</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
              {lang === 'id'
                ? 'Backup & Enkripsi Ekosistem VZ'
                : 'VZ Ecosystem Encrypted Backup & Vault'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {lang === 'id'
                ? 'Standar enkripsi lokal VZ Mail terintegrasi dengan CipherVault Pro & VZ Desk (.anf, .cvp, .enc) dengan proteksi Kunci PIN lokal opsional (PBKDF2-SHA256).'
                : 'VZ Mail local backup powered by the CipherVault Pro & VZ Desk standard (.anf, .cvp, .enc) with opt-in local PIN protection (PBKDF2-SHA256).'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!showFullLockScreen && !showFirstOpenSetup && (
              <>
                {pinConfig.enabled &&
                  pinConfig.mode === 'full_vault_autolock' &&
                  vaultUnlocked && (
                    <button
                      type="button"
                      onClick={() =>
                        lockVaultNow(
                          lang === 'id'
                            ? 'VZ Vault dikunci secara manual.'
                            : 'VZ Vault locked manually.'
                        )
                      }
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/70 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {lang === 'id' ? 'Kunci Vault' : 'Lock Vault'}
                      </span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setPinSettingsOpen((v) => !v)}
                  className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    pinConfig.enabled
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                      : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] border-slate-200 dark:border-[#2A303D] hover:bg-slate-200 dark:hover:bg-[#232A38]'
                  }`}
                >
                  <Settings2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{pinModeSummary}</span>
                  <span className="sm:hidden">PIN</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'id' ? 'Tutup VZ Vault' : 'Close VZ Vault'}
              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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

        {/* ================================================================ */}
        {/* MODE 1: FULL-VAULT PIN LOCK SCREEN                               */}
        {/* ================================================================ */}
        {showFullLockScreen ? (
          <form
            onSubmit={handleUnlockFullVault}
            className="p-5 sm:p-7 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] max-w-md mx-auto text-center space-y-4"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                {lang === 'id' ? 'VZ Vault Terkunci' : 'VZ Vault Locked'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'id'
                  ? `Masukkan PIN 4–6 digit untuk membuka modul VZ Vault milik @${username}. Auto-lock aktif (${pinConfig.autoLockMinutes} menit).`
                  : `Enter your 4–6 digit PIN to unlock VZ Vault for @${username}. Auto-lock is active (${pinConfig.autoLockMinutes}m).`}
              </p>
            </div>

            {unlockError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 text-left">
                {unlockError}
              </div>
            )}

            <div className="space-y-2.5">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                value={unlockPinInput}
                onChange={(e) =>
                  setUnlockPinInput(e.target.value.replace(/\D+/g, '').slice(0, 6))
                }
                placeholder={
                  lang === 'id' ? 'Masukkan PIN (4–6 digit)...' : 'Enter 4–6 digit PIN...'
                }
                className="w-full px-4 py-3 text-center text-base tracking-[0.4em] font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || unlockPinInput.length < 4}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>
                  {busy
                    ? lang === 'id'
                      ? 'Memverifikasi...'
                      : 'Verifying...'
                    : lang === 'id'
                      ? 'Buka VZ Vault'
                      : 'Unlock VZ Vault'}
                </span>
              </button>
            </div>

            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {lang === 'id'
                ? `PBKDF2-SHA256 lokal · Sisa ${remainingAttempts} dari ${VAULT_PIN_LOCK_MAX_ATTEMPTS} percobaan sebelum auto-reset`
                : `Local PBKDF2-SHA256 · ${remainingAttempts} of ${VAULT_PIN_LOCK_MAX_ATTEMPTS} attempts before auto-reset`}
            </div>
          </form>
        ) : showFirstOpenSetup ? (
          /* ================================================================ */
          /* MODE 3: OPT-IN FIRST-OPEN PIN SETUP PROMPT                       */
          /* ================================================================ */
          <form
            onSubmit={handleCreateVaultPin}
            className="p-4 sm:p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'id'
                    ? 'Lindungi VZ Vault dengan Kunci PIN Lokal (Opt-In)'
                    : 'Protect VZ Vault with a Local PIN Lock (Opt-In)'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {lang === 'id'
                    ? 'Cegah akses tidak sah saat perangkat Anda dipakai orang lain. PIN tidak pernah disimpan dalam teks biasa — hanya verifier PBKDF2-SHA256 150.000 iterasi dengan auto-reset setelah 5x salah.'
                    : 'Prevent unauthorized local access on shared devices. Your PIN is never stored in plaintext — only a 150,000-iteration PBKDF2-SHA256 verifier with 5-attempt auto-wipe.'}
                </p>
              </div>
            </div>

            {/* Mode Picker (Mode 1 vs Mode 2) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSetupMode('full_vault_autolock')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  setupMode === 'full_vault_autolock'
                    ? 'bg-white dark:bg-[#161B24] border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-white'
                    : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {lang === 'id'
                      ? '1. Layar Kunci Penuh + Auto-Lock'
                      : '1. Full Vault Lock + Auto-Lock'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {lang === 'id'
                    ? 'Meminta PIN setiap kali VZ Vault dibuka dan mengunci otomatis saat idle atau pindah tab.'
                    : 'Requires PIN whenever VZ Vault opens and auto-locks on idle or tab switch.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSetupMode('sensitive_actions')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  setupMode === 'sensitive_actions'
                    ? 'bg-white dark:bg-[#161B24] border-emerald-600 dark:border-emerald-500 text-slate-900 dark:text-white'
                    : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>
                    {lang === 'id'
                      ? '2. PIN Khusus Aksi Sensitif'
                      : '2. Sensitive Actions PIN Gate'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {lang === 'id'
                    ? 'Vault langsung terbuka, tetapi PIN diminta sebelum Ekspor, Impor/Restore, atau akses Frasa 12-Kata.'
                    : 'Opens Vault directly, prompting for PIN before Export, Import/Restore, or 12-Word Phrase actions.'}
                </p>
              </button>
            </div>

            {setupMode === 'full_vault_autolock' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732]">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {lang === 'id' ? 'Timer Auto-Lock:' : 'Auto-Lock Timer:'}
                  </span>
                  <div className="flex items-center gap-1">
                    {([1, 5, 15] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSetupAutoLock(m)}
                        className={`px-2 py-1 text-[11px] font-mono rounded-md border cursor-pointer ${
                          setupAutoLock === m
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-[#0B0D11] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2A303D]'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setupLockOnTabHidden}
                    onChange={(e) => setSetupLockOnTabHidden(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>
                    {lang === 'id'
                      ? 'Kunci saat pindah tab'
                      : 'Lock on tab switch'}
                  </span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={newPinInput}
                onChange={(e) =>
                  setNewPinInput(e.target.value.replace(/\D+/g, '').slice(0, 6))
                }
                placeholder={
                  lang === 'id'
                    ? 'Buat PIN baru (4–6 digit)...'
                    : 'Create PIN (4–6 digits)...'
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
              />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={confirmPinInput}
                onChange={(e) =>
                  setConfirmPinInput(
                    e.target.value.replace(/\D+/g, '').slice(0, 6)
                  )
                }
                placeholder={
                  lang === 'id' ? 'Konfirmasi PIN...' : 'Confirm PIN...'
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={setupRequireFirst}
                onChange={(e) => setSetupRequireFirst(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>
                {lang === 'id'
                  ? '3. Tampilkan panduan buat PIN saat pertama kali membuka VZ Vault jika PIN belum diatur'
                  : '3. Prompt to create a PIN on first open when no PIN is configured'}
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleSkipFirstSetup}
                className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161B24] border border-slate-200 dark:border-[#2A303D] hover:bg-slate-100 dark:hover:bg-[#1E2430] rounded-lg cursor-pointer"
              >
                {lang === 'id'
                  ? 'Lewati untuk Sekarang (Tanpa PIN)'
                  : 'Skip for Now (No PIN)'}
              </button>
              <button
                type="submit"
                disabled={busy || newPinInput.length < 4}
                className="min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {lang === 'id'
                    ? 'Aktifkan Kunci PIN VZ Vault'
                    : 'Enable VZ Vault PIN Lock'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* ============================================================== */}
            {/* MODE 2: INLINE SENSITIVE ACTION PIN VERIFICATION GATE          */}
            {/* ============================================================== */}
            {pendingSensitive && (
              <form
                onSubmit={handleConfirmSensitivePin}
                className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/80 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-amber-950 dark:text-amber-100">
                        {lang === 'id'
                          ? `Verifikasi PIN diperlukan: ${pendingSensitive.labelId}`
                          : `PIN verification required: ${pendingSensitive.labelEn}`}
                      </div>
                      <p className="text-[11px] text-amber-800 dark:text-amber-200/90">
                        {lang === 'id'
                          ? `Masukkan PIN VZ Vault 4–6 digit Anda untuk melanjutkan (sisa ${remainingAttempts} percobaan).`
                          : `Enter your 4–6 digit VZ Vault PIN to proceed (${remainingAttempts} attempts remaining).`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSensitive(null);
                      setSensitivePinInput('');
                      setSensitivePinError(null);
                    }}
                    className="text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {sensitivePinError && (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300">
                    {sensitivePinError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    maxLength={6}
                    value={sensitivePinInput}
                    onChange={(e) =>
                      setSensitivePinInput(
                        e.target.value.replace(/\D+/g, '').slice(0, 6)
                      )
                    }
                    placeholder={
                      lang === 'id'
                        ? 'PIN VZ Vault (4–6 digit)...'
                        : 'VZ Vault PIN (4–6 digits)...'
                    }
                    className="sm:w-52 px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-amber-300 dark:border-amber-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={busy || sensitivePinInput.length < 4}
                    className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'id'
                        ? 'Verifikasi & Lanjutkan'
                        : 'Verify & Continue'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* ============================================================== */}
            {/* COLLAPSIBLE VZ VAULT PIN LOCK SETTINGS PANEL                   */}
            {/* ============================================================== */}
            {pinSettingsOpen && (
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {lang === 'id'
                        ? 'Pengaturan Kunci PIN VZ Vault (3 Opsi Opt-In)'
                        : 'VZ Vault PIN Lock Settings (3 Opt-In Options)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPinSettingsOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    {lang === 'id' ? 'Tutup' : 'Close'}
                  </button>
                </div>

                {!pinConfig.enabled ? (
                  <form onSubmit={handleCreateVaultPin} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSetupMode('full_vault_autolock')}
                        className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                          setupMode === 'full_vault_autolock'
                            ? 'bg-white dark:bg-[#161B24] border-emerald-600 text-slate-900 dark:text-white font-semibold'
                            : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {lang === 'id'
                          ? '1. Layar Kunci Penuh + Auto-Lock'
                          : '1. Full Lock Screen + Auto-Lock'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSetupMode('sensitive_actions')}
                        className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                          setupMode === 'sensitive_actions'
                            ? 'bg-white dark:bg-[#161B24] border-emerald-600 text-slate-900 dark:text-white font-semibold'
                            : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {lang === 'id'
                          ? '2. Kunci PIN Aksi Sensitif'
                          : '2. Sensitive Actions PIN Gate'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        value={newPinInput}
                        onChange={(e) =>
                          setNewPinInput(
                            e.target.value.replace(/\D+/g, '').slice(0, 6)
                          )
                        }
                        placeholder={
                          lang === 'id' ? 'PIN baru (4–6 digit)' : 'New PIN (4–6 digits)'
                        }
                        className="px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        value={confirmPinInput}
                        onChange={(e) =>
                          setConfirmPinInput(
                            e.target.value.replace(/\D+/g, '').slice(0, 6)
                          )
                        }
                        placeholder={
                          lang === 'id' ? 'Konfirmasi PIN' : 'Confirm PIN'
                        }
                        className="px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={busy || newPinInput.length < 4}
                        className="min-h-[38px] px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        {lang === 'id' ? 'Aktifkan PIN' : 'Enable PIN'}
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pinConfig.requireFirstSetup}
                        onChange={(e) =>
                          handleUpdatePinSettings({
                            requireFirstSetup: e.target.checked,
                          })
                        }
                        className="rounded border-slate-300"
                      />
                      <span>
                        {lang === 'id'
                          ? '3. Wajib tampilkan panduan buat PIN saat pertama kali buka VZ Vault'
                          : '3. Require first-open PIN creation prompt when unconfigured'}
                      </span>
                    </label>
                  </form>
                ) : (
                  <div className="space-y-3">
                    {/* Active Mode Switcher */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdatePinSettings({ mode: 'full_vault_autolock' })
                        }
                        className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                          pinConfig.mode === 'full_vault_autolock'
                            ? 'bg-white dark:bg-[#161B24] border-emerald-600 text-slate-900 dark:text-white font-semibold'
                            : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {lang === 'id'
                          ? '1. Layar Kunci Penuh + Auto-Lock'
                          : '1. Full Lock Screen + Auto-Lock'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdatePinSettings({ mode: 'sensitive_actions' })
                        }
                        className={`p-2.5 rounded-lg border text-left text-xs cursor-pointer ${
                          pinConfig.mode === 'sensitive_actions'
                            ? 'bg-white dark:bg-[#161B24] border-emerald-600 text-slate-900 dark:text-white font-semibold'
                            : 'bg-white/60 dark:bg-[#13161C] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {lang === 'id'
                          ? '2. PIN Khusus Aksi Sensitif'
                          : '2. Sensitive Actions PIN Gate'}
                      </button>
                    </div>

                    {pinConfig.mode === 'full_vault_autolock' && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732]">
                        <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Auto-Lock:</span>
                          {([1, 5, 15] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() =>
                                handleUpdatePinSettings({ autoLockMinutes: m })
                              }
                              className={`px-2 py-0.5 text-[11px] font-mono rounded border cursor-pointer ${
                                pinConfig.autoLockMinutes === m
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 dark:bg-[#0B0D11] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2A303D]'
                              }`}
                            >
                              {m}m
                            </button>
                          ))}
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pinConfig.lockOnTabHidden}
                            onChange={(e) =>
                              handleUpdatePinSettings({
                                lockOnTabHidden: e.target.checked,
                              })
                            }
                            className="rounded border-slate-300"
                          />
                          <span>
                            {lang === 'id'
                              ? 'Kunci saat pindah tab'
                              : 'Lock on tab switch'}
                          </span>
                        </label>
                      </div>
                    )}

                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pinConfig.requireFirstSetup}
                        onChange={(e) =>
                          handleUpdatePinSettings({
                            requireFirstSetup: e.target.checked,
                          })
                        }
                        className="rounded border-slate-300"
                      />
                      <span>
                        {lang === 'id'
                          ? '3. Wajib buat PIN baru jika kunci PIN pernah direset/dihapus'
                          : '3. Require new PIN prompt if PIN lock is ever reset'}
                      </span>
                    </label>

                    {/* Change or Disable PIN */}
                    <form
                      onSubmit={handleChangeExistingPin}
                      className="pt-2 border-t border-slate-200 dark:border-[#232732] space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          value={currentPinForManage}
                          onChange={(e) =>
                            setCurrentPinForManage(
                              e.target.value.replace(/\D+/g, '').slice(0, 6)
                            )
                          }
                          placeholder={
                            lang === 'id' ? 'PIN saat ini...' : 'Current PIN...'
                          }
                          className="px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="new-password"
                          maxLength={6}
                          value={nextPinForChange}
                          onChange={(e) =>
                            setNextPinForChange(
                              e.target.value.replace(/\D+/g, '').slice(0, 6)
                            )
                          }
                          placeholder={
                            lang === 'id' ? 'PIN baru (opsional)' : 'New PIN (optional)'
                          }
                          className="px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="new-password"
                          maxLength={6}
                          value={confirmPinForChange}
                          onChange={(e) =>
                            setConfirmPinForChange(
                              e.target.value.replace(/\D+/g, '').slice(0, 6)
                            )
                          }
                          placeholder={
                            lang === 'id' ? 'Konfirmasi PIN baru' : 'Confirm new PIN'
                          }
                          className="px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={busy || currentPinForManage.length < 4}
                          onClick={() => void handleDisableExistingPin()}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 disabled:opacity-45 rounded-lg cursor-pointer"
                        >
                          {lang === 'id' ? 'Matikan Kunci PIN' : 'Disable PIN Lock'}
                        </button>
                        <button
                          type="submit"
                          disabled={
                            busy ||
                            currentPinForManage.length < 4 ||
                            nextPinForChange.length < 4
                          }
                          className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-45 rounded-lg cursor-pointer"
                        >
                          {lang === 'id' ? 'Simpan PIN Baru' : 'Update PIN'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
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

              {/* 12-Word Mnemonic Generator & Local Phrase PIN Vault */}
              <div className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>
                      {lang === 'id'
                        ? 'Generator Frasa 12-Kata (Mnemonic CipherVault Pro) & Brankas PIN'
                        : '12-Word Recovery Phrase Generator (CipherVault Pro) & PIN Vault'}
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

                {/* Local 4-6 Digit Phrase PIN Vault Controls */}
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
                        ? 'PIN frasa 4-6 digit...'
                        : '4-6 digit phrase PIN...'
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
                        {lang === 'id'
                          ? 'Simpan dengan PIN'
                          : 'Lock Phrase with PIN'}
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
                            {lang === 'id'
                              ? 'Buka dengan PIN'
                              : 'Unlock with PIN'}
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
                  className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
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
                    className="min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Full Mailbox (.mbox)</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleExportLatestEml}
                    className="min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-lg cursor-pointer"
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
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".anf,.cvp,.enc,.mbox,.eml,.json,.pdf,.zip"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleTriggerImportFilePicker}
                    className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#191E28] border border-slate-300 dark:border-[#2E3646] hover:border-blue-500 rounded-lg cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'id'
                        ? 'Pilih Berkas (.anf / .cvp / .enc / .mbox / .eml)'
                        : 'Choose File (.anf / .cvp / .enc / .mbox / .eml)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
