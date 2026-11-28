export type ChangelogServiceId = 'vz-mail' | 'vz-links';
export type ChangelogCategoryId = 'core' | 'privacy_security' | 'ux_tools' | 'seo_infra';

export interface BilingualText {
  id: string;
  en: string;
}

export interface ChangelogItem {
  id: string;
  category: ChangelogCategoryId;
  title: BilingualText;
  description: BilingualText;
}

export interface ChangelogServiceRelease {
  serviceId: ChangelogServiceId;
  serviceName: string;
  domains: string[];
  version: string;
  releaseDate: string; // ISO YYYY-MM-DD
  codename: BilingualText;
  summary: BilingualText;
  highlights: ChangelogItem[];
}

export const CHANGELOG_VERSION = 'v1.1.5';
export const CHANGELOG_RELEASE_DATE = '2026-11-28';

export const CHANGELOG_CATEGORY_LABELS: Record<ChangelogCategoryId, BilingualText> = {
  core: {
    id: 'Fitur Utama',
    en: 'Core Features',
  },
  privacy_security: {
    id: 'Privasi & Keamanan',
    en: 'Privacy & Security',
  },
  ux_tools: {
    id: 'Alat & Pengalaman Pengguna',
    en: 'Tools & User Experience',
  },
  seo_infra: {
    id: 'SEO, AI Crawler & Infrastruktur',
    en: 'SEO, AI Crawlers & Infrastructure',
  },
};

