import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderArchive,
  FolderOpen,
  HardDrive,
  Inbox,
  Link2,
  Loader2,
  Lock,
  MailPlus,
  MessageSquare,
  Paperclip,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Table2,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoSession';
import type { ThemePreference } from '../hooks/useTheme';
import {
  MAIL_ATTACHMENT_MAX_COUNT,
  MAIL_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../utils/linksModel';
import {
  deleteMessageFromLocalDb,
  ensureUserMessagesSeeded,
  markMessagesAsRead,
  normalizeInboundPacketToLocalMessage,
  saveMessage,
  saveMessagesBatch,
  type LocalMailMessage,
  type MailAttachment,
  type MailFolder,
} from '../utils/localMailDb';
import {
  DEFAULT_SUPPORTED_DOMAINS,
  generateAliasExamples,
  resolveCanonicalEmail,
} from '../utils/mailIdentity';
import { generateSecureId } from '../utils/mailSecurity';
import {
  serializeToEml,
  triggerBrowserDownload,
} from '../utils/mailVaultCrypto';
import { checkReservedUsername } from '../utils/reservedUsernames';
import {
  formatFileSizeLabel,
  normalizeAndClassifyExternalLink,
  type MailExternalLink,
} from '../utils/mailExternalLinks';
import {
  uploadFileToVzFiles,
  type VzFilesUploadProgress,
} from '../utils/vzFilesUploader';
import { ConfirmActionModal } from './ConfirmActionModal';
import { MailExternalLinksView } from './MailExternalLinksView';
import {
  MailFloatingComposer,
  type ComposeFeedbackState,
  type ComposeWindowMode,
  type PendingComposeAttachment,
} from './MailFloatingComposer';
import type { ActiveHostView } from './MailLinksTopBar';
import { MailSearchGroundingDrawer } from './MailSearchGroundingDrawer';
import { MailQrModal } from './QrCodeModal';

interface VzMailWorkspaceProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: ThemePreference;
  onChangeTheme: (theme: ThemePreference) => void;
  session: SsoSession;
  composeRequested: number;
  onSelectHost: (host: ActiveHostView) => void;
  onOpenVault: () => void;
  onDeactivateMail: () => void;
  refreshTrigger: number;
}

interface EphemeralEdgePacket {
  id: string;
  rfcMessageId: string;
  canonicalUser: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  plusTag: string | null;
  dotNormalized: boolean;
  subject: string;
  bodyText: string;
  receivedAt: string;
  attachments?: MailAttachment[];
  externalLinks?: MailExternalLink[];
}

interface ToastNotification {
  kind: 'success' | 'error' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return arrayBufferToBase64(buf);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

function triggerBinaryBrowserDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SESSION_FALLBACK_KEY_PREFIX = 'vz_ephemeral_transit_fallback_v1:';

function readLocalFallbackQueue(user: string): EphemeralEdgePacket[] {
  try {
    const raw = sessionStorage.getItem(`${SESSION_FALLBACK_KEY_PREFIX}${user}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EphemeralEdgePacket[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFallbackQueue(user: string, packets: EphemeralEdgePacket[]): void {
  try {
    if (packets.length === 0) {
      sessionStorage.removeItem(`${SESSION_FALLBACK_KEY_PREFIX}${user}`);
    } else {
      sessionStorage.setItem(
        `${SESSION_FALLBACK_KEY_PREFIX}${user}`,
        JSON.stringify(packets.slice(0, 50))
      );
    }
  } catch {
    // Ignore sessionStorage restrictions
  }
}

function enqueueLocalFallbackPacket(packet: EphemeralEdgePacket): void {
  const existing = readLocalFallbackQueue(packet.canonicalUser);
  if (existing.some((p) => p.id === packet.id)) return;
  writeLocalFallbackQueue(packet.canonicalUser, [packet, ...existing]);
}

export function VzMailWorkspace({
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  session,
  composeRequested,
  onSelectHost,
  onOpenVault,
  onDeactivateMail,
  refreshTrigger,
}: VzMailWorkspaceProps) {
  const user = session.username || 'fadhil';
  const domain = session.primaryDomain || 'imy.li';
  const primaryEmail = `${user}@${domain}`;

  const [viewMode, setViewMode] = useState<'conversational' | 'classic'>(() => {
    try {
      const saved = localStorage.getItem('vz_mail_view_mode');
      return saved === 'classic' ? 'classic' : 'conversational';
    } catch {
      return 'conversational';
    }
  });

  const [activeFolder, setActiveFolder] = useState<MailFolder>('inbox');
  const [selectedPlusTag, setSelectedPlusTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<LocalMailMessage[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);

  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [selectedMessageId, setSelectedMessageId] = useState<string>('');
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [expandedHeaderIds, setExpandedHeaderIds] = useState<Record<string, boolean>>({});
  const [quickReplyText, setQuickReplyText] = useState('');
  const [sendingQuickReply, setSendingQuickReply] = useState(false);
  const [pendingPermanentDeleteMsg, setPendingPermanentDeleteMsg] =
    useState<LocalMailMessage | null>(null);
  const [deletingLocalMsg, setDeletingLocalMsg] = useState(false);
  const [groundingDrawer, setGroundingDrawer] = useState<{
    open: boolean;
    email: string;
    name: string;
    subject: string;
  }>({
    open: false,
    email: '',
    name: '',
    subject: '',
  });
  const openSearchGrounding = useCallback(
    (email = '', name = '', subject = '') => {
      setGroundingDrawer({
        open: true,
        email,
        name,
        subject,
      });
    },
    []
  );
  const [mailQrState, setMailQrState] = useState<{
    open: boolean;
    initialEmail?: string;
  }>({ open: false });
  const reservedMailCheck = useMemo(
    () => checkReservedUsername(user),
    [user]
  );

  // Ephemeral Edge Transit Queue state
  const [edgePackets, setEdgePackets] = useState<EphemeralEdgePacket[]>([]);
  const [syncingEdge, setSyncingEdge] = useState(false);
  const [lastPurgeReceipt, setLastPurgeReceipt] = useState<string>(
    'PURGED-CF-EDGE-0B-RETAINED'
  );
  const [quotaUsed, setQuotaUsed] = useState(1);
  const [quotaLimit, setQuotaLimit] = useState(25);
  const [toastNotice, setToastNotice] = useState<ToastNotification | null>(null);

  // Floating Gmail / Hotmail-Style Composer state
  const [composeMode, setComposeMode] = useState<ComposeWindowMode>('closed');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeFromAlias, setComposeFromAlias] = useState(primaryEmail);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<PendingComposeAttachment[]>([]);
  const [composeExternalLinks, setComposeExternalLinks] = useState<MailExternalLink[]>([]);
  const [oversizedFiles, setOversizedFiles] = useState<File[]>([]);
  const [vzUploadProgress, setVzUploadProgress] = useState<VzFilesUploadProgress | null>(null);
  const [composeSending, setComposeSending] = useState(false);
  const [composeFeedback, setComposeFeedback] = useState<ComposeFeedbackState>({
    kind: 'idle',
    message: '',
  });
  const [downloadingAttId, setDownloadingAttId] = useState<string | null>(null);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);

  // Inbound Alias Simulator Modal state
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simToAlias, setSimToAlias] = useState(
    `${user.slice(0, 2)}.${user.slice(2) || 'id'}+promo@${domain}`
  );
  const [simFromName, setSimFromName] = useState('Arief Budiman');
  const [simFromAddr, setSimFromAddr] = useState('arief@proton.me');
  const [simSubject, setSimSubject] = useState(
    `Konfirmasi Kolaborasi via Alias Titik & Plus (${user}@${domain})`
  );
  const [simBody, setSimBody] = useState(
    `Halo ${user},\n\nPesan ini dikirim ke alamat alias Anda untuk menguji Cloudflare Email Routing -> Ephemeral Transit Queue -> Pop-and-Purge ke IndexedDB perangkat lokal.`
  );

  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (
      msg: string,
      options?: {
        kind?: 'success' | 'error' | 'info';
        actionLabel?: string;
        onAction?: () => void;
        durationMs?: number;
      }
    ) => {
      const nextToast: ToastNotification = {
        kind: options?.kind || 'info',
        message: msg,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      };
      setToastNotice(nextToast);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      const timeoutMs =
        options?.durationMs ?? (nextToast.kind === 'error' ? 8000 : 5500);
      toastTimerRef.current = window.setTimeout(() => {
        setToastNotice((curr) => (curr?.message === msg ? null : curr));
      }, timeoutMs);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Keep user-dependent defaults synchronized when SSO handle or primary domain changes
  useEffect(() => {
    setComposeFromAlias(primaryEmail);
    setSimToAlias(`${user.slice(0, 2)}.${user.slice(2) || 'id'}+promo@${domain}`);
    setSimSubject(`Konfirmasi Kolaborasi via Alias Titik & Plus (${primaryEmail})`);
    setSimBody(
      `Halo ${user},\n\nPesan ini dikirim ke alamat alias Anda untuk menguji Cloudflare Email Routing -> Ephemeral Transit Queue -> Pop-and-Purge ke IndexedDB perangkat lokal.`
    );
  }, [user, domain, primaryEmail]);

  // Escape key closes Simulator & mobile Folders drawer, or shrinks fullscreen composer back to floating
  useEffect(() => {
    if (composeMode !== 'fullscreen' && !simulatorOpen && !mobileFoldersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (composeMode === 'fullscreen' && !composeSending) {
          setComposeMode('floating');
        }
        setSimulatorOpen(false);
        setMobileFoldersOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composeMode, composeSending, simulatorOpen, mobileFoldersOpen]);

  // Lock body scroll and close mobile Folders drawer when resizing to desktop
  useEffect(() => {
    if (!mobileFoldersOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileFoldersOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('resize', onResize);
    };
  }, [mobileFoldersOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('vz_mail_view_mode', viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (composeRequested > 0) {
      setComposeFromAlias(primaryEmail);
      setComposeFeedback({ kind: 'idle', message: '' });
      setComposeMode((prev) => (prev === 'closed' ? 'floating' : prev));
    }
  }, [composeRequested, primaryEmail]);

  const loadLocalMessages = useCallback(async () => {
    setLoadingLocal(true);
    try {
      const list = await ensureUserMessagesSeeded(user, domain);
      setMessages(list);
      if (list.length > 0) {
        setSelectedThreadId((prev) =>
          prev && list.some((m) => m.threadId === prev) ? prev : list[0].threadId
        );
        setSelectedMessageId((prev) =>
          prev && list.some((m) => m.id === prev) ? prev : list[0].id
        );
      }
    } finally {
      setLoadingLocal(false);
    }
  }, [user, domain]);

  const checkEdgeTransitQueue = useCallback(
    async (signal?: AbortSignal) => {
      const localPending = readLocalFallbackQueue(user);
      try {
        const res = await fetch(
          `/api/mail/queue?username=${encodeURIComponent(user)}`,
          { signal }
        );
        if (!res.ok) {
          setEdgePackets(localPending);
          return;
        }
        const data = await res.json();
        if (data.ok) {
          const remotePackets: EphemeralEdgePacket[] = Array.isArray(data.packets)
            ? data.packets
            : [];
          const mergedMap = new Map<string, EphemeralEdgePacket>();
          for (const pkt of [...remotePackets, ...localPending]) {
            mergedMap.set(pkt.id, pkt);
          }
          setEdgePackets(Array.from(mergedMap.values()));
          if (data.outboundQuota) {
            setQuotaUsed(data.outboundQuota.usedToday ?? 0);
            setQuotaLimit(data.outboundQuota.dailyLimit ?? 25);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Offline mode graceful fallback
        setEdgePackets(localPending);
      }
    },
    [user]
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const init = async () => {
      setLoadingLocal(true);
      try {
        const list = await ensureUserMessagesSeeded(user, domain);
        if (cancelled) return;
        setMessages(list);
        if (list.length > 0) {
          setSelectedThreadId((prev) =>
            prev && list.some((m) => m.threadId === prev) ? prev : list[0].threadId
          );
          setSelectedMessageId((prev) =>
            prev && list.some((m) => m.id === prev) ? prev : list[0].id
          );
        }
      } finally {
        if (!cancelled) setLoadingLocal(false);
      }

      try {
        const seedRes = await fetch('/api/mail/seed-transit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user }),
          signal: controller.signal,
        });
        if (seedRes.ok) {
          const seedData = await seedRes.json();
          const seededFlagKey = `vz_seeded_local_transit_v1:${user}`;
          if (
            seedData.ok &&
            seedData.seedPacket &&
            !sessionStorage.getItem(seededFlagKey)
          ) {
            enqueueLocalFallbackPacket(seedData.seedPacket as EphemeralEdgePacket);
            sessionStorage.setItem(seededFlagKey, '1');
          }
        }
      } catch {
        // Ignore offline/abort errors
      }

      if (!cancelled) {
        await checkEdgeTransitQueue(controller.signal);
      }
    };

    init();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, domain, refreshTrigger, checkEdgeTransitQueue]);

  // Pull pending packets from Cloudflare Edge Queue:
  // 1. Commit durably to local IndexedDB FIRST (zero data-loss guarantee)
  // 2. ACK server to permanently purge from Edge KV & clear session fallback buffer
  // 3. Stamp authoritative purge receipt onto committed local messages
  const handlePopAndPurgeEdgeQueue = async () => {
    setSyncingEdge(true);
    try {
      const localPending = readLocalFallbackQueue(user);
      let remotePackets: EphemeralEdgePacket[] = [];

      try {
        const res = await fetch(
          `/api/mail/queue?username=${encodeURIComponent(user)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.packets)) {
            remotePackets = data.packets;
          }
        }
      } catch {
        // Proceed with localPending if offline
      }

