import {
  Check,
  CheckCircle2,
  Edit3,
  Fingerprint,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Usb,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { Language } from '../data/i18n';
import {
  suggestDefaultPasskeyLabel,
  type PasskeyAuthenticatorType,
  type VaultPasskeyConfig,
  type VaultPasskeyCredential,
  type WebAuthnCapabilityReport,
} from '../utils/vaultPasskeyWebAuthn';

interface VaultPasskeySettingsSectionProps {
  lang: Language;
  capabilities: WebAuthnCapabilityReport | null;
  passkeyConfig: VaultPasskeyConfig;
  busy: boolean;
  onRegisterPasskey: (params: {
    label: string;
    authenticatorType: PasskeyAuthenticatorType;
  }) => Promise<void>;
  onTestPasskey: (credential: VaultPasskeyCredential) => Promise<void>;
  onRenamePasskey: (credentialId: string, nextLabel: string) => void;
  onRemovePasskey: (credential: VaultPasskeyCredential) => void;
}

function formatShortDate(iso: string | null, lang: Language): string {
  if (!iso) return lang === 'id' ? 'Belum dipakai' : 'Never used';
  try {
    return new Date(iso).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function VaultPasskeySettingsSection({
  lang,
  capabilities,
  passkeyConfig,
  busy,
  onRegisterPasskey,
  onTestPasskey,
  onRenamePasskey,
  onRemovePasskey,
}: VaultPasskeySettingsSectionProps) {
  const [authType, setAuthType] = useState<PasskeyAuthenticatorType>('platform');
  const [labelInput, setLabelInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedLabel =
      labelInput.trim() || suggestDefaultPasskeyLabel(authType, lang);
    await onRegisterPasskey({
      label: resolvedLabel,
      authenticatorType: authType,
    });
    setLabelInput('');
  };

  const prfCount = passkeyConfig.credentials.filter((c) => c.prfSupported).length;
  const webAuthnReady = Boolean(capabilities?.supported);

  return (
    <div className="space-y-3.5">
      {/* Header & Device Capability Readout (Zero-Pill Inline Metadata) */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
            <Fingerprint className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              {lang === 'id'
                ? 'Biometrik & Passkey (Standar CipherVault Pro · WebAuthn + PRF)'
                : 'Biometrics & Passkeys (CipherVault Pro Standard · WebAuthn + PRF)'}
            </span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {passkeyConfig.credentials.length}{' '}
            {lang === 'id' ? 'terdaftar' : 'enrolled'}
            {prfCount > 0 ? ` · ${prfCount} PRF` : ''}
          </span>
        </div>

        {capabilities && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span
              className={
                capabilities.supported
                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                  : 'text-rose-700 dark:text-rose-400 font-medium'
              }
            >
              {capabilities.supported
                ? lang === 'id'
                  ? 'WebAuthn Siap'
                  : 'WebAuthn Ready'
                : lang === 'id'
                  ? 'WebAuthn Tidak Tersedia'
                  : 'WebAuthn Unavailable'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {capabilities.platformAuthenticatorAvailable
                ? lang === 'id'
                  ? 'Biometrik Perangkat Terdeteksi'
                  : 'Platform Biometrics Detected'
                : lang === 'id'
                  ? 'Gunakan Security Key / Passkey Lintas Perangkat'
                  : 'Use Security Key / Cross-Device Passkey'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">RP: {capabilities.rpId}</span>
          </div>
        )}
      </div>

      {/* Capability / Iframe Advisory */}
      {capabilities && (capabilities.reasonId || capabilities.reasonEn) && (
        <div
          className={`p-3 rounded-lg border text-[11px] leading-relaxed flex items-start gap-2 ${
            capabilities.supported
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{lang === 'id' ? capabilities.reasonId : capabilities.reasonEn}</span>
        </div>
      )}

      {/* Enroll New Passkey Form */}
      <form
        onSubmit={handleEnrollSubmit}
        className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setAuthType('platform')}
            className={`min-h-[44px] p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
              authType === 'platform'
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 text-slate-900 dark:text-white'
                : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
            }`}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'id' ? 'Biometrik Perangkat Ini' : 'This Device Biometrics'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Face ID · Touch ID · Android · Windows Hello
            </div>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => setAuthType('cross-platform')}
            className={`min-h-[44px] p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
              authType === 'cross-platform'
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 text-slate-900 dark:text-white'
                : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732] text-slate-600 dark:text-slate-400'
            }`}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <Usb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                {lang === 'id'
                  ? 'Security Key / Passkey Eksternal'
                  : 'Security Key / Cross-Device Passkey'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              YubiKey · FIDO2 USB/NFC · Hybrid Phone QR
            </div>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            maxLength={60}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder={
              lang === 'id'
                ? `Label opsional (mis. ${suggestDefaultPasskeyLabel(authType, lang)})...`
                : `Optional label (e.g. ${suggestDefaultPasskeyLabel(authType, lang)})...`
            }
            className="flex-1 min-w-0 px-3 py-2.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={busy || !webAuthnReady}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>
              {lang === 'id'
                ? 'Daftarkan Biometrik / Passkey'
                : 'Register Biometric / Passkey'}
            </span>
          </button>
        </div>
      </form>

      {/* Enrolled Passkeys List */}
      {passkeyConfig.credentials.length > 0 ? (
        <div className="divide-y divide-slate-200 dark:divide-[#232732] rounded-lg border border-slate-200 dark:border-[#232732] bg-white dark:bg-[#13161C] overflow-hidden">
          {passkeyConfig.credentials.map((cred) => {
            const isEditing = editingId === cred.id;
            return (
              <div
                key={cred.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1B202B] flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                    {cred.authenticatorType === 'platform' ? (
                      <Fingerprint className="w-4 h-4" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          maxLength={60}
                          autoFocus
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              onRenamePasskey(cred.id, editingLabel);
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          className="px-2 py-1 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-blue-500 rounded text-slate-900 dark:text-white min-w-[160px]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onRenamePasskey(cred.id, editingLabel);
                            setEditingId(null);
                          }}
                          aria-label={lang === 'id' ? 'Simpan nama' : 'Save label'}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label={lang === 'id' ? 'Batal' : 'Cancel'}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {cred.label}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {cred.authenticatorType === 'platform'
                          ? lang === 'id'
                            ? 'Platform'
                            : 'Platform'
                          : 'Security Key'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          cred.prfSupported
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {cred.prfSupported
                          ? lang === 'id'
                            ? 'PRF Kunci Hardware Aktif'
                            : 'Hardware PRF Active'
                          : lang === 'id'
                            ? 'Verifikasi Perangkat (Non-PRF)'
                            : 'Device Verify Only (Non-PRF)'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {lang === 'id' ? 'Terakhir:' : 'Last used:'}{' '}
                        {formatShortDate(cred.lastUsedAt, lang)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busy || !webAuthnReady}
                    onClick={() => void onTestPasskey(cred)}
                    className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#242B3A] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>{lang === 'id' ? 'Uji' : 'Test'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(cred.id);
                      setEditingLabel(cred.label);
                    }}
                    title={lang === 'id' ? 'Ubah nama passkey' : 'Rename passkey'}
                    aria-label={lang === 'id' ? 'Ubah nama passkey' : 'Rename passkey'}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemovePasskey(cred)}
                    title={lang === 'id' ? 'Hapus passkey' : 'Remove passkey'}
                    aria-label={lang === 'id' ? 'Hapus passkey' : 'Remove passkey'}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 rounded-lg border border-dashed border-slate-300 dark:border-[#2A303D] text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            {lang === 'id'
              ? 'Belum ada Biometrik atau Passkey terdaftar. Anda dapat mengaktifkannya secara mandiri tanpa PIN, atau menggabungkannya dengan PIN sebagai cadangan.'
              : 'No Biometrics or Passkeys enrolled yet. You can enable them standalone without a PIN, or pair them with a PIN as a backup fallback.'}
          </span>
        </div>
      )}
    </div>
  );
}
