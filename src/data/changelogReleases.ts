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

export const CHANGELOG_VERSION = 'v1.0.0';
export const CHANGELOG_RELEASE_DATE = '2026-11-25';

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
    domains: ['mail.vz.gay', '@imy.li'],
    version: '1.0.0',
    releaseDate: CHANGELOG_RELEASE_DATE,
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
          id: 'Ekspor dan pulihkan seluruh arsip percakapan lokal dalam berkas .vzvault terenkripsi berbasis kata sandi di browser, dilengkapi panel verifikasi domain SPF/DKIM/DMARC/RDAP dan pencarian grounding search.vz.gay.',
          en: 'Export and restore full local conversation archives into password-encrypted .vzvault files directly in-browser, paired with SPF/DKIM/DMARC/RDAP domain checks and search.vz.gay grounding.',
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
    releaseDate: CHANGELOG_RELEASE_DATE,
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
