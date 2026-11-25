import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  Globe,
  Link2,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  MAX_RAW_UPLOAD_BYTES,
  formatBytesCompact,
  type EncodedAvatarResult,
} from '../utils/avatarEncoder';
import {
  BIO_THEMES,
  SOCIAL_PLATFORMS,
  createEmptyBioWorkspace,
  sanitizePageSlug,
  type BioButtonStyle,
  type BioLinkItem,
  type BioPageRecord,
  type BioThemeId,
  type BioWorkspaceData,
  type SocialPlatformId,
} from '../utils/linksModel';
import { BioAvatarCropModal } from './BioAvatarCropModal';
import type { ActiveHostView } from './MailLinksTopBar';
import { SocialIconGlyph } from './SocialIconGlyph';

interface VzLinksWorkspaceProps {
  lang: Language;
  session: SsoSession;
  onSelectHost: (host: ActiveHostView) => void;
  onOpenPublicBioPage: (pageSlug: string) => void;
  onActivateMailFromLinks: () => void;
  onDeactivateLinks: () => void;
}

type EditorTab = 'links' | 'profile_socials' | 'theme';

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
  const statusTimerRef = useRef<number | null>(null);

  const flashStatus = (type: 'ok' | 'error', text: string) => {
    setStatusMessage({ type, text });
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(null), 3600);
  };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/links/bio/${encodeURIComponent(username)}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        configured?: boolean;
        storageEngine?: string;
        data?: BioWorkspaceData | null;
      } | null;

      if (res.ok && json?.ok) {
        if (json.storageEngine) setStorageEngine(json.storageEngine);
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
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, [loadWorkspace]);

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
      const res = await fetch(`/api/links/bio/${encodeURIComponent(username)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        storageEngine?: string;
        data?: BioWorkspaceData;
      } | null;

      if (!res.ok || !json?.ok || !json.data) {
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

    if (!file.type.startsWith('image/')) {
      flashStatus(
        'error',
        lang === 'id'
          ? 'Pilih file gambar yang valid (JPG, PNG, WebP, atau AVIF).'
          : 'Please choose a valid image file (JPG, PNG, WebP, or AVIF).'
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

  const handleConfirmCroppedAvatar = async (encoded: EncodedAvatarResult) => {
    if (!cropTargetScope) return;
    setUploadingAvatar(true);
    try {
      const endpoint =
        cropTargetScope === 'main'
          ? `/api/links/avatar/${encodeURIComponent(username)}`
          : `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(cropTargetScope)}`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': encoded.mimeType },
        body: encoded.blob,
      });

      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        avatarUrl?: string;
        storageEngine?: string;
        byteSize?: number;
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

      const nextWorkspace: BioWorkspaceData =
        cropTargetScope === 'main'
          ? { ...workspace, avatarUrl: json.avatarUrl }
          : {
              ...workspace,
              pages: workspace.pages.map((p) =>
                p.pageSlug === cropTargetScope
                  ? { ...p, avatarUrl: json.avatarUrl || '' }
                  : p
              ),
            };

      setWorkspace(nextWorkspace);
      setCropFile(null);
      setCropTargetScope(null);

      const sizeText = formatBytesCompact(json.byteSize || encoded.byteSize);
      const storageLabel = formatMediaStorageBadge(json.storageEngine || '');
      const scopeText =
        cropTargetScope === 'main'
          ? `${username}.${domain}`
          : `${username}.${domain}/${cropTargetScope}`;

      await persistWorkspace(
        nextWorkspace,
        lang === 'id'
          ? `Foto profil ${scopeText} diperbarui (${encoded.formatLabel} · ${sizeText} · ${storageLabel}).`
          : `Profile photo for ${scopeText} updated (${encoded.formatLabel} · ${sizeText} · ${storageLabel}).`
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

  const handleDeleteAvatar = async (scope: 'main' | string) => {
    setDeletingAvatarScope(scope);
    try {
      const endpoint =
        scope === 'main'
          ? `/api/links/avatar/${encodeURIComponent(username)}`
          : `/api/links/avatar/${encodeURIComponent(username)}/${encodeURIComponent(scope)}`;

      await fetch(endpoint, { method: 'DELETE' }).catch(() => {});

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

  const handleDeleteSubpage = (slug: string) => {
    if (!slug) return; // Root page cannot be deleted
    updateWorkspace((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.pageSlug !== slug),
    }));
    if (activePageSlug === slug) {
      setActivePageSlug('');
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

  const handleDeleteLink = (linkId: string) => {
    updateActivePage((page) => ({
      ...page,
      links: page.links
        .filter((l) => l.id !== linkId)
        .map((l, idx) => ({ ...l, sortOrder: idx })),
    }));
  };

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
    navigator.clipboard?.writeText(`https://${activePublicPath}`).catch(() => {});
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

        <div className="flex flex-wrap items-center gap-2">
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
            disabled={saving || loading}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

      {/* Multi-Page Switcher Bar ($USERNAME.imy.li & $USERNAME.imy.li/$PAGE) */}
      <section className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {workspace.pages.map((page) => {
              const isSelected = page.pageSlug === activePage.pageSlug;
              const isRoot = page.pageSlug === '';
              return (
                <div key={page.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setActivePageSlug(page.pageSlug)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[#FAFAFA] dark:bg-[#0B0D11] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A303D] hover:border-blue-500/60'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isRoot
                        ? lang === 'id'
                          ? `Utama (${username}.${domain})`
                          : `Main (${username}.${domain})`
                        : `/${page.pageSlug}`}
                    </span>
                    <span className="opacity-70 text-[10px] tabular-nums">
                      ({page.links.length})
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
              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
                  <div className="flex items-center justify-between gap-2">
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
                      <button
                        type="button"
                        onClick={() => handleDeleteSubpage(activePage.pageSlug)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Hapus Halaman' : 'Delete Page'}</span>
                      </button>
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
                          accept="image/*"
                          onChange={(e) =>
                            handleSelectAvatarFile(e, activePage.pageSlug)
                          }
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => subpageAvatarInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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
                              void handleDeleteAvatar(activePage.pageSlug)
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
                              onClick={() => handleDeleteLink(link.id)}
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
                              ? 'Foto Profil Khusus Bio Link (AVIF 256×256)'
                              : 'Dedicated Bio Link Photo (AVIF 256×256)'}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {lang === 'id'
                              ? 'Terpisah sepenuhnya dari foto akun SSO myaccount.vz.gay. Otomatis dipotong 1:1 & dikompres ke AVIF ultra-ringan sebelum diunggah.'
                              : 'Completely independent from your myaccount.vz.gay SSO avatar. Automatically cropped 1:1 & compressed to ultra-light AVIF before upload.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <input
                          ref={mainAvatarInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleSelectAvatarFile(e, 'main')}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => mainAvatarInputRef.current?.click()}
                          disabled={uploadingAvatar}
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
                            onClick={() => void handleDeleteAvatar('main')}
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
            ) : (
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
            )}
          </div>
        </div>

        {/* Right Live Mobile Preview */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>{lang === 'id' ? 'Pratinjau Langsung' : 'Live Preview'}</span>
            <span className="truncate max-w-[240px]">https://{activePublicPath}</span>
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

      {/* Interactive 1:1 AVIF Crop & Upload Modal */}
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
      />
    </div>
  );
}
