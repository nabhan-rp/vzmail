import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderArchive,
  FolderOpen,
  HardDrive,
  Inbox,
  Link2,
  Lock,
  MailPlus,
  MessageSquare,
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
  deleteMessageFromLocalDb,
  ensureUserMessagesSeeded,
  markMessagesAsRead,
  normalizeInboundPacketToLocalMessage,
  saveMessage,
  saveMessagesBatch,
  type LocalMailMessage,
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
import { ConfirmActionModal } from './ConfirmActionModal';
import type { ActiveHostView } from './MailLinksTopBar';

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
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Compose Modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeFromAlias, setComposeFromAlias] = useState(primaryEmail);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);

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

  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotice((curr) => (curr === msg ? null : curr));
    }, 4500);
  }, []);

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

  // Escape key closes Compose, Simulator, and mobile Folders drawer cleanly
  useEffect(() => {
    if (!composeOpen && !simulatorOpen && !mobileFoldersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setComposeOpen(false);
        setSimulatorOpen(false);
        setMobileFoldersOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composeOpen, simulatorOpen, mobileFoldersOpen]);

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
      setComposeOpen(true);
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

  const handleSendOutboundEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo.trim()) return;
    setComposeSending(true);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUser: user,
          fromAddress: composeFromAlias || primaryEmail,
          toAddress: composeTo.trim(),
          subject: composeSubject.trim() || '(Tanpa Subjek)',
          bodyText: composeBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Gagal mengirim email.');
        return;
      }

      if (!data.kvBound && data.loopbackPacket) {
        enqueueLocalFallbackPacket(data.loopbackPacket as EphemeralEdgePacket);
      }

      const newLocalSent: LocalMailMessage = {
        id: generateSecureId('msg-sent'),
        rfcMessageId: data.rfcMessageId || `<${generateSecureId('sent')}@${domain}>`,
        ownerUser: user,
        threadId: composeTo.trim().toLowerCase(),
        folder: 'sent',
        direction: 'outbound',
        from: { name: user, address: composeFromAlias || primaryEmail },
        to: [
          {
            name: composeTo.trim().split('@')[0],
            address: composeTo.trim().toLowerCase(),
          },
        ],
        cc: [],
        deliveredToAlias: composeTo.trim().toLowerCase(),
        plusTag: null,
        dotNormalized: false,
        subject: composeSubject.trim() || '(Tanpa Subjek)',
        bodyText: composeBody.trim(),
        timestamp: new Date().toISOString(),
        read: true,
        starred: false,
        verifiedSpfDkim: true,
        dmarcPolicy: 'local-relay',
        ephemeralQueueReceipt: 'LOCAL-ONLY-ZERO-SERVER-COPY',
        chatBridgeChannel: null,
        attachments: [],
      };

      await saveMessage(newLocalSent);
      if (data.quota) {
        setQuotaUsed(data.quota.usedToday);
      }
      setComposeOpen(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      await loadLocalMessages();
      await checkEdgeTransitQueue();
      setSelectedThreadId(newLocalSent.threadId);
      setSelectedMessageId(newLocalSent.id);

      showToast(
        lang === 'id'
          ? `Email diproses (${data.liveEmailDispatched ? 'Cloudflare Email Sending aktif' : 'Mode Simulasi Relay'}) & disimpan di IndexedDB perangkat lokal.`
          : `Email processed (${data.liveEmailDispatched ? 'Live Cloudflare Email Sending' : 'Relay Simulation Mode'}) & saved in local device IndexedDB.`
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal terhubung ke relay pengiriman email.'
          : 'Failed to reach outbound email relay.'
      );
    } finally {
      setComposeSending(false);
    }
  };

  const handleSaveDraft = async () => {
    const draftMsg: LocalMailMessage = {
      id: generateSecureId('msg-draft'),
      rfcMessageId: `<${generateSecureId('draft')}@${domain}>`,
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
      attachments: [],
    };
    await saveMessage(draftMsg);
    setComposeOpen(false);
    setActiveFolder('drafts');
    await loadLocalMessages();
    showToast(
      lang === 'id'
        ? 'Draf disimpan secara lokal di perangkat Anda.'
        : 'Draft saved locally on your device.'
    );
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
          setComposeFromAlias(primaryEmail);
          setComposeOpen(true);
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

      {/* Toast Notification */}
      {toastNotice && (
        <div className="bg-slate-900 dark:bg-blue-950 text-white border border-slate-700 dark:border-blue-800 rounded-lg px-4 py-2.5 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="break-words">{toastNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            aria-label="Dismiss notification"
            className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-white shrink-0 cursor-pointer"
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
              onClick={() => {
                setComposeFromAlias(primaryEmail);
                setComposeOpen(true);
              }}
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
                          onClick={() => {
                            setComposeTo(activeThread.peerAddress);
                            setComposeSubject(
                              `Re: ${activeThread.latestMessage.subject}`
                            );
                            setComposeOpen(true);
                          }}
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

                              {/* Attachments */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="pt-2 space-y-1">
                                  {msg.attachments.map((att) => (
                                    <button
                                      key={att.id}
                                      type="button"
                                      onClick={() =>
                                        triggerBrowserDownload(
                                          att.filename,
                                          att.contentText || msg.bodyText,
                                          att.mimeType
                                        )
                                      }
                                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono cursor-pointer ${
                                        isOutbound
                                          ? 'bg-blue-700 text-white hover:bg-blue-800'
                                          : 'bg-slate-100 dark:bg-[#1F2533] text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>{att.filename}</span>
                                    </button>
                                  ))}
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
                      <button
                        type="button"
                        onClick={() => {
                          setComposeTo(
                            activeClassicMessage.direction === 'inbound'
                              ? activeClassicMessage.from.address
                              : activeClassicMessage.to[0]?.address || ''
                          );
                          setComposeSubject(
                            `Re: ${activeClassicMessage.subject}`
                          );
                          setComposeOpen(true);
                        }}
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
                    </div>
                  </div>

                  <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed max-w-[70ch]">
                    {activeClassicMessage.bodyText}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Outbound Compose Modal */}
      {composeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Compose Outbound Email"
          onClick={(e) => {
            if (e.target === e.currentTarget) setComposeOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#232732] pb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {lang === 'id'
                    ? 'Tulis Email Baru (Cloudflare Email Sending)'
                    : 'Compose Outbound Email (Cloudflare Email Sending)'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Zero VPS · Disimpan lokal di IndexedDB ({quotaUsed}/
                  {quotaLimit} kuota harian)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                aria-label="Close composer"
                className="w-11 h-11 -mr-2 -mt-2 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendOutboundEmail} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'id'
                    ? 'Dari Alamat / Alias (+ atau .):'
                    : 'From Address / Alias (+ or .):'}
                </label>
                <select
                  value={composeFromAlias}
                  onChange={(e) => setComposeFromAlias(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                >
                  <option value={primaryEmail}>
                    {primaryEmail} (Primary Canonical)
                  </option>
                  {aliasExamples.map((ex) => (
                    <option key={ex.address} value={ex.address}>
                      {ex.address} ({ex.rule})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'id' ? 'Kepada (To):' : 'To Recipient:'}
                </label>
                <input
                  type="email"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="rina@imy.li atau alamat eksternal..."
                  className="w-full px-3.5 py-2 text-xs font-mono bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'id' ? 'Subjek:' : 'Subject:'}
                </label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder={
                    lang === 'id' ? 'Subjek pesan...' : 'Email subject...'
                  }
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {lang === 'id' ? 'Isi Pesan:' : 'Message Body:'}
                </label>
                <textarea
                  rows={6}
                  required
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder={
                    lang === 'id'
                      ? 'Tulis isi surat elektronik Anda...'
                      : 'Write your email message...'
                  }
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303D] rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="min-h-[42px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202B] rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  {lang === 'id' ? 'Simpan Draf Lokal' : 'Save Local Draft'}
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setComposeOpen(false)}
                    className="min-h-[42px] px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                  >
                    {lang === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={composeSending}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {composeSending
                        ? 'Sending...'
                        : lang === 'id'
                          ? 'Kirim via Edge Worker'
                          : 'Send via Edge Worker'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
}
