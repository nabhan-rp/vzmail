import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  Globe,
  Link2,
  Lock,
  Palette,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import { apiFetch } from '../utils/apiAuthClient';
import {
  MAX_RAW_UPLOAD_BYTES,
  formatBytesCompact,
  type EncodedAvatarResult,
} from '../utils/avatarEncoder';
import { copyTextSafely } from '../utils/clipboard';
import {
  BIO_DELETE_COOLDOWN_DAYS,
  BIO_THEMES,
  RECYCLE_BIN_RETENTION_DAYS,
  SOCIAL_PLATFORMS,
  createEmptyBioWorkspace,
  getDefaultQrDesignForTheme,
  sanitizeBioIndexingMode,
  sanitizePageSlug,
  type BioButtonStyle,
  type BioDeleteCooldownInfo,
  type BioIndexingMode,
  type BioLinkItem,
  type BioPageRecord,
  type BioQrDesignConfig,
  type BioThemeId,
  type BioWorkspaceData,
  type RecycleBinItemType,
  type RecycleBinRecord,
  type SocialPlatformId,
} from '../utils/linksModel';
import { checkReservedUsername } from '../utils/reservedUsernames';
import { getBioIndexingPolicyDirectives } from '../utils/seoConfig';
import { BioAvatarCropModal } from './BioAvatarCropModal';
import { BioQrCustomizerPanel } from './BioQrCustomizerPanel';
import { ConfirmActionModal } from './ConfirmActionModal';
import type { ActiveHostView } from './MailLinksTopBar';
import { QrCodeModal } from './QrCodeModal';
import { SocialIconGlyph } from './SocialIconGlyph';

interface VzLinksWorkspaceProps {
  lang: Language;
  session: SsoSession;
  onSelectHost: (host: ActiveHostView) => void;
  onOpenPublicBioPage: (pageSlug: string) => void;
  onActivateMailFromLinks: () => void;
  onDeactivateLinks: () => void;
}

type EditorTab =
  | 'links'
  | 'profile_socials'
  | 'theme'
  | 'qr_design'
  | 'recycle_bin'
  | 'settings_danger';

type PendingConfirmAction =
  | { kind: 'delete_link'; link: BioLinkItem }
  | { kind: 'delete_avatar'; scope: 'main' | string }
  | { kind: 'delete_subpage'; page: BioPageRecord }
  | { kind: 'deactivate_bio' }
  | { kind: 'permanent_delete_bio' }
  | { kind: 'purge_recycle_item'; item: RecycleBinRecord }
  | { kind: 'empty_recycle_bin' }
  | null;

function formatStorageBadge(engine: string): string {
  if (engine === 'cloudflare-d1') return 'Cloudflare D1';
  if (engine === 'cloudflare-kv') return 'Cloudflare KV';
  if (engine === 'local-dev-memory') return 'Local Dev';
  return 'Edge Storage';
}

function formatMediaStorageBadge(engine: string): string {
  if (engine === 'cloudflare-r2') return 'Cloudflare R2';
  if (engine === 'cloudflare-d1') return 'Cloudflare D1 (Fallback)';
  if (engine === 'cloudflare-kv') return 'Cloudflare KV (Fallback)';
  if (engine === 'local-dev-memory') return 'Local Dev';
  return 'Edge Storage';
}

function formatCooldownCountdown(
  unlockAtIso: string | null,
  nowMs: number,
  lang: Language
): string {
  if (!unlockAtIso) return '';
  const diffMs = Math.max(0, Date.parse(unlockAtIso) - nowMs);
  if (diffMs <= 0) {
    return lang === 'id' ? 'Selesai — silakan muat ulang' : 'Ready — please reload';
  }
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (lang === 'id') {
    return `${days}h ${String(hours).padStart(2, '0')}j ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}d`;
  }
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function formatRecycleRemaining(
  expiresAtIso: string,
  nowMs: number,
  lang: Language
): string {
  const diffMs = Math.max(0, Date.parse(expiresAtIso) - nowMs);
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 1) {
    const hours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
    return lang === 'id' ? `Sisa ${hours} jam` : `${hours}h left`;
  }
  return lang === 'id' ? `Sisa ${days} hari` : `${days}d left`;
}