      const mergedMap = new Map<string, EphemeralEdgePacket>();
      for (const pkt of [...remotePackets, ...localPending]) {
        mergedMap.set(pkt.id, pkt);
      }
      const packets = Array.from(mergedMap.values());

      if (packets.length === 0) {
        setEdgePackets([]);
        showToast(
          lang === 'id'
            ? 'Antrean transit edge bersih (0 pesan di server). Semua pesan sudah ada di IndexedDB lokal.'
            : 'Edge transit queue is empty (0 messages on server). All messages are in local IndexedDB.'
        );
        return;
      }

      // STEP 1: Commit to local device IndexedDB BEFORE purging server queue!
      const provisionalReceipt = `COMMITTED-LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const localMsgs = packets.map((pkt) =>
        normalizeInboundPacketToLocalMessage(
          {
            ...pkt,
            ephemeralQueueReceipt: provisionalReceipt,
          },
          [domain, ...DEFAULT_SUPPORTED_DOMAINS]
        )
      );
      await saveMessagesBatch(localMsgs);

      // STEP 2: Only after local IndexedDB write succeeded, ACK to purge server queue
      let receipt = provisionalReceipt;
      try {
        const ackRes = await fetch('/api/mail/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user,
            packetIds: packets.map((p) => p.id),
          }),
        });
        if (ackRes.ok) {
          const ackData = await ackRes.json();
          if (ackData.receiptCode) {
            receipt = ackData.receiptCode;
          }
        }
      } catch {
        // Local messages are already safely persisted
      }

      // STEP 3: Clear fallback buffer & stamp authoritative purge receipt
      writeLocalFallbackQueue(user, []);
      if (receipt !== provisionalReceipt) {
        await saveMessagesBatch(
          localMsgs.map((m) => ({ ...m, ephemeralQueueReceipt: receipt }))
        );
      }

      setLastPurgeReceipt(receipt);
      setEdgePackets([]);
      await loadLocalMessages();

      if (localMsgs[0]) {
        setSelectedThreadId(localMsgs[0].threadId);
        setSelectedMessageId(localMsgs[0].id);
      }

      showToast(
        lang === 'id'
          ? `${localMsgs.length} email tersimpan di IndexedDB lokal & dihapus permanen dari server (${receipt}).`
          : `${localMsgs.length} email(s) saved to local IndexedDB & permanently purged from edge (${receipt}).`
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal menyimpan pesan ke IndexedDB lokal. Pesan tetap aman di antrean edge.'
          : 'Failed to commit messages to local IndexedDB. Packets remain safely queued on edge.'
      );
    } finally {
      setSyncingEdge(false);
    }
  };

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/mail/simulate-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toAddress: simToAlias,
          fromName: simFromName,
          fromAddress: simFromAddr,
          subject: simSubject,
          bodyText: simBody,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(
          data.error ||
            (lang === 'id'
              ? 'Gagal mensimulasikan email masuk.'
              : 'Failed to simulate inbound email.')
        );
        return;
      }

      // If Worker runs without KV bound yet, buffer the returned packet in browser session fallback
      if (!data.kvBound && data.queuedPacket) {
        enqueueLocalFallbackPacket(data.queuedPacket as EphemeralEdgePacket);
      }

      setSimulatorOpen(false);
      await checkEdgeTransitQueue();
      showToast(
        lang === 'id'
          ? `Paket masuk ke ${simToAlias} ditangkap oleh Edge Queue. Klik "Tarik & Purge" untuk menyimpan ke perangkat lokal!`
          : `Inbound packet to ${simToAlias} queued at Edge Relay. Click "Pull & Purge" to commit to local device!`
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal mensimulasikan email masuk.'
          : 'Failed to simulate inbound email.'
      );
    }
  };

  const resetComposeForm = useCallback(() => {
    setEditingDraftId(null);
    setComposeFromAlias(primaryEmail);
    setComposeTo('');
    setComposeSubject('');
    setComposeBody('');
    setComposeAttachments([]);
    setComposeExternalLinks([]);
    setOversizedFiles([]);
    setVzUploadProgress(null);
    setComposeFeedback({ kind: 'idle', message: '' });
  }, [primaryEmail]);

  const handleOpenNewComposer = useCallback(
    (prefill?: { to?: string; subject?: string; body?: string }) => {
      if (prefill) {
        setEditingDraftId(null);
        setComposeFromAlias(primaryEmail);
        setComposeTo(prefill.to || '');
        setComposeSubject(prefill.subject || '');
        setComposeBody(prefill.body || '');
        setComposeAttachments([]);
        setComposeExternalLinks([]);
        setOversizedFiles([]);
      } else if (composeMode === 'closed') {
        setComposeFromAlias(primaryEmail);
      }
      setComposeFeedback({ kind: 'idle', message: '' });
      setComposeMode('floating');
    },
    [primaryEmail, composeMode]
  );

  const handleEditDraft = useCallback(
    (draft: LocalMailMessage) => {
      setEditingDraftId(draft.id);
      setComposeFromAlias(draft.from.address || primaryEmail);
      const rawTo = draft.to[0]?.address || '';
      setComposeTo(rawTo === `draft@${domain}` ? '' : rawTo);
      setComposeSubject(
        draft.subject === '(Draf Belum Berjudul)' ? '' : draft.subject
      );
      setComposeBody(draft.bodyText === '(Draf kosong)' ? '' : draft.bodyText);
      setComposeAttachments(
        (draft.attachments || []).map((att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          localDataBase64: att.localDataBase64,
        }))
      );
      setComposeExternalLinks(draft.externalLinks || []);
      setOversizedFiles([]);
      setComposeFeedback({ kind: 'idle', message: '' });
      setComposeMode('floating');
    },
    [primaryEmail, domain]
  );

  const handleAddComposeFiles = useCallback(
    (filesInput: FileList | File[]) => {
      const incoming = Array.from(filesInput);
      if (incoming.length === 0) return;

      const currentCount = composeAttachments.length;
      const currentTotal = composeAttachments.reduce((s, a) => s + a.sizeBytes, 0);
      const nextItems: PendingComposeAttachment[] = [];
      const nextOversized: File[] = [];
      let runningTotal = currentTotal;

      for (const file of incoming) {
        if (file.size <= 0) continue;
        if (runningTotal + file.size > MAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
          nextOversized.push(file);
          continue;
        }
        if (currentCount + nextItems.length >= MAIL_ATTACHMENT_MAX_COUNT) {
          setComposeFeedback({
            kind: 'error',
            message:
              lang === 'id'
                ? `Maksimal ${MAIL_ATTACHMENT_MAX_COUNT} lampiran R2 per email. Gunakan VZ Files (files.vz.gay) atau sisipkan link untuk file tambahan.`
                : `Maximum ${MAIL_ATTACHMENT_MAX_COUNT} R2 attachments per email. Use VZ Files (files.vz.gay) or insert a link for extra files.`,
          });
          break;
        }
        runningTotal += file.size;
        nextItems.push({
          id: generateSecureId('att'),
          filename: file.name || 'attachment.bin',
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          file,
        });
      }

      if (nextOversized.length > 0) {
        setOversizedFiles((prev) => [...prev, ...nextOversized].slice(0, 5));
        setComposeFeedback({
          kind: 'idle',
          message: '',
        });
      }

      if (nextItems.length > 0) {
        setComposeAttachments((prev) => [...prev, ...nextItems]);
        setComposeFeedback((prev) =>
          prev.kind === 'error' ? { kind: 'idle', message: '' } : prev
        );
      }
    },
    [composeAttachments, lang]
  );

  const handleRemoveComposeAttachment = useCallback((id: string) => {
    setComposeAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAddExternalLink = useCallback((link: MailExternalLink) => {
    setComposeExternalLinks((prev) => {
      if (prev.some((existing) => existing.url === link.url)) {
        return prev;
      }
      return [...prev, link];
    });
  }, []);

  const handleRemoveExternalLink = useCallback((id: string) => {
    setComposeExternalLinks((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleToggleExternalLinkInline = useCallback((id: string) => {
    setComposeExternalLinks((prev) =>
      prev.map((item) =>
        item.id === id && item.directMediaUrl
          ? { ...item, renderInline: !item.renderInline }
          : item
      )
    );
  }, []);

  const handleUploadFileToVzFiles = useCallback(
    async (file: File) => {
      if (vzUploadProgress) return;
      setComposeFeedback({ kind: 'idle', message: '' });
      try {
        const uploaded = await uploadFileToVzFiles(file, (progress) => {
          setVzUploadProgress(progress);
        });
        const card = normalizeAndClassifyExternalLink(uploaded.shareUrl, {
          label: uploaded.filename,
          sizeLabel: formatFileSizeLabel(uploaded.sizeBytes),
        });
        if (card) {
          setComposeExternalLinks((prev) =>
            prev.some((item) => item.url === card.url) ? prev : [...prev, card]
          );
        }
        setOversizedFiles((prev) => prev.filter((f) => f !== file));
        setComposeFeedback({
          kind: 'success',
          message:
            lang === 'id'
              ? `"${uploaded.filename}" berhasil diunggah ke VZ Files (${uploaded.shareUrl}) dan disisipkan ke email.`
              : `"${uploaded.filename}" uploaded to VZ Files (${uploaded.shareUrl}) and attached to your email.`,
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : lang === 'id'
              ? 'Gagal mengunggah ke VZ Files. Anda dapat mengunggah manual lewat https://files.vz.gay lalu menempel tautannya.'
              : 'Failed to upload to VZ Files. You can upload manually at https://files.vz.gay and paste the link.';
        setComposeFeedback({ kind: 'error', message: msg });
      } finally {
        setVzUploadProgress(null);
      }
    },
    [vzUploadProgress, lang]
  );

  const dispatchEmailPayload = async (params: {
    fromAlias: string;
    to: string;
    subject: string;
    body: string;
    attachments: PendingComposeAttachment[];
    externalLinks: MailExternalLink[];
    draftIdToDelete?: string | null;
    surface: 'composer' | 'draft_pane';
  }): Promise<boolean> => {
    const cleanTo = params.to.trim();
    const cleanSubject = params.subject.trim() || '(Tanpa Subjek)';
    const cleanBody = params.body.trim();
    const cleanFrom = params.fromAlias || primaryEmail;

    if (!cleanTo || !cleanTo.includes('@') || cleanTo === `draft@${domain}`) {
      const msg =
        lang === 'id'
          ? 'Alamat tujuan (Kepada) belum valid. Isi alamat email tujuan terlebih dahulu.'
          : 'Recipient (To) email address is missing or invalid.';
      if (params.surface === 'composer') {
        setComposeFeedback({ kind: 'error', message: msg });
      } else {
        showToast(msg, { kind: 'error' });
      }
      return false;
    }

    if (!cleanBody || cleanBody === '(Draf kosong)') {
      const msg =
        lang === 'id'
          ? 'Isi pesan masih kosong. Tulis pesan sebelum mengirim.'
          : 'Message body is empty. Write your message before sending.';
      if (params.surface === 'composer') {
        setComposeFeedback({ kind: 'error', message: msg });
      } else {
        showToast(msg, { kind: 'error' });
      }
      return false;
    }

    try {
      // Step 1: Upload any attachments to ephemeral R2 before sending
      const uploadedMeta: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
      }> = [];
      const localSavedAttachments: MailAttachment[] = [];

      for (let i = 0; i < params.attachments.length; i += 1) {
        const att = params.attachments[i];
        if (params.surface === 'composer') {
          setComposeFeedback({
            kind: 'sending',
            message:
              lang === 'id'
                ? `Mengunggah lampiran ${i + 1}/${params.attachments.length}: ${att.filename}...`
                : `Uploading attachment ${i + 1}/${params.attachments.length}: ${att.filename}...`,
          });
        }

        let blob: Blob;
        let b64: string;
        if (att.file) {
          blob = att.file;
          b64 = await fileToBase64(att.file);
        } else if (att.localDataBase64) {
          b64 = att.localDataBase64;
          blob = base64ToBlob(att.localDataBase64, att.mimeType);
        } else {
          continue;
        }

        const uploadUrl = `/api/mail/attachments/upload?ownerUser=${encodeURIComponent(
          user
        )}&filename=${encodeURIComponent(att.filename)}`;

        const upRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': att.mimeType || 'application/octet-stream',
          },
          body: blob,
        });
        const upJson = (await upRes.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          id?: string;
          ephemeralId?: string;
          ephemeralOwner?: string;
          filename?: string;
          mimeType?: string;
          sizeBytes?: number;
          expiresAt?: string;
        } | null;

        const uploadedId = upJson?.ephemeralId || upJson?.id;
        if (!upRes.ok || !upJson?.ok || !uploadedId) {
          const errMsg =
            upJson?.error ||
            (lang === 'id'
              ? `Gagal mengunggah lampiran "${att.filename}".`
              : `Failed to upload attachment "${att.filename}".`);
          if (params.surface === 'composer') {
            setComposeFeedback({ kind: 'error', message: errMsg });
          } else {
            showToast(errMsg, { kind: 'error' });
          }
          return false;
        }

        const resolvedMeta = {
          id: uploadedId,
          ephemeralId: uploadedId,
          filename: upJson.filename || att.filename,
          mimeType: upJson.mimeType || att.mimeType || 'application/octet-stream',
          sizeBytes: upJson.sizeBytes ?? att.sizeBytes,
        };
        uploadedMeta.push(resolvedMeta);
        localSavedAttachments.push({
          id: resolvedMeta.id,
          ephemeralId: resolvedMeta.ephemeralId,
          ephemeralOwner: upJson.ephemeralOwner || user,
          expiresAt: upJson.expiresAt,
          filename: resolvedMeta.filename,
          mimeType: resolvedMeta.mimeType,
          sizeBytes: resolvedMeta.sizeBytes,
          localDataBase64: b64,
          storageStatus: 'local_saved',
        });
      }

      // Step 2: Dispatch email via Edge Worker (/api/mail/send)
      if (params.surface === 'composer') {
        setComposeFeedback({
          kind: 'sending',
          message:
            lang === 'id'
              ? `Mengirim email ke ${cleanTo} melalui Edge Worker...`
              : `Sending email to ${cleanTo} via Edge Worker...`,
        });
      }

      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUser: user,
          fromAddress: cleanFrom,
          toAddress: cleanTo,
          subject: cleanSubject,
          bodyText: cleanBody,
          attachments: uploadedMeta,
          externalLinks: params.externalLinks,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        kvBound?: boolean;
        loopbackPacket?: EphemeralEdgePacket;
        rfcMessageId?: string;
        dispatchedVia?: string;
        liveEmailDispatched?: boolean;
        quota?: { usedToday: number; dailyLimit: number };
      } | null;

      if (!res.ok || !data?.ok) {
        const errMsg =
          data?.error ||
          (lang === 'id'
            ? `Pengiriman gagal (HTTP ${res.status}). Periksa konfigurasi provider email (Brevo/cPanel/Resend) atau simpan sebagai Draf Lokal.`
            : `Email delivery failed (HTTP ${res.status}). Check your outbound provider secret or save as Local Draft.`);
        if (params.surface === 'composer') {
          setComposeFeedback({ kind: 'error', message: errMsg });
        } else {
          showToast(errMsg, { kind: 'error' });
        }
        return false;
      }

      if (!data.kvBound && data.loopbackPacket) {
        enqueueLocalFallbackPacket(data.loopbackPacket);
      }

      const newLocalSent: LocalMailMessage = {
        id: generateSecureId('msg-sent'),
        rfcMessageId:
          data.rfcMessageId || `<${generateSecureId('sent')}@${domain}>`,
        ownerUser: user,
        threadId: cleanTo.toLowerCase(),
        folder: 'sent',
        direction: 'outbound',
        from: { name: user, address: cleanFrom },
        to: [
          {
            name: cleanTo.split('@')[0],
            address: cleanTo.toLowerCase(),
          },
        ],
        cc: [],
        deliveredToAlias: cleanTo.toLowerCase(),
        plusTag: null,
        dotNormalized: false,
        subject: cleanSubject,
        bodyText: cleanBody,
        timestamp: new Date().toISOString(),
        read: true,
        starred: false,
        verifiedSpfDkim: true,
        dmarcPolicy: 'local-relay',
        ephemeralQueueReceipt:
          data.dispatchedVia === 'brevo'
            ? 'DISPATCHED-BREVO-ZERO-SERVER-COPY'
            : data.dispatchedVia === 'cpanel_relay'
              ? 'DISPATCHED-CPANEL-ZERO-SERVER-COPY'
              : data.dispatchedVia === 'resend'
                ? 'DISPATCHED-RESEND-ZERO-SERVER-COPY'
                : data.dispatchedVia === 'cloudflare'
                  ? 'DISPATCHED-CF-SEND-ZERO-SERVER-COPY'
                  : 'LOCAL-ONLY-ZERO-SERVER-COPY',
        chatBridgeChannel: null,
        attachments: localSavedAttachments,
        externalLinks: params.externalLinks,
      };

      if (params.draftIdToDelete) {
        await deleteMessageFromLocalDb(params.draftIdToDelete);
      }
      await saveMessage(newLocalSent);

      if (data.quota) {
        setQuotaUsed(data.quota.usedToday);
      }

      if (params.surface === 'composer') {
        resetComposeForm();
        setComposeMode('closed');
      }

      await loadLocalMessages();
      await checkEdgeTransitQueue();
      setSelectedThreadId(newLocalSent.threadId);
      setSelectedMessageId(newLocalSent.id);

      const providerLabel =
        data.dispatchedVia === 'brevo'
          ? 'Brevo API'
          : data.dispatchedVia === 'cpanel_relay'
            ? 'cPanel Relay'
            : data.dispatchedVia === 'resend'
              ? 'Resend API'
              : data.dispatchedVia === 'cloudflare'
                ? 'Cloudflare Email Sending'
                : data.dispatchedVia === 'internal_loopback'
                  ? 'Internal @imy.li Edge'
                  : lang === 'id'
                    ? 'Mode Simulasi Lokal'
                    : 'Local Relay Simulation';

      showToast(
        lang === 'id'
          ? `Email terkirim ke ${cleanTo} via ${providerLabel} & tersimpan di folder Terkirim Lokal.`
          : `Email sent to ${cleanTo} via ${providerLabel} & saved to Local Sent.`,
        {
          kind: 'success',
          actionLabel: lang === 'id' ? 'Lihat di Terkirim' : 'Open Sent',
          onAction: () => {
            setActiveFolder('sent');
            setViewMode('classic');
            setSelectedMessageId(newLocalSent.id);
            setMobileShowDetail(true);
          },
        }
      );
      return true;
    } catch {
      const netErr =
        lang === 'id'
          ? 'Gagal terhubung ke server relay pengiriman email. Periksa koneksi internet Anda atau simpan sebagai Draf Lokal.'
          : 'Could not reach the outbound email relay. Check your connection or save as Local Draft.';
      if (params.surface === 'composer') {
        setComposeFeedback({ kind: 'error', message: netErr });
      } else {
        showToast(netErr, { kind: 'error' });
      }
      return false;
    }
  };

  const handleSendOutboundEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (composeSending) return;
    setComposeSending(true);
    try {
      await dispatchEmailPayload({
        fromAlias: composeFromAlias || primaryEmail,
        to: composeTo,
        subject: composeSubject,
        body: composeBody,
        attachments: composeAttachments,
        externalLinks: composeExternalLinks,
        draftIdToDelete: editingDraftId,
        surface: 'composer',
      });
    } finally {
      setComposeSending(false);
    }
  };

  const handleSendDraftDirectly = async (draft: LocalMailMessage) => {
    if (sendingDraftId) return;
    setSendingDraftId(draft.id);
    try {
      const draftAtts: PendingComposeAttachment[] = (draft.attachments || []).map(
        (att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          localDataBase64: att.localDataBase64,
        })
      );
      const ok = await dispatchEmailPayload({
        fromAlias: draft.from.address || primaryEmail,
        to: draft.to[0]?.address || '',
        subject:
          draft.subject === '(Draf Belum Berjudul)' ? '' : draft.subject,
        body: draft.bodyText === '(Draf kosong)' ? '' : draft.bodyText,
        attachments: draftAtts,
        externalLinks: draft.externalLinks || [],
        draftIdToDelete: draft.id,
        surface: 'draft_pane',
      });
      if (ok) {
        setActiveFolder('sent');
        setViewMode('classic');
      }
    } finally {
      setSendingDraftId(null);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const persistedAttachments: MailAttachment[] = [];
      for (const att of composeAttachments) {
        let b64 = att.localDataBase64;
        if (!b64 && att.file) {
          b64 = await fileToBase64(att.file);
        }
        persistedAttachments.push({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          localDataBase64: b64,
          storageStatus: 'local_saved',
        });
      }

      const draftId = editingDraftId || generateSecureId('msg-draft');
      const draftMsg: LocalMailMessage = {
        id: draftId,
        rfcMessageId: `<${draftId}@${domain}>`,
        ownerUser: user,
        threadId: (composeTo.trim() || `draft@${domain}`).toLowerCase(),
        folder: 'drafts',
        direction: 'outbound',
        from: { name: user, address: composeFromAlias || primaryEmail },
        to: [
          {
            name: (composeTo.trim() || 'draft').split('@')[0],
            address: (composeTo.trim() || `draft@${domain}`).toLowerCase(),
          },
        ],
        cc: [],
        deliveredToAlias: (composeTo.trim() || primaryEmail).toLowerCase(),
        plusTag: null,
        dotNormalized: false,
        subject: composeSubject.trim() || '(Draf Belum Berjudul)',
        bodyText: composeBody.trim() || '(Draf kosong)',
        timestamp: new Date().toISOString(),
        read: true,
        starred: false,
        verifiedSpfDkim: true,
        dmarcPolicy: 'local-relay',
        ephemeralQueueReceipt: 'LOCAL-DRAFT-INDEXEDDB',
        chatBridgeChannel: null,
        attachments: persistedAttachments,
        externalLinks: composeExternalLinks,
      };
      await saveMessage(draftMsg);
      resetComposeForm();
      setComposeMode('closed');
      setActiveFolder('drafts');
      setViewMode('classic');
      await loadLocalMessages();
      setSelectedMessageId(draftMsg.id);
      setMobileShowDetail(true);
      showToast(
        lang === 'id'
          ? 'Draf tersimpan di IndexedDB perangkat lokal (folder Draf Lokal).'
          : 'Draft saved to local device IndexedDB (Local Drafts folder).',
        { kind: 'success' }
      );
    } catch {
      setComposeFeedback({
        kind: 'error',
        message:
          lang === 'id'
            ? 'Gagal menyimpan draf ke IndexedDB lokal.'
            : 'Failed to save draft to local IndexedDB.',
      });
    }
  };

  const handleDownloadAttachment = async (
    msg: LocalMailMessage,
    att: MailAttachment
  ) => {
    // 1. Offline local hit (already downloaded or locally sent/drafted)
    if (att.localDataBase64) {
      const blob = base64ToBlob(att.localDataBase64, att.mimeType);
      triggerBinaryBrowserDownload(att.filename, blob);
      return;
    }
    if (att.contentText) {
      triggerBrowserDownload(att.filename, att.contentText, att.mimeType);
      return;
    }

    // 2. Already marked expired/purged on server
    if (att.storageStatus === 'expired_purged') {
      showToast(
        lang === 'id'
          ? `Lampiran "${att.filename}" sudah terhapus dari server R2 (karena sudah diunduh atau >7 hari). Minta pengirim mengirim ulang.`
          : `Attachment "${att.filename}" was already purged from R2 (downloaded or >7 days old). Ask the sender to resend it.`,
        { kind: 'error' }
      );
      return;
    }

    // 3. Ephemeral R2 one-time download (WhatsApp-style: download once -> save locally -> purged from R2)
    const owner = att.ephemeralOwner || msg.ownerUser || user;
    const ephemId = att.ephemeralId || att.id;
    setDownloadingAttId(att.id);
    try {
      const res = await fetch(
        `/api/mail/attachments/${encodeURIComponent(owner)}/${encodeURIComponent(ephemId)}`
      );

      if (res.status === 410 || res.status === 404) {
        const updatedMsg: LocalMailMessage = {
          ...msg,
          attachments: (msg.attachments || []).map((item) =>
            item.id === att.id
              ? { ...item, storageStatus: 'expired_purged' }
              : item
          ),
        };
        await saveMessage(updatedMsg);
        await loadLocalMessages();
        showToast(
          lang === 'id'
            ? `Lampiran "${att.filename}" sudah kedaluwarsa atau telah dihapus dari server R2 (>7 hari / sudah diunduh). Minta pengirim kirim ulang.`
            : `Attachment "${att.filename}" has expired or been purged from R2 (>7 days / already downloaded). Ask the sender to resend.`,
          { kind: 'error' }
        );
        return;
      }

      if (!res.ok) {
        showToast(
          lang === 'id'
            ? `Gagal mengunduh lampiran "${att.filename}" (HTTP ${res.status}).`
            : `Failed to download "${att.filename}" (HTTP ${res.status}).`,
          { kind: 'error' }
        );
        return;
      }

      const buf = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const contentType =
        res.headers.get('Content-Type') || att.mimeType || 'application/octet-stream';
      const blob = new Blob([buf], { type: contentType });

      const updatedMsg: LocalMailMessage = {
        ...msg,
        attachments: (msg.attachments || []).map((item) =>
          item.id === att.id
            ? {
                ...item,
                mimeType: contentType,
                sizeBytes: buf.byteLength || item.sizeBytes,
                localDataBase64: b64,
                storageStatus: 'local_saved',
              }
            : item
        ),
      };
      await saveMessage(updatedMsg);
      await loadLocalMessages();

      triggerBinaryBrowserDownload(att.filename, blob);
      showToast(
        lang === 'id'
          ? `Lampiran "${att.filename}" tersimpan offline di perangkat Anda & langsung dihapus dari server R2 (Zero Retention).`
          : `Attachment "${att.filename}" saved offline on your device & immediately purged from R2 (Zero Retention).`,
        { kind: 'success' }
      );
    } catch {
      showToast(
        lang === 'id'
          ? `Gagal mengunduh lampiran "${att.filename}" karena kendala jaringan.`
          : `Network error downloading "${att.filename}".`,
        { kind: 'error' }
      );
    } finally {
      setDownloadingAttId(null);
    }
  };

  const handleQuickBubbleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyText.trim() || !selectedThreadId) return;
    setSendingQuickReply(true);
    try {
      const threadMsgs = messages.filter(
        (m) => m.threadId === selectedThreadId && m.folder !== 'trash'
      );
      const latestSubject =
        threadMsgs[0]?.subject || `Percakapan dengan ${selectedThreadId}`;
      const replySubject = latestSubject.toLowerCase().startsWith('re:')
        ? latestSubject
        : `Re: ${latestSubject}`;

      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUser: user,
          fromAddress: primaryEmail,
          toAddress: selectedThreadId,
          subject: replySubject,
          bodyText: quickReplyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(
          data.error ||
            (lang === 'id'
              ? 'Gagal mengirim balasan cepat.'
              : 'Failed to send quick reply.')
        );
        return;
      }

      if (!data.kvBound && data.loopbackPacket) {
        enqueueLocalFallbackPacket(data.loopbackPacket as EphemeralEdgePacket);
      }

      const replyMsg: LocalMailMessage = {
        id: generateSecureId('msg-bubble'),
        rfcMessageId: data.rfcMessageId || `<${generateSecureId('bubble')}@${domain}>`,
        ownerUser: user,
        threadId: selectedThreadId,
        folder: 'sent',
        direction: 'outbound',
        from: { name: user, address: primaryEmail },
        to: [
          {
            name: selectedThreadId.split('@')[0],
            address: selectedThreadId,
          },
        ],
        cc: [],
        deliveredToAlias: selectedThreadId,
        plusTag: null,
        dotNormalized: false,
        subject: replySubject,
        bodyText: quickReplyText.trim(),
        timestamp: new Date().toISOString(),
        read: true,
        starred: false,
        verifiedSpfDkim: true,
        dmarcPolicy: 'local-relay',
        ephemeralQueueReceipt: 'LOCAL-ONLY-ZERO-SERVER-COPY',
        chatBridgeChannel: threadMsgs[0]?.chatBridgeChannel || null,
        attachments: [],
      };

      await saveMessage(replyMsg);
      if (data.quota) {
        setQuotaUsed(data.quota.usedToday);
      }
      setQuickReplyText('');
      await loadLocalMessages();
      await checkEdgeTransitQueue();
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal mengirim balasan karena kendala jaringan.'
          : 'Failed to send reply due to network error.'
      );
    } finally {
      setSendingQuickReply(false);
    }
  };

  const handleSelectThread = async (threadId: string, threadMessages: LocalMailMessage[]) => {
    setSelectedThreadId(threadId);
    setMobileShowDetail(true);
    const unread = threadMessages.filter((m) => !m.read);
    if (unread.length > 0) {
      await markMessagesAsRead(unread);
      setMessages((prev) =>
        prev.map((m) => (m.threadId === threadId ? { ...m, read: true } : m))
      );
    }
  };

  const handleSelectClassicMessage = async (msg: LocalMailMessage) => {
    setSelectedMessageId(msg.id);
    setMobileShowDetail(true);
    if (!msg.read) {
      await markMessagesAsRead([msg]);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      );
    }
  };

  const handleToggleStar = async (msg: LocalMailMessage) => {
    const updated: LocalMailMessage = {
      ...msg,
      starred: !msg.starred,
      read: true,
    };
    await saveMessage(updated);
    await loadLocalMessages();
  };

  const handleMoveFolder = async (
    msg: LocalMailMessage,
    targetFolder: LocalMailMessage['folder']
  ) => {
    const updated: LocalMailMessage = {
      ...msg,
      folder: targetFolder,
      read: true,
    };
    await saveMessage(updated);
    await loadLocalMessages();
    showToast(
      lang === 'id'
        ? `Pesan dipindahkan ke ${targetFolder} di penyimpanan lokal.`
        : `Message moved to ${targetFolder} in local storage.`
    );
  };

  const handlePermanentLocalDelete = async (msgId: string) => {
    await deleteMessageFromLocalDb(msgId);
    await loadLocalMessages();
    showToast(
      lang === 'id'
        ? 'Pesan dihapus permanen dari IndexedDB perangkat lokal.'
        : 'Message permanently wiped from local device IndexedDB.'
    );
  };

  // Unique plus tags discovered in local messages
  const discoveredPlusTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) {
      if (m.plusTag) set.add(m.plusTag);
    }
    return Array.from(set);
  }, [messages]);

  // Folder counts
  const folderCounts = useMemo(() => {
    return {
      inbox: messages.filter((m) => m.folder === 'inbox').length,
      sent: messages.filter((m) => m.folder === 'sent').length,
      drafts: messages.filter((m) => m.folder === 'drafts').length,
      starred: messages.filter((m) => m.starred && m.folder !== 'trash').length,
      plus_aliases: messages.filter(
        (m) => (m.plusTag || m.dotNormalized) && m.folder !== 'trash'
      ).length,
      archive: messages.filter((m) => m.folder === 'archive').length,
      trash: messages.filter((m) => m.folder === 'trash').length,
    };
  }, [messages]);

  // Filtered messages
  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (activeFolder === 'starred') {
        if (!m.starred || m.folder === 'trash') return false;
      } else if (activeFolder === 'plus_aliases') {
        if (!m.plusTag && !m.dotNormalized) return false;
        if (m.folder === 'trash') return false;
      } else {
        if (m.folder !== activeFolder) return false;
      }

      if (selectedPlusTag && m.plusTag !== selectedPlusTag) {
        return false;
      }

      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.bodyText.toLowerCase().includes(q) ||
        m.from.address.toLowerCase().includes(q) ||
        m.from.name.toLowerCase().includes(q) ||
        m.deliveredToAlias.toLowerCase().includes(q) ||
        (m.plusTag && m.plusTag.toLowerCase().includes(q))
      );
    });
  }, [messages, activeFolder, selectedPlusTag, searchQuery]);

  // Conversational threads grouped by correspondent (`threadId`)
  const conversationThreads = useMemo(() => {
    const map = new Map<
      string,
      {
        threadId: string;
        peerName: string;
        peerAddress: string;
        messages: LocalMailMessage[];
        latestMessage: LocalMailMessage;
        unreadCount: number;
      }
    >();

    const pool = messages.filter((m) => m.folder !== 'trash');
    for (const msg of pool) {
      if (selectedPlusTag && msg.plusTag !== selectedPlusTag) continue;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          msg.subject.toLowerCase().includes(q) ||
          msg.bodyText.toLowerCase().includes(q) ||
          msg.from.address.toLowerCase().includes(q) ||
          msg.deliveredToAlias.toLowerCase().includes(q);
        if (!matches) continue;
      }

      const key = msg.threadId;
      const existing = map.get(key);
      const peerName =
        msg.direction === 'inbound'
          ? msg.from.name
          : msg.to[0]?.name || key.split('@')[0];

      if (!existing) {
        map.set(key, {
          threadId: key,
          peerName,
          peerAddress: key,
          messages: [msg],
          latestMessage: msg,
          unreadCount: !msg.read && msg.direction === 'inbound' ? 1 : 0,
        });
      } else {
        existing.messages.push(msg);
        if (!msg.read && msg.direction === 'inbound') {
          existing.unreadCount += 1;
        }
        if (
          new Date(msg.timestamp).getTime() >
          new Date(existing.latestMessage.timestamp).getTime()
        ) {
          existing.latestMessage = msg;
        }
      }
    }

    const arr = Array.from(map.values());
    for (const t of arr) {
      t.messages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
    arr.sort(
      (a, b) =>
        new Date(b.latestMessage.timestamp).getTime() -
        new Date(a.latestMessage.timestamp).getTime()
    );
    return arr;
  }, [messages, selectedPlusTag, searchQuery]);

  const activeThread = useMemo(() => {
    return (
      conversationThreads.find((t) => t.threadId === selectedThreadId) ||
      conversationThreads[0] ||
      null
    );
  }, [conversationThreads, selectedThreadId]);

  const activeClassicMessage = useMemo(() => {
    return (
      filteredMessages.find((m) => m.id === selectedMessageId) ||
      filteredMessages[0] ||
      null
    );
  }, [filteredMessages, selectedMessageId]);

  // Estimate local IndexedDB byte size without allocating Blob objects
  const localBytesUsed = useMemo(() => {
    const jsonSize = new TextEncoder().encode(JSON.stringify(messages)).byteLength;
    return (jsonSize / 1024).toFixed(1);
  }, [messages]);

  const aliasExamples = useMemo(
    () => generateAliasExamples(user, domain),
    [user, domain]
  );

  const simResolved = useMemo(
    () => resolveCanonicalEmail(simToAlias, [domain, 'vz.gay']),
    [simToAlias, domain]
  );

  const folderItems = useMemo(
    () =>
      [
        {
          id: 'inbox' as const,
          label: lang === 'id' ? 'Kotak Masuk' : 'Inbox',
          icon: Inbox,
          count: folderCounts.inbox,
        },
        {
          id: 'plus_aliases' as const,
          label:
            lang === 'id' ? 'Alias (+Tag & Titik)' : 'Aliases (+Tag & Dot)',
          icon: Tag,
          count: folderCounts.plus_aliases,
        },
        {
          id: 'starred' as const,
          label: lang === 'id' ? 'Berbintang' : 'Starred',
          icon: Star,
          count: folderCounts.starred,
        },
        {
          id: 'sent' as const,
          label: lang === 'id' ? 'Terkirim Lokal' : 'Local Sent',
          icon: Send,
          count: folderCounts.sent,
        },
        {
          id: 'drafts' as const,
          label: lang === 'id' ? 'Draf Lokal' : 'Local Drafts',
          icon: FileText,
          count: folderCounts.drafts,
        },
        {
          id: 'archive' as const,
          label: lang === 'id' ? 'Arsip Perangkat' : 'Device Archive',
          icon: Archive,
          count: folderCounts.archive,
        },
        {
          id: 'trash' as const,
          label: lang === 'id' ? 'Sampah' : 'Trash',
          icon: Trash2,
          count: folderCounts.trash,
        },
      ],
    [lang, folderCounts]
  );

  const activeFolderMeta =
    folderItems.find((f) => f.id === activeFolder) || folderItems[0];

  const renderSidebarContent = (onCloseDrawer?: () => void) => (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => {
          onCloseDrawer?.();
          handleOpenNewComposer();
        }}
        className="w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <Send className="w-3.5 h-3.5" />
        <span>
          {lang === 'id' ? '+ Tulis Email Baru' : '+ Compose New Email'}
        </span>
      </button>

      {/* Folders List */}
      <nav aria-label="Mailbox Folders" className="space-y-1">
        {folderItems.map((folder) => {
          const Icon = folder.icon;
          const isSelected = activeFolder === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                setActiveFolder(folder.id);
                setSelectedPlusTag(null);
                setMobileShowDetail(false);
                if (folder.id !== 'inbox' && viewMode === 'conversational') {
                  setViewMode('classic');
                }
                onCloseDrawer?.();
              }}
              className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B202B]'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{folder.label}</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {folder.count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Discovered +Plus Alias Filter */}
      {discoveredPlusTags.length > 0 && (
        <div className="pt-3 border-t border-slate-200 dark:border-[#232732] space-y-2">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {lang === 'id'
              ? 'Filter Subaddressing (+Tag):'
              : 'Plus Subaddress Filters (+Tag):'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedPlusTag(null);
                onCloseDrawer?.();
              }}
              className={`min-h-[32px] px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                selectedPlusTag === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-[#1B202B] text-slate-600 dark:text-slate-300'
              }`}
            >
              All
            </button>
            {discoveredPlusTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setSelectedPlusTag((curr) => (curr === tag ? null : tag));
                  onCloseDrawer?.();
                }}
                className={`min-h-[32px] px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                  selectedPlusTag === tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-[#1B202B] text-slate-600 dark:text-slate-300'
                }`}
              >
                +{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary @imy.li Identity & Paired VZ Links Card */}
      <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-2.5 text-xs">
        <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
          <span>{lang === 'id' ? 'Identitas Aktif' : 'Active Identity'}</span>
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
            @{domain}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1.5 font-mono text-[11px]">
          <div className="text-slate-900 dark:text-white font-semibold truncate">
            {primaryEmail}
          </div>
          <div className="text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Alias + &amp; .:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {lang === 'id' ? 'Gratis (Aktif)' : 'Free (Active)'}
            </span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Paired Bio:</span>
            <button
              type="button"
              onClick={() => {
                onCloseDrawer?.();
                onSelectHost('bio_public');
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline truncate cursor-pointer"
            >
              {user}.{domain}
            </button>
          </div>
          <div className="text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Shortlinks:</span>
            <button
              type="button"
              onClick={() => {
                onCloseDrawer?.();
                onSelectHost('shortlinks');
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline truncate cursor-pointer"
            >
              {domain}/s/*
            </button>
          </div>
          <div className="text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 tabular-nums">
            <span>Kuota Kirim:</span>
            <span>
              {quotaUsed} / {quotaLimit} hari ini
            </span>
          </div>
          <div className="pt-1.5 border-t border-slate-200 dark:border-[#232732]">
            <button
              type="button"
              onClick={() => {
                onCloseDrawer?.();
                setMailQrState({
                  open: true,
                  initialEmail: selectedPlusTag
                    ? `${user}+${selectedPlusTag}@${domain}`
                    : primaryEmail,
                });
              }}
              className="w-full min-h-[34px] px-2.5 py-1.5 text-[11px] font-sans font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>
                {lang === 'id'
                  ? 'QR Email & vCard (@imy.li / Alias)'
                  : 'Email & vCard QR (@imy.li / Alias)'}
              </span>
            </button>
          </div>
        </div>

        {/* Locked Additional Mailbox / Custom Alias Without + or . (Coming Soon Paid Package) */}
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0E1117] border border-dashed border-slate-300 dark:border-[#282E3D] space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-amber-500 shrink-0" />
              <span>
                {lang === 'id'
                  ? '+ Tambah Mailbox & Alias Tanpa +/.'
                  : '+ Add Mailbox & Custom Alias (No +/.)'}
              </span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {lang === 'id'
              ? 'Alias dengan + dan . adalah fasilitas gratis. Paket Berbayar (Coming Soon) khusus untuk tambah mailbox atau alias bebas tanpa + / . di 1 akun SSO.'
              : 'Aliases with + and . are free. The Paid Package (Coming Soon) is strictly for adding extra mailboxes or standalone aliases without + / . in 1 SSO account.'}
          </p>
        </div>
      </div>

      {/* Local Device IndexedDB & Zero Server Retention Telemetry */}
      <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-2 text-xs">
        <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-medium">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>IndexedDB Lokal</span>
          </span>
          <span className="font-mono tabular-nums">{localBytesUsed} KB</span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 font-mono tabular-nums">
          <div>Server Mailbox: 0 KB (Zero Retention)</div>
          <div className="truncate" title={lastPurgeReceipt}>
            Last ACK: {lastPurgeReceipt}
          </div>
        </div>
        <div className="pt-1 flex items-center justify-between text-[11px]">
          <a
            href="https://myaccount.vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onCloseDrawer?.()}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            myaccount.vz.gay
          </a>
          <button
            type="button"
            onClick={() => {
              onCloseDrawer?.();
              onDeactivateMail();
            }}
            className="text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
          >
            {lang === 'id' ? 'Nonaktifkan Mail' : 'Disable Mail'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
      {reservedMailCheck.isReserved && (
        <div className="bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900/60 rounded-lg px-4 py-3 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div className="leading-relaxed">
            <strong>
              {lang === 'id'
                ? `Username sistem "${user}" dilindungi (Reserved):`
                : `System username "${user}" is reserved:`}
            </strong>{' '}
            {lang === 'id'
              ? `Pengiriman email keluar dari ${user}@${domain} diblokir otomatis di server untuk melindungi alamat resmi sistem. Ganti username di myaccount.vz.gay.`
              : `Outbound email sending from ${user}@${domain} is blocked server-side to protect official system addresses. Update your username on myaccount.vz.gay.`}
          </div>
        </div>
      )}

      {/* Fixed Floating Toast Notification (ALWAYS above modals & floating composer) */}
      {toastNotice && (
        <div
          role={toastNotice.kind === 'error' ? 'alert' : 'status'}
          className={`fixed top-4 right-4 z-[70] w-[min(440px,calc(100vw-2rem))] rounded-xl px-4 py-3 text-xs shadow-2xl border flex items-start justify-between gap-3 ${
            toastNotice.kind === 'error'
              ? 'bg-rose-950 text-rose-50 border-rose-700'
              : toastNotice.kind === 'success'
                ? 'bg-emerald-950 text-emerald-50 border-emerald-700'
                : 'bg-slate-900 dark:bg-[#171E2E] text-white border-slate-700 dark:border-blue-800'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {toastNotice.kind === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1.5 min-w-0">
              <p className="break-words leading-snug font-medium">
                {toastNotice.message}
              </p>
              {toastNotice.actionLabel && toastNotice.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    const fn = toastNotice.onAction;
                    setToastNotice(null);
                    fn?.();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-white/15 hover:bg-white/25 text-white rounded-md transition-colors cursor-pointer"
                >
                  {toastNotice.actionLabel}
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            aria-label="Dismiss notification"
            className="w-7 h-7 inline-flex items-center justify-center text-white/70 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Workspace Control Toolbar */}
      <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-3 sm:px-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Top / Left Row: Mobile Folders + Compose, View Switcher, Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile / Tablet Folders Drawer Trigger + Quick Compose (< lg) */}
          <div className="flex items-center gap-2 w-full sm:w-auto lg:hidden">
            <button
              type="button"
              onClick={() => setMobileFoldersOpen(true)}
              className="flex-1 sm:flex-none min-h-[44px] inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] border border-slate-200 dark:border-[#2A303D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{activeFolderMeta.label}</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {activeFolderMeta.count}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenNewComposer()}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Tulis' : 'Compose'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0D11] rounded-lg border border-slate-200/70 dark:border-[#232732] w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setViewMode('conversational');
                setMobileShowDetail(false);
              }}
              className={`flex-1 sm:flex-none min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'conversational'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>
                {lang === 'id' ? 'Gelembung Chat' : 'Conversational View'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('classic');
                setMobileShowDetail(false);
              }}
              className={`flex-1 sm:flex-none min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'classic'
                  ? 'bg-white dark:bg-[#191E28] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Tabel Klasik' : 'Classic Inbox'}</span>
            </button>
          </div>

