# Changelog

Seluruh perubahan rilis resmi untuk layanan **VZ Mail** (`mail.vz.gay`) dan **VZ Links** (`links.vz.gay`, `*.imy.li`, `imy.li/s/`) oleh **PT Galeri Langkah Bahagia Yuwana (galbay)**.

Format ini mengikuti prinsip [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) dan [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versi web publik tersedia di [`/changelog`](https://mail.vz.gay/changelog) dan [`https://links.vz.gay/changelog`](https://links.vz.gay/changelog).

---

## VZ Mail — `v1.0.0` (2026-11-25)

**Domain:** `mail.vz.gay` · `@imy.li`  
**Rilis:** Rilis Perdana Zero-Retention Local-First

### Added
- **Arsitektur Zero-Retention Pop-and-Purge & IndexedDB Lokal:** Email masuk diantrekan sementara pada Cloudflare `MAIL_TRANSIT_KV` (auto-TTL 72 jam), ditarik ke IndexedDB browser perangkat pengguna, lalu langsung dimusnahkan permanen dari edge setelah konfirmasi (`POST /api/mail/ack`).
- **Alias Tak Terbatas (`+tag` dan titik `.`):** Kanonikalisasi alamat masuk otomatis ala Gmail (`nama+promo@imy.li`, `na.ma@imy.li` diarahkan ke kotak utama `nama@imy.li`) beserta pengiriman email keluar via Brevo / Cloudflare Email Sending / Relay dengan batas kuota harian.
- **QR Code untuk Alamat Utama & Semua Alias:** Pembuatan QR Code instan untuk alamat `@imy.li` utama maupun seluruh alias `+`/`.` dengan pilihan format **`mailto:`** (langsung kirim email) dan **`vCard 3.0`** (simpan kontak), lengkap dengan unduhan PNG/SVG resolusi tinggi.
- **MyVault Terenkripsi (AES-GCM) & Verifikasi Pengirim:** Ekspor dan impor arsip percakapan lokal terenkripsi `.vzvault` langsung di perangkat, ditambah verifikasi autentikasi domain (SPF, DKIM, DMARC, RDAP) dan panel grounding pencarian `search.vz.gay`.
- **Multi-OS PWA, Dynamic Edge SEO & AI Crawler Discovery:** Dukungan pemasangan aplikasi (iOS, Android, macOS, Windows, Linux), penyuntikan metadata OpenGraph/Twitter/JSON-LD dinamis lewat Cloudflare Worker `HTMLRewriter`, serta berkas resmi `/llms.txt` dan `/llms-full.txt`.

---

## VZ Links — `v1.0.0` (2026-11-25)

**Domain:** `links.vz.gay` · `*.imy.li` · `imy.li/s/`  
**Rilis:** Rilis Perdana Multi-Page Bio, Shortlink & QR Studio

### Added
- **Link-in-Bio Multi-Halaman (`$USERNAME.imy.li` & `/$PAGE`):** Satu akun berpasangan 1:1 dengan handle email VZ Mail, mendukung halaman utama dan sub-halaman tak terbatas (`/promo`, `/event`, dsb.), 6 tema per halaman, 16 ikon media sosial, unggah foto profil AVIF/WebP otomatis ke Cloudflare R2/D1, dan pencatatan klik nyata.
- **Pemendek URL Mandiri (`imy.li/s/`):** Pembuatan tautan pendek kode acak atau slug kustom dengan redirect HTTP 302 tanpa cache agar klik terhitung akurat, didukung auto-bootstrap skema Cloudflare D1 (`vzlinks-db`) serta fallback baca otomatis untuk data lama di `LINKS_KV`.
- **Studio Desain QR Code Kustom untuk Bio, Sub-Halaman & Semua Tautan:** Kustomisasi penuh warna foreground/background, gaya dot (`square`, `rounded`, `dots`, `classy`), sudut QR, bingkai teks CTA, dan foto profil Bio atau monogram di tengah QR. Desain tersimpan ke D1/KV dan langsung dapat dipindai pengunjung pada halaman publik Bio.
- **Recycle Bin 14 Hari, Nonaktifkan Sementara & Cooldown 3 Hari:** Pemulihan item terhapus (tautan Bio, sub-halaman, shortlink) hingga 14 hari, penonaktifan sementara tanpa menghapus data, penghapusan permanen lintas D1/KV/R2 dengan masa tunggu 3 hari (72 jam), serta isolasi Zero-Cookie PSL pada subdomain `*.imy.li`.
- **Kontrol Opt-In Indeksasi Mesin Pencari & AI Crawler (Meta-Style) untuk Halaman Bio:** Default privat (`none`: `noindex, nofollow, noai, noimageai`), memberi pemilik Bio pilihan eksplisit antara **Tidak Diindeks (Privat)**, **Mesin Pencari Saja**, **AI Crawler Saja**, atau **Mesin Pencari & AI**—diterapkan langsung di Cloudflare edge melalui `https://$USERNAME.imy.li/robots.txt`, HTTP `X-Robots-Tag`, `<meta name="robots">`, dan Schema.org `ProfilePage` JSON-LD.