export function VzLinksWorkspace({
  lang,
  session,
  onSelectHost,
  onOpenPublicBioPage,
}: VzLinksWorkspaceProps) {
  const username = session.username;
  const domain = session.primaryDomain || 'imy.li';

  const [workspace, setWorkspace] = useState<BioWorkspaceData>(() =>
    createEmptyBioWorkspace(username, {
      displayName: session.name || username,
    })
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [storageEngine, setStorageEngine] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const [activePageSlug, setActivePageSlug] = useState<string>('');
  const [editorTab, setEditorTab] = useState<EditorTab>('links');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Bio avatar crop & upload state (independent from Auth0/myaccount SSO avatar)
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTargetScope, setCropTargetScope] = useState<'main' | string | null>(
    null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatarScope, setDeletingAvatarScope] = useState<string | null>(
    null
  );
  const [previewAvatarError, setPreviewAvatarError] = useState(false);
  const [mainAvatarThumbError, setMainAvatarThumbError] = useState(false);
  const [subpageAvatarThumbError, setSubpageAvatarThumbError] = useState(false);
  const mainAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const subpageAvatarInputRef = useRef<HTMLInputElement | null>(null);

  // New subpage creator
  const [addingPage, setAddingPage] = useState(false);
  const [newPageSlugInput, setNewPageSlugInput] = useState('');
  const [newPageTitleInput, setNewPageTitleInput] = useState('');
  const [newPageError, setNewPageError] = useState<string | null>(null);

  // New link creator
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkSubtitle, setNewLinkSubtitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkError, setNewLinkError] = useState<string | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [quickQrModal, setQuickQrModal] = useState<{
    title: string;
    subtitle?: string;
    url: string;
    filenameBase: string;
    design?: BioQrDesignConfig;
    centerImageUrl?: string;
    monogramText?: string;
  } | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  // Reserved handle check, 3-day permanent delete cooldown, Recycle Bin & confirmation dialogs
  const localReserved = useMemo(
    () => checkReservedUsername(username),
    [username]
  );
  const [serverReserved, setServerReserved] = useState(false);
  const isReservedHandle = localReserved.isReserved || serverReserved;

  const [cooldown, setCooldown] = useState<BioDeleteCooldownInfo>({
    active: false,
    deletedAt: null,
    unlockAt: null,
    remainingMs: 0,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [recycleItems, setRecycleItems] = useState<RecycleBinRecord[]>([]);
  const [loadingRecycle, setLoadingRecycle] = useState(false);
  const [recycleFilter, setRecycleFilter] = useState<'all' | RecycleBinItemType>('all');
  const [recycleActionId, setRecycleActionId] = useState<string | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [togglingDeactivate, setTogglingDeactivate] = useState(false);

  const isCooldownLocked = useMemo(() => {
    if (!cooldown.active || !cooldown.unlockAt) return false;
    return Date.parse(cooldown.unlockAt) > nowMs;
  }, [cooldown, nowMs]);

  useEffect(() => {
    const intervalMs = isCooldownLocked ? 1000 : 30000;
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [isCooldownLocked]);

  const flashStatus = (type: 'ok' | 'error', text: string) => {
    setStatusMessage({ type, text });
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(null), 4200);
  };

  const loadRecycleBin = useCallback(async () => {
    setLoadingRecycle(true);
    try {
      const res = await apiFetch(
        `/api/links/recycle-bin?owner=${encodeURIComponent(username)}`,
        { cache: 'no-store' }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        items?: RecycleBinRecord[];
      } | null;
      if (res.ok && json?.ok) {
        setRecycleItems(Array.isArray(json.items) ? json.items : []);
      }
    } catch {
      // Preserve existing list on transient error
    } finally {
      setLoadingRecycle(false);
    }
  }, [username]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/links/bio/${encodeURIComponent(username)}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        configured?: boolean;
        reserved?: boolean;
        cooldown?: BioDeleteCooldownInfo;
        storageEngine?: string;
        data?: BioWorkspaceData | null;
      } | null;

      if (res.ok && json?.ok) {
        if (json.storageEngine) setStorageEngine(json.storageEngine);
        setServerReserved(Boolean(json.reserved));
        if (json.cooldown) {
          setCooldown(json.cooldown);
        }
        if (json.configured && json.data) {
          setWorkspace(json.data);
          setHasUnsaved(false);
        } else {
          setWorkspace(
            createEmptyBioWorkspace(username, {
              displayName: session.name || username,
            })
          );
          setHasUnsaved(false);
        }
      }
    } catch {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Gagal memuat data bio dari server edge.'
          : 'Failed to load bio data from edge server.'
      );
    } finally {
      setLoading(false);
    }
  }, [username, session.name, lang]);

  useEffect(() => {
    void loadWorkspace();
    void loadRecycleBin();
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, [loadWorkspace, loadRecycleBin]);

  const activePage: BioPageRecord = useMemo(() => {
    return (
      workspace.pages.find((p) => p.pageSlug === activePageSlug) ||
      workspace.pages[0]
    );
  }, [workspace.pages, activePageSlug]);

  const activeTheme = BIO_THEMES[activePage.themeId] || BIO_THEMES.midnight_slate;
  const activePublicPath = activePage.pageSlug
    ? `${username}.${domain}/${activePage.pageSlug}`
    : `${username}.${domain}`;
  const effectivePreviewAvatar = activePage.avatarUrl || workspace.avatarUrl;
  const activePageQrDesign = useMemo(
    () =>
      activePage.qrDesign ||
      getDefaultQrDesignForTheme(activePage.themeId, activePublicPath),
    [activePage.qrDesign, activePage.themeId, activePublicPath]
  );

  useEffect(() => {
    setPreviewAvatarError(false);
  }, [effectivePreviewAvatar]);

  useEffect(() => {
    setMainAvatarThumbError(false);
  }, [workspace.avatarUrl]);

  useEffect(() => {
    setSubpageAvatarThumbError(false);
  }, [activePage.avatarUrl, activePage.pageSlug]);

  const filledSocials = useMemo(() => {
    return SOCIAL_PLATFORMS.filter((p) => {
      const val = workspace.socials[p.id];
      return typeof val === 'string' && val.trim().length > 0;
    });
  }, [workspace.socials]);

  const updateWorkspace = (updater: (prev: BioWorkspaceData) => BioWorkspaceData) => {
    setWorkspace((prev) => updater(prev));
    setHasUnsaved(true);
  };

  const updateActivePage = (updater: (page: BioPageRecord) => BioPageRecord) => {
    updateWorkspace((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.pageSlug === activePage.pageSlug ? updater(p) : p
      ),
    }));
  };

  const persistWorkspace = async (
    payload: BioWorkspaceData,
    customSuccessText?: string
  ) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/links/bio/${encodeURIComponent(username)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        cooldown?: BioDeleteCooldownInfo;
        storageEngine?: string;
        data?: BioWorkspaceData;
      } | null;

      if (!res.ok || !json?.ok || !json.data) {
        if (json?.cooldown) {
          setCooldown(json.cooldown);
        }
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Gagal menyimpan perubahan bio.'
              : 'Failed to save bio changes.')
        );
        return false;
      }

      if (json.storageEngine) setStorageEngine(json.storageEngine);
      setWorkspace(json.data);
      setHasUnsaved(false);
      flashStatus(
        'ok',
        customSuccessText ||
          (lang === 'id'
            ? `Tersimpan! ${activePublicPath} langsung live.`
            : `Saved! ${activePublicPath} is live.`)
      );
      return true;
    } catch {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Koneksi ke server gagal saat menyimpan.'
          : 'Network error while saving.'
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToServer = async () => {
    await persistWorkspace(workspace);
  };

  const handleSelectAvatarFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    scope: 'main' | string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isSvgFile =
      file.type.toLowerCase() === 'image/svg+xml' || /\.svgz?$/.test(lowerName);
    const hasRecognizedImageExt =
      /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?|ico)$/.test(lowerName);
    if (isSvgFile || (!file.type.startsWith('image/') && !hasRecognizedImageExt)) {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Pilih file gambar raster yang valid (JPG, PNG, WebP, GIF, HEIC, BMP, TIFF, atau AVIF). SVG tidak diizinkan demi keamanan.'
          : 'Please choose a valid raster image file (JPG, PNG, WebP, GIF, HEIC, BMP, TIFF, or AVIF). SVG is blocked for security.'
      );
      return;
    }

    if (file.size > MAX_RAW_UPLOAD_BYTES) {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Ukuran file sumber maksimal 10 MB.'
          : 'Source image file must be 10 MB or smaller.'
      );
      return;
    }

    setCropTargetScope(scope);
    setCropFile(file);
  };

  const applyUploadedAvatarResult = async (
    scope: 'main' | string,
    json: {
      avatarUrl: string;
      storageEngine?: string;
      mediaStorageEngine?: string;
      contentType?: string;
      sourceBytes?: number;
      byteSize?: number;
      convertedBy?: string;
    },
    fallbackLabel: string,
    fallbackBytes: number
  ) => {
    const nextWorkspace: BioWorkspaceData =
      scope === 'main'
        ? { ...workspace, avatarUrl: json.avatarUrl }
        : {
            ...workspace,
            pages: workspace.pages.map((p) =>
              p.pageSlug === scope
                ? { ...p, avatarUrl: json.avatarUrl || '' }
                : p
            ),
          };

    setWorkspace(nextWorkspace);
    setCropFile(null);
    setCropTargetScope(null);

    const outSizeText = formatBytesCompact(json.byteSize || fallbackBytes);
    const srcSizeText =
      json.sourceBytes && json.sourceBytes > (json.byteSize || 0)
        ? `${formatBytesCompact(json.sourceBytes)} → ${outSizeText}`
        : outSizeText;
    const formatBadge =
      json.convertedBy === 'cloudflare-images-avif'
        ? 'Server AVIF'
        : json.contentType === 'image/avif'
          ? 'AVIF'
          : fallbackLabel;
    const storageLabel = formatMediaStorageBadge(
      json.mediaStorageEngine || json.storageEngine || ''
    );
    const scopeText =
      scope === 'main'
        ? `${username}.${domain}`
        : `${username}.${domain}/${scope}`;

    await persistWorkspace(
      nextWorkspace,
      lang === 'id'
        ? `Foto profil ${scopeText} tersimpan (${formatBadge} · ${srcSizeText} · ${storageLabel}).`
        : `Profile photo for ${scopeText} saved (${formatBadge} · ${srcSizeText} · ${storageLabel}).`
    );
  };

  const handleConfirmCroppedAvatar = async (encoded: EncodedAvatarResult) => {
    if (!cropTargetScope) return;
    setUploadingAvatar(true);
    try {
      const endpoint =
        cropTargetScope === 'main'
          ? `/api/links/avatar/${encodeURIComponent(username)}`
          : `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(cropTargetScope)}`;

      const res = await apiFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': encoded.mimeType },
        body: encoded.blob,
      });

      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        avatarUrl?: string;
        storageEngine?: string;
        mediaStorageEngine?: string;
        contentType?: string;
        sourceBytes?: number;
        byteSize?: number;
        convertedBy?: string;
      } | null;

      if (!res.ok || !json?.ok || !json.avatarUrl) {
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Gagal mengunggah foto profil bio.'
              : 'Failed to upload bio profile photo.')
        );
        return;
      }

      await applyUploadedAvatarResult(
        cropTargetScope,
        { ...json, avatarUrl: json.avatarUrl },
        encoded.formatLabel,
        encoded.byteSize
      );
    } catch {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Koneksi gagal saat mengunggah foto profil bio.'
          : 'Network error while uploading bio profile photo.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDirectServerAvatarUpload = async (rawFile: File) => {
    if (!cropTargetScope) return;
    setUploadingAvatar(true);
    try {
      const baseEndpoint =
        cropTargetScope === 'main'
          ? `/api/links/avatar/${encodeURIComponent(username)}`
          : `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(cropTargetScope)}`;

      const res = await apiFetch(`${baseEndpoint}?convert=server`, {
        method: 'PUT',
        headers: {
          'Content-Type': rawFile.type || 'application/octet-stream',
        },
        body: rawFile,
      });

      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        avatarUrl?: string;
        storageEngine?: string;
        mediaStorageEngine?: string;
        contentType?: string;
        sourceBytes?: number;
        byteSize?: number;
        convertedBy?: string;
      } | null;

      if (!res.ok || !json?.ok || !json.avatarUrl) {
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Server gagal mengonversi gambar ini ke AVIF.'
              : 'Server failed to convert this image to AVIF.')
        );
        return;
      }

      await applyUploadedAvatarResult(
        cropTargetScope,
        { ...json, avatarUrl: json.avatarUrl },
        'Server AVIF',
        rawFile.size
      );
    } catch {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Koneksi gagal saat mengirim gambar ke konverter AVIF server.'
          : 'Network error sending image to server AVIF converter.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteAvatar = async (scope: 'main' | string) => {
    setDeletingAvatarScope(scope);
    try {
      const endpoint =
        scope === 'main'
          ? `/api/links/avatar/${encodeURIComponent(username)}`
          : `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(scope)}`;

      await apiFetch(endpoint, { method: 'DELETE' }).catch(() => {});

      const nextWorkspace: BioWorkspaceData =
        scope === 'main'
          ? { ...workspace, avatarUrl: '' }
          : {
              ...workspace,
              pages: workspace.pages.map((p) =>
                p.pageSlug === scope ? { ...p, avatarUrl: '' } : p
              ),
            };

      setWorkspace(nextWorkspace);
      await persistWorkspace(
        nextWorkspace,
        scope === 'main'
          ? lang === 'id'
            ? 'Foto profil utama bio dihapus. Halaman kembali menampilkan monogram inisial.'
            : 'Main bio profile photo removed. Reverting to monogram initials.'
          : lang === 'id'
            ? `Foto khusus /${scope} dihapus. Kini mewarisi foto profil utama bio.`
            : `Custom photo for /${scope} removed. Now inheriting main bio photo.`
      );
    } finally {
      setDeletingAvatarScope(null);
    }
  };

  const handleCreateSubpage = (e: React.FormEvent) => {
    e.preventDefault();
    setNewPageError(null);
    const cleaned = sanitizePageSlug(newPageSlugInput);
    if (!cleaned) {
      setNewPageError(
        lang === 'id'
          ? 'Slug halaman harus 2–40 karakter (huruf kecil, angka, tanda hubung) dan bukan kata sistem.'
          : 'Page slug must be 2–40 chars (lowercase, digits, hyphen) and not a reserved word.'
      );
      return;
    }
    if (workspace.pages.some((p) => p.pageSlug === cleaned)) {
      setNewPageError(
        lang === 'id'
          ? `Halaman /${cleaned} sudah ada.`
          : `Page /${cleaned} already exists.`
      );
      return;
    }

    const now = new Date().toISOString();
    const newPage: BioPageRecord = {
      id: `page-${username}-${cleaned}-${Date.now().toString(36)}`,
      pageSlug: cleaned,
      title: newPageTitleInput.trim() || `/${cleaned}`,
      description: '',
      avatarUrl: '',
      themeId: activePage.themeId,
      buttonStyle: activePage.buttonStyle,
      showSocials: true,
      isPublished: true,
      links: [],
      updatedAt: now,
    };

    updateWorkspace((prev) => ({
      ...prev,
      pages: [...prev.pages, newPage],
    }));
    setActivePageSlug(cleaned);
    setNewPageSlugInput('');
    setNewPageTitleInput('');
    setAddingPage(false);
  };

  const pushToRecycleBin = async (
    itemType: RecycleBinItemType,
    label: string,
    summary: string,
    payload: unknown
  ) => {
    try {
      const res = await apiFetch('/api/links/recycle-bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUser: username,
          itemType,
          label,
          summary,
          payload,
        }),
      });
      if (res.ok) {
        await loadRecycleBin();
      }
    } catch {
      // Non-blocking fallback
    }
  };

  const executeDeleteSubpage = async (
    page: BioPageRecord,
    moveToRecycleBin: boolean
  ) => {
    if (!page.pageSlug) return;
    setConfirmBusy(true);
    try {
      if (moveToRecycleBin) {
        await pushToRecycleBin(
          'bio_page',
          `/${page.pageSlug} (${page.title || page.pageSlug})`,
          `${page.links.length} ${lang === 'id' ? 'tautan' : 'links'} · ${username}.${domain}/${page.pageSlug}`,
          { page }
        );
      }

      if (page.avatarUrl && !moveToRecycleBin) {
        await apiFetch(
          `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(page.pageSlug)}`,
          { method: 'DELETE' }
        ).catch(() => {});
      }

      const nextWorkspace: BioWorkspaceData = {
        ...workspace,
        pages: workspace.pages.filter((p) => p.pageSlug !== page.pageSlug),
      };
      setWorkspace(nextWorkspace);
      if (activePageSlug === page.pageSlug) {
        setActivePageSlug('');
      }
      await persistWorkspace(
        nextWorkspace,
        moveToRecycleBin
          ? lang === 'id'
            ? `Sub-halaman /${page.pageSlug} dihapus dari halaman aktif & disimpan di Recycle Bin (14 hari).`
            : `Sub-page /${page.pageSlug} removed from live pages & moved to Recycle Bin (14 days).`
          : lang === 'id'
            ? `Sub-halaman /${page.pageSlug} telah dihapus permanen dari database.`
            : `Sub-page /${page.pageSlug} has been permanently deleted from the database.`
      );
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    setNewLinkError(null);
    const titleTrimmed = newLinkTitle.trim();
    const urlTrimmed = newLinkUrl.trim();

    if (!titleTrimmed || !urlTrimmed) {
      setNewLinkError(
        lang === 'id'
          ? 'Judul tautan dan URL tujuan wajib diisi.'
          : 'Link title and destination URL are required.'
      );
      return;
    }

    const normalizedUrl =
      /^https?:\/\/|^mailto:/i.test(urlTrimmed)
        ? urlTrimmed
        : `https://${urlTrimmed}`;

    const item: BioLinkItem = {
      id: `lnk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: titleTrimmed.slice(0, 100),
      subtitle: newLinkSubtitle.trim().slice(0, 140),
      url: normalizedUrl,
      sortOrder: activePage.links.length,
      enabled: true,
      clicks: 0,
    };

    updateActivePage((page) => ({
      ...page,
      links: [...page.links, item],
    }));
    setNewLinkTitle('');
    setNewLinkSubtitle('');
    setNewLinkUrl('');
  };

  const handleMoveLink = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activePage.links.length) return;
    updateActivePage((page) => {
      const next = [...page.links];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return {
        ...page,
        links: next.map((l, idx) => ({ ...l, sortOrder: idx })),
      };
    });
  };

  const handleToggleLink = (linkId: string) => {
    updateActivePage((page) => ({
      ...page,
      links: page.links.map((l) =>
        l.id === linkId ? { ...l, enabled: !l.enabled } : l
      ),
    }));
  };

  const executeDeleteLink = async (
    link: BioLinkItem,
    moveToRecycleBin: boolean
  ) => {
    setConfirmBusy(true);
    try {
      if (moveToRecycleBin) {
        await pushToRecycleBin(
          'bio_link',
          link.title,
          `${link.url} (${activePage.pageSlug ? `/${activePage.pageSlug}` : 'Halaman Utama'})`,
          { pageSlug: activePage.pageSlug, link }
        );
      }

      const nextWorkspace: BioWorkspaceData = {
        ...workspace,
        pages: workspace.pages.map((p) =>
          p.pageSlug === activePage.pageSlug
            ? {
                ...p,
                links: p.links
                  .filter((l) => l.id !== link.id)
                  .map((l, idx) => ({ ...l, sortOrder: idx })),
              }
            : p
        ),
      };
      setWorkspace(nextWorkspace);
      await persistWorkspace(
        nextWorkspace,
        moveToRecycleBin
          ? lang === 'id'
            ? `Tautan "${link.title}" dihapus dari Bio & dipindahkan ke Recycle Bin (14 hari).`
            : `Link "${link.title}" removed from Bio & moved to Recycle Bin (14 days).`
          : lang === 'id'
            ? `Tautan "${link.title}" dihapus permanen dari database.`
            : `Link "${link.title}" permanently deleted from the database.`
      );
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  const handleSetBioDeactivated = async (nextDeactivated: boolean) => {
    setTogglingDeactivate(true);
    setConfirmBusy(true);
    try {
      const res = await apiFetch(
        `/api/links/bio/${encodeURIComponent(username)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDeactivated: nextDeactivated }),
        }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        data?: BioWorkspaceData;
      } | null;

      if (!res.ok || !json?.ok) {
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Gagal memperbarui status publikasi Bio.'
              : 'Failed to update Bio publication status.')
        );
        return;
      }

      if (json.data) {
        setWorkspace(json.data);
        setHasUnsaved(false);
      } else {
        setWorkspace((prev) => ({
          ...prev,
          isDeactivated: nextDeactivated,
          deactivatedAt: nextDeactivated ? new Date().toISOString() : null,
        }));
      }

      flashStatus(
        'ok',
        nextDeactivated
          ? lang === 'id'
            ? `Bio ${username}.${domain} dinonaktifkan sementara. Halaman disembunyikan dari publik tanpa menghapus data di database.`
            : `Bio ${username}.${domain} temporarily deactivated. Public visitors cannot view it, while your data stays safe.`
          : lang === 'id'
            ? `Bio ${username}.${domain} telah diaktifkan kembali dan tayang publik.`
            : `Bio ${username}.${domain} has been reactivated and is live again.`
      );
    } finally {
      setTogglingDeactivate(false);
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  const handlePermanentDeleteBio = async () => {
    setConfirmBusy(true);
    try {
      const res = await apiFetch(
        `/api/links/bio/${encodeURIComponent(username)}`,
        { method: 'DELETE' }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        cooldown?: BioDeleteCooldownInfo;
      } | null;

      if (!res.ok || !json?.ok) {
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Gagal menghapus permanen profil Bio dari database.'
              : 'Failed to permanently delete Bio profile from database.')
        );
        return;
      }

      setWorkspace(
        createEmptyBioWorkspace(username, {
          displayName: session.name || username,
        })
      );
      setActivePageSlug('');
      setHasUnsaved(false);
      if (json.cooldown) {
        setCooldown(json.cooldown);
      }
      flashStatus(
        'ok',
        lang === 'id'
          ? `Seluruh profil, halaman, tautan & foto AVIF ${username}.${domain} telah dihapus permanen dari database. Masa tunggu aktivasi ulang: ${BIO_DELETE_COOLDOWN_DAYS} hari.`
          : `All profile data, pages, links & AVIF photos for ${username}.${domain} have been permanently erased. Cooldown before re-creation: ${BIO_DELETE_COOLDOWN_DAYS} days.`
      );
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  const handleRestoreRecycleItem = async (item: RecycleBinRecord) => {
    setRecycleActionId(item.id);
    try {
      const res = await apiFetch('/api/links/recycle-bin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ownerUser: username }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        cooldown?: BioDeleteCooldownInfo;
      } | null;

      if (!res.ok || !json?.ok) {
        if (json?.cooldown) setCooldown(json.cooldown);
        flashStatus(
          'error',
          json?.error ||
            (lang === 'id'
              ? 'Gagal memulihkan item dari Recycle Bin.'
              : 'Failed to restore item from Recycle Bin.')
        );
        return;
      }

      await loadRecycleBin();
      if (item.itemType === 'bio_link' || item.itemType === 'bio_page') {
        await loadWorkspace();
      }
      flashStatus(
        'ok',
        lang === 'id'
          ? `"${item.label}" berhasil dipulihkan dari Recycle Bin.`
          : `"${item.label}" has been restored from Recycle Bin.`
      );
    } finally {
      setRecycleActionId(null);
    }
  };

  const executePurgeRecycleItem = async (item: RecycleBinRecord) => {
    setConfirmBusy(true);
    setRecycleActionId(item.id);
    try {
      const res = await apiFetch(
        `/api/links/recycle-bin/${encodeURIComponent(item.id)}?owner=${encodeURIComponent(username)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setRecycleItems((prev) => prev.filter((x) => x.id !== item.id));
        flashStatus(
          'ok',
          lang === 'id'
            ? `"${item.label}" dihapus permanen dari database.`
            : `"${item.label}" permanently erased from the database.`
        );
      }
    } finally {
      setConfirmBusy(false);
      setRecycleActionId(null);
      setPendingConfirm(null);
    }
  };

  const executeEmptyRecycleBin = async () => {
    setConfirmBusy(true);
    try {
      const res = await apiFetch(
        `/api/links/recycle-bin?owner=${encodeURIComponent(username)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setRecycleItems([]);
        flashStatus(
          'ok',
          lang === 'id'
            ? 'Seluruh Recycle Bin berhasil dikosongkan permanen dari database.'
            : 'Recycle Bin permanently emptied from the database.'
        );
      }
    } finally {
      setConfirmBusy(false);
      setPendingConfirm(null);
    }
  };

  const filteredRecycleItems = useMemo(() => {
    if (recycleFilter === 'all') return recycleItems;
    return recycleItems.filter((item) => item.itemType === recycleFilter);
  }, [recycleItems, recycleFilter]);

  const handleUpdateSocial = (platformId: SocialPlatformId, value: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      socials: {
        ...prev.socials,
        [platformId]: value,
      },
    }));
  };

  const handleCopyActiveUrl = () => {
    void copyTextSafely(`https://${activePublicPath}`);
    setCopiedUrl(true);
    window.setTimeout(() => setCopiedUrl(false), 1800);
  };

  const buttonRadiusClass =
    activePage.buttonStyle === 'sharp' ? 'rounded-md' : 'rounded-xl';

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Top Studio Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232732]">
        <div className="space-y-1">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>{username}.{domain}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {workspace.pages.length}{' '}
              {lang === 'id' ? 'halaman aktif' : 'active pages'}
            </span>
            {storageEngine && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatStorageBadge(storageEngine)}
                </span>
              </>
            )}
            {hasUnsaved && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {lang === 'id' ? 'Ada perubahan belum disimpan' : 'Unsaved changes'}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? 'Studio Multi-Page Link-in-Bio'
              : 'Multi-Page Link-in-Bio Studio'}
          </h1>
        </div>

        <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setMobilePreviewOpen(true)}
            className="lg:hidden min-h-[40px] px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Pratinjau Bio' : 'Live Preview'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectHost('shortlinks')}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#191E28] dark:hover:bg-[#232A38] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{domain}/s/ Shortener</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPublicBioPage(activePage.pageSlug)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#151922] hover:bg-slate-100 dark:hover:bg-[#1E2430] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Lihat Halaman Publik' : 'View Public Page'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSaveToServer()}
            disabled={saving || loading || isReservedHandle || isCooldownLocked}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {saving
                ? lang === 'id'
                  ? 'Menyimpan...'
                  : 'Saving...'
                : lang === 'id'
                  ? 'Simpan & Publikasikan'
                  : 'Save & Publish'}
            </span>
          </button>
        </div>
      </div>

      {/* Reserved System Username Block Banner */}
      {isReservedHandle && (
        <div className="px-4 py-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="space-y-1 leading-relaxed">
            <div className="font-semibold">
              {lang === 'id'
                ? `Username sistem "${username}" dilindungi (Reserved)`
                : `System username "${username}" is reserved`}
            </div>
            <p>
              {lang === 'id'
                ? `Subdomain ${username}.${domain} dicadangkan khusus untuk operasional sistem resmi dan tidak dapat dipublikasikan oleh akun pribadi. Ganti username di myaccount.vz.gay.`
                : `Subdomain ${username}.${domain} is reserved for official system operations and cannot be published by personal accounts. Update your username on myaccount.vz.gay.`}
            </p>
          </div>
        </div>
      )}

      {/* 3-Day Anti-Brute-Force Permanent Delete Cooldown Banner */}
      {isCooldownLocked && (
        <div className="px-4 py-4 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1 leading-relaxed">
              <div className="font-semibold">
                {lang === 'id'
                  ? `Masa Tunggu Aktivasi Ulang Bio Aktif (${BIO_DELETE_COOLDOWN_DAYS} Hari)`
                  : `Bio Re-Creation Cooldown Active (${BIO_DELETE_COOLDOWN_DAYS} Days)`}
              </div>
              <p>
                {lang === 'id'
                  ? `Anda baru saja menghapus permanen profil ${username}.${domain} dari database. Untuk mencegah penyalahgunaan penulisan ulang database (brute-force D1/KV), pembuatan ulang Bio dikunci hingga masa tunggu selesai.`
                  : `You recently permanently erased ${username}.${domain} from the database. To prevent brute-force D1/KV rewrite abuse, recreating your Bio is locked until the cooldown expires.`}
              </p>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/80 dark:bg-[#0B0D11] border border-amber-300 dark:border-amber-800/70 font-mono font-bold text-amber-900 dark:text-amber-300 tabular-nums whitespace-nowrap shrink-0 self-start sm:self-center">
            {formatCooldownCountdown(cooldown.unlockAt, nowMs, lang)}
          </div>
        </div>
      )}

      {/* Temporary Deactivation Banner */}
      {workspace.isDeactivated && !isCooldownLocked && (
        <div className="px-4 py-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <PauseCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5 leading-relaxed">
              <div className="font-semibold">
                {lang === 'id'
                  ? `Bio ${username}.${domain} sedang dinonaktifkan sementara`
                  : `Bio ${username}.${domain} is temporarily deactivated`}
              </div>
              <p>
                {lang === 'id'
                  ? 'Halaman utama dan semua sub-halaman disembunyikan dari publik, namun seluruh data tetap tersimpan aman di database.'
                  : 'Your main page and sub-pages are hidden from public visitors while all your stored data remains safe.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={togglingDeactivate}
            onClick={() => void handleSetBioDeactivated(false)}
            className="min-h-[36px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Aktifkan Kembali Bio' : 'Reactivate Bio'}</span>
          </button>
        </div>
      )}

      {statusMessage && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs flex items-center gap-2 ${
            statusMessage.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Multi-Page Switcher Bar ($USERNAME.imy.li & $USERNAME.imy.li/$PAGE) — Single-Row Touch Scroll on Mobile */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px-1">
            {workspace.pages.map((page) => {
              const isSelected = page.pageSlug === activePage.pageSlug;
              const isRoot = page.pageSlug === '';
              const isSubpageHidden = !isRoot && page.isPublished === false;
              return (
                <div key={page.id} className="inline-flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setActivePageSlug(page.pageSlug)}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : isSubpageHidden
                          ? 'bg-slate-100 dark:bg-[#141720] text-slate-500 border-dashed border-slate-300 dark:border-[#2A303D]'
                          : 'bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A303D] hover:border-blue-500/60'
                    }`}
                  >
                    {isSubpageHidden ? (
                      <EyeOff className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {isRoot
                        ? lang === 'id'
                          ? `Utama (${username}.${domain})`
                          : `Main (${username}.${domain})`
                        : `/${page.pageSlug}`}
                    </span>
                    <span className="opacity-70 text-[10px] tabular-nums">
                      ({page.links.length}
                      {isSubpageHidden ? ' · Off' : ''})
                    </span>
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setAddingPage((v) => !v);
                setNewPageError(null);
              }}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? '+ Halaman Baru (/$PAGE)' : '+ New Page (/$PAGE)'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="truncate max-w-[220px] sm:max-w-none">
              https://{activePublicPath}
            </span>
            <button
              type="button"
              onClick={handleCopyActiveUrl}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C212C] text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Copy URL"
            >
              {copiedUrl ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuickQrModal({
                  title:
                    activePage.pageSlug === ''
                      ? workspace.displayName || username
                      : activePage.title || `/${activePage.pageSlug}`,
                  subtitle: activePublicPath,
                  url: `https://${activePublicPath}`,
                  filenameBase: `bio-qr-${activePublicPath}`,
                  design: activePageQrDesign,
                  centerImageUrl: !previewAvatarError ? effectivePreviewAvatar : '',
                  monogramText: workspace.displayName || username,
                })
              }
              className="px-2.5 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 inline-flex items-center gap-1 text-[11px] font-sans font-semibold cursor-pointer"
              title={lang === 'id' ? 'Tampilkan QR Halaman Ini' : 'Show Page QR Code'}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR</span>
            </button>
          </div>
        </div>

        {/* Inline New Sub-Page Form */}
        {addingPage && (
          <form
            onSubmit={handleCreateSubpage}
            className="pt-3 border-t border-slate-200 dark:border-[#232732] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
          >
            <div className="sm:col-span-5 space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                {lang === 'id' ? 'Alamat Sub-Halaman' : 'Sub-Page Path'}
              </label>
              <div className="flex items-center rounded-lg border border-slate-300 dark:border-[#2A303D] bg-[#FAFAFA] dark:bg-[#0B0D11] overflow-hidden">
                <span className="px-2.5 py-2 text-xs font-mono text-slate-500 border-r border-slate-200 dark:border-[#232732] truncate max-w-[140px]">
                  {username}.{domain}/
                </span>
                <input
                  type="text"
                  value={newPageSlugInput}
                  onChange={(e) => setNewPageSlugInput(e.target.value)}
                  placeholder="promo"
                  className="w-full px-2.5 py-2 text-xs font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>
            <div className="sm:col-span-4 space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                {lang === 'id' ? 'Judul Halaman' : 'Page Title'}
              </label>
              <input
                type="text"
                value={newPageTitleInput}
                onChange={(e) => setNewPageTitleInput(e.target.value)}
                placeholder={lang === 'id' ? 'Katalog & Promo' : 'Catalog & Offers'}
                className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3 flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 min-h-[36px] px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
              >
                {lang === 'id' ? 'Buat Halaman' : 'Create Page'}
              </button>
              <button
                type="button"
                onClick={() => setAddingPage(false)}
                className="min-h-[36px] px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#1B202B] rounded-lg cursor-pointer"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
            </div>
            {newPageError && (
              <div className="sm:col-span-12 text-xs text-rose-600 dark:text-rose-400">
                {newPageError}
              </div>
            )}
          </form>
        )}
      </section>

      {/* Main Split: Editor (7 cols) + Live Mobile Bio Preview (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Editor Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
          {/* Editor Tabs */}
          <div className="px-4 pt-3 border-b border-slate-200 dark:border-[#232732] flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setEditorTab('links')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'links'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>
                {lang === 'id' ? 'Tautan & Halaman' : 'Links & Page'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('profile_socials')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'profile_socials'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>
                {lang === 'id'
                  ? `Profil & Ikon Sosmed (${filledSocials.length}/${SOCIAL_PLATFORMS.length})`
                  : `Profile & Social Icons (${filledSocials.length}/${SOCIAL_PLATFORMS.length})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('theme')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'theme'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Tema Halaman' : 'Page Theme'}</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('qr_design')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'qr_design'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Desain QR Code' : 'QR Design'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditorTab('recycle_bin');
                void loadRecycleBin();
              }}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'recycle_bin'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                Recycle Bin ({recycleItems.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('settings_danger')}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                editorTab === 'settings_danger'
                  ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                  : 'border-transparent text-slate-500 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                {lang === 'id' ? 'Pengaturan & Bahaya' : 'Settings & Danger'}
              </span>
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-slate-100 dark:bg-[#191E28] animate-pulse"
                  />
                ))}
              </div>
            ) : editorTab === 'links' ? (
              <>
                {/* Page Metadata Settings */}
                <div className="space-y-3 pb-5 border-b border-slate-200 dark:border-[#232732]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {activePage.pageSlug === ''
                        ? lang === 'id'
                          ? `Pengaturan Halaman Utama (${username}.${domain})`
                          : `Main Page Settings (${username}.${domain})`
                        : lang === 'id'
                          ? `Pengaturan Sub-Halaman (/${activePage.pageSlug})`
                          : `Sub-Page Settings (/${activePage.pageSlug})`}
                    </div>
                    {activePage.pageSlug !== '' && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            updateActivePage((p) => ({
                              ...p,
                              isPublished: p.isPublished === false ? true : false,
                            }))
                          }
                          className={`inline-flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                            activePage.isPublished === false
                              ? 'text-emerald-600 dark:text-emerald-400 hover:underline'
                              : 'text-amber-600 dark:text-amber-400 hover:underline'
                          }`}
                        >
                          {activePage.isPublished === false ? (
                            <>
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>
                                {lang === 'id' ? 'Aktifkan Sub-Halaman' : 'Publish Sub-Page'}
                              </span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>
                                {lang === 'id' ? 'Nonaktifkan Sementara' : 'Deactivate Temporarily'}
                              </span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setPendingConfirm({
                              kind: 'delete_subpage',
                              page: activePage,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{lang === 'id' ? 'Hapus Halaman' : 'Delete Page'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Judul Halaman' : 'Page Title'}
                      </label>
                      <input
                        type="text"
                        value={activePage.title}
                        onChange={(e) =>
                          updateActivePage((p) => ({ ...p, title: e.target.value }))
                        }
                        placeholder={workspace.displayName || username}
                        className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Deskripsi Singkat Halaman' : 'Page Description'}
                      </label>
                      <input
                        type="text"
                        value={activePage.description}
                        onChange={(e) =>
                          updateActivePage((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        placeholder={
                          lang === 'id'
                            ? 'Opsional — tampil di bawah judul halaman'
                            : 'Optional — displayed under the page title'
                        }
                        className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={activePage.showSocials}
                      onChange={(e) =>
                        updateActivePage((p) => ({
                          ...p,
                          showSocials: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>
                      {lang === 'id'
                        ? 'Tampilkan baris ikon sosial media yang sudah diisi pada halaman ini'
                        : 'Show configured social media icon bar on this page'}
                    </span>
                  </label>

                  {/* Optional Per-Subpage Custom Bio Avatar Override */}
                  {activePage.pageSlug !== '' && (
                    <div className="mt-2 p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {activePage.avatarUrl && !subpageAvatarThumbError ? (
                          <img
                            src={activePage.avatarUrl}
                            alt={`/${activePage.pageSlug}`}
                            referrerPolicy="no-referrer"
                            onError={() => setSubpageAvatarThumbError(true)}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-[#2A303E] shrink-0"
                          />
                        ) : workspace.avatarUrl && !mainAvatarThumbError ? (
                          <img
                            src={workspace.avatarUrl}
                            alt={workspace.displayName || username}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-[#2A303E] opacity-75 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-[#1B202B] text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold font-display shrink-0">
                            {(activePage.title || activePage.pageSlug)
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {lang === 'id'
                              ? `Foto Khusus Sub-Halaman /${activePage.pageSlug}`
                              : `Custom Photo for /${activePage.pageSlug}`}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {activePage.avatarUrl
                              ? lang === 'id'
                                ? 'Menggunakan foto AVIF khusus untuk sub-halaman ini.'
                                : 'Using a dedicated AVIF photo for this sub-page.'
                              : lang === 'id'
                                ? 'Saat ini mewarisi foto profil utama Bio Anda.'
                                : 'Currently inheriting your main Bio profile photo.'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <input
                          ref={subpageAvatarInputRef}
                          type="file"
                          accept="image/*,.heic,.heif,.bmp,.tiff,.tif,.avif,.webp"
                          onChange={(e) =>
                            handleSelectAvatarFile(e, activePage.pageSlug)
                          }
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => subpageAvatarInputRef.current?.click()}
                          disabled={uploadingAvatar || isCooldownLocked || isReservedHandle}
                          className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 disabled:opacity-50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            {activePage.avatarUrl
                              ? lang === 'id'
                                ? 'Ganti Foto'
                                : 'Change Photo'
                              : lang === 'id'
                                ? `Unggah Foto /${activePage.pageSlug}`
                                : `Upload /${activePage.pageSlug} Photo`}
                          </span>
                        </button>

                        {activePage.avatarUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingConfirm({
                                kind: 'delete_avatar',
                                scope: activePage.pageSlug,
                              })
                            }
                            disabled={deletingAvatarScope === activePage.pageSlug}
                            className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#151922] hover:bg-slate-100 dark:hover:bg-[#1E2430] border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>
                              {lang === 'id'
                                ? 'Gunakan Foto Utama'
                                : 'Use Main Photo'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Add New Link Form */}
                <form
                  onSubmit={handleAddLink}
                  className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-3"
                >
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'id'
                      ? `Tambah Tautan ke ${activePage.pageSlug ? `/${activePage.pageSlug}` : 'Halaman Utama'}`
                      : `Add Link to ${activePage.pageSlug ? `/${activePage.pageSlug}` : 'Main Page'}`}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder={lang === 'id' ? 'Judul tombol (misal: Portofolio)' : 'Button title (e.g. Portfolio)'}
                      className="px-3 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <input
                      type="text"
                      value={newLinkSubtitle}
                      onChange={(e) => setNewLinkSubtitle(e.target.value)}
                      placeholder={lang === 'id' ? 'Subjudul (opsional)' : 'Subtitle (optional)'}
                      className="px-3 py-2 text-xs bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://... atau mailto:..."
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-[#13161C] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      className="min-h-[36px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{lang === 'id' ? 'Tambah Tautan' : 'Add Link'}</span>
                    </button>
                  </div>

                  {newLinkError && (
                    <div className="text-xs text-rose-600 dark:text-rose-400">
                      {newLinkError}
                    </div>
                  )}
                </form>

                {/* Active Page Links List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {lang === 'id' ? 'Daftar Tautan Halaman Ini' : 'Links on This Page'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {activePage.links.length} {lang === 'id' ? 'item' : 'items'}
                    </span>
                  </div>

                  {activePage.links.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#2A303E] text-center space-y-1">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {lang === 'id'
                          ? 'Belum ada tautan di halaman ini'
                          : 'No links on this page yet'}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {lang === 'id'
                          ? 'Tambahkan tautan pertama Anda di formulir atas, lalu klik Simpan & Publikasikan.'
                          : 'Add your first link using the form above, then click Save & Publish.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activePage.links.map((link, idx) => (
                        <div
                          key={link.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                            link.enabled
                              ? 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732]'
                              : 'bg-slate-100/60 dark:bg-[#0B0D11]/50 border-slate-200/70 dark:border-[#1E222D] opacity-65'
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {link.title}
                            </div>
                            {link.subtitle && (
                              <div className="text-[11px] text-slate-500 truncate">
                                {link.subtitle}
                              </div>
                            )}
                            <div className="text-[11px] font-mono text-slate-400 truncate">
                              {link.url}
                              <span aria-hidden="true"> · </span>
                              <span className="tabular-nums">
                                {link.clicks.toLocaleString()}{' '}
                                {lang === 'id' ? 'klik' : 'clicks'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveLink(idx, -1)}
                              disabled={idx === 0}
                              aria-label="Move up"
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#1B202B] cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLink(idx, 1)}
                              disabled={idx === activePage.links.length - 1}
                              aria-label="Move down"
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#1B202B] cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setQuickQrModal({
                                  title: link.title,
                                  subtitle: link.subtitle || activePublicPath,
                                  url: link.url,
                                  filenameBase: `bio-link-${link.title}`,
                                  design: {
                                    ...activePageQrDesign,
                                    frameText: link.title.slice(0, 42),
                                    centerLogoMode: 'none',
                                  },
                                })
                              }
                              aria-label={`QR Code ${link.title}`}
                              title={lang === 'id' ? 'QR Code untuk tautan ini' : 'QR Code for this link'}
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#1B202B] cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleLink(link.id)}
                              aria-label={link.enabled ? 'Hide link' : 'Show link'}
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-md hover:bg-slate-200/70 dark:hover:bg-[#1B202B] cursor-pointer"
                            >
                              {link.enabled ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingConfirm({ kind: 'delete_link', link })
                              }
                              aria-label="Delete link"
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : editorTab === 'profile_socials' ? (
              <div className="space-y-6">
                {/* Main Profile Details */}
                <div className="space-y-3 pb-5 border-b border-slate-200 dark:border-[#232732]">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'id'
                      ? `Identitas Profil Utama (${username}.${domain})`
                      : `Main Profile Identity (${username}.${domain})`}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Nama Tampilan' : 'Display Name'}
                      </label>
                      <input
                        type="text"
                        value={workspace.displayName}
                        onChange={(e) =>
                          updateWorkspace((prev) => ({
                            ...prev,
                            displayName: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Headline / Profesi' : 'Headline / Role'}
                      </label>
                      <input
                        type="text"
                        value={workspace.headline}
                        onChange={(e) =>
                          updateWorkspace((prev) => ({
                            ...prev,
                            headline: e.target.value,
                          }))
                        }
                        placeholder={
                          lang === 'id'
                            ? 'Contoh: Kreator Digital & Engineer'
                            : 'Example: Digital Creator & Engineer'
                        }
                        className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Bio Singkat' : 'Short Bio'}
                    </label>
                    <textarea
                      rows={3}
                      value={workspace.bio}
                      onChange={(e) =>
                        updateWorkspace((prev) => ({ ...prev, bio: e.target.value }))
                      }
                      placeholder={
                        lang === 'id'
                          ? 'Ceritakan singkat tentang Anda atau tautan yang Anda bagikan.'
                          : 'Write a short bio about yourself or what you share.'
                      }
                      className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {/* Dedicated Bio Profile Photo (AVIF, decoupled from SSO myaccount avatar) */}
                  <div className="pt-2 space-y-2.5">
                    <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {workspace.avatarUrl && !mainAvatarThumbError ? (
                          <img
                            src={workspace.avatarUrl}
                            alt={workspace.displayName || username}
                            referrerPolicy="no-referrer"
                            onError={() => setMainAvatarThumbError(true)}
                            className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-[#2A303E] shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-[#1B202B] text-slate-700 dark:text-slate-200 flex items-center justify-center text-base font-bold font-display shrink-0">
                            {(workspace.displayName || username)
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white">
                            {lang === 'id'
                              ? 'Foto Profil Khusus Bio Link (Auto Konversi Server → AVIF R2)'
                              : 'Dedicated Bio Link Photo (Auto Server Convert → R2 AVIF)'}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {lang === 'id'
                              ? 'Terpisah dari foto SSO myaccount.vz.gay. Unggah gambar raster format apa saja (JPG, PNG, WebP, GIF, HEIC, BMP, TIFF maks 10 MB) — bisa potong 1:1 atau langsung biarkan server mengonversi otomatis ke AVIF ultra-ringan di R2.'
                              : 'Independent from your myaccount.vz.gay SSO photo. Upload any raster image format (JPG, PNG, WebP, GIF, HEIC, BMP, TIFF up to 10 MB) — crop 1:1 or let the server convert automatically to ultra-light AVIF in R2.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <input
                          ref={mainAvatarInputRef}
                          type="file"
                          accept="image/*,.heic,.heif,.bmp,.tiff,.tif,.avif,.webp"
                          onChange={(e) => handleSelectAvatarFile(e, 'main')}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => mainAvatarInputRef.current?.click()}
                          disabled={uploadingAvatar || isCooldownLocked || isReservedHandle}
                          className="min-h-[36px] px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {workspace.avatarUrl
                              ? lang === 'id'
                                ? 'Ganti Foto Bio'
                                : 'Change Bio Photo'
                              : lang === 'id'
                                ? 'Unggah Foto (AVIF)'
                                : 'Upload Photo (AVIF)'}
                          </span>
                        </button>

                        {workspace.avatarUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingConfirm({
                                kind: 'delete_avatar',
                                scope: 'main',
                              })
                            }
                            disabled={deletingAvatarScope === 'main'}
                            className="min-h-[36px] px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{lang === 'id' ? 'Hapus' : 'Remove'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {lang === 'id'
                          ? 'Atau tempel URL foto eksternal (opsional, HTTPS)'
                          : 'Or paste an external image URL (optional, HTTPS)'}
                      </label>
                      <input
                        type="url"
                        value={workspace.avatarUrl}
                        onChange={(e) =>
                          updateWorkspace((prev) => ({
                            ...prev,
                            avatarUrl: e.target.value,
                          }))
                        }
                        placeholder="https://... atau otomatis terisi setelah unggah AVIF"
                        className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* All 16 Social Media Platform Icons */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {lang === 'id'
                        ? 'Ikon Sosial Media (Tampil Otomatis Hanya Jika Diisi)'
                        : 'Social Media Icons (Shown Publicly Only When Filled)'}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Semua platform sudah tersedia di sini. Kolom yang dibiarkan kosong tidak akan ditampilkan di halaman publik Anda.'
                        : 'All platforms are built in. Any field left blank stays hidden on your public bio page.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SOCIAL_PLATFORMS.map((platform) => {
                      const val = workspace.socials[platform.id] || '';
                      const isFilled = val.trim().length > 0;
                      return (
                        <div key={platform.id} className="space-y-1">
                          <label className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1.5">
                              <SocialIconGlyph
                                platform={platform.id}
                                className={`w-3.5 h-3.5 ${
                                  isFilled
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-slate-400'
                                }`}
                              />
                              <span>{platform.label}</span>
                            </span>
                            {isFilled && (
                              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                {lang === 'id' ? 'Tampil' : 'Visible'}
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) =>
                              handleUpdateSocial(platform.id, e.target.value)
                            }
                            placeholder={platform.placeholder}
                            className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : editorTab === 'theme' ? (
              /* Theme & Button Style per Page */
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'id'
                      ? `Tema Warna untuk ${activePage.pageSlug ? `/${activePage.pageSlug}` : 'Halaman Utama'}`
                      : `Color Theme for ${activePage.pageSlug ? `/${activePage.pageSlug}` : 'Main Page'}`}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(Object.keys(BIO_THEMES) as BioThemeId[]).map((themeKey) => {
                      const t = BIO_THEMES[themeKey];
                      const selected = activePage.themeId === themeKey;
                      return (
                        <button
                          key={themeKey}
                          type="button"
                          onClick={() =>
                            updateActivePage((p) => ({ ...p, themeId: themeKey }))
                          }
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            selected
                              ? 'border-blue-600 ring-2 ring-blue-600/30 bg-blue-50/40 dark:bg-blue-950/20'
                              : 'border-slate-200 dark:border-[#232732] hover:border-slate-400 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-md border border-slate-300 dark:border-slate-700 shrink-0"
                              style={{ backgroundColor: t.swatchHex }}
                            />
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {t.name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {lang === 'id' ? 'Gaya Tombol Tautan' : 'Link Button Style'}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        {
                          id: 'rounded',
                          label: lang === 'id' ? 'Solid Rounded' : 'Solid Rounded',
                        },
                        {
                          id: 'sharp',
                          label: lang === 'id' ? 'Solid Sharp' : 'Solid Sharp',
                        },
                        {
                          id: 'outline',
                          label: lang === 'id' ? 'Outline Minimal' : 'Minimal Outline',
                        },
                      ] as { id: BioButtonStyle; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          updateActivePage((p) => ({ ...p, buttonStyle: opt.id }))
                        }
                        className={`p-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          activePage.buttonStyle === opt.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                            : 'border-slate-200 dark:border-[#232732] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : editorTab === 'qr_design' ? (
              <BioQrCustomizerPanel
                lang={lang}
                publicUrl={`https://${activePublicPath}`}
                pageLabel={activePublicPath}
                themeId={activePage.themeId}
                design={activePageQrDesign}
                effectiveAvatarUrl={!previewAvatarError ? effectivePreviewAvatar : ''}
                monogramText={workspace.displayName || username}
                hasUnsaved={hasUnsaved}
                saving={saving}
                disabledSave={loading || isReservedHandle || isCooldownLocked}
                onChangeDesign={(nextDesign) =>
                  updateActivePage((p) => ({ ...p, qrDesign: nextDesign }))
                }
                onSaveToServer={() => void handleSaveToServer()}
              />
            ) : editorTab === 'recycle_bin' ? (
              /* Recycle Bin Tab (14-Day Auto-Purge from D1 / KV) */
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-[#232732]">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white font-display">
                      {lang === 'id'
                        ? `Recycle Bin VZ Links (Retensi ${RECYCLE_BIN_RETENTION_DAYS} Hari)`
                        : `VZ Links Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS}-Day Retention)`}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {lang === 'id'
                        ? `Tautan Bio, sub-halaman, dan shortlink ${domain}/s/ yang dihapus disimpan sementara selama ${RECYCLE_BIN_RETENTION_DAYS} hari sebelum dihapus permanen secara otomatis dari database Cloudflare.`
                        : `Deleted Bio links, sub-pages, and ${domain}/s/ shortlinks are held for ${RECYCLE_BIN_RETENTION_DAYS} days before being permanently auto-purged from Cloudflare storage.`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void loadRecycleBin()}
                      disabled={loadingRecycle}
                      className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202B] dark:hover:bg-[#242B3A] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${loadingRecycle ? 'animate-spin' : ''}`}
                      />
                      <span>{lang === 'id' ? 'Segarkan' : 'Refresh'}</span>
                    </button>

                    {recycleItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirm({ kind: 'empty_recycle_bin' })
                        }
                        className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/35 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'id' ? 'Kosongkan Semua' : 'Empty Bin'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: lang === 'id' ? 'Semua' : 'All' },
                      {
                        id: 'bio_link',
                        label: lang === 'id' ? 'Tautan Bio' : 'Bio Links',
                      },
                      {
                        id: 'bio_page',
                        label: lang === 'id' ? 'Sub-Halaman' : 'Sub-Pages',
                      },
                      {
                        id: 'shortlink',
                        label: `Shortlink (${domain}/s/)`,
                      },
                    ] as { id: 'all' | RecycleBinItemType; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRecycleFilter(f.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        recycleFilter === f.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#232732] hover:border-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {loadingRecycle ? (
                  <div className="space-y-2.5">
                    {[1, 2].map((n) => (
                      <div
                        key={n}
                        className="h-16 rounded-xl bg-slate-100 dark:bg-[#191E28] animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredRecycleItems.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#2A303E] text-center space-y-1.5">
                    <Trash2 className="w-6 h-6 text-slate-400 mx-auto" />
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {lang === 'id'
                        ? 'Recycle Bin kosong'
                        : 'Recycle Bin is empty'}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Item yang Anda hapus dari Bio maupun Shortlink akan muncul di sini hingga 14 hari.'
                        : 'Deleted Bio items and shortlinks will appear here for up to 14 days.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredRecycleItems.map((item) => {
                      const typeLabel =
                        item.itemType === 'bio_link'
                          ? lang === 'id'
                            ? 'Tautan Bio'
                            : 'Bio Link'
                          : item.itemType === 'bio_page'
                            ? lang === 'id'
                              ? 'Sub-Halaman'
                              : 'Sub-Page'
                            : 'Shortlink';
                      const isItemBusy = recycleActionId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                {typeLabel}
                              </span>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                                {formatRecycleRemaining(item.expiresAt, nowMs, lang)}
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {item.label}
                            </div>
                            {item.summary && (
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                {item.summary}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isItemBusy}
                              onClick={() => void handleRestoreRecycleItem(item)}
                              className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-900/60 rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{lang === 'id' ? 'Pulihkan' : 'Restore'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={isItemBusy}
                              onClick={() =>
                                setPendingConfirm({
                                  kind: 'purge_recycle_item',
                                  item,
                                })
                              }
                              className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-[#151922] hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-[#2A303E] rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>
                                {lang === 'id' ? 'Hapus Permanen' : 'Delete Forever'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Settings & Danger Zone Tab (Opt-In Search/AI Indexing + Temporary Deactivate + Permanent DB Erase) */
              <div className="space-y-6">
                {/* 0. Meta-Style Opt-In Search Engine & AI Crawler Indexing Controls */}
                {(() => {
                  const currentMode = sanitizeBioIndexingMode(workspace.indexingMode);
                  const activePolicy = getBioIndexingPolicyDirectives(currentMode);
                  const indexingOptions: {
                    mode: BioIndexingMode;
                    title: string;
                    subtitle: string;
                    metaTag: string;
                    icon: typeof Lock;
                  }[] = [
                    {
                      mode: 'none',
                      title:
                        lang === 'id'
                          ? 'Privat — Tidak Diindeks (Default)'
                          : 'Private — Do Not Index (Default)',
                      subtitle:
                        lang === 'id'
                          ? 'Halaman Bio tetap dapat dibuka lewat tautan langsung, tetapi disembunyikan dari Google/Bing dan semua AI Crawler.'
                          : 'Your Bio remains reachable via direct link, but is hidden from Google/Bing and all AI crawlers.',
                      metaTag: 'noindex, nofollow, noai',
                      icon: Lock,
                    },
                    {
                      mode: 'search_only',
                      title:
                        lang === 'id'
                          ? 'Mesin Pencari Saja (Google, Bing, DuckDuckGo)'
                          : 'Search Engines Only (Google, Bing, DuckDuckGo)',
                      subtitle:
                        lang === 'id'
                          ? 'Izinkan profil & sub-halaman publik muncul di hasil pencarian web, namun blokir AI crawler (GPTBot, ClaudeBot, PerplexityBot).'
                          : 'Allow your Bio and published sub-pages in web search results while blocking AI crawlers (GPTBot, ClaudeBot, PerplexityBot).',
                      metaTag: 'index, follow, noai',
                      icon: Search,
                    },
                    {
                      mode: 'ai_only',
                      title:
                        lang === 'id'
                          ? 'AI Search & Crawler Saja (ChatGPT, Claude, Perplexity)'
                          : 'AI Search & Crawlers Only (ChatGPT, Claude, Perplexity)',
                      subtitle:
                        lang === 'id'
                          ? 'Izinkan mesin jawaban & asisten AI membaca halaman Bio Anda, tetapi cegah indeksasi mesin pencari konvensional.'
                          : 'Allow AI search assistants to read your Bio while keeping it out of traditional search engine indexes.',
                      metaTag: 'AI Allow · Search noindex',
                      icon: Bot,
                    },
                    {
                      mode: 'search_and_ai',
                      title:
                        lang === 'id'
                          ? 'Mesin Pencari + AI Crawler (Publik Penuh)'
                          : 'Search Engines + AI Crawlers (Full Discovery)',
                      subtitle:
                        lang === 'id'
                          ? 'Maksimalkan keterlihatan publik: izinkan mesin pencari web dan AI Search/Crawler mengindeks profil Bio beserta Schema.org ProfilePage.'
                          : 'Maximize public discoverability: allow both web search engines and AI search crawlers to index your Bio with ProfilePage JSON-LD.',
                      metaTag: 'index, follow · AI Allow',
                      icon: Globe,
                    },
                  ];

                  return (
                    <div className="p-4 sm:p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
                          <Search className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>
                            {lang === 'id'
                              ? `Visibilitas Mesin Pencari & AI Crawler (${username}.${domain})`
                              : `Search Engine & AI Crawler Visibility (${username}.${domain})`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {lang === 'id'
                            ? 'Seperti kontrol privasi profil di ekosistem Meta, halaman Bio Anda bersifat opt-in (privat secara bawaan). Pilihan Anda diterapkan langsung pada edge Cloudflare melalui robots.txt, header HTTP X-Robots-Tag, dan meta HTML.'
                            : 'Modeled after Meta profile discovery controls, your Bio is opt-in (private by default). Your selection is enforced directly at the Cloudflare edge via robots.txt, HTTP X-Robots-Tag headers, and HTML meta tags.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {indexingOptions.map((opt) => {
                          const Icon = opt.icon;
                          const isSelected = currentMode === opt.mode;
                          return (
                            <button
                              key={opt.mode}
                              type="button"
                              disabled={saving || isCooldownLocked || isReservedHandle}
                              onClick={() => {
                                if (currentMode === opt.mode) return;
                                const nextWs: BioWorkspaceData = {
                                  ...workspace,
                                  indexingMode: opt.mode,
                                };
                                setWorkspace(nextWs);
                                void persistWorkspace(
                                  nextWs,
                                  lang === 'id'
                                    ? `Kebijakan indeksasi ${username}.${domain} diperbarui: ${opt.title}`
                                    : `Indexing policy for ${username}.${domain} updated: ${opt.title}`
                                );
                              }}
                              className={`text-left p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 disabled:opacity-50 cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 dark:border-blue-500/80'
                                  : 'bg-white dark:bg-[#13161C] border-slate-200 dark:border-[#232732] hover:border-slate-300 dark:hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Icon
                                    className={`w-4 h-4 shrink-0 ${
                                      isSelected
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  />
                                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                    {opt.title}
                                  </span>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                {opt.subtitle}
                              </p>
                              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-[#232732]">
                                {opt.metaTag}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-500">
                            {lang === 'id' ? 'Kebijakan Edge Aktif:' : 'Active Edge Policy:'}
                          </span>
                          <span className="text-slate-900 dark:text-slate-200">
                            https://{username}.{domain}/robots.txt
                          </span>
                        </div>
                        <div className="truncate">
                          X-Robots-Tag: {activePolicy.xRobotsTag}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 1. Temporary Deactivation (Main Bio + Sub-Pages) */}
                <div className="p-4 sm:p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900 dark:text-white font-display">
                        {lang === 'id'
                          ? `Nonaktifkan Sementara Bio (${username}.${domain})`
                          : `Temporarily Deactivate Bio (${username}.${domain})`}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {lang === 'id'
                          ? 'Menyembunyikan halaman utama dan semua sub-halaman dari pengunjung publik tanpa menghapus data atau foto AVIF Anda di database. Dapat diaktifkan kembali kapan saja tanpa masa tunggu.'
                          : 'Hides your main Bio and all sub-pages from public visitors without deleting your database records or AVIF photos. Can be reactivated anytime with no cooldown.'}
                      </p>
                    </div>

                    {workspace.isDeactivated ? (
                      <button
                        type="button"
                        disabled={togglingDeactivate || isCooldownLocked}
                        onClick={() => void handleSetBioDeactivated(false)}
                        className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>
                          {lang === 'id' ? 'Aktifkan Kembali Bio' : 'Reactivate Bio'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={togglingDeactivate || isCooldownLocked || isReservedHandle}
                        onClick={() =>
                          setPendingConfirm({ kind: 'deactivate_bio' })
                        }
                        className="min-h-[38px] px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800/70 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PauseCircle className="w-4 h-4" />
                        <span>
                          {lang === 'id'
                            ? 'Nonaktifkan Sementara'
                            : 'Temporarily Deactivate'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Per-Subpage Publish/Hide Controls */}
                  {workspace.pages.filter((p) => p.pageSlug !== '').length > 0 && (
                    <div className="pt-3 border-t border-slate-200 dark:border-[#232732] space-y-2">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {lang === 'id'
                          ? 'Status Publikasi Per Sub-Halaman (/$PAGE)'
                          : 'Per Sub-Page Visibility (/$PAGE)'}
                      </div>
                      <div className="space-y-2">
                        {workspace.pages
                          .filter((p) => p.pageSlug !== '')
                          .map((sub) => {
                            const isPub = sub.isPublished !== false;
                            return (
                              <div
                                key={sub.id}
                                className="px-3 py-2.5 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                                    {username}.{domain}/{sub.pageSlug}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {isPub
                                      ? lang === 'id'
                                        ? 'Tayang Publik'
                                        : 'Publicly Visible'
                                      : lang === 'id'
                                        ? 'Dinonaktifkan Sementara (Data Aman)'
                                        : 'Temporarily Hidden (Data Preserved)'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={saving || isCooldownLocked}
                                  onClick={() => {
                                    const nextWs: BioWorkspaceData = {
                                      ...workspace,
                                      pages: workspace.pages.map((p) =>
                                        p.pageSlug === sub.pageSlug
                                          ? { ...p, isPublished: !isPub }
                                          : p
                                      ),
                                    };
                                    setWorkspace(nextWs);
                                    void persistWorkspace(
                                      nextWs,
                                      !isPub
                                        ? lang === 'id'
                                          ? `Sub-halaman /${sub.pageSlug} kembali tayang publik.`
                                          : `Sub-page /${sub.pageSlug} is publicly visible again.`
                                        : lang === 'id'
                                          ? `Sub-halaman /${sub.pageSlug} dinonaktifkan sementara (data tetap tersimpan).`
                                          : `Sub-page /${sub.pageSlug} temporarily hidden (data preserved).`
                                    );
                                  }}
                                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors shrink-0 cursor-pointer ${
                                    isPub
                                      ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                                      : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100'
                                  }`}
                                >
                                  {isPub
                                    ? lang === 'id'
                                      ? 'Nonaktifkan'
                                      : 'Deactivate'
                                    : lang === 'id'
                                      ? 'Aktifkan'
                                      : 'Activate'}
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Permanent Bio Profile Deletion (Real DB Wipe + 3-Day Anti-Brute-Force Cooldown) */}
                <div className="p-4 sm:p-5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-sm font-bold text-rose-800 dark:text-rose-200 font-display flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'id'
                          ? `Hapus Permanen Profil & Semua Data Bio (${username}.${domain})`
                          : `Permanently Delete Bio Profile & All Data (${username}.${domain})`}
                      </span>
                    </div>
                    <p className="text-xs text-rose-900/85 dark:text-rose-200/85 leading-relaxed">
                      {lang === 'id'
                        ? `Tindakan ini menghapus secara nyata (hard DELETE) seluruh profil utama, semua sub-halaman /$PAGE, daftar tautan, ikon sosmed, serta berkas foto profil AVIF dari Cloudflare D1, KV, dan R2 (tidak masuk Recycle Bin).`
                        : `This executes a real hard DELETE of your main profile, all /$PAGE sub-pages, links, social icons, and AVIF photos across Cloudflare D1, KV, and R2 (bypasses Recycle Bin).`}
                    </p>
                    <p className="text-xs text-rose-900/85 dark:text-rose-200/85 leading-relaxed">
                      {lang === 'id'
                        ? `Sesuai kebijakan anti-penyalahgunaan database, setelah dihapus permanen akun Anda akan memasuki masa tunggu (cooldown) selama ${BIO_DELETE_COOLDOWN_DAYS} hari (72 jam) sebelum dapat membuat ulang halaman Bio.`
                        : `To protect database integrity from brute-force rewrites, a mandatory ${BIO_DELETE_COOLDOWN_DAYS}-day (72-hour) cooldown applies before you can recreate your Bio page.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isCooldownLocked || isReservedHandle}
                    onClick={() =>
                      setPendingConfirm({ kind: 'permanent_delete_bio' })
                    }
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {lang === 'id'
                        ? `Hapus Permanen ${username}.${domain}`
                        : `Permanently Delete ${username}.${domain}`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Live Mobile Preview (Sticky on lg+ Desktop, Bottom-Sheet Modal on < lg Mobile) */}
        <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-20 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>{lang === 'id' ? 'Pratinjau Langsung' : 'Live Preview'}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[190px]">https://{activePublicPath}</span>
              <button
                type="button"
                onClick={() => setEditorTab('qr_design')}
                className="px-2 py-1 text-[11px] font-sans font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-md inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <QrCode className="w-3 h-3" />
                <span>QR</span>
              </button>
            </div>
          </div>

          <div
            className={`rounded-2xl border p-6 sm:p-7 min-h-[520px] flex flex-col justify-between transition-colors ${activeTheme.pageBgClass} ${activeTheme.dividerClass}`}
          >
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex flex-col items-center text-center space-y-2.5">
                {effectivePreviewAvatar && !previewAvatarError ? (
                  <img
                    src={effectivePreviewAvatar}
                    alt={
                      activePage.pageSlug === ''
                        ? workspace.displayName || username
                        : activePage.title || activePage.pageSlug
                    }
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewAvatarError(true)}
                    className="w-16 h-16 rounded-2xl object-cover border border-white/15"
                  />
                ) : (
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold font-display ${activeTheme.avatarClass}`}
                  >
                    {(workspace.displayName || username).slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="space-y-1">
                  <h2 className={`text-lg font-bold font-display ${activeTheme.titleClass}`}>
                    {activePage.pageSlug === ''
                      ? workspace.displayName || username
                      : activePage.title || `/${activePage.pageSlug}`}
                  </h2>
                  {activePage.pageSlug === '' && workspace.headline && (
                    <div className={`text-xs font-medium ${activeTheme.mutedClass}`}>
                      {workspace.headline}
                    </div>
                  )}
                  {(activePage.pageSlug === '' ? workspace.bio : activePage.description) && (
                    <p
                      className={`text-xs leading-relaxed max-w-[36ch] mx-auto ${activeTheme.bodyClass}`}
                    >
                      {activePage.pageSlug === ''
                        ? workspace.bio
                        : activePage.description}
                    </p>
                  )}
                </div>

                {/* Filled Social Icons Only */}
                {activePage.showSocials && filledSocials.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {filledSocials.map((platform) => (
                      <span
                        key={platform.id}
                        title={platform.label}
                        className={`w-9 h-9 rounded-lg border inline-flex items-center justify-center ${activeTheme.socialBtnClass}`}
                      >
                        <SocialIconGlyph platform={platform.id} className="w-4 h-4" />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Links Stack */}
              <div className="space-y-2.5">
                {activePage.links.filter((l) => l.enabled).length === 0 ? (
                  <div
                    className={`p-5 rounded-xl border border-dashed text-center text-xs ${activeTheme.dividerClass} ${activeTheme.mutedClass}`}
                  >
                    {lang === 'id'
                      ? 'Belum ada tautan aktif di halaman ini.'
                      : 'No active links on this page yet.'}
                  </div>
                ) : (
                  activePage.links
                    .filter((l) => l.enabled)
                    .map((link) => (
                      <div
                        key={link.id}
                        className={`w-full px-4 py-3 border flex items-center justify-between gap-3 transition-colors ${buttonRadiusClass} ${
                          activePage.buttonStyle === 'outline'
                            ? activeTheme.linkOutlineClass
                            : activeTheme.linkSolidClass
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {link.title}
                          </div>
                          {link.subtitle && (
                            <div className="text-[11px] opacity-75 truncate">
                              {link.subtitle}
                            </div>
                          )}
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Subtle Page Navigation Footer inside Preview */}
            <div
              className={`pt-5 mt-6 border-t text-center text-[11px] font-mono ${activeTheme.dividerClass} ${activeTheme.mutedClass}`}
            >
              {activePublicPath}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Mobile Quick Preview Trigger (< lg) */}
      <div className="lg:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex items-center gap-2">
        {hasUnsaved && (
          <button
            type="button"
            onClick={() => void handleSaveToServer()}
            disabled={saving || loading || isReservedHandle || isCooldownLocked}
            className="min-h-[44px] px-3.5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? '...' : lang === 'id' ? 'Simpan' : 'Save'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setMobilePreviewOpen(true)}
          className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 border border-slate-700 dark:border-blue-500 rounded-xl shadow-xl inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <Eye className="w-4 h-4" />
          <span>{lang === 'id' ? 'Pratinjau Bio' : 'Bio Preview'}</span>
        </button>
      </div>

      {/* Mobile Bottom-Sheet Live Bio Preview Drawer (< lg) */}
      {mobilePreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'id' ? 'Pratinjau Langsung Bio' : 'Live Bio Preview'}
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
        >
          <div
            onClick={() => setMobilePreviewOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-h-[88dvh] bg-white dark:bg-[#13161C] border-t border-slate-200 dark:border-[#232732] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
            {/* Sheet Grab Handle & Header */}
            <div className="pt-2 px-4 pb-3 border-b border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0E1117] shrink-0 space-y-2.5">
              <div className="flex justify-center">
                <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white font-display truncate">
                    {lang === 'id' ? 'Pratinjau Langsung Bio' : 'Live Bio Preview'}
                  </div>
                  <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate">
                    https://{activePublicPath}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMobilePreviewOpen(false);
                      setEditorTab('qr_design');
                    }}
                    className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobilePreviewOpen(false)}
                    aria-label="Close preview"
                    className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#191E28] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Page Switcher inside Mobile Preview Sheet */}
              {workspace.pages.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {workspace.pages.map((p) => {
                    const isSel = p.pageSlug === activePage.pageSlug;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActivePageSlug(p.pageSlug)}
                        className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md border whitespace-nowrap shrink-0 cursor-pointer ${
                          isSel
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-[#151922] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2A303E]'
                        }`}
                      >
                        {p.pageSlug === '' ? `${username}.${domain}` : `/${p.pageSlug}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Live Phone Bio Mockup */}
            <div className="flex-1 overflow-y-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div
                className={`rounded-2xl border p-5 min-h-[420px] flex flex-col justify-between transition-colors ${activeTheme.pageBgClass} ${activeTheme.dividerClass}`}
              >
                <div className="space-y-5">
                  <div className="flex flex-col items-center text-center space-y-2">
                    {effectivePreviewAvatar && !previewAvatarError ? (
                      <img
                        src={effectivePreviewAvatar}
                        alt={
                          activePage.pageSlug === ''
                            ? workspace.displayName || username
                            : activePage.title || activePage.pageSlug
                        }
                        referrerPolicy="no-referrer"
                        onError={() => setPreviewAvatarError(true)}
                        className="w-16 h-16 rounded-2xl object-cover border border-white/15"
                      />
                    ) : (
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold font-display ${activeTheme.avatarClass}`}
                      >
                        {(workspace.displayName || username).slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="space-y-1">
                      <h2 className={`text-lg font-bold font-display ${activeTheme.titleClass}`}>
                        {activePage.pageSlug === ''
                          ? workspace.displayName || username
                          : activePage.title || `/${activePage.pageSlug}`}
                      </h2>
                      {activePage.pageSlug === '' && workspace.headline && (
                        <div className={`text-xs font-medium ${activeTheme.mutedClass}`}>
                          {workspace.headline}
                        </div>
                      )}
                      {(activePage.pageSlug === '' ? workspace.bio : activePage.description) && (
                        <p
                          className={`text-xs leading-relaxed max-w-[36ch] mx-auto ${activeTheme.bodyClass}`}
                        >
                          {activePage.pageSlug === ''
                            ? workspace.bio
                            : activePage.description}
                        </p>
                      )}
                    </div>

                    {activePage.showSocials && filledSocials.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {filledSocials.map((platform) => (
                          <span
                            key={platform.id}
                            title={platform.label}
                            className={`w-9 h-9 rounded-lg border inline-flex items-center justify-center ${activeTheme.socialBtnClass}`}
                          >
                            <SocialIconGlyph platform={platform.id} className="w-4 h-4" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {activePage.links.filter((l) => l.enabled).length === 0 ? (
                      <div
                        className={`p-5 rounded-xl border border-dashed text-center text-xs ${activeTheme.dividerClass} ${activeTheme.mutedClass}`}
                      >
                        {lang === 'id'
                          ? 'Belum ada tautan aktif di halaman ini.'
                          : 'No active links on this page yet.'}
                      </div>
                    ) : (
                      activePage.links
                        .filter((l) => l.enabled)
                        .map((link) => (
                          <div
                            key={link.id}
                            className={`w-full px-4 py-3 border flex items-center justify-between gap-3 transition-colors ${buttonRadiusClass} ${
                              activePage.buttonStyle === 'outline'
                                ? activeTheme.linkOutlineClass
                                : activeTheme.linkSolidClass
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {link.title}
                              </div>
                              {link.subtitle && (
                                <div className="text-[11px] opacity-75 truncate">
                                  {link.subtitle}
                                </div>
                              )}
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div
                  className={`pt-4 mt-5 border-t text-center text-[11px] font-mono ${activeTheme.dividerClass} ${activeTheme.mutedClass}`}
                >
                  {activePublicPath}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive 1:1 Crop or Direct Server -> AVIF Upload Modal */}
      <BioAvatarCropModal
        isOpen={Boolean(cropFile && cropTargetScope)}
        lang={lang}
        imageFile={cropFile}
        scopeLabel={
          cropTargetScope === 'main'
            ? `${username}.${domain}`
            : `${username}.${domain}/${cropTargetScope || ''}`
        }
        uploading={uploadingAvatar}
        onCancel={() => {
          if (uploadingAvatar) return;
          setCropFile(null);
          setCropTargetScope(null);
        }}
        onConfirm={handleConfirmCroppedAvatar}
        onConfirmDirectServer={handleDirectServerAvatarUpload}
      />

      {/* Universal Deletion & Danger Confirmation Modal (Yes/Cancel + GitHub Type-to-Confirm) */}
      {(() => {
        if (!pendingConfirm) return null;

        if (pendingConfirm.kind === 'delete_link') {
          const { link } = pendingConfirm;
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="warning"
              title={
                lang === 'id'
                  ? `Hapus tautan "${link.title}"?`
                  : `Delete link "${link.title}"?`
              }
              description={
                lang === 'id'
                  ? `Tautan akan segera dihapus dari halaman Bio aktif Anda. Anda dapat memindahkannya ke Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS} hari sebelum terhapus otomatis) atau langsung menghapusnya permanen dari database.`
                  : `This link will be removed from your live Bio page immediately. Move it to the Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS}-day auto-purge) or erase it permanently right now.`
              }
              details={link.url}
              confirmLabel={
                lang === 'id'
                  ? `Pindah ke Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS} hari)`
                  : `Move to Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS} days)`
              }
              secondaryAction={{
                label:
                  lang === 'id'
                    ? 'Hapus Permanen Sekarang'
                    : 'Delete Permanently Now',
                tone: 'danger',
                onClick: () => void executeDeleteLink(link, false),
              }}
              loading={confirmBusy}
              onConfirm={() => void executeDeleteLink(link, true)}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'delete_avatar') {
          const { scope } = pendingConfirm;
          const isMain = scope === 'main';
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="danger"
              title={
                isMain
                  ? lang === 'id'
                    ? 'Hapus foto profil utama Bio?'
                    : 'Delete main Bio profile photo?'
                  : lang === 'id'
                    ? `Hapus foto khusus sub-halaman /${scope}?`
                    : `Remove custom photo for /${scope}?`
              }
              description={
                isMain
                  ? lang === 'id'
                    ? 'File AVIF foto profil utama Bio akan dihapus permanen dari penyimpanan Cloudflare (R2/D1/KV). Foto akun SSO myaccount.vz.gay Anda tidak terpengaruh.'
                    : 'The main Bio AVIF photo file will be permanently deleted from Cloudflare storage (R2/D1/KV). Your myaccount.vz.gay SSO avatar is unaffected.'
                  : lang === 'id'
                    ? `Foto khusus untuk /${scope} akan dihapus dari penyimpanan dan sub-halaman ini akan kembali mewarisi foto profil utama Bio.`
                    : `The custom photo for /${scope} will be deleted from storage and this sub-page will inherit your main Bio photo again.`
              }
              confirmLabel={lang === 'id' ? 'Ya, Hapus Foto' : 'Yes, Remove Photo'}
              loading={deletingAvatarScope === scope}
              onConfirm={async () => {
                await handleDeleteAvatar(scope);
                setPendingConfirm(null);
              }}
              onCancel={() => {
                if (!deletingAvatarScope) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'delete_subpage') {
          const { page } = pendingConfirm;
          const phrase =
            lang === 'id'
              ? `hapus /${page.pageSlug}`
              : `delete /${page.pageSlug}`;
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="danger"
              title={
                lang === 'id'
                  ? `Hapus sub-halaman ${username}.${domain}/${page.pageSlug}?`
                  : `Delete sub-page ${username}.${domain}/${page.pageSlug}?`
              }
              description={
                lang === 'id'
                  ? `Sub-halaman /${page.pageSlug} beserta ${page.links.length} tautan di dalamnya akan langsung ditarik dari publik. Anda dapat menyimpannya di Recycle Bin selama ${RECYCLE_BIN_RETENTION_DAYS} hari atau langsung menghapus permanen dari database.`
                  : `Sub-page /${page.pageSlug} and its ${page.links.length} link(s) will immediately be removed from public view. You can move it to Recycle Bin for ${RECYCLE_BIN_RETENTION_DAYS} days or delete it permanently.`
              }
              requireTypedText={phrase}
              confirmLabel={
                lang === 'id'
                  ? `Pindah ke Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS} hari)`
                  : `Move to Recycle Bin (${RECYCLE_BIN_RETENTION_DAYS} days)`
              }
              secondaryAction={{
                label:
                  lang === 'id'
                    ? 'Hapus Permanen dari DB'
                    : 'Delete Permanently from DB',
                tone: 'danger',
                onClick: () => void executeDeleteSubpage(page, false),
              }}
              loading={confirmBusy}
              onConfirm={() => void executeDeleteSubpage(page, true)}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'deactivate_bio') {
          const phrase =
            lang === 'id'
              ? `nonaktifkan ${username}.${domain}`
              : `deactivate ${username}.${domain}`;
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="warning"
              title={
                lang === 'id'
                  ? `Nonaktifkan sementara ${username}.${domain}?`
                  : `Temporarily deactivate ${username}.${domain}?`
              }
              description={
                lang === 'id'
                  ? `Halaman utama ${username}.${domain} dan seluruh sub-halaman /$PAGE akan disembunyikan dari publik. Seluruh tautan, ikon sosmed, dan foto AVIF tetap tersimpan aman di database dan dapat diaktifkan kembali kapan saja.`
                  : `Your main page ${username}.${domain} and all /$PAGE sub-pages will be hidden from public visitors. All links, social icons, and AVIF photos remain safely stored and can be reactivated anytime.`
              }
              requireTypedText={phrase}
              confirmLabel={
                lang === 'id'
                  ? 'Nonaktifkan Sementara Bio'
                  : 'Temporarily Deactivate Bio'
              }
              loading={confirmBusy}
              onConfirm={() => void handleSetBioDeactivated(true)}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'permanent_delete_bio') {
          const phrase =
            lang === 'id'
              ? `hapus ${username}.${domain}`
              : `delete ${username}.${domain}`;
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="danger"
              title={
                lang === 'id'
                  ? `Hapus permanen seluruh profil & data ${username}.${domain}?`
                  : `Permanently delete ${username}.${domain} and all data?`
              }
              description={
                lang === 'id'
                  ? `Seluruh profil, semua sub-halaman /$PAGE, daftar tautan, ikon sosmed, dan foto profil AVIF akan dihapus permanen dari Cloudflare D1, KV, dan R2 (tidak dapat dibatalkan). Anda harus menunggu ${BIO_DELETE_COOLDOWN_DAYS} hari sebelum dapat mengaktifkan ulang Bio.`
                  : `Your entire profile, all /$PAGE sub-pages, links, social icons, and AVIF photos will be permanently erased from Cloudflare D1, KV, and R2 (irreversible). A ${BIO_DELETE_COOLDOWN_DAYS}-day cooldown will apply before recreating your Bio.`
              }
              requireTypedText={phrase}
              confirmLabel={
                lang === 'id'
                  ? 'Hapus Permanen dari Database'
                  : 'Permanently Delete from Database'
              }
              loading={confirmBusy}
              onConfirm={() => void handlePermanentDeleteBio()}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'purge_recycle_item') {
          const { item } = pendingConfirm;
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="danger"
              title={
                lang === 'id'
                  ? `Hapus permanen "${item.label}" dari Recycle Bin?`
                  : `Permanently delete "${item.label}" from Recycle Bin?`
              }
              description={
                lang === 'id'
                  ? 'Item ini akan langsung dihapus permanen dari database Cloudflare D1/KV dan tidak dapat dipulihkan lagi.'
                  : 'This item will immediately be permanently erased from the Cloudflare D1/KV database and cannot be restored.'
              }
              details={item.summary || undefined}
              confirmLabel={
                lang === 'id' ? 'Ya, Hapus Permanen' : 'Yes, Delete Permanently'
              }
              loading={confirmBusy}
              onConfirm={() => void executePurgeRecycleItem(item)}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        if (pendingConfirm.kind === 'empty_recycle_bin') {
          const phrase =
            lang === 'id' ? 'kosongkan recycle bin' : 'empty recycle bin';
          return (
            <ConfirmActionModal
              isOpen
              lang={lang}
              tone="danger"
              title={
                lang === 'id'
                  ? `Kosongkan seluruh Recycle Bin (${recycleItems.length} item)?`
                  : `Empty entire Recycle Bin (${recycleItems.length} items)?`
              }
              description={
                lang === 'id'
                  ? 'Seluruh tautan Bio, sub-halaman, dan shortlink yang berada di Recycle Bin akan dihapus permanen dari database Cloudflare secara langsung.'
                  : 'All Bio links, sub-pages, and shortlinks currently in the Recycle Bin will be permanently erased from the Cloudflare database immediately.'
              }
              requireTypedText={phrase}
              confirmLabel={
                lang === 'id'
                  ? 'Kosongkan Permanen Sekarang'
                  : 'Empty Permanently Now'
              }
              loading={confirmBusy}
              onConfirm={() => void executeEmptyRecycleBin()}
              onCancel={() => {
                if (!confirmBusy) setPendingConfirm(null);
              }}
            />
          );
        }

        return null;
      })()}

      {/* Quick QR Code Modal for Active Bio Page or Individual Bio Link Item */}
      <QrCodeModal
        isOpen={Boolean(quickQrModal)}
        lang={lang}
        title={quickQrModal?.title || ''}
        subtitle={quickQrModal?.subtitle}
        url={quickQrModal?.url || ''}
        filenameBase={quickQrModal?.filenameBase || 'bio-qr'}
        design={quickQrModal?.design}
        centerImageUrl={quickQrModal?.centerImageUrl}
        monogramText={quickQrModal?.monogramText}
        onClose={() => setQuickQrModal(null)}
      />
    </div>
  );
}
