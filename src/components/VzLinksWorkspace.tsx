import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import {
  deleteShortlink,
  getOrSeedBioProfile,
  getOrSeedShortlinks,
  saveBioProfile,
  saveShortlink,
  type BioLinkCardItem,
  type ImyBioProfile,
  type ImyShortlink,
} from '../utils/localMailDb';
import type { ActiveHostView } from './MailLinksTopBar';

interface VzLinksWorkspaceProps {
  lang: Language;
  session: SsoSession;
  initialSubTab?: 'bio' | 'shortlinks';
  onSelectHost: (host: ActiveHostView) => void;
  onActivateMailFromLinks: () => void;
  onDeactivateLinks: () => void;
  onOpenSso: () => void;
}

export function VzLinksWorkspace({
  lang,
  session,
  initialSubTab = 'bio',
  onSelectHost,
  onActivateMailFromLinks,
  onDeactivateLinks,
  onOpenSso,
}: VzLinksWorkspaceProps) {
  const user = session.username || 'fadhil';
  const domain = session.primaryDomain || 'imy.li';
  const [subTab, setSubTab] = useState<'bio' | 'shortlinks'>(initialSubTab);

  const [profile, setProfile] = useState<ImyBioProfile | null>(null);
  const [shortlinks, setShortlinks] = useState<ImyShortlink[]>([]);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Add Bio Link form
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkSubtitle, setNewLinkSubtitle] = useState('');
  const [newLinkCategory, setNewLinkCategory] =
    useState<BioLinkCardItem['category']>('project');

  // Add Shortlink form
  const [newSlug, setNewSlug] = useState('');
  const [newShortTitle, setNewShortTitle] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const loadLinksData = async () => {
    const [p, sl] = await Promise.all([
      getOrSeedBioProfile(user),
      getOrSeedShortlinks(user),
    ]);
    setProfile(p);
    setShortlinks(sl);
  };

  useEffect(() => {
    loadLinksData();
  }, [user]);

  const flashBanner = (msg: string) => {
    setSavedBanner(msg);
    window.setTimeout(() => {
      setSavedBanner((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const handleSaveProfileMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const updated: ImyBioProfile = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await saveBioProfile(updated);
    setProfile(updated);
    flashBanner(
      lang === 'id'
        ? `Profil statis ${user}.${domain} berhasil diperbarui.`
        : `Static profile ${user}.${domain} updated.`
    );
  };

  const handleAddBioLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
    const normalizedUrl =
      newLinkUrl.trim().startsWith('http://') ||
      newLinkUrl.trim().startsWith('https://') ||
      newLinkUrl.trim().startsWith('mailto:')
        ? newLinkUrl.trim()
        : `https://${newLinkUrl.trim()}`;

    const item: BioLinkCardItem = {
      id: `link-${Date.now()}`,
      title: newLinkTitle.trim(),
      url: normalizedUrl,
      subtitle:
        newLinkSubtitle.trim() || `Tautan terverifikasi di ${user}.${domain}`,
      category: newLinkCategory,
      clicks: 0,
      enabled: true,
    };

    const updated: ImyBioProfile = {
      ...profile,
      links: [...profile.links, item],
      updatedAt: new Date().toISOString(),
    };
    await saveBioProfile(updated);
    setProfile(updated);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkSubtitle('');
    flashBanner(
      lang === 'id'
        ? 'Tautan ditambahkan ke halaman bio.'
        : 'Link added to bio page.'
    );
  };

  const handleRemoveBioLink = async (id: string) => {
    if (!profile) return;
    const updated: ImyBioProfile = {
      ...profile,
      links: profile.links.filter((l) => l.id !== id),
      updatedAt: new Date().toISOString(),
    };
    await saveBioProfile(updated);
    setProfile(updated);
  };

  const handleCreateShortlink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetUrl.trim()) return;
    const cleanSlug = (
      newSlug.trim() || Math.random().toString(36).slice(2, 7)
    )
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');

    if (!cleanSlug) return;

    const normalizedTarget =
      newTargetUrl.trim().startsWith('http://') ||
      newTargetUrl.trim().startsWith('https://')
        ? newTargetUrl.trim()
        : `https://${newTargetUrl.trim()}`;

    const record: ImyShortlink = {
      slug: cleanSlug,
      ownerUser: user,
      title: newShortTitle.trim() || `Shortlink ${domain}/s/${cleanSlug}`,
      targetUrl: normalizedTarget,
      clicks: 0,
      createdAt: new Date().toISOString(),
      safeBrowsingVerified: true,
    };

    await saveShortlink(record);
    setNewSlug('');
    setNewShortTitle('');
    setNewTargetUrl('');
    await loadLinksData();
    flashBanner(
      lang === 'id'
        ? `Shortlink https://${domain}/s/${cleanSlug} siap digunakan.`
        : `Shortlink https://${domain}/s/${cleanSlug} created.`
    );
  };

  const handleTestShortlinkClick = async (item: ImyShortlink) => {
    const updated: ImyShortlink = { ...item, clicks: item.clicks + 1 };
    await saveShortlink(updated);
    await loadLinksData();
    flashBanner(
      lang === 'id'
        ? `Simulasi HTTP 301: https://${domain}/s/${item.slug} -> ${item.targetUrl}`
        : `Simulated HTTP 301: https://${domain}/s/${item.slug} -> ${item.targetUrl}`
    );
  };

  const handleDeleteShortlink = async (slug: string) => {
    await deleteShortlink(slug);
    await loadLinksData();
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    flashBanner(
      lang === 'id' ? `Disalin: ${text}` : `Copied: ${text}`
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {savedBanner && (
        <div className="bg-slate-900 dark:bg-blue-950 text-white border border-slate-700 dark:border-blue-800 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* VZ Links Workspace Header Bar */}
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>links.vz.gay</span>
            <span aria-hidden="true"> · </span>
            <span>Bio: {user}.{domain}</span>
            <span aria-hidden="true"> · </span>
            <span>Shortlinks: {domain}/s/$URL</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white font-display">
            {lang === 'id'
              ? `Studio Link-in-Bio & Pemendek Tautan (${user}.${domain})`
              : `Link-in-Bio & Shortlink Studio (${user}.${domain})`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0D11] rounded-lg border border-slate-200/70 dark:border-[#232732]">
            <button
              type="button"
              onClick={() => setSubTab('bio')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                subTab === 'bio'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {user}.{domain} Bio
            </button>
            <button
              type="button"
              onClick={() => setSubTab('shortlinks')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                subTab === 'shortlinks'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {domain}/s/$URL ({shortlinks.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectHost('bio_public')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {lang === 'id'
                ? `Pratinjau ${user}.${domain}`
                : `Preview ${user}.${domain}`}
            </span>
          </button>

          {!session.mailActivated ? (
            <button
              type="button"
              onClick={() => {
                onActivateMailFromLinks();
                onSelectHost('mail.vz.gay');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>
                {lang === 'id'
                  ? `Aktifkan Email ${user}@${domain}`
                  : `Configure ${user}@${domain} Mail`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectHost('mail.vz.gay')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{user}@{domain}</span>
            </button>
          )}
        </div>
      </div>

      {subTab === 'bio' && profile ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Profile & Links Editor (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <form
              onSubmit={handleSaveProfileMeta}
              className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#232732] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                    {lang === 'id'
                      ? `Identitas Halaman Statis (${user}.${domain})`
                      : `Static Page Identity (${user}.${domain})`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    PSL-safe static rendering · Zero cross-subdomain cookies · No arbitrary user JS
                  </p>
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {lang === 'id' ? 'Simpan Profil' : 'Save Profile'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama Tampilan:
                  </label>
                  <input
                    type="text"
                    value={profile.displayName}
                    onChange={(e) =>
                      setProfile({ ...profile, displayName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi / Tagline Singkat:
                  </label>
                  <input
                    type="text"
                    value={profile.location}
                    onChange={(e) =>
                      setProfile({ ...profile, location: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Headline:
                </label>
                <input
                  type="text"
                  value={profile.headline}
                  onChange={(e) =>
                    setProfile({ ...profile, headline: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Bio Singkat:
                </label>
                <textarea
                  rows={3}
                  value={profile.bio}
                  onChange={(e) =>
                    setProfile({ ...profile, bio: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Alias Email Publik (+Tag untuk Anti-Spam):
                  </label>
                  <input
                    type="text"
                    value={profile.publicEmailAlias}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        publicEmailAlias: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={profile.showPublicEmailButton}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          showPublicEmailButton: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      {lang === 'id'
                        ? `Tampilkan tombol kontak ${user}@${domain}`
                        : `Show ${user}@${domain} contact button`}
                    </span>
                  </label>
                </div>
              </div>
            </form>

            {/* Bio Links List + Add New Link */}
            <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'id'
                    ? `Daftar Tautan Terkurasi (${profile.links.length})`
                    : `Curated Bio Links (${profile.links.length})`}
                </h2>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  Safe-Browsing Validated
                </span>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-[#232732] border border-slate-200 dark:border-[#232732] rounded-lg">
                {profile.links.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate">
                        {item.url}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.subtitle} · {item.clicks} clicks
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBioLink(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      aria-label="Remove link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleAddBioLink}
                className="pt-3 border-t border-slate-200 dark:border-[#232732] space-y-3"
              >
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {lang === 'id' ? '+ Tambah Kartu Tautan Baru' : '+ Add New Link Card'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Judul tautan (mis. GitHub / Portofolio)"
                    className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    required
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://... atau https://imy.li/s/..."
                    className="px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={newLinkSubtitle}
                    onChange={(e) => setNewLinkSubtitle(e.target.value)}
                    placeholder="Deskripsi singkat (opsional)"
                    className="sm:col-span-2 px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                  <select
                    value={newLinkCategory}
                    onChange={(e) =>
                      setNewLinkCategory(
                        e.target.value as BioLinkCardItem['category']
                      )
                    }
                    className="px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="project">Project</option>
                    <option value="social">Social</option>
                    <option value="contact">Contact</option>
                    <option value="document">Document</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'id' ? 'Tambahkan Tautan' : 'Add Link'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right: Live Mini Static Preview Card (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#232732] pb-3">
              <div className="text-xs font-mono text-slate-500">
                https://{user}.{domain}
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(`https://${user}.${domain}`)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy URL</span>
              </button>
            </div>

            <div className="p-5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-4">
              <div className="space-y-1">
                <div className="w-11 h-11 rounded-lg bg-blue-600 text-white font-display font-bold flex items-center justify-center text-base">
                  {user.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="pt-2 text-base font-bold text-slate-900 dark:text-white font-display">
                  {profile.displayName}
                </h3>
                <div className="text-xs font-mono text-slate-500">
                  @{user} · {profile.location}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                  {profile.bio}
                </p>
              </div>

              {profile.showPublicEmailButton && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-blue-700 dark:text-blue-300 truncate">
                    {profile.publicEmailAlias}
                  </span>
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    VZ Mail Verified
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {profile.links.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={onOpenSso}
                className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                myaccount.vz.gay
              </button>
              <button
                type="button"
                onClick={onDeactivateLinks}
                className="hover:text-rose-600 cursor-pointer"
              >
                {lang === 'id' ? 'Nonaktifkan VZ Links' : 'Disable VZ Links'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* SHORTLINK MANAGER: imy.li/s/$URL */
        <div className="space-y-6">
          <form
            onSubmit={handleCreateShortlink}
            className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'id'
                    ? `Buat Shortlink Baru (${domain}/s/$URL)`
                    : `Create New Shortlink (${domain}/s/$URL)`}
                </h2>
                <p className="text-xs text-slate-500">
                  {lang === 'id'
                    ? `Dialihkan cepat via HTTP 301 oleh Cloudflare Worker yang sama dengan mail.vz.gay dan ${user}.${domain}.`
                    : `Fast HTTP 301 edge redirect handled by the same Cloudflare Worker serving mail.vz.gay and ${user}.${domain}.`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Anti-Phishing Route Guard</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Slug ({domain}/s/...):
                </label>
                <div className="flex items-center">
                  <span className="px-2.5 py-2 text-xs font-mono bg-slate-100 dark:bg-[#1B202B] border border-r-0 border-slate-300 dark:border-[#2A303D] rounded-l-lg text-slate-500">
                    /s/
                  </span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="cv-2026"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-r-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  URL Tujuan (Target URL):
                </label>
                <input
                  type="text"
                  required
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  placeholder="https://docs.vz.gay/proposal-2026"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Label / Judul (Opsional):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newShortTitle}
                    onChange={(e) => setNewShortTitle(e.target.value)}
                    placeholder="Proposal & CV"
                    className="flex-1 px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {lang === 'id' ? '+ Buat' : '+ Create'}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Shortlinks High-Density Data Grid */}
          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-display">
                <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>
                  {lang === 'id'
                    ? `Daftar Shortlink Aktif (${domain}/s/$URL)`
                    : `Active Shortlinks (${domain}/s/$URL)`}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {shortlinks.length} routes
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0F131A] text-slate-500">
                    <th className="py-2.5 pl-5 pr-3 font-medium">Short URL</th>
                    <th className="py-2.5 px-3 font-medium">Label & Target</th>
                    <th className="py-2.5 px-3 font-medium text-right">Clicks</th>
                    <th className="py-2.5 pl-3 pr-5 font-medium text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#232732]">
                  {shortlinks.map((item) => {
                    const fullShort = `https://${domain}/s/${item.slug}`;
                    return (
                      <tr
                        key={item.slug}
                        className="h-11 hover:bg-slate-50 dark:hover:bg-[#171B24]"
                      >
                        <td className="py-2.5 pl-5 pr-3 font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {domain}/s/{item.slug}
                        </td>
                        <td className="py-2.5 px-3 max-w-md truncate">
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 truncate">
                            {item.targetUrl}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {item.clicks}
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => handleTestShortlinkClick(item)}
                            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            Test 301
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyText(fullShort)}
                            className="text-xs text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShortlink(item.slug)}
                            className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
