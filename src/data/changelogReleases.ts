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

export const CHANGELOG_VERSION = 'v1.1.0';
export const CHANGELOG_RELEASE_DATE = '2026-11-26';

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