          {/* Search input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'id'
                  ? 'Cari subjek, pengirim, +tag...'
                  : 'Search subject, sender, +tag...'
              }
              className="w-full min-h-[40px] pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Right: Pop & Purge Edge Relay, Simulate Inbound, Local Vault, Lang/Theme */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePopAndPurgeEdgeQueue}
            disabled={syncingEdge}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              edgePackets.length > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#232A38]'
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${syncingEdge ? 'animate-spin' : ''}`}
            />
            <span className="tabular-nums">
              {edgePackets.length > 0
                ? lang === 'id'
                  ? `Tarik & Purge Edge (${edgePackets.length})`
                  : `Pull & Purge (${edgePackets.length})`
                : lang === 'id'
                  ? 'Edge Queue: 0'
                  : 'Edge Queue: 0'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSimulatorOpen(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MailPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              {lang === 'id' ? 'Uji Masuk (+/.)' : 'Test Inbound (+/.)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (viewMode === 'conversational' && activeThread) {
                openSearchGrounding(
                  activeThread.peerAddress,
                  activeThread.peerName,
                  activeThread.latestMessage.subject
                );
              } else if (activeClassicMessage) {
                openSearchGrounding(
                  activeClassicMessage.from.address,
                  activeClassicMessage.from.name,
                  activeClassicMessage.subject
                );
              } else {
                openSearchGrounding(searchQuery.trim(), '', '');
              }
            }}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>
              {lang === 'id'
                ? 'Verifikasi & VZ Search'
                : 'Verify & VZ Search'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMailQrState({
                open: true,
                initialEmail: selectedPlusTag
                  ? `${user}+${selectedPlusTag}@${domain}`
                  : primaryEmail,
              })
            }
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{lang === 'id' ? 'QR Email' : 'Email QR'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenVault}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#232A38] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderArchive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Vault</span>
          </button>

          <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-[#232732]">
            <button
              type="button"
              onClick={() => onChangeLang(lang === 'id' ? 'en' : 'id')}
              className="min-h-[36px] px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
            >
              {lang.toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeTheme(theme === 'dark' ? 'light' : 'dark')
              }
              className="min-h-[36px] px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile / Tablet Slide-Over Folders & Identity Drawer (< lg) */}
      {mobileFoldersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'id' ? 'Folder & Identitas Mail' : 'Mail Folders & Identity'}
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            onClick={() => setMobileFoldersOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[300px] max-w-[86vw] h-full bg-white dark:bg-[#13161C] border-r border-slate-200 dark:border-[#232732] shadow-2xl flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
                  {lang === 'id' ? 'Folder & Identitas' : 'Folders & Identity'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileFoldersOpen(false)}
                aria-label={lang === 'id' ? 'Tutup panel folder' : 'Close folders drawer'}
                className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1B202B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {renderSidebarContent(() => setMobileFoldersOpen(false))}
            </div>
          </aside>
        </div>
      )}

      {/* Main 1440px Workspace Grid: Desktop Sidebar (260px) + Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar (Desktop lg+ only) */}
        <aside className="hidden lg:block lg:col-span-3 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-4">
          {renderSidebarContent()}
        </aside>

        {/* Main Content Viewport (9 cols on lg) */}
        <section className="lg:col-span-9 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl overflow-hidden min-h-[640px] flex flex-col">
          {loadingLocal ? (
            <div className="p-8 space-y-4">
              <div className="h-6 w-48 bg-slate-200 dark:bg-[#1E2430] rounded animate-pulse" />
              <div className="h-12 w-full bg-slate-100 dark:bg-[#171C26] rounded animate-pulse" />
              <div className="h-12 w-full bg-slate-100 dark:bg-[#171C26] rounded animate-pulse" />
            </div>
          ) : viewMode === 'conversational' ? (
            /* MODE A: CONVERSATIONAL BUBBLE VIEW (WhatsApp-style local threads) */
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-[540px] md:min-h-[640px]">
              {/* Left Thread Correspondent Column (4 cols) */}
              <div
                className={`${
                  mobileShowDetail ? 'hidden md:flex' : 'flex'
                } md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-[#232732] flex-col`}
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-[#232732] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {lang === 'id'
                      ? 'Utas Percakapan Email'
                      : 'Conversational Threads'}
                  </span>
                  <span className="font-mono tabular-nums">
                    {conversationThreads.length} peers
                  </span>
                </div>

                {conversationThreads.length === 0 ? (
                  <div className="p-6 text-center space-y-3 text-xs text-slate-500">
                    <p>
                      {lang === 'id'
                        ? 'Belum ada utas percakapan yang cocok dengan filter.'
                        : 'No conversational threads match your filter.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSimulatorOpen(true)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md cursor-pointer"
                    >
                      {lang === 'id'
                        ? 'Simulasikan Email Masuk'
                        : 'Simulate Inbound Email'}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-[#232732] overflow-y-auto max-h-[600px]">
                    {conversationThreads.map((thread) => {
                      const isSelected =
                        activeThread?.threadId === thread.threadId;
                      const latestTime = new Date(
                        thread.latestMessage.timestamp
                      ).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <button
                          key={thread.threadId}
                          type="button"
                          onClick={() =>
                            handleSelectThread(thread.threadId, thread.messages)
                          }
                          className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/70 dark:bg-[#192132]'
                              : 'hover:bg-slate-50 dark:hover:bg-[#171B24]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {thread.peerName}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                              {latestTime}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            {thread.peerAddress}
                          </div>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                            {thread.latestMessage.subject} —{' '}
                            {thread.latestMessage.bodyText}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            <span>{thread.messages.length} msg</span>
                            {thread.latestMessage.plusTag && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-blue-600 dark:text-blue-400">
                                  +{thread.latestMessage.plusTag}
                                </span>
                              </>
                            )}
                            {thread.latestMessage.dotNormalized && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>dot-alias</span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Chat Bubble Stream (8 cols) */}
              <div
                className={`${
                  mobileShowDetail ? 'flex' : 'hidden md:flex'
                } md:col-span-8 flex-col justify-between bg-[#FAFAFA] dark:bg-[#0E1117]`}
              >
                {activeThread ? (
                  <>
                    {/* Thread Header */}
                    <div className="px-4 sm:px-5 py-3 bg-white dark:bg-[#13161C] border-b border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => setMobileShowDetail(false)}
                          aria-label={lang === 'id' ? 'Kembali ke daftar utas' : 'Back to threads'}
                          className="md:hidden min-h-[44px] inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg shrink-0 cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>{lang === 'id' ? 'Utas' : 'Threads'}</span>
                        </button>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
                            {activeThread.peerName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono flex flex-wrap items-center gap-1.5">
                            <span className="truncate">{activeThread.peerAddress}</span>
                            <span aria-hidden="true" className="hidden sm:inline">·</span>
                            <span className="hidden sm:inline">Local IndexedDB</span>
                            {activeThread.latestMessage.chatBridgeChannel && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-blue-600 dark:text-blue-400">
                                  Bridged: {activeThread.latestMessage.chatBridgeChannel}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            openSearchGrounding(
                              activeThread.peerAddress,
                              activeThread.peerName,
                              activeThread.latestMessage.subject
                            )
                          }
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            {lang === 'id'
                              ? 'Verifikasi Pengirim'
                              : 'Verify Sender'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenNewComposer({
                              to: activeThread.peerAddress,
                              subject: `Re: ${activeThread.latestMessage.subject}`,
                            })
                          }
                          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] hover:bg-slate-200 dark:hover:bg-[#242B3A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {lang === 'id' ? 'Editor Penuh' : 'Full Composer'}
                        </button>
                      </div>
                    </div>

                    {/* Bubbles List */}
                    <div className="p-5 space-y-4 overflow-y-auto max-h-[470px] flex-1">
                      {activeThread.messages.map((msg) => {
                        const isOutbound = msg.direction === 'outbound';
                        const isExpanded = Boolean(expandedHeaderIds[msg.id]);
                        const formattedDate = new Date(
                          msg.timestamp
                        ).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${
                              isOutbound ? 'items-end' : 'items-start'
                            }`}
                          >
                            <div
                              className={`max-w-[85%] sm:max-w-[75%] rounded-xl p-4 space-y-2 border ${
                                isOutbound
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-[#151922] text-slate-900 dark:text-slate-100 border-slate-200 dark:border-[#252A37]'
                              }`}
                            >
                              {/* Subject & Unboxed Metadata Line */}
                              <div className="flex items-start justify-between gap-4">
                                <div className="text-xs font-bold">
                                  {msg.subject}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStar(msg)}
                                  aria-label="Star message"
                                  className="shrink-0 cursor-pointer"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      msg.starred
                                        ? 'fill-amber-400 text-amber-400'
                                        : isOutbound
                                          ? 'text-blue-200'
                                          : 'text-slate-400'
                                    }`}
                                  />
                                </button>
                              </div>

                              {/* Message Body */}
                              <div className="text-xs sm:text-sm whitespace-pre-line leading-relaxed">
                                {msg.bodyText}
                              </div>

                              {/* Inline Direct Media (Imgur / Direct Images) & External File Links (VZ Files / Drive) */}
                              <MailExternalLinksView
                                bodyText={msg.bodyText}
                                externalLinks={msg.externalLinks}
                                lang={lang}
                                invertedBubble={isOutbound}
                              />

                              {/* WhatsApp-Style Ephemeral & Local Attachments */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="pt-2 space-y-1.5">
                                  {msg.attachments.map((att) => {
                                    const isLocal = Boolean(
                                      att.localDataBase64 ||
                                        att.contentText ||
                                        att.storageStatus === 'local_saved'
                                    );
                                    const isExpired =
                                      att.storageStatus === 'expired_purged';
                                    const isDownloading =
                                      downloadingAttId === att.id;
                                    return (
                                      <button
                                        key={att.id}
                                        type="button"
                                        disabled={isDownloading}
                                        onClick={() =>
                                          void handleDownloadAttachment(msg, att)
                                        }
                                        className={`w-full text-left inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                                          isExpired
                                            ? 'bg-rose-950/30 border border-rose-400/50 text-rose-100'
                                            : isOutbound
                                              ? 'bg-blue-700 text-white hover:bg-blue-800'
                                              : 'bg-slate-100 dark:bg-[#1F2533] text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#272F40]'
                                        }`}
                                      >
                                        <span className="inline-flex items-center gap-2 min-w-0">
                                          {isDownloading ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                          ) : isExpired ? (
                                            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                          ) : (
                                            <Download className="w-3.5 h-3.5 shrink-0" />
                                          )}
                                          <span className="truncate">
                                            {att.filename}
                                          </span>
                                        </span>
                                        <span className="text-[10px] opacity-85 shrink-0">
                                          {isExpired
                                            ? lang === 'id'
                                              ? 'Kedaluwarsa (Minta Kirim Ulang)'
                                              : 'Expired (Ask Resend)'
                                            : isLocal
                                              ? `${formatAttachmentBytes(att.sizeBytes)} · Lokal`
                                              : `${formatAttachmentBytes(att.sizeBytes)} · Unduh (R2)`}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Quiet Unboxed Footer Metadata */}
                              <div
                                className={`pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums ${
                                  isOutbound
                                    ? 'border-blue-500 text-blue-100'
                                    : 'border-slate-200 dark:border-[#252A37] text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{formattedDate}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>to: {msg.deliveredToAlias}</span>
                                  {msg.plusTag && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>+{msg.plusTag}</span>
                                    </>
                                  )}
                                  {msg.dotNormalized && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>dot-normalized</span>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedHeaderIds((prev) => ({
                                        ...prev,
                                        [msg.id]: !prev[msg.id],
                                      }))
                                    }
                                    className="underline cursor-pointer"
                                  >
                                    {isExpanded ? 'Hide RFC' : 'RFC Headers'}
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerBrowserDownload(
                                        `${msg.id}.eml`,
                                        serializeToEml(msg),
                                        'message/rfc822'
                                      )
                                    }
                                    className="underline cursor-pointer"
                                  >
                                    .eml
                                  </button>
                                </div>
                              </div>

                              {/* Expandable RFC 5322 & Zero-Retention Receipt Panel */}
                              {isExpanded && (
                                <div
                                  className={`mt-2 p-2.5 rounded text-[11px] font-mono space-y-1 ${
                                    isOutbound
                                      ? 'bg-blue-700/80 text-blue-50'
                                      : 'bg-slate-100 dark:bg-[#0B0D11] text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div>Message-ID: {msg.rfcMessageId}</div>
                                  <div>
                                    From: {msg.from.name} &lt;{msg.from.address}
                                    &gt;
                                  </div>
                                  <div>Delivered-To: {msg.deliveredToAlias}</div>
                                  <div>
                                    Canonical-Owner: {msg.ownerUser}@{domain}
                                  </div>
                                  <div>DMARC/SPF: {msg.dmarcPolicy}</div>
                                  <div>
                                    Edge-Retention-Proof:{' '}
                                    {msg.ephemeralQueueReceipt ||
                                      'PURGED-ON-PULL'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fast Bottom Chat-Bubble Reply Composer */}
                    <form
                      onSubmit={handleQuickBubbleReply}
                      className="p-3 sm:p-3.5 bg-white dark:bg-[#13161C] border-t border-slate-200 dark:border-[#232732] flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                        placeholder={
                          lang === 'id'
                            ? `Balas cepat ke ${activeThread.peerAddress}...`
                            : `Quick reply to ${activeThread.peerAddress}...`
                        }
                        className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={sendingQuickReply || !quickReplyText.trim()}
                        className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{lang === 'id' ? 'Kirim' : 'Send'}</span>
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="p-10 text-center text-xs text-slate-500">
                    {lang === 'id'
                      ? 'Pilih salah satu utas percakapan di sebelah kiri.'
                      : 'Select a conversation thread on the left.'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* MODE B: CLASSIC HIGH-DENSITY TABULAR INBOX VIEW */
            <div className="flex-1 flex flex-col">
              {/* Mobile Card List (< md) */}
              <div
                className={`md:hidden ${
                  mobileShowDetail ? 'hidden' : 'block'
                } divide-y divide-slate-200 dark:divide-[#232732] border-b border-slate-200 dark:border-[#232732]`}
              >
                {filteredMessages.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-500">
                    {lang === 'id'
                      ? 'Tidak ada pesan pada folder ini di IndexedDB lokal.'
                      : 'No messages in this folder in local IndexedDB.'}
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isSelected = activeClassicMessage?.id === msg.id;
                    const dateStr = new Date(msg.timestamp).toLocaleString(
                      lang === 'id' ? 'id-ID' : 'en-US',
                      {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    );
                    return (
                      <div
                        key={msg.id}
                        onClick={() => handleSelectClassicMessage(msg)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectClassicMessage(msg);
                          }
                        }}
                        className={`p-3.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-[#192132]'
                            : 'hover:bg-slate-50 dark:hover:bg-[#171B24]'
                        }`}
                      >
                        <button
                          type="button"
                          aria-label="Star message"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStar(msg);
                          }}
                          className="w-10 h-10 -ml-2 -mt-1 inline-flex items-center justify-center rounded-lg shrink-0 cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              msg.starred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-400'
                            }`}
                          />
                        </button>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {msg.direction === 'inbound'
                                ? msg.from.name
                                : `To: ${msg.to[0]?.address || ''}`}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                              {dateStr}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {msg.subject}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {msg.bodyText}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            to: {msg.deliveredToAlias}
                            {msg.plusTag ? ` (+${msg.plusTag})` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop High-Density Table (md+) */}
              <div className="hidden md:block overflow-x-auto border-b border-slate-200 dark:border-[#232732]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#232732] bg-[#FAFAFA] dark:bg-[#0F131A] text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pl-4 pr-2 font-medium w-8">★</th>
                      <th className="py-2.5 px-3 font-medium">
                        {lang === 'id' ? 'Pengirim / Tujuan' : 'From / To'}
                      </th>
                      <th className="py-2.5 px-3 font-medium">
                        {lang === 'id' ? 'Subjek & Ringkasan' : 'Subject & Preview'}
                      </th>
                      <th className="py-2.5 px-3 font-medium">
                        {lang === 'id' ? 'Alias Tujuan' : 'Delivered Alias'}
                      </th>
                      <th className="py-2.5 pl-3 pr-4 text-right font-medium">
                        {lang === 'id' ? 'Waktu' : 'Time'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#232732]">
                    {filteredMessages.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-8 text-center text-slate-500"
                        >
                          {lang === 'id'
                            ? 'Tidak ada pesan pada folder ini di IndexedDB lokal.'
                            : 'No messages in this folder in local IndexedDB.'}
                        </td>
                      </tr>
                    ) : (
                      filteredMessages.map((msg) => {
                        const isSelected = activeClassicMessage?.id === msg.id;
                        const dateStr = new Date(
                          msg.timestamp
                        ).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        return (
                          <tr
                            key={msg.id}
                            onClick={() => handleSelectClassicMessage(msg)}
                            className={`h-10 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50/80 dark:bg-[#192132]'
                                : 'hover:bg-slate-50 dark:hover:bg-[#171B24]'
                            }`}
                          >
                            <td
                              className="py-2 pl-4 pr-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStar(msg);
                              }}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  msg.starred
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-400'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                              {msg.direction === 'inbound'
                                ? msg.from.name
                                : `To: ${msg.to[0]?.address || ''}`}
                            </td>
                            <td className="py-2 px-3 max-w-md truncate text-slate-700 dark:text-slate-300">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {msg.subject}
                              </span>{' '}
                              <span className="text-slate-500">
                                — {msg.bodyText.slice(0, 80)}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {msg.deliveredToAlias}
                              {msg.plusTag ? ` (+${msg.plusTag})` : ''}
                            </td>
                            <td className="py-2 pl-3 pr-4 text-right font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                              {dateStr}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Classic Split Reading Pane */}
              {activeClassicMessage && (
                <div
                  className={`${
                    mobileShowDetail ? 'block' : 'hidden md:block'
                  } p-4 sm:p-6 space-y-4 flex-1 bg-[#FAFAFA] dark:bg-[#0E1117]`}
                >
                  <button
                    type="button"
                    onClick={() => setMobileShowDetail(false)}
                    className="md:hidden min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-lg cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {lang === 'id' ? 'Kembali ke Daftar Email' : 'Back to Message List'}
                    </span>
                  </button>

                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-[#232732] pb-4">
                    <div className="space-y-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-display break-words">
                        {activeClassicMessage.subject}
                      </h3>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 tabular-nums">
                        <span className="break-all">
                          From: {activeClassicMessage.from.name} &lt;
                          {activeClassicMessage.from.address}&gt;
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="break-all">
                          Delivered-To: {activeClassicMessage.deliveredToAlias}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Receipt:{' '}
                          {activeClassicMessage.ephemeralQueueReceipt ||
                            'PURGED-CF-EDGE'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeClassicMessage.folder === 'drafts' ? (
                        <>
                          <button
                            type="button"
                            disabled={sendingDraftId === activeClassicMessage.id}
                            onClick={() =>
                              void handleSendDraftDirectly(activeClassicMessage)
                            }
                            className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {sendingDraftId === activeClassicMessage.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {sendingDraftId === activeClassicMessage.id
                                ? lang === 'id'
                                  ? 'Mengirim...'
                                  : 'Sending...'
                                : lang === 'id'
                                  ? 'Kirim Sekarang'
                                  : 'Send Now'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditDraft(activeClassicMessage)}
                            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>
                              {lang === 'id' ? 'Lanjutkan Edit' : 'Edit Draft'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingPermanentDeleteMsg(activeClassicMessage)
                            }
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>
                              {lang === 'id' ? 'Hapus Draf' : 'Delete Draft'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              openSearchGrounding(
                                activeClassicMessage.from.address,
                                activeClassicMessage.from.name,
                                activeClassicMessage.subject
                              )
                            }
                            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {lang === 'id'
                                ? 'Verifikasi Pengirim & Cari'
                                : 'Verify Sender & Search'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenNewComposer({
                                to:
                                  activeClassicMessage.direction === 'inbound'
                                    ? activeClassicMessage.from.address
                                    : activeClassicMessage.to[0]?.address || '',
                                subject: `Re: ${activeClassicMessage.subject}`,
                              })
                            }
                            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                          >
                            {lang === 'id' ? 'Balas' : 'Reply'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              triggerBrowserDownload(
                                `${activeClassicMessage.id}.eml`,
                                serializeToEml(activeClassicMessage),
                                'message/rfc822'
                              )
                            }
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-md cursor-pointer"
                          >
                            .eml
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleMoveFolder(activeClassicMessage, 'archive')
                            }
                            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-md cursor-pointer"
                          >
                            {lang === 'id' ? 'Arsipkan' : 'Archive'}
                          </button>
                          {activeClassicMessage.folder === 'trash' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingPermanentDeleteMsg(activeClassicMessage)
                              }
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer"
                            >
                              {lang === 'id'
                                ? 'Hapus Permanen Lokal'
                                : 'Wipe from Device'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveFolder(activeClassicMessage, 'trash')
                              }
                              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-[#191E28] border border-slate-200 dark:border-[#282F3D] rounded-md cursor-pointer"
                            >
                              {lang === 'id' ? 'Sampah' : 'Trash'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed max-w-[70ch]">
                    {activeClassicMessage.bodyText}
                  </div>

                  {/* Inline Direct Media (Imgur / Direct Images) & External Cloud/VZ Files Cards */}
                  <div className="max-w-2xl">
                    <MailExternalLinksView
                      bodyText={activeClassicMessage.bodyText}
                      externalLinks={activeClassicMessage.externalLinks}
                      lang={lang}
                    />
                  </div>

                  {/* WhatsApp-Style Ephemeral & Local Attachments in Classic Reading Pane */}
                  {activeClassicMessage.attachments &&
                    activeClassicMessage.attachments.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 dark:border-[#232732] space-y-2.5 max-w-2xl">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <Paperclip className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>
                            {lang === 'id'
                              ? `Lampiran (${activeClassicMessage.attachments.length})`
                              : `Attachments (${activeClassicMessage.attachments.length})`}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {activeClassicMessage.attachments.map((att) => {
                            const isLocal = Boolean(
                              att.localDataBase64 ||
                                att.contentText ||
                                att.storageStatus === 'local_saved'
                            );
                            const isExpired =
                              att.storageStatus === 'expired_purged';
                            const isDownloading = downloadingAttId === att.id;
                            return (
                              <div
                                key={att.id}
                                className={`p-3 rounded-lg border flex flex-col gap-2 ${
                                  isExpired
                                    ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                                    : 'bg-white dark:bg-[#151922] border-slate-200 dark:border-[#262C3B]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                      {att.filename}
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                      {formatAttachmentBytes(att.sizeBytes)} ·{' '}
                                      {att.mimeType}
                                    </div>
                                  </div>
                                  {!isExpired && (
                                    <button
                                      type="button"
                                      disabled={isDownloading}
                                      onClick={() =>
                                        void handleDownloadAttachment(
                                          activeClassicMessage,
                                          att
                                        )
                                      }
                                      className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                    >
                                      {isDownloading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Download className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {isLocal
                                          ? lang === 'id'
                                            ? 'Unduh'
                                            : 'Download'
                                          : lang === 'id'
                                            ? 'Unduh & Simpan'
                                            : 'Download & Save'}
                                      </span>
                                    </button>
                                  )}
                                </div>
                                <div className="text-[11px] leading-snug">
                                  {isExpired ? (
                                    <span className="text-rose-700 dark:text-rose-300 font-medium">
                                      {lang === 'id'
                                        ? 'Media sudah terhapus dari server R2 (setelah diunduh / >7 hari). Minta pengirim kirim ulang.'
                                        : 'Media was purged from R2 (downloaded / >7 days old). Ask the sender to resend.'}
                                    </span>
                                  ) : isLocal ? (
                                    <span className="text-emerald-700 dark:text-emerald-400 font-mono">
                                      {lang === 'id'
                                        ? 'Tersimpan lokal di perangkat (0 byte di server R2)'
                                        : 'Saved locally on device (0 bytes on R2 server)'}
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {lang === 'id'
                                        ? 'Transit sementara R2 (maks 7 hari) — otomatis terhapus dari server saat Anda unduh.'
                                        : 'Ephemeral R2 transit (max 7 days) — auto-purged from server upon download.'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Gmail / Hotmail-Style Floating, Minimizable & Fullscreen Composer */}
      <MailFloatingComposer
        mode={composeMode}
        onChangeMode={setComposeMode}
        lang={lang}
        primaryEmail={primaryEmail}
        aliasExamples={aliasExamples}
        fromAlias={composeFromAlias}
        onChangeFromAlias={setComposeFromAlias}
        to={composeTo}
        onChangeTo={setComposeTo}
        subject={composeSubject}
        onChangeSubject={setComposeSubject}
        body={composeBody}
        onChangeBody={setComposeBody}
        attachments={composeAttachments}
        onAddFiles={handleAddComposeFiles}
        onRemoveAttachment={handleRemoveComposeAttachment}
        externalLinks={composeExternalLinks}
        onAddExternalLink={handleAddExternalLink}
        onRemoveExternalLink={handleRemoveExternalLink}
        onToggleExternalLinkInline={handleToggleExternalLinkInline}
        oversizedFiles={oversizedFiles}
        onClearOversizedFiles={() => setOversizedFiles([])}
        onUploadFileToVzFiles={handleUploadFileToVzFiles}
        vzUploadProgress={vzUploadProgress}
        editingDraftId={editingDraftId}
        sending={composeSending}
        feedback={composeFeedback}
        onClearFeedback={() => setComposeFeedback({ kind: 'idle', message: '' })}
        quotaUsed={quotaUsed}
        quotaLimit={quotaLimit}
        onSend={handleSendOutboundEmail}
        onSaveDraft={handleSaveDraft}
        onDiscard={() => {
          resetComposeForm();
          setComposeMode('closed');
        }}
      />

      {/* Inbound Email Routing & Alias Simulator Modal */}
      {simulatorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Simulate Inbound Email"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSimulatorOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#232732] pb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'id'
                    ? 'Simulasi Paket Masuk Cloudflare Email Routing (+ & . Alias)'
                    : 'Simulate Cloudflare Email Routing Inbound Packet (+ & . Alias)'}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === 'id'
                    ? 'Uji pengiriman ke variasi titik (.) atau plus (+) dan tarik dari antrean transit ke IndexedDB lokal.'
                    : 'Test sending to any dot (.) or plus (+) alias variation and pull it from the edge transit queue.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorOpen(false)}
                aria-label="Close simulator"
                className="w-11 h-11 -mr-2 -mt-2 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulateInbound} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'id'
                    ? 'Alamat Tujuan Alias (+ / .):'
                    : 'Recipient Alias (+ / .):'}
                </label>
                <input
                  type="text"
                  required
                  value={simToAlias}
                  onChange={(e) => setSimToAlias(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {aliasExamples.map((ex) => (
                    <button
                      key={ex.address}
                      type="button"
                      onClick={() => setSimToAlias(ex.address)}
                      className="px-2 py-1 text-[11px] font-mono bg-slate-100 dark:bg-[#1B202B] text-slate-700 dark:text-slate-300 rounded cursor-pointer"
                    >
                      {ex.address}
                    </button>
                  ))}
                </div>
                <div className="mt-2 p-2.5 rounded bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-[11px] font-mono text-slate-600 dark:text-slate-300 break-words">
                  Canonical Target:{' '}
                  <strong className="text-blue-600 dark:text-blue-400">
                    {simResolved.canonicalEmail}
                  </strong>{' '}
                  · Plus Tag: {simResolved.plusTag || 'none'} · Dots Normalized:{' '}
                  {simResolved.dotCount}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama Pengirim:
                  </label>
                  <input
                    type="text"
                    required
                    value={simFromName}
                    onChange={(e) => setSimFromName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Pengirim:
                  </label>
                  <input
                    type="email"
                    required
                    value={simFromAddr}
                    onChange={(e) => setSimFromAddr(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Subjek:
                </label>
                <input
                  type="text"
                  required
                  value={simSubject}
                  onChange={(e) => setSimSubject(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Isi Pesan:
                </label>
                <textarea
                  rows={4}
                  required
                  value={simBody}
                  onChange={(e) => setSimBody(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSimulatorOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  {lang === 'id' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {lang === 'id'
                    ? 'Masukkan ke Antrean Edge'
                    : 'Inject into Edge Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmActionModal
        isOpen={Boolean(pendingPermanentDeleteMsg)}
        lang={lang}
        tone="danger"
        title={
          lang === 'id'
            ? 'Hapus permanen email ini dari perangkat?'
            : 'Permanently delete this email from device?'
        }
        description={
          lang === 'id'
            ? 'Pesan ini akan dihapus secara permanen dari database IndexedDB lokal perangkat Anda dan tidak dapat dipulihkan kembali (kecuali Anda memiliki cadangan MyVault).'
            : 'This message will be permanently erased from your device local IndexedDB database and cannot be recovered (unless you have a MyVault backup).'
        }
        details={
          pendingPermanentDeleteMsg
            ? `${pendingPermanentDeleteMsg.subject || '(No Subject)'} — ${pendingPermanentDeleteMsg.from.address}`
            : undefined
        }
        confirmLabel={
          lang === 'id' ? 'Ya, Hapus Permanen' : 'Yes, Delete Permanently'
        }
        loading={deletingLocalMsg}
        onConfirm={async () => {
          if (!pendingPermanentDeleteMsg) return;
          setDeletingLocalMsg(true);
          try {
            await handlePermanentLocalDelete(pendingPermanentDeleteMsg.id);
          } finally {
            setDeletingLocalMsg(false);
            setPendingPermanentDeleteMsg(null);
          }
        }}
        onCancel={() => {
          if (deletingLocalMsg) return;
          setPendingPermanentDeleteMsg(null);
        }}
      />

      <MailSearchGroundingDrawer
        isOpen={groundingDrawer.open}
        lang={lang}
        initialSenderEmail={groundingDrawer.email}
        initialSenderName={groundingDrawer.name}
        initialSubject={groundingDrawer.subject}
        allMessages={messages}
        onClose={() =>
          setGroundingDrawer((prev) => ({ ...prev, open: false }))
        }
        onSelectMessage={(msg) => {
          setActiveFolder(msg.folder);
          setSelectedPlusTag(null);
          if (viewMode === 'conversational') {
            setSelectedThreadId(msg.threadId);
          } else {
            setSelectedMessageId(msg.id);
          }
          setMobileShowDetail(true);
        }}
      />

      <MailQrModal
        isOpen={mailQrState.open}
        lang={lang}
        primaryEmail={primaryEmail}
        username={user}
        displayName={session.name || user}
        domain={domain}
        discoveredPlusTags={discoveredPlusTags}
        initialEmail={mailQrState.initialEmail}
        onClose={() => setMailQrState({ open: false })}
      />
    </div>
  );
}
