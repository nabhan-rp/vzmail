# Changelog (Pengembangan Prarilis)

Seluruh catatan perubahan prarilis bertahap (`v0.1.0-alpha` → `v0.9.0-dev`) untuk layanan **VZ Mail** (`mail.vz.gay`) dan **VZ Links** (`links.vz.gay`, `*.imy.li`, `imy.li/s/`) oleh **PT Galeri Langkah Bahagia Yuwana (galbay)**.

Format ini mengikuti prinsip [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) dan [Semantic Versioning](https://semver.org/spec/v2.0.0.html) prarilis. Versi web publik tersedia di [`/changelog`](https://mail.vz.gay/changelog) dan [`https://links.vz.gay/changelog`](https://links.vz.gay/changelog).

---

## VZ Links & VZ Mail — `v0.9.0-dev` (2026-11-28)

**Tahap:** Pengembangan (`dev`)  
**Domain:** `links.vz.gay` · `imy.li` · `www.imy.li` · `mail.vz.gay`  
**Tonggak:** Edit Shortlink Khusus SSO (Slug, URL & Label) & Timeline Changelog Prarilis

### Added & Security
- **Modal Edit Shortlink Khusus Login SSO:** Pengguna yang masuk via Auth0 SSO kini memiliki tombol **Edit** pada daftar shortlink akun dan banner hasil untuk mengubah **slug** (2–48 karakter), **URL tujuan**, serta **label/catatan** sekaligus lengkap dengan pratinjau langsung `https://imy.li/s/<slug-baru>` tanpa kehilangan riwayat klik nyata.
- **Pilihan Nasib Slug Lama Per Pengeditan:** Saat slug diubah, pengguna dapat memilih **(1) Nonaktifkan slug lama** (dihapus langsung dari backend D1 & KV sehingga berhenti redirect seketika) atau **(2) Pertahankan slug lama sebagai alias redirect** menuju URL tujuan terbaru.
- **Endpoint Backend `PATCH /api/links/shortlinks/:slug` (Atomik D1 + KV & Express Parity):** Dilindungi penuh oleh verifikasi JWT Auth0 RS256 dan pemeriksaan kepemilikan akun kanonis (menolak edit tautan tamu atau milik akun lain dengan `403`, serta bentrok slug dengan `409`).
- **Timeline Changelog Prarilis (`v0.1.0-alpha` → `v0.9.0-dev`) & Akses Drawer/Footer Dinamis:** Seluruh riwayat fitur disusun ulang dalam lini masa kronologis prarilis dengan filter ganda layanan & kategori, dilengkapi tautan Changelog langsung di menu drawer HP dan footer global dinamis tanpa menambah kepadatan bilah header desktop.

---

## VZ Links & VZ Ecosystem API — `v0.8.0-dev` (2026-11-28)

**Tahap:** Pengembangan (`dev`)  
**Domain:** `imy.li` · `www.imy.li` · `links.vz.gay` · `mail.vz.gay` · `*.vz.gay`  
**Tonggak:** Pengerasan Verifikasi Cloudflare Turnstile (`siteverify`) & Standar Spin

### Improved & Security
- **Pemicu Widget Turnstile Berbasis URL Valid (Debounce 450 ms):** Widget hanya dimuat saat tamu non-login mengetik URL berformat domain valid (atau langsung saat menempel `http(s)://...`), mencegah tantangan terbuang percuma yang menurunkan rasio *Token Validation* di Cloudflare Analytics, serta menambahkan status `Terverifikasi Turnstile` pada banner hasil.
- **Wajib `siteverify` Bila Token Dikirim & Keluarkan `mail.vz.gay` dari Bypass Origin Anonim:** Setiap permintaan yang membawa `turnstileToken` kini selalu memanggil `challenges.cloudflare.com/turnstile/v0/siteverify` (dengan `idempotency_key` UUID v4). Tamu anonim di `mail.vz.gay` kini melewati Turnstile, sementara pengguna login Auth0 SSO dan seluruh layanan saudara ekosistem VZ tetap berjalan tanpa hambatan.
- **Kompatibilitas Penuh Cloudflare Spin & Observabilitas:** Mendukung `TURNSTILE_SECRET` selain `TURNSTILE_SECRET_KEY`, allowlist hostname produksi ketat lewat `TURNSTILE_HOSTNAMES` (menolak `localhost`/`127.0.0.1` di produksi), serta log `shortlink_antibot_verified` pada Cloudflare Workers Logs.

---

## VZ Links & VZ Ecosystem API — `v0.7.0-dev` (2026-11-28)

**Tahap:** Pengembangan (`dev`)  
**Domain:** `links.vz.gay` · `imy.li` · `builder.vz.gay` · `desk.vz.gay` · `files.vz.gay`  
**Tonggak:** Proteksi Anti-Bot Cloudflare Turnstile & Bypass Hibrida Ekosistem VZ

### Added & Security
- **Cloudflare Turnstile On-Demand untuk Shortlink Publik (`imy.li/s/`):** Widget Cloudflare Turnstile Managed otomatis dimuat hanya ketika tamu (non-login SSO) mulai mengetik URL tujuan pada form pemendek URL, dengan verifikasi server-side `siteverify` ketat (*fail-closed*) di produksi serta bypass otomatis di lingkungan `localhost`/preview lokal.
- **Bypass Hibrida & CORS Terverifikasi untuk Sub-Aplikasi Ekosistem VZ:** Mendukung 3 jalur resmi agar seluruh layanan saudara tidak terblokir perlindungan anti-bot: (1) JWT Auth0 SSO terverifikasi, (2) header API Key konstan-waktu `X-VZ-Ecosystem-Key` / `X-VZ-Relay-Token`, serta (3) allowlist `Origin` HTTPS spesifik dan CORS non-wildcard untuk `builder.vz.gay` (`*.builder.vz.gay` termasuk `go-blog` & `business`), `desk.vz.gay` (`*.desk.vz.gay` untuk 20+ sub-aplikasi), `files.vz.gay` (`*.files.vz.gay`), dan domain saudara ekosistem VZ (dengan pengecualian keras terhadap `links.vz.gay` dan `*.imy.li`).
- **Pengerasan CSP Edge & Batas Burst Origin:** Menambahkan `https://challenges.cloudflare.com` pada CSP Cloudflare Worker (`script-src`, `frame-src`, `connect-src`) serta menerapkan batas burst 60 permintaan/menit per IP pada jalur bypass Origin.

---

## VZ Mail & VZ Links — `v0.6.0-dev` (2026-11-27)

**Tahap:** Pengembangan (`dev`)  
**Domain:** `mail.vz.gay` · `links.vz.gay` · `*.imy.li`  
**Tonggak:** Biometrik & Passkey VZ Vault (Standar CipherVault Pro · WebAuthn + PRF)

### Added & Security
- **Biometrik & Passkey Multi-Perangkat pada VZ Vault (100% Client-Side):** Menambahkan pendaftaran, pengujian, pengubahan nama, dan pencabutan hingga 8 Passkey (Face ID, Touch ID, Biometrik Android, Windows Hello, serta Security Key FIDO2/YubiKey lintas perangkat) dengan validasi ketat `clientDataJSON` (`type`, `challenge`, `origin`) dan `authenticatorData` (`rpIdHash` SHA-256 + flag `UP` & `UV`).
- **Buka Vault & Gerbang Aksi Sensitif Terpadu (Mandiri atau + Cadangan PIN):** Biometrik/Passkey dapat diaktifkan secara mandiri tanpa wajib membuat PIN, atau berdampingan dengan Kunci PIN 4–6 digit sebagai cadangan pada Layar Kunci Penuh + Auto-Lock (1/5/15 menit & pindah tab) maupun Gerbang Aksi Sensitif.
- **Brankas Frasa Biometrik & Mode Kunci Backup Langsung WebAuthn PRF:** Pada browser/authenticator yang mendukung ekstensi WebAuthn PRF, pengguna dapat mengunci frasa 12-kata / kata sandi secara lokal dengan `HKDF-SHA256` → `AES-256-GCM` untuk isi otomatis 1-ketuk, serta mengenkripsi/mendekripsi berkas `.anf` / `.cvp` / `.enc` langsung memakai kunci derivasi Passkey PRF—dengan fallback mulus untuk perangkat Non-PRF.

---

## VZ Mail & VZ Links — `v0.5.0-beta` (2026-11-27)

**Tahap:** Beta (`beta`)  
**Domain:** `mail.vz.gay` · `links.vz.gay` · `*.imy.li`  
**Tonggak:** Deliverability Anti-Spam, Diagnostik Inbound, Navigasi 2 Hamburger Mobile & Background Sync Hemat RAM

### Fixed
- **Deliverability Outbound Anti-Spam:** Mengganti format default email keluar menjadi **HTML Minimalis** bersih (dengan opsi pilihan **Plain-Text murni** dan **HTML Kartu** di komposer), menghapus header kustom `X-VZ-Zero-Retention` dan `reply_to` redundan, serta menambahkan tombol cek cepat SPF/DKIM/DMARC langsung di komposer.
- **Inbound Fail-Closed & Normalisasi Alamat:** Memperbaiki Cloudflare Worker `email()` agar mengembalikan `451` sementara ketika binding `MAIL_TRANSIT_KV` tidak tersedia (mencegah email hilang diam-diam tanpa bounce di Gmail/Yandex), menormalisasi format `Nama <user@imy.li>`, serta menampilkan error sinkronisasi API secara eksplisit di UI.
- **Bug Hantu `(1)` pada Pull & Purge:** Menambahkan penanda seeding satu kali (`meta:seeded:<user>`) dan tombstone ACK 90 detik (`ack:<user>:<id>` di KV & lokal) untuk mengatasi eventual consistency `KV.list()`, sehingga angka `(1)` tidak muncul lagi setelah di-purge.
- **Bug Overflow & Auto-Zoom Mobile pada Toast Panjang:** Mengunci lebar maksimum `100vw` + `overflow-x: clip` serta menerapkan `overflow-wrap: anywhere` pada toast notifikasi, banner komposer, dan navbar bawah mobile agar alamat email sangat panjang tidak mengubah lebar layar atau merusak tata letak navbar bawah.

### Added & Improved
- **Navigasi Mobile 2 Hamburger:** Memisahkan tombol **Hamburger Global** di header kiri (Links, Mail, Profil Akun) dan tombol **Hamburger Menu Mail** di toolbar inbox (Kotak Masuk, Terkirim, Draf, Spam, Sampah, Alias `+/.`, Sync & Diagnostik).
- **Panel Diagnostik Mail & SPF/DKIM/DMARC:** Menambahkan modal diagnostik untuk memantau status binding KV, jumlah antrean transit, waktu email masuk terakhir, dan hasil verifikasi DNS SPF/DKIM/DMARC/MX secara langsung.
- **Background Sync Hemat RAM (Opt-In) & Notifikasi:** Menambahkan fitur sinkronisasi latar belakang opt-in (default mati) dengan 3 mode (Adaptif Hemat RAM sebagai default, Interval Manual `30 dtk`/`60 dtk`/`3 mnt`/`5 mnt`, dan Tab-Resume + Periodic Sync PWA) berbasis cek metadata `?metaOnly=1` tanpa WebSocket, plus notifikasi opsional yang mensyaratkan Background Sync aktif.

---

## VZ Mail & VZ Links — `v0.4.0-beta` (2026-11-27)

**Tahap:** Beta (`beta`)  
**Domain:** `mail.vz.gay` · `links.vz.gay` · `*.imy.li` · `imy.li/s/`  
**Tonggak:** Optimasi Safe-Area Multi-UA, Panduan SSO In-App Browser, Middleware Auth0 JWT & Kunci PIN VZ Vault

### Added & Security
- **Kunci PIN VZ Vault (3 Opsi Opt-In):** Menambahkan proteksi PIN lokal 4–6 digit (`PBKDF2-SHA256` 150.000 iterasi dengan auto-reset setelah 5x salah) yang mendukung seluruh 3 mode opt-in: (1) Layar Kunci Penuh + Auto-Lock (1/5/15 menit & kunci otomatis saat pindah tab), (2) Kunci PIN Khusus Aksi Sensitif (Ekspor, Impor/Restore, dan Frasa 12-Kata), serta (3) Panduan opt-in pembuatan PIN saat pertama kali membuka VZ Vault.
- **Middleware Verifikasi Auth0 JWT Terpusat (Worker & Express):** Memisahkan middleware `runWorkerAuthMiddleware` (`src/utils/workerAuthMiddleware.ts`) dan `createExpressAuthMiddleware` (`src/utils/expressAuthMiddleware.ts`) dengan kebijakan rute terpadu, validasi `azp` multi-audiens OIDC, tantangan standar `WWW-Authenticate: Bearer` pada respons `401`, ketat di produksi dengan fallback dev lokal otomatis untuk `localhost` / preview.

### Improved & Compatibility
- **Safe-Area Mobile & Responsivitas Multi-UA:** Menerapkan `env(safe-area-inset-top/bottom/left/right)`, `overflow-x: clip`, dan fallback `dvh`/`vh` secara menyeluruh pada sticky header, banner atas, bottom navigation, komposer email mengambang/bottom-sheet, tombol pratinjau bio mengambang, drawer, modal, dan toast.
- **Banner In-App Browser + Panduan SSO Langsung di Tombol Login:** Memperluas deteksi WebView (WhatsApp, Instagram, TikTok, Threads, Discord, LINE, Telegram, Shopee, Gojek, Grab, Slack, Notion, WebView Android/iOS generik) serta menampilkan panduan buka di browser utama / salin URL langsung di dekat tombol Login SSO pada VZ Mail, VZ Links, Shortlink Studio, dan drawer mobile.

---

## VZ Mail & VZ Links — `v0.3.0-alpha` (2026-11-27)

**Tahap:** Alpha (`alpha`)  
**Domain:** `mail.vz.gay` · `links.vz.gay` · `*.imy.li` · `imy.li/s/` · `files.vz.gay`  
**Tonggak:** Pengerasan Keamanan API Auth0 JWT, Stabilitas Edge & Kompatibilitas Multi-Browser/OS

### Security
- **Verifikasi Auth0 RS256 OIDC JWT & Isolasi Kepemilikan Akun:** Menambahkan verifikasi RS256 JWKS zero-dependency pada Cloudflare Worker dan Express (`server.ts`) untuk seluruh endpoint privat `/api/mail/*`, `/api/vzfiles/*`, mutasi Bio/Avatar, Recycle Bin, serta pengelolaan shortlink berpemilik.
- **Perbaikan Celah Hapus Shortlink Berpemilik:** Menolak penghapusan shortlink yang memiliki pemilik apabila permintaan tidak terautentikasi atau parameter pemilik tidak cocok.
- **Pemblokiran Unggahan Avatar SVG & Sandbox Unduhan Lampiran:** Membatasi avatar Bio khusus format raster aman (`AVIF`, `WebP`, `PNG`, `JPEG`, `GIF`) serta menambahkan header `Content-Security-Policy: sandbox` dan pemaksaan `application/octet-stream` untuk tipe file aktif saat unduhan lampiran email.
- **Pengerasan Allowlist VZ Files & Validasi IP Privat/IPv6:** Memperketat allowlist host unggahan multipart VZ Files, memblokir rentang IP `0.0.0.0/8`, CGNAT `100.64.0.0/10`, dan alamat IPv6 privat/loopback/mapped.
- **Proteksi Brute-Force Brankas PIN Lokal:** Menghapus otomatis brankas kunci PIN lokal setelah 5 kali percobaan PIN salah berturut-turut, dilengkapi pengecekan HTTPS Web Crypto.

### Fixed & Compatibility
- **Decoder Email Inbound Quoted-Printable & HTML-Only:** Menambahkan decoder Quoted-Printable UTF-8 dan ekstraksi teks bersih untuk email masuk tanpa bagian `text/plain`.
- **Konsistensi Lampiran Outbound & Batas Memori Worker:** Meneruskan lampiran pada `cpanel_relay`, menampilkan pesan eksplisit apabila provider `SEND_EMAIL` menerima lampiran biner, serta membatasi `/api/vzfiles/legacy-upload` maksimal 20 MB agar aman dari batas memori Worker 128 MB.
- **Kompatibilitas Multi-Browser, Multi-OS & In-App Browser:** Menambahkan banner deteksi In-App Browser (WhatsApp, Instagram, TikTok, LINE, Facebook), dukungan `useRefreshTokens` Auth0 untuk Safari ITP & Brave Shields, header `COOP: same-origin-allow-popups`, fallback clipboard lintas browser, fallback kompresi avatar JPEG, deteksi iPadOS 13+, pencegahan auto-zoom input iOS, `viewport-fit=cover`, serta pengecualian cache Service Worker untuk parameter callback OAuth.

---

## VZ Mail — `v0.2.0-alpha` (2026-11-26)

**Tahap:** Alpha (`alpha`)  
**Domain:** `mail.vz.gay` · `@imy.li` · `files.vz.gay` · `chipervaultro.app.vz.gay`  
**Tonggak:** Standar Enkripsi Ekosistem VZ (`.anf` & CipherVault Pro) + VZ Files Cloud (`>10 MB`)

### Added
- **Standar Enkripsi Ekosistem VZ `.anf` (*Advanced/Archival Neural File*):** Peningkatan skema ekspor & pemulihan email/backup lokal ke standar platform **CipherVault Pro** (`chipervaultro.app.vz.gay` / `github.com/nabhan-rp/chipervaultpro`) selaras dengan **VZ Desk** (`desk.vz.gay`). Format default `.anf` (`vz-anf-v1`, AES-256-GCM + PBKDF2-SHA256 `200.000` iterasi) menjadi standar resmi ekosistem VZ yang dapat dibuka lintas layanan VZ (seperti Mail dan Desk).
- **Dukungan Multi-Format Enkripsi (`.anf`, `.cvp`, `.enc`):** Selain `.anf`, tersedia dua opsi ekspor terenkripsi tambahan:
  - **`.cvp` (Standar Bawaan CipherVault Pro v3):** Kompatibel langsung dengan aplikasi CipherVault Pro (`PBKDF2-SHA256` `100.000` iterasi + `AES-256-GCM`).
  - **`.enc` (Standar Kompatibilitas Umum MyVault):** Kontainer JSON `vz.myvault.enc.v1` (`PBKDF2-SHA256` `310.000` iterasi + `AES-256-GCM`) agar tetap kompatibel dengan utilitas dekripsi lain.
- **Mode Kontainer Standard JSON & Polyglot Stealth (PDF/ZIP Carrier):** Ekspor `.anf` dan `.cvp` mendukung pilihan antara **Standard JSON** dan **Polyglot Stealth** (menyisipkan *ciphertext* biner `AES-256-GCM` di balik *header* PDF atau ZIP sintetis dengan penanda `---VZ_ANF_v1_SIG---` atau `---CV_PRO_v3_SIG---`). Fitur Impor otomatis mendeteksi dan mendekripsi seluruh format serta mode tersebut.
- **Generator Frasa Pemulihan 12-Kata (Mnemonic CipherVault Pro) & Brankas PIN Lokal:** Pembuatan frasa kunci 12-kata acak kriptografis (CSPRNG) sekali klik yang dapat disalin atau dikunci pada perangkat lokal menggunakan PIN 4–6 digit (`vz-anf-pin-vault-v1`, `PBKDF2-SHA256` `150.000` iterasi).
- **Transfer File Besar (`>10 MB`) via VZ Files (`files.vz.gay`) & Media Inline:** Dukungan unggah langsung file berukuran di atas batas lampiran 10 MB ke layanan **VZ Files** (`https://files.vz.gay` / `github.com/nabhan-rp/vzfiles`) dari komposer email, serta penyisipan tautan eksternal (Google Drive, Imgur, atau *direct file*). Tautan gambar langsung (*direct image URL*) otomatis ditampilkan *inline* di dalam badan email.

### Fixed & Changed
- **Standarisasi Pengiriman Outbound Brevo & Resend:** Penyeragaman header `Reply-To` serta penanganan respons validasi lampiran dengan tombol penyelamatan cepat ke **Draf Lokal**.
- **Sinkronisasi Lockfile Cloudflare Workers Builds & Stabilitas Dev Server:** Menghapus konflik `bun.lock` dengan `package-lock.json` pada pipeline Cloudflare Builds serta menonaktifkan WebSocket HMR standalone (`hmr: false`) di mode middleware agar tidak terjadi bentrok port `24678`.

---

## VZ Mail — `v0.1.0-alpha` (2026-11-25)

**Tahap:** Alpha (`alpha`)  
**Domain:** `mail.vz.gay` · `@imy.li`  
**Tonggak:** Pondasi Awal Zero-Retention Local-First

### Added
- **Arsitektur Zero-Retention Pop-and-Purge & IndexedDB Lokal:** Email masuk diantrekan sementara pada Cloudflare `MAIL_TRANSIT_KV` (auto-TTL 72 jam), ditarik ke IndexedDB browser perangkat pengguna, lalu langsung dimusnahkan permanen dari edge setelah konfirmasi (`POST /api/mail/ack`).
- **Alias Tak Terbatas (`+tag` dan titik `.`):** Kanonikalisasi alamat masuk otomatis ala Gmail (`nama+promo@imy.li`, `na.ma@imy.li` diarahkan ke kotak utama `nama@imy.li`) beserta pengiriman email keluar via Brevo / Cloudflare Email Sending / Relay dengan batas kuota harian.
- **QR Code untuk Alamat Utama & Semua Alias:** Pembuatan QR Code instan untuk alamat `@imy.li` utama maupun seluruh alias `+`/`.` dengan pilihan format **`mailto:`** (langsung kirim email) dan **`vCard 3.0`** (simpan kontak), lengkap dengan unduhan PNG/SVG resolusi tinggi.
- **MyVault Terenkripsi (AES-GCM) & Verifikasi Pengirim:** Ekspor dan impor arsip percakapan lokal terenkripsi langsung di perangkat, ditambah verifikasi autentikasi domain (SPF, DKIM, DMARC, RDAP) dan panel grounding pencarian `search.vz.gay`.
- **Multi-OS PWA, Dynamic Edge SEO & AI Crawler Discovery:** Dukungan pemasangan aplikasi (iOS, Android, macOS, Windows, Linux), penyuntikan metadata OpenGraph/Twitter/JSON-LD dinamis lewat Cloudflare Worker `HTMLRewriter`, serta berkas resmi `/llms.txt` dan `/llms-full.txt`.

---

## VZ Links — `v0.1.0-alpha` (2026-11-25)

**Tahap:** Alpha (`alpha`)  
**Domain:** `links.vz.gay` · `*.imy.li` · `imy.li/s/`  
**Tonggak:** Pondasi Awal Multi-Page Bio, Shortlink & QR Studio

### Added
- **Link-in-Bio Multi-Halaman (`$USERNAME.imy.li` & `/$PAGE`):** Satu akun berpasangan 1:1 dengan handle email VZ Mail, mendukung halaman utama dan sub-halaman tak terbatas (`/promo`, `/event`, dsb.), 6 tema per halaman, 16 ikon media sosial, unggah foto profil AVIF/WebP otomatis ke Cloudflare R2/D1, dan pencatatan klik nyata.
- **Pemendek URL Mandiri (`imy.li/s/`):** Pembuatan tautan pendek kode acak atau slug kustom dengan redirect HTTP 302 tanpa cache agar klik terhitung akurat, didukung auto-bootstrap skema Cloudflare D1 (`vzlinks-db`) serta fallback baca otomatis untuk data lama di `LINKS_KV`.
- **Studio Desain QR Code Kustom untuk Bio, Sub-Halaman & Semua Tautan:** Kustomisasi penuh warna foreground/background, gaya dot (`square`, `rounded`, `dots`, `classy`), sudut QR, bingkai teks CTA, dan foto profil Bio atau monogram di tengah QR. Desain tersimpan ke D1/KV dan langsung dapat dipindai pengunjung pada halaman publik Bio.
- **Recycle Bin 14 Hari, Nonaktifkan Sementara & Cooldown 3 Hari:** Pemulihan item terhapus (tautan Bio, sub-halaman, shortlink) hingga 14 hari, penonaktifan sementara tanpa menghapus data, penghapusan permanen lintas D1/KV/R2 dengan masa tunggu 3 hari (72 jam), serta isolasi Zero-Cookie PSL pada subdomain `*.imy.li`.
- **Kontrol Opt-In Indeksasi Mesin Pencari & AI Crawler (Meta-Style) untuk Halaman Bio:** Default privat (`none`: `noindex, nofollow, noai, noimageai`), memberi pemilik Bio pilihan eksplisit antara **Tidak Diindeks (Privat)**, **Mesin Pencari Saja**, **AI Crawler Saja**, atau **Mesin Pencari & AI**—diterapkan langsung di Cloudflare edge melalui `https://$USERNAME.imy.li/robots.txt`, HTTP `X-Robots-Tag`, `<meta name="robots">`, dan Schema.org `ProfilePage` JSON-LD.