export const CHANGELOG_RELEASES: readonly ChangelogServiceRelease[] = [
  {
    serviceId: 'vz-links',
    serviceName: 'VZ Links & VZ Ecosystem API',
    domains: ['links.vz.gay', 'imy.li', 'builder.vz.gay', 'desk.vz.gay', 'files.vz.gay'],
    version: '1.1.5',
    releaseDate: '2026-11-28',
    codename: {
      id: 'Proteksi Anti-Bot Cloudflare Turnstile & Bypass Hibrida Ekosistem VZ',
      en: 'Cloudflare Turnstile Anti-Bot Protection & VZ Ecosystem Hybrid Bypass',
    },
    summary: {
      id: 'Menambahkan verifikasi Cloudflare Turnstile on-demand untuk pembuatan shortlink imy.li/s/ publik (tanpa login SSO), disertai jalur bypass hibrida & CORS terverifikasi agar sub-aplikasi ekosistem VZ (VZ Builder beserta go-blog & business, VZ Desk beserta 20+ subdomain, serta VZ Files) tetap berjalan lancar tanpa terblokir.',
      en: 'Adds on-demand Cloudflare Turnstile verification for public (non-SSO) imy.li/s/ shortlink creation, paired with a hybrid bypass and allowlisted CORS so sibling VZ ecosystem apps (VZ Builder including go-blog & business, VZ Desk with 20+ subdomains, and VZ Files) remain uninterrupted.',
    },
    highlights: [
      {
        id: 'v115-turnstile-ondemand',
        category: 'privacy_security',
        title: {
          id: 'Cloudflare Turnstile On-Demand untuk Shortlink Publik',
          en: 'On-Demand Cloudflare Turnstile for Public Shortlinks',
        },
        description: {
          id: 'Widget Turnstile Managed hanya dimuat dan ditampilkan otomatis saat tamu (non-login SSO) mulai mengetik URL tujuan, dengan verifikasi server-side ketat (fail-closed) di produksi serta bypass otomatis di localhost/preview.',
          en: 'Managed Turnstile widget lazy-loads only when an unauthenticated guest begins typing a URL, backed by strict fail-closed server-side verification in production and automatic local/preview bypass.',
        },
      },
      {
        id: 'v115-vz-ecosystem-hybrid-bypass',
        category: 'seo_infra',
        title: {
          id: 'Bypass Hibrida & CORS Terverifikasi untuk Ekosistem VZ',
          en: 'Hybrid Bypass & Allowlisted CORS for VZ Ecosystem Apps',
        },
        description: {
          id: 'Mendukung 3 jalur bypass resmi tanpa mengganggu pengguna layanan saudara: token Auth0 SSO, API Key konstan-waktu (X-VZ-Ecosystem-Key), serta Origin HTTPS terverifikasi khusus untuk builder.vz.gay (*.builder.vz.gay), desk.vz.gay (*.desk.vz.gay), files.vz.gay (*.files.vz.gay), dan mail.vz.gay.',
          en: 'Supports 3 trusted bypass paths so sibling apps are never blocked: verified Auth0 SSO JWT, constant-time API Key (X-VZ-Ecosystem-Key), and scoped HTTPS Origin allowlist covering builder.vz.gay (*.builder.vz.gay), desk.vz.gay (*.desk.vz.gay), files.vz.gay (*.files.vz.gay), and mail.vz.gay.',
        },
      },
      {
        id: 'v115-csp-ratelimit-hardening',
        category: 'privacy_security',
        title: {
          id: 'Pengerasan CSP Edge & Rate-Limit Burst Origin',
          en: 'Edge CSP Hardening & Origin Burst Rate-Limiting',
        },
        description: {
          id: 'Memperbarui Content-Security-Policy Cloudflare Worker untuk challenges.cloudflare.com, mengecualikan links.vz.gay dan *.imy.li dari bypass Origin agar tamu publik selalu melewati Turnstile, serta menambahkan batas burst 60 permintaan/menit per IP pada jalur Origin.',
          en: 'Updated Worker CSP for challenges.cloudflare.com, explicitly excluded links.vz.gay and *.imy.li from Origin bypass so public guests always pass Turnstile, and added a 60 req/min per-IP burst limiter for Origin-bypassed calls.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail & VZ Links',
    domains: ['mail.vz.gay', 'links.vz.gay', '*.imy.li'],
    version: '1.1.4',
    releaseDate: '2026-11-27',
    codename: {
      id: 'Biometrik & Passkey VZ Vault (Standar CipherVault Pro · WebAuthn + PRF)',
      en: 'VZ Vault Biometrics & Passkeys (CipherVault Pro Standard · WebAuthn + PRF)',
    },
    summary: {
      id: 'Menambahkan dukungan opt-in Biometrik & Passkey (Face ID, Touch ID, Biometrik Android, Windows Hello, dan Security Key YubiKey) pada VZ Vault dengan verifikasi WebAuthn ketat, Brankas Frasa Biometrik berbasis ekstensi WebAuthn PRF (HKDF-SHA256 + AES-256-GCM), serta mode enkripsi/dekripsi langsung via Passkey PRF.',
      en: 'Adds opt-in Biometrics & Passkeys (Face ID, Touch ID, Android Biometrics, Windows Hello, and YubiKey security keys) to VZ Vault with strict WebAuthn assertion verification, a WebAuthn PRF Biometric Phrase Locker (HKDF-SHA256 + AES-256-GCM), and direct Passkey PRF backup encryption/decryption.',
    },
    highlights: [
      {
        id: 'vault-passkey-multi-enroll-v114',
        category: 'privacy_security',
        title: {
          id: 'Pendaftaran Multi-Passkey & Biometrik Perangkat (100% Client-Side)',
          en: 'Multi-Passkey & Platform Biometric Enrollment (100% Client-Side)',
        },
        description: {
          id: 'Pengguna dapat mendaftarkan hingga 8 Passkey (Biometrik Perangkat Ini maupun Security Key lintas perangkat), menamai ulang, menguji verifikasi langsung, dan mencabut kredensial tanpa menyimpan kunci privat di server.',
          en: 'Users can enroll up to 8 Passkeys (platform biometrics or cross-platform security keys), rename labels, test assertions live, and revoke credentials with zero server-side key storage.',
        },
      },
      {
        id: 'vault-passkey-unlock-and-pin-fallback-v114',
        category: 'core',
        title: {
          id: 'Buka Vault & Gerbang Aksi Sensitif via Biometrik + Cadangan PIN',
          en: 'Biometric Vault Unlock & Sensitive Action Gate with PIN Fallback',
        },
        description: {
          id: 'Berfungsi mandiri tanpa wajib membuat PIN, atau berdampingan dengan Kunci PIN 4–6 digit sebagai cadangan. Seluruh kebijakan Layar Kunci Penuh, Auto-Lock (1/5/15 menit & pindah tab), dan Gerbang Aksi Sensitif berlaku terpadu.',
          en: 'Works standalone without forcing a PIN, or paired with the 4–6 digit PIN lock as fallback. Full Vault Lock, Auto-Lock (1/5/15m & tab-switch), and Sensitive Action Gates apply uniformly.',
        },
      },
      {
        id: 'vault-webauthn-prf-crypto-v114',
        category: 'ux_tools',
        title: {
          id: 'Brankas Frasa Biometrik & Enkripsi Backup Langsung WebAuthn PRF',
          en: 'WebAuthn PRF Biometric Phrase Locker & Direct Hardware-Key Backups',
        },
        description: {
          id: 'Pada authenticator yang mendukung ekstensi PRF, pengguna dapat mengunci frasa 12-kata dengan kunci non-ekstrak HKDF-SHA256 -> AES-256-GCM untuk isi otomatis 1-ketuk, atau mengenkripsi/mendekripsi arsip .anf/.cvp/.enc langsung dari Passkey. Perangkat Non-PRF tetap mendukung buka biometrik secara otomatis.',
          en: 'On PRF-capable authenticators, users can seal 12-word recovery phrases via non-extractable HKDF-SHA256 -> AES-256-GCM keys for 1-tap autofill, or encrypt/decrypt .anf/.cvp/.enc archives directly via Passkey PRF. Non-PRF devices degrade gracefully to standard biometric unlock.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail & VZ Links',
    domains: ['mail.vz.gay', 'links.vz.gay', '*.imy.li'],
    version: '1.1.3',
    releaseDate: '2026-11-27',
    codename: {
      id: 'Deliverability Anti-Spam, Diagnostik Inbound, Navigasi 2 Hamburger Mobile & Background Sync Hemat RAM',
      en: 'Anti-Spam Deliverability, Inbound Diagnostics, Dual-Hamburger Mobile Nav & Low-RAM Background Sync',
    },
    summary: {
      id: 'Pembaruan besar untuk kualitas pengiriman email (format HTML Minimalis / Plain-Text / Kartu + cek SPF/DKIM/DMARC), perbaikan fail-closed email masuk Cloudflare, penghapusan bug hantu (1) pada Pull & Purge, navigasi mobile 2 hamburger yang intuitif, penguncian overflow toast alamat panjang, serta Background Sync hemat RAM & Notifikasi opt-in.',
      en: 'Major upgrade for outbound email deliverability (Minimal HTML / Plain-Text / Rich Card selector + live SPF/DKIM/DMARC check), fail-closed Cloudflare inbound routing, elimination of ghost (1) Pull & Purge badges, dual-hamburger mobile navigation, mobile overflow clamping for long email toasts, and opt-in Low-RAM Background Sync + Notifications.',
    },
    highlights: [
      {
        id: 'outbound-deliverability-formats-v113',
        category: 'core',
        title: {
          id: 'Pilihan Format Kirim Anti-Spam + Header Bersih & Cek DNS SPF/DKIM/DMARC',
          en: 'Anti-Spam Outbound Format Selector + Clean Headers & SPF/DKIM/DMARC Check',
        },
        description: {
          id: 'Komposer kini menyediakan 3 mode pengiriman (HTML Minimalis default ramah Gmail/Yandex, Plain-Text murni tanpa HTML, dan HTML Kartu) dengan pembersihan header kustom serta tombol cek cepat SPF/DKIM/DMARC.',
          en: 'Composer now offers 3 selectable formats (Gmail/Yandex-friendly Minimal HTML default, pure Plain-Text without HTML, and Rich Card HTML), stripped non-standard headers, and a 1-click SPF/DKIM/DMARC checker.',
        },
      },
      {
        id: 'inbound-fail-closed-and-diagnostics-v113',
        category: 'seo_infra',
        title: {
          id: 'Inbound Fail-Closed SMTP 451 & Panel Diagnostik Mail',
          en: 'Inbound Fail-Closed SMTP 451 & Mail Diagnostics Panel',
        },
        description: {
          id: 'Worker email() kini menolak sementara dengan SMTP 451 jika binding KV tidak tersedia (mencegah email hilang diam-diam tanpa bounce), menormalisasi alamat bertanda kurung sudut, menampilkan error sinkronisasi secara jelas, dan dilengkapi panel Diagnostik Inbound + DNS.',
          en: 'Worker email() now fails closed with SMTP 451 when KV transit storage is unbound (preventing silent drops without bounces), normalizes angle-bracket recipients, surfaces sync errors clearly, and adds a live Inbound + DNS Diagnostics modal.',
        },
      },
      {
        id: 'pull-purge-ghost-one-fix-v113',
        category: 'privacy_security',
        title: {
          id: 'Perbaikan Bug Hantu (1) Pull & Purge dengan Tombstone 90 Detik',
          en: 'Pull & Purge Ghost (1) Bug Fix with 90-Second ACK Tombstones',
        },
        description: {
          id: 'Menghilangkan re-seeding berulang paket sambutan dan menambahkan tombstone ACK 90 detik pada KV & klien untuk mengatasi eventual consistency Cloudflare KV list() sehingga lencana (1) tidak muncul kembali setelah di-purge.',
          en: 'Eliminates repeated welcome-packet re-seeding and adds 90-second ACK tombstones across KV and client storage to defeat Cloudflare KV list() eventual consistency so ghost (1) badges never reappear after purging.',
        },
      },
      {
        id: 'dual-hamburger-and-mobile-clamp-v113',
        category: 'ux_tools',
        title: {
          id: 'Navigasi Mobile 2 Hamburger & Anti-Overflow Toast Alamat Panjang',
          en: 'Dual-Hamburger Mobile Navigation & Long-Email Toast Overflow Protection',
        },
        description: {
          id: 'Memisahkan Hamburger Global (header kiri: Links, Mail, Profil) dan Hamburger Menu Mail (toolbar inbox: Kotak Masuk, Terkirim, Draf, Spam, Sampah, Alias) serta mengunci lebar viewport 100vw + overflow-wrap: anywhere agar notifikasi alamat email panjang tidak membuat layar HP zoom atau navbar bawah berantakan.',
          en: 'Separates the Global Hamburger (top-left header: Links, Mail, Profile) from the dedicated Mail Menu Hamburger (inbox toolbar: Inbox, Sent, Drafts, Spam, Trash, Aliases) and clamps viewport width to 100vw with overflow-wrap: anywhere so long email toasts never zoom mobile screens or break the bottom navbar.',
        },
      },
      {
        id: 'low-ram-bg-sync-and-notifications-v113',
        category: 'ux_tools',
        title: {
          id: 'Background Sync Hemat RAM (Opt-In) & Notifikasi Terkendali',
          en: 'Opt-In Low-RAM Background Sync & Dependent Push Notifications',
        },
        description: {
          id: 'Fitur opt-in (default mati) dengan 3 mode: Adaptif Hemat RAM (default, otomatis melambat pada HP RAM <= 4 GB atau Mode Hemat Data), Interval Manual (30 dtk / 60 dtk / 3 mnt / 5 mnt), dan Tab-Resume + Periodic Sync PWA. Menggunakan cek metadata ?metaOnly=1 ringan tanpa WebSocket, serta tombol Notifikasi opsional yang mensyaratkan Background Sync aktif.',
          en: 'Strictly opt-in (default OFF) with 3 selectable modes: Adaptive Low-RAM (default, auto-throttles on <= 4 GB RAM or Save-Data devices), Manual Interval (30s / 60s / 3m / 5m), and Tab-Resume + PWA Periodic Sync. Uses tiny ?metaOnly=1 metadata checks without persistent WebSockets, plus optional Notifications requiring Background Sync.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail & VZ Links',
    domains: ['mail.vz.gay', 'links.vz.gay', '*.imy.li'],
    version: '1.1.2',
    releaseDate: '2026-11-27',
    codename: {
      id: 'Optimasi Safe-Area Multi-UA, Panduan SSO In-App Browser, Middleware Auth0 JWT & Kunci PIN VZ Vault',
      en: 'Multi-UA Safe-Area Optimization, Inline In-App SSO Guidance, Auth0 JWT Middleware & VZ Vault PIN Lock',
    },
    summary: {
      id: 'Menyempurnakan responsivitas & safe-area di perangkat mobile (notch, Dynamic Island, home indicator, orientasi lanskap), menambahkan panduan SSO kontekstual langsung di dekat tombol Login untuk In-App Browser, memusatkan middleware verifikasi Auth0 JWT di Worker & Express, serta menghadirkan 3 mode opt-in Kunci PIN VZ Vault.',
      en: 'Refines mobile safe-area responsiveness (notch, Dynamic Island, home indicator, landscape), adds inline SSO guidance next to Sign-In buttons for In-App WebViews, centralizes Auth0 JWT verification middleware in Cloudflare Worker & Express, and introduces 3 opt-in VZ Vault PIN Lock modes.',
    },
    highlights: [
      {
        id: 'vault-pin-lock-3-modes',
        category: 'privacy_security',
        title: {
          id: 'Kunci PIN VZ Vault dengan 3 Opsi Opt-In (Penuh + Auto-Lock, Aksi Sensitif, & Panduan Pertama)',
          en: 'VZ Vault PIN Lock with 3 Opt-In Modes (Full + Auto-Lock, Sensitive Actions, & First-Open Setup)',
        },
        description: {
          id: 'Pengguna dapat mengaktifkan Kunci PIN 4–6 digit lokal (PBKDF2-SHA256 150.000 iterasi, auto-reset setelah 5x salah) dalam mode Layar Kunci Penuh + Auto-Lock (1/5/15 menit & pindah tab), mode PIN Khusus Aksi Sensitif (Ekspor/Impor/Frasa 12-Kata), maupun panduan opt-in saat pertama kali membuka VZ Vault.',
          en: 'Users can enable a local 4–6 digit PIN (PBKDF2-SHA256 150,000 iterations, 5-attempt auto-wipe) in Full Lock Screen + Auto-Lock mode (1/5/15m & tab switch), Sensitive Actions Gate mode (Export/Import/12-Word Phrase), plus an opt-in first-open setup prompt.',
        },
      },
      {
        id: 'worker-express-jwt-middleware',
        category: 'privacy_security',
        title: {
          id: 'Middleware Terpusat Verifikasi Auth0 JWT di Cloudflare Worker & Express',
          en: 'Centralized Auth0 JWT Verification Middleware in Cloudflare Worker & Express',
        },
        description: {
          id: 'Memisahkan lapisan middleware verifikasi Auth0 RS256 JWKS (termasuk validasi klaim azp multi-audiens dan header WWW-Authenticate Bearer pada respons 401) yang ketat di produksi dengan fallback dev lokal otomatis untuk localhost & preview.',
          en: 'Separates centralized Auth0 RS256 JWKS verification middleware (including multi-audience azp validation and WWW-Authenticate Bearer 401 challenges) enforcing strict verification in production with automatic local-dev fallback on localhost and preview hosts.',
        },
      },
      {
        id: 'safe-area-multi-ua-inapp-sso',
        category: 'ux_tools',
        title: {
          id: 'Safe-Area Mobile Menyeluruh & Panduan SSO In-App Browser (Banner Atas + Tombol Login)',
          en: 'Full Mobile Safe-Area Polish & In-App Browser SSO Guidance (Top Banner + Login Buttons)',
        },
        description: {
          id: 'Menambahkan inset env(safe-area-inset-*) pada header sticky, banner atas, bottom navigation, komposer email, tombol pratinjau bio mengambang, drawer, dan toast, serta memperluas deteksi WebView (WhatsApp, Instagram, TikTok, Threads, Discord, LINE, Telegram, Shopee, Gojek, Grab) dengan panduan langsung di sebelah tombol Login SSO.',
          en: 'Applies env(safe-area-inset-*) across sticky header, top banner, bottom navigation, email composer, floating bio preview trigger, drawers, and toasts, and expands WebView detection (WhatsApp, Instagram, TikTok, Threads, Discord, LINE, Telegram, Shopee, Gojek, Grab) with inline guidance beside Auth0 SSO Login buttons.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail',
    domains: ['mail.vz.gay', '@imy.li', 'files.vz.gay'],
    version: '1.1.1',
    releaseDate: '2026-11-27',
    codename: {
      id: 'Pengerasan Keamanan API Auth0 JWT, Stabilitas Edge & Kompatibilitas Multi-Browser/OS',
      en: 'Auth0 JWT API Hardening, Edge Stability & Cross-Browser/OS Compatibility',
    },
    summary: {
      id: 'Peningkatan keamanan menyeluruh pada Cloudflare Worker dan server Express dengan verifikasi token RS256 Auth0 OIDC per akun, proteksi sandbox lampiran, perbaikan parser email Quoted-Printable/HTML, serta optimasi lintas browser & OS (iOS Safari, iPadOS, Brave, Firefox, Windows/Linux, dan deteksi In-App Browser).',
      en: 'Comprehensive security hardening across Cloudflare Worker and Express with per-account RS256 Auth0 OIDC JWT verification, sandboxed attachment downloads, Quoted-Printable/HTML email decoding fixes, and cross-browser/OS polish (iOS Safari, iPadOS, Brave, Firefox, Windows/Linux, and In-App Browser detection).',
    },
    highlights: [
      {
        id: 'mail-jwt-ownership-hardening',
        category: 'privacy_security',
        title: {
          id: 'Verifikasi Auth0 RS256 JWT & Isolasi Kepemilikan Akun pada Seluruh API',
          en: 'Auth0 RS256 JWT Verification & Per-Account Ownership Isolation Across APIs',
        },
        description: {
          id: 'Seluruh endpoint privat /api/mail/* dan /api/vzfiles/* kini memverifikasi tanda tangan RS256 ID Token Auth0 melalui JWKS di Edge Worker maupun Express, memastikan pengguna hanya dapat menarik antrean, mengunduh lampiran, atau mengirim email atas nama handle miliknya sendiri.',
          en: 'All private /api/mail/* and /api/vzfiles/* endpoints now verify RS256 Auth0 ID Token signatures against JWKS in both Edge Worker and Express, ensuring users can only access queues, download attachments, or send mail for their own canonical handle.',
        },
      },
      {
        id: 'mail-ssrf-attachment-pin-hardening',
        category: 'privacy_security',
        title: {
          id: 'Allowlist Ketat VZ Files, Sandbox Lampiran & Proteksi Brute-Force PIN Vault',
          en: 'Strict VZ Files Allowlist, Sandboxed Attachments & PIN Vault Brute-Force Lockout',
        },
        description: {
          id: 'Memperketat validasi URL unggahan part VZ Files serta pemblokiran IP privat/IPv6/CGNAT, menambahkan header Content-Security-Policy: sandbox pada unduhan lampiran, membatasi legacy-upload maksimal 20 MB agar aman dari batas memori Worker, serta menghapus otomatis brankas PIN lokal setelah 5 kali salah memasukkan PIN.',
          en: 'Tightened VZ Files multipart upload host allowlists and private/IPv6/CGNAT IP blocking, added Content-Security-Policy: sandbox on attachment downloads, capped legacy-upload at 20 MB to protect Worker memory, and added automatic local PIN vault wipe after 5 failed attempts.',
        },
      },
      {
        id: 'mail-mime-decoder-and-cross-browser',
        category: 'ux_tools',
        title: {
          id: 'Perbaikan Decoder Email Quoted-Printable/HTML & Kompatibilitas Multi-Browser/In-App WebView',
          en: 'Quoted-Printable/HTML Email Decoding Fix & Multi-Browser / In-App WebView Support',
        },
        description: {
          id: 'Menambahkan decoder Quoted-Printable dan fallback ekstraksi teks dari email HTML-only, memperbaiki konsistensi lampiran provider outbound, menghadirkan banner panduan untuk In-App Browser (WhatsApp, Instagram, TikTok, LINE), fallback clipboard lintas browser, serta dukungan refresh token untuk Safari ITP & Brave Shields.',
          en: 'Added Quoted-Printable decoding and clean text extraction for HTML-only emails, aligned outbound attachment handling across providers, added an In-App Browser guidance banner (WhatsApp, Instagram, TikTok, LINE), cross-browser clipboard fallbacks, and refresh-token resilience for Safari ITP & Brave Shields.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-links',
    serviceName: 'VZ Links',
    domains: ['links.vz.gay', '*.imy.li', 'imy.li/s/'],
    version: '1.1.1',
    releaseDate: '2026-11-27',
    codename: {
      id: 'Proteksi Kepemilikan Shortlink/Bio, Pemblokiran SVG Berbahaya & Optimasi Mobile Multi-OS',
      en: 'Shortlink/Bio Ownership Protection, Unsafe SVG Blocking & Multi-OS Mobile Polish',
    },
    summary: {
      id: 'Menutup celah penghapusan shortlink milik akun lain, memblokir unggahan avatar SVG untuk mencegah XSS, menambahkan fallback kompresi JPEG bagi browser lama, serta menyempurnakan tampilan iOS/iPadOS/Android (anti auto-zoom input, safe-area notch, dan fallback tinggi layar).',
      en: 'Closes owned shortlink deletion bypasses, blocks SVG avatar uploads to prevent stored XSS, adds JPEG compression fallback for older browsers, and polishes iOS/iPadOS/Android layout behavior (anti-zoom inputs, safe-area notch support, and viewport fallbacks).',
    },
    highlights: [
      {
        id: 'links-auth-shortlink-svg-fix',
        category: 'privacy_security',
        title: {
          id: 'Otorisasi Mutasi Bio/Recycle Bin, Perbaikan Hapus Shortlink & Blokir Avatar SVG',
          en: 'Authenticated Bio/Recycle Bin Mutations, Shortlink Deletion Fix & SVG Avatar Block',
        },
        description: {
          id: 'Seluruh mutasi Bio, Avatar, Recycle Bin, serta penghapusan shortlink berpemilik kini mewajibkan verifikasi Auth0 JWT yang cocok dengan pemilik akun. Unggahan avatar dibatasi khusus gambar raster aman (AVIF, WebP, PNG, JPEG, GIF) tanpa SVG.',
          en: 'All Bio, Avatar, Recycle Bin mutations and owned shortlink deletions now enforce Auth0 JWT ownership checks. Avatar uploads are restricted to safe raster image formats (AVIF, WebP, PNG, JPEG, GIF) with SVG blocked.',
        },
      },
      {
        id: 'links-mobile-browser-compat',
        category: 'ux_tools',
        title: {
          id: 'Kompatibilitas iOS/iPadOS Safari, Fallback Avatar JPEG & Anti Auto-Zoom Input',
          en: 'iOS/iPadOS Safari Compatibility, JPEG Avatar Fallback & Anti-Zoom Mobile Inputs',
        },
        description: {
          id: 'Menambahkan deteksi PWA iPadOS 13+, fallback encoder avatar JPEG untuk browser tanpa encoder AVIF/WebP, pencegahan zoom otomatis iOS pada kolom input, viewport-fit=cover untuk layar ber-notch, serta pengecualian cache Service Worker untuk callback OAuth.',
          en: 'Added iPadOS 13+ PWA detection, adaptive JPEG fallback in the avatar cropper for browsers without AVIF/WebP encoding, iOS input auto-zoom prevention, viewport-fit=cover notch support, and Service Worker OAuth callback exclusions.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail',
    domains: ['mail.vz.gay', '@imy.li', 'files.vz.gay', 'chipervaultro.app.vz.gay'],
    version: '1.1.0',
    releaseDate: '2026-11-26',
    codename: {
      id: 'Standar Enkripsi Ekosistem VZ (.anf & CipherVault Pro) + VZ Files Cloud (>10 MB)',
      en: 'VZ Ecosystem Encryption Standard (.anf & CipherVault Pro) + VZ Files Cloud (>10 MB)',
    },
    summary: {
      id: 'Pembaruan skema ekspor & enkripsi Vault lokal ke standar ekosistem VZ menggunakan format .anf (Advanced/Archival Neural File — kompatibel lintas VZ Mail & VZ Desk) serta mesin CipherVault Pro (.cvp) dan kompatibilitas .enc, dilengkapi mode Polyglot Stealth, generator frasa 12-kata + brankas PIN, serta transfer file besar >10 MB via VZ Files (files.vz.gay).',
      en: 'Upgrades local Vault backup & encryption to the VZ ecosystem standard using .anf (Advanced/Archival Neural File — interoperable across VZ Mail & VZ Desk), native CipherVault Pro (.cvp), and .enc compatibility, complete with Polyglot Stealth mode, a 12-word Mnemonic + PIN key manager, and >10 MB cloud transfers via VZ Files (files.vz.gay).',
    },
    highlights: [
      {
        id: 'mail-anf-ciphervault-upgrade',
        category: 'privacy_security',
        title: {
          id: 'Standar Enkripsi Ekosistem VZ .anf (Advanced/Archival Neural File) + Opsi .cvp & .enc',
          en: 'VZ Ecosystem .anf (Advanced/Archival Neural File) Standard + .cvp & .enc Options',
        },
        description: {
          id: 'Skema ekspor dan pemulihan email lokal kini ditingkatkan ke standar platform CipherVault Pro (chipervaultro.app.vz.gay) seperti pada VZ Desk (desk.vz.gay). Format default .anf (vz-anf-v1, AES-256-GCM + PBKDF2-SHA256 200.000 iterasi) dirancang khusus untuk ekosistem VZ (Mail & Desk), disertai 2 opsi tambahan: .cvp (format bawaan CipherVault Pro v3, 100.000 iterasi) dan .enc (standar MyVault 310.000 iterasi untuk kompatibilitas aplikasi dekripsi lain).',
          en: 'Local email export and recovery now adopts the CipherVault Pro (chipervaultro.app.vz.gay) platform architecture shared with VZ Desk (desk.vz.gay). The default .anf format (vz-anf-v1, AES-256-GCM + PBKDF2-SHA256 200,000 iterations) powers VZ ecosystem archival across Mail & Desk, alongside two selectable options: .cvp (native CipherVault Pro v3, 100,000 iterations) and .enc (standard MyVault 310,000 iterations for cross-tool decryption compatibility).',
        },
      },
      {
        id: 'mail-polyglot-stealth-mnemonic',
        category: 'privacy_security',
        title: {
          id: 'Mode Kontainer Standard JSON & Polyglot Stealth + Generator Frasa 12-Kata & PIN',
          en: 'Standard JSON & Polyglot Stealth Container Modes + 12-Word Mnemonic & PIN Vault',
        },
        description: {
          id: 'Ekspor .anf dan .cvp mendukung mode Standard JSON maupun Polyglot Stealth (menyisipkan ciphertext AES-256-GCM di balik header biner PDF atau ZIP sintetis dengan penanda ---VZ_ANF_v1_SIG--- / ---CV_PRO_v3_SIG---). Dilengkapi Generator Frasa Pemulihan 12-Kata (CSPRNG) yang dapat dikunci di perangkat menggunakan PIN 4–6 digit (PBKDF2 150.000 iterasi).',
          en: 'Both .anf and .cvp exports support Standard JSON and Polyglot Stealth modes (embedding raw AES-256-GCM ciphertext behind synthetic PDF or ZIP binary headers with ---VZ_ANF_v1_SIG--- / ---CV_PRO_v3_SIG--- metadata trailers). Includes a CSPRNG 12-Word Recovery Phrase Generator with optional 4–6 digit local PIN lock (PBKDF2 150,000 iterations).',
        },
      },
      {
        id: 'mail-vzfiles-external-links',
        category: 'core',
        title: {
          id: 'Transfer File Besar (>10 MB) via VZ Files (files.vz.gay) & Media Inline Langsung',
          en: 'Large File Transfer (>10 MB) via VZ Files (files.vz.gay) & Direct Inline Media',
        },
        description: {
          id: 'Mendukung pengiriman file berukuran di atas batas lampiran 10 MB dengan unggah langsung ke layanan VZ Files (https://files.vz.gay) dari dalam komposer email maupun penempelan tautan eksternal (Google Drive, Imgur, atau direct file). Tautan gambar langsung (direct image URL) otomatis dirender inline di dalam isi email.',
          en: 'Supports transferring files over the 10 MB attachment limit via direct in-composer upload to VZ Files (https://files.vz.gay) or external link insertion (Google Drive, Imgur, or direct files). Direct image links automatically render inline inside the email body.',
        },
      },
      {
        id: 'mail-outbound-delivery-infra',
        category: 'seo_infra',
        title: {
          id: 'Penyempurnaan Pengiriman Brevo / Resend & Stabilitas Runtime Edge/Dev',
          en: 'Brevo / Resend Outbound Delivery Hardening & Edge/Dev Runtime Stability',
        },
        description: {
          id: 'Standarisasi header Reply-To pada provider Brevo dan Resend, penanganan validasi format lampiran secara transparan dengan opsi simpan ke Draf Lokal, sinkronisasi lockfile npm untuk Cloudflare Workers Builds, serta penonaktifan WebSocket HMR standalone untuk mencegah konflik port.',
          en: 'Standardized Reply-To headers across Brevo and Resend providers, transparent attachment format validation with one-click Local Draft fallback, synchronized npm lockfile for Cloudflare Workers Builds, and disabled standalone HMR WebSocket to prevent port collisions.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-mail',
    serviceName: 'VZ Mail',
    domains: ['mail.vz.gay', '@imy.li'],
    version: '1.0.0',
    releaseDate: '2026-11-25',
    codename: {
      id: 'Rilis Perdana Zero-Retention Local-First',
      en: 'Initial Zero-Retention Local-First Release',
    },
    summary: {
      id: 'Rilis stabil pertama layanan email percakapan lokal privat (@imy.li) tanpa penyimpanan kotak surat permanen di server, ditenagai Cloudflare Email Routing, IndexedDB terenkripsi perangkat, dan integrasi SSO Universal vz.gay.',
      en: 'First stable release of local-first private conversational email (@imy.li) with zero permanent server mailbox storage, powered by Cloudflare Email Routing, device-local IndexedDB, and vz.gay Universal SSO.',
    },
    highlights: [
      {
        id: 'mail-pop-and-purge',
        category: 'core',
        title: {
          id: 'Arsitektur Zero-Retention Pop-and-Purge + IndexedDB Lokal',
          en: 'Zero-Retention Pop-and-Purge + Local IndexedDB Storage',
        },
        description: {
          id: 'Email masuk diantrekan sementara pada Cloudflare MAIL_TRANSIT_KV (TTL otomatis 72 jam). Setelah ditarik ke IndexedDB browser pengguna dan terkonfirmasi, salinan transit langsung dimusnahkan permanen dari edge.',
          en: 'Inbound emails are queued transiently in Cloudflare MAIL_TRANSIT_KV (72h auto-TTL). Once pulled into the user’s local IndexedDB and acknowledged, the transit copy is immediately purged from the edge.',
        },
      },
      {
        id: 'mail-aliases-routing',
        category: 'core',
        title: {
          id: 'Alias Tak Terbatas (+tag dan titik .) + Pengiriman Email Keluar',
          en: 'Unlimited (+tag & dot .) Aliases + Outbound Email Delivery',
        },
        description: {
          id: 'Mendukung normalisasi alias ala Gmail (contoh: nama+tag@imy.li dan na.ma@imy.li masuk ke kotak utama) serta pengiriman email keluar via Brevo/Cloudflare/Relay dengan kuota harian terukur.',
          en: 'Supports Gmail-style alias canonicalization (e.g., name+tag@imy.li and na.me@imy.li route to the primary handle) alongside outbound delivery via Brevo/Cloudflare/Relay with daily rate quotas.',
        },
      },
      {
        id: 'mail-qr-vcard',
        category: 'ux_tools',
        title: {
          id: 'QR Code Alamat Utama & Semua Alias (mailto: & vCard)',
          en: 'QR Codes for Primary Address & All Aliases (mailto: & vCard)',
        },
        description: {
          id: 'Setiap alamat utama @imy.li maupun alias (+ dan .) kini dapat langsung diubah menjadi QR Code mode mailto: (langsung buka aplikasi email) atau vCard 3.0 (simpan kontak instan) dengan unduhan PNG/SVG.',
          en: 'Every primary @imy.li address and (+ / .) alias can generate instant QR codes in mailto: mode (open email composer) or vCard 3.0 mode (save contact card) with HD PNG/SVG download.',
        },
      },
      {
        id: 'mail-vault-grounding',
        category: 'privacy_security',
        title: {
          id: 'Cadangan MyVault Terenkripsi AES-GCM & Verifikasi Pengirim (DNS/RDAP/VZ Search)',
          en: 'AES-GCM Encrypted MyVault Backup & Sender Verification (DNS/RDAP/VZ Search)',
        },
        description: {
          id: 'Ekspor dan pulihkan seluruh arsip percakapan lokal dalam berkas terenkripsi berbasis kata sandi di browser, dilengkapi panel verifikasi domain SPF/DKIM/DMARC/RDAP dan pencarian grounding search.vz.gay.',
          en: 'Export and restore full local conversation archives into password-encrypted files directly in-browser, paired with SPF/DKIM/DMARC/RDAP domain checks and search.vz.gay grounding.',
        },
      },
      {
        id: 'mail-seo-pwa',
        category: 'seo_infra',
        title: {
          id: 'Multi-OS PWA, Dynamic Edge SEO & Dukungan AI Crawler (llms.txt)',
          en: 'Multi-OS PWA, Dynamic Edge SEO & AI Crawler Discovery (llms.txt)',
        },
        description: {
          id: 'Dapat dipasang sebagai aplikasi mandiri (iOS, Android, macOS, Windows, Linux) lengkap dengan injeksi meta OpenGraph/JSON-LD dinamis di Cloudflare Worker HTMLRewriter serta dokumentasi resmi /llms.txt dan /llms-full.txt.',
          en: 'Installable across iOS, Android, macOS, Windows, and Linux with dynamic Cloudflare Worker HTMLRewriter OpenGraph/JSON-LD injection plus standards-compliant /llms.txt and /llms-full.txt discovery.',
        },
      },
    ],
  },
  {
    serviceId: 'vz-links',
    serviceName: 'VZ Links',
    domains: ['links.vz.gay', '*.imy.li', 'imy.li/s/'],
    version: '1.0.0',
    releaseDate: '2026-11-25',
    codename: {
      id: 'Rilis Perdana Multi-Page Bio, Shortlink & QR Studio',
      en: 'Initial Multi-Page Bio, Shortlink & QR Studio Release',
    },
    summary: {
      id: 'Rilis stabil pertama layanan Link-in-Bio multi-halaman ($USERNAME.imy.li dan /$PAGE) berpasangan 1:1 dengan akun VZ Mail, pemendek URL mandiri imy.li/s/, kustomisasi QR Code penuh, serta kontrol privasi indeksasi mesin pencari & AI bergaya Meta.',
      en: 'First stable release of multi-page Link-in-Bio ($USERNAME.imy.li and /$PAGE) paired 1:1 with VZ Mail handles, standalone imy.li/s/ URL shortener, customizable QR studio, and Meta-style opt-in Search/AI indexing controls.',
    },
    highlights: [
      {
        id: 'links-multipage-bio',
        category: 'core',
        title: {
          id: 'Link-in-Bio Multi-Halaman ($USERNAME.imy.li/$PAGE) & Foto Profil AVIF',
          en: 'Multi-Page Link-in-Bio ($USERNAME.imy.li/$PAGE) & AVIF Avatars',
        },
        description: {
          id: 'Satu akun mendukung halaman utama dan sub-halaman tak terbatas (misalnya /promo, /event) dengan tema warna per halaman, 16 ikon media sosial, kompresi foto profil AVIF/WebP otomatis ke Cloudflare R2/D1, dan hitungan klik nyata.',
          en: 'Single account supports a primary Bio plus unlimited sub-pages (e.g., /promo, /event) with per-page themes, 16 social icons, automatic AVIF/WebP profile photo encoding to Cloudflare R2/D1, and real click counters.',
        },
      },
      {
        id: 'links-shortener-d1',
        category: 'core',
        title: {
          id: 'Pemendek URL Mandiri imy.li/s/ + Auto-Bootstrap Cloudflare D1 & Fallback KV',
          en: 'Standalone imy.li/s/ Shortener + Auto-Bootstrapping Cloudflare D1 & KV Fallback',
        },
        description: {
          id: 'Pemendek tautan cepat dengan kode acak atau slug kustom, redirect HTTP 302 bebas cache untuk pencatatan klik akurat, serta migrasi tabel otomatis di Cloudflare D1 (vzlinks-db) dengan fallback baca data lama dari LINKS_KV.',
          en: 'Fast URL shortener with random codes or custom slugs, uncached HTTP 302 redirects for accurate click counting, and automatic Cloudflare D1 schema bootstrapping with seamless legacy LINKS_KV read fallback.',
        },
      },
      {
        id: 'links-qr-customizer',
        category: 'ux_tools',
        title: {
          id: 'Studio Desain QR Code Kustom untuk Bio, Sub-Halaman & Semua Tautan',
          en: 'Custom QR Code Design Studio for Bio, Sub-Pages & Every Link',
        },
        description: {
          id: 'Kustomisasi warna QR, bentuk dot (square/rounded/dots/classy), gaya sudut, bingkai teks CTA, dan foto profil Bio di tengah QR secara langsung. Desain tersimpan ke D1/KV dan tersedia bagi pengunjung publik halaman Bio.',
          en: 'Customize QR colors, dot patterns (square/rounded/dots/classy), corner eyes, CTA text frames, and centered Bio avatar/monogram live. Designs persist in D1/KV and appear directly on public Bio pages.',
        },
      },
      {
        id: 'links-recycle-cooldown',
        category: 'privacy_security',
        title: {
          id: 'Recycle Bin 14 Hari, Nonaktifkan Sementara & Proteksi Cooldown 3 Hari',
          en: '14-Day Recycle Bin, Temporary Deactivation & 3-Day Delete Cooldown',
        },
        description: {
          id: 'Tautan, sub-halaman, dan shortlink yang dihapus dapat dipulihkan hingga 14 hari. Penghapusan permanen profil Bio membersihkan D1/KV/R2 secara nyata dengan masa tunggu 3 hari (72 jam) anti-brute-force serta isolasi Zero-Cookie PSL.',
          en: 'Deleted links, sub-pages, and shortlinks can be restored for up to 14 days. Permanent Bio erasure hard-deletes D1/KV/R2 records with an anti-abuse 3-day cooldown alongside Zero-Cookie PSL isolation.',
        },
      },
      {
        id: 'links-optin-indexing',
        category: 'seo_infra',
        title: {
          id: 'Kontrol Opt-In Indeksasi Mesin Pencari & AI Crawler untuk Halaman Bio',
          en: 'Opt-In Search Engine & AI Crawler Indexing Controls for Bio Pages',
        },
        description: {
          id: 'Default privat (noindex, noai) seperti ekosistem Meta: pemilik Bio dapat memilih secara granular apakah $USERNAME.imy.li diizinkan untuk Tidak Diindeks, Mesin Pencari Saja, AI Crawler Saja, atau Mesin Pencari + AI, diterapkan langsung lewat edge robots.txt, X-Robots-Tag, dan meta HTML.',
          en: 'Private by default (noindex, noai) inspired by Meta controls: Bio owners choose whether $USERNAME.imy.li allows No Indexing, Search Engines Only, AI Crawlers Only, or Both Search & AI—enforced at the edge via per-subdomain robots.txt, X-Robots-Tag, and HTML meta tags.',
        },
      },
    ],
  },
] as const;
