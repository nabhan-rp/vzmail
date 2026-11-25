import {
  ArrowLeft,
  FileText,
  Globe,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import type { Language } from '../data/i18n';

interface LegalDocumentViewProps {
  lang: Language;
  docType: 'terms' | 'privacy';
  onSwitchDoc: (next: 'terms' | 'privacy') => void;
  onBack: () => void;
}

interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

function getTermsSections(lang: Language): LegalSection[] {
  if (lang === 'en') {
    return [
      {
        id: 'scope',
        heading: '1. Scope & Service Operator',
        paragraphs: [
          'These Terms of Service ("Terms") govern your access to and use of the vz.gay ecosystem services operated by PT Galeri Langkah Bahagia Yuwana ("galbay", "we", or "us"), including VZ Mail (mail.vz.gay and @imy.li mailboxes), VZ Links (links.vz.gay, *.imy.li multi-page Link-in-Bio profiles, and imy.li/s/ URL shortener), and related edge routing infrastructure.',
          'Authentication is unified through accounts.vz.gay / myaccount.vz.gay (Auth0 SSO). Activation of VZ Mail and VZ Links is strictly opt-in; by activating either service or shortening a link on imy.li/s/, you agree to these Terms and our Privacy Policy.',
        ],
      },
      {
        id: 'tld-gay',
        heading: '2. Compliance with .gay TLD Rights Protections Policy',
        paragraphs: [
          'Our platform hosts services under the .gay top-level domain (vz.gay, mail.vz.gay, links.vz.gay), which is governed by the official .gay Registry Rights Protections Policy (GoDaddy Registry / Registry Services LLC).',
          'To keep the .gay namespace safe, inclusive, and compliant with registry mandates, you strictly agree NOT to use any VZ Mail or VZ Links service to publish, transmit, link to, or promote:',
        ],
        bullets: [
          'Anti-LGBTQIA+ hate speech, slurs, dehumanization, or discrimination based on sexual orientation, gender identity, or expression.',
          'Harassment, targeted cyberbullying, doxxing, threats, or incitement to violence against any individual or protected group.',
          'Content affiliated with recognized hate groups, extremist organizations, or unlawful abuse networks.',
          'Any conduct that violates GoDaddy Registry / .gay Rights Protections Policy. We reserve the right to immediately suspend or terminate offending accounts, bio pages, email access, or links without prior notice.',
        ],
      },
      {
        id: 'tld-li',
        heading: '3. Compliance with .li ccTLD Registry & Anti-Abuse Policy (SWITCH)',
        paragraphs: [
          'Email identities (@imy.li), public bio subdomains (*.imy.li), and shortlinks (imy.li/s/) operate under the .li country-code top-level domain administered by SWITCH Registry (Liechtenstein).',
          'All users—including anonymous guest users of imy.li/s/—must strictly comply with SWITCH anti-abuse requirements and international internet safety standards:',
        ],
        bullets: [
          'Zero Phishing & Malware: Do not shorten, host, or email links leading to credential harvesting pages, malware payloads, ransomware, trojans, or deceptive login clones.',
          'Zero Spam / Unsolicited Bulk Email (UCE): VZ Mail may not be used for mass unsolicited marketing, email harvesting, spoofing, or automated scraping.',
          'Zero Fraudulent Redirects & Impersonation: Do not use *.imy.li or imy.li/s/ to impersonate banks, government agencies, payment processors, or official vz.gay / imy.li staff.',
          'Rapid Takedown Cooperation: Confirmed abusive shortlinks, bio pages, or mailboxes are immediately terminated and purged from Cloudflare D1/KV/R2 upon detection or valid report to abuse@imy.li.',
        ],
      },
      {
        id: 'reserved-handles',
        heading: '4. Reserved System Usernames & Namespace Protection',
        paragraphs: [
          'To protect user security and prevent social engineering, system and administrative handles are permanently reserved for official vz.gay and imy.li operations. This protection is synchronized across our Auth0 registration/login Actions, Cloudflare Worker APIs, and application interfaces.',
        ],
        bullets: [
          'Reserved prefixes include (non-exhaustive): admin, administrator, root, system, web, webmaster, postmaster, hostmaster, noreply, no-reply, mailer-daemon, newsletter, cs, help, support, abuse, security, billing, legal, terms, privacy, sso, auth, api, www, mail, links, vz, imy, galbay.',
          'Canonical normalization applies: dot or separator variations (such as ad.min, no.reply, web-master, or sup_port) resolve to the same canonical root and are equally blocked.',
          'Attempts to bypass reserved username rules may result in immediate account restriction.',
        ],
      },
      {
        id: 'mail-terms',
        heading: '5. VZ Mail Specific Terms (Local-First & Pop-and-Purge)',
        paragraphs: [
          'VZ Mail operates on a Local-First architecture where your message history resides in your browser IndexedDB storage. Incoming messages held in the Cloudflare Worker transit queue are purged immediately once pulled to your device.',
          'Because we do not retain a permanent cloud archive of your inbox, you are solely responsible for exporting periodic backups via MyVault (.eml, .mbox, or encrypted .enc archives) before clearing browser storage or switching devices.',
        ],
      },
      {
        id: 'links-lifecycle',
        heading: '6. VZ Links Lifecycle: Deactivation, 14-Day Recycle Bin & 3-Day Cooldown',
        paragraphs: [
          'VZ Links provides transparent lifecycle controls designed to prevent accidental loss while protecting shared Cloudflare edge database budgets from abuse:',
        ],
        bullets: [
          'Temporary Deactivation: You may temporarily deactivate your entire Bio profile (*.imy.li) or individual sub-pages (/$PAGE). Deactivated pages are hidden from public visitors while preserving your stored records until you reactivate them.',
          '14-Day Recycle Bin: Deleted Bio links, sub-pages, and (for signed-in users) shortlinks can be moved to the Recycle Bin. Live redirects stop immediately. Items in the Recycle Bin are automatically and permanently purged from Cloudflare D1/KV after 14 days unless restored earlier.',
          'Permanent Deletion & 3-Day Anti-Brute-Force Cooldown: Choosing permanent Bio deletion executes a hard DELETE across Cloudflare D1, KV, and R2 (including AVIF profile photos). To prevent rapid delete/recreate database rewrite abuse (brute-force overload), a 3-day (72-hour) cooldown applies before the same username may recreate a Bio profile.',
          'Shortlink Deletion: Deleting an imy.li/s/ shortlink removes it immediately from active edge routing so it stops redirecting right away.',
        ],
      },
      {
        id: 'abuse-contact',
        heading: '7. Abuse Reporting, Modifications & Contact',
        paragraphs: [
          'We may update these Terms to reflect registry rules, infrastructure changes, or legal requirements. Material updates will be reflected by the revision date at the top of this page.',
          'To report abuse, phishing, hate speech, or copyright violations on vz.gay or imy.li, email abuse@imy.li. For legal inquiries, contact legal@vz.gay.',
        ],
      },
    ];
  }

  return [
    {
      id: 'scope',
      heading: '1. Ruang Lingkup Layanan & Identitas Operator',
      paragraphs: [
        'Syarat & Ketentuan Layanan ("Ketentuan") ini mengatur penggunaan seluruh layanan ekosistem vz.gay yang dioperasikan oleh PT Galeri Langkah Bahagia Yuwana ("galbay", "kami"), meliputi VZ Mail (mail.vz.gay dan kotak surat @imy.li), VZ Links (links.vz.gay, halaman Multi-Page Link-in-Bio *.imy.li, serta pemendek tautan imy.li/s/), beserta infrastruktur edge terkait.',
        'Autentikasi akun dipusatkan melalui SSO Universal accounts.vz.gay / myaccount.vz.gay (Auth0). Aktivasi VZ Mail dan VZ Links bersifat opt-in (pilihan sukarela). Dengan mengaktifkan salah satu layanan atau menyingkat tautan melalui imy.li/s/, Anda menyatakan setuju dan terikat pada Ketentuan ini serta Kebijakan Privasi kami.',
      ],
    },
    {
      id: 'tld-gay',
      heading: '2. Kepatuhan Kebijakan TLD .gay (.gay Rights Protections Policy)',
      paragraphs: [
        'Layanan kami berjalan di bawah Top-Level Domain .gay (vz.gay, mail.vz.gay, links.vz.gay) yang tunduk penuh pada .gay Rights Protections Policy yang ditetapkan oleh GoDaddy Registry / Registry Services LLC.',
        'Demi menjaga ruang digital .gay yang aman, inklusif, dan patuh terhadap regulasi registri, Anda DILARANG KERAS menggunakan VZ Mail maupun VZ Links untuk menerbitkan, mengirim, menautkan, atau mempromosikan:',
      ],
      bullets: [
        'Ujaran kebencian anti-LGBTQIA+, penghinaan, dehumanisasi, atau diskriminasi berbasis orientasi seksual, identitas gender, maupun ekspresi gender.',
        'Pelecehan, perundungan siber (cyberbullying), doxxing, pengancaman, atau hasutan kekerasan terhadap individu maupun kelompok mana pun.',
        'Konten yang berafiliasi dengan kelompok kebencian (hate groups), ekstremisme kekerasan, atau jaringan penyalahgunaan ilegal.',
        'Segala tindakan yang melanggar .gay Rights Protections Policy. Kami berhak melakukan moderasi aktif, penonaktifan segera, hingga pemutusan akses permanen tanpa pemberitahuan sebelumnya atas pelanggaran yang terkonfirmasi.',
      ],
    },
    {
      id: 'tld-li',
      heading: '3. Kepatuhan Kebijakan ccTLD .li (SWITCH Registry — Liechtenstein)',
      paragraphs: [
        'Identitas email (@imy.li), subdomain bio publik (*.imy.li), dan pemendek URL (imy.li/s/) beroperasi di bawah ccTLD .li yang dikelola oleh SWITCH Registry (Liechtenstein).',
        'Seluruh pengguna—baik pengguna akun SSO maupun tamu tanpa login pada imy.li/s/—wajib mematuhi kebijakan anti-penyalahgunaan SWITCH serta standar keamanan internet internasional:',
      ],
      bullets: [
        'Anti-Phishing & Anti-Malware: Dilarang menyingkat, menayangkan, atau mengirimkan tautan menuju situs pencurian kredensial (phishing), malware, ransomware, skrip berbahaya, atau halaman login palsu.',
        'Anti-Spam / UCE: VZ Mail dilarang digunakan untuk pengiriman email massal tanpa izin (spam/UCE), spoofing identitas pengirim, atau penipuan elektronik.',
        'Anti-Peniruan Identitas (Impersonation): Dilarang menggunakan *.imy.li atau imy.li/s/ untuk meniru instansi pemerintah, bank, layanan pembayaran, maupun staf resmi vz.gay / imy.li.',
        'Tindakan Cepat Takedown: Tautan pendek, halaman bio, atau akses surat elektronik yang terbukti melanggar akan segera dinonaktifkan dan dihapus dari Cloudflare D1/KV/R2 saat terdeteksi atau dilaporkan melalui abuse@imy.li.',
      ],
    },
    {
      id: 'reserved-handles',
      heading: '4. Perlindungan Username Sistem (Reserved Usernames)',
      paragraphs: [
        'Untuk melindungi keamanan pengguna dan mencegah penipuan rekayasa sosial, nama pengguna (username) yang bersifat administratif, teknis, atau sistem dicadangkan secara permanen bagi infrastruktur resmi vz.gay dan imy.li. Aturan ini disinkronkan di Auth0 Actions, Cloudflare Worker, dan aplikasi web.',
      ],
      bullets: [
        'Daftar kata yang dilindungi mencakup (namun tidak terbatas pada): admin, administrator, root, system, web, webmaster, postmaster, hostmaster, noreply, no-reply, mailer-daemon, newsletter, cs, help, support, abuse, security, billing, legal, terms, privacy, sso, auth, api, www, mail, links, vz, imy, galbay.',
        'Normalisasi kanonik berlaku penuh: variasi tanda titik, strip, atau garis bawah (misalnya ad.min, no.reply, web-master, sup_port) akan dinormalisasi ke akar yang sama dan otomatis diblokir.',
        'Upaya mengakali perlindungan username sistem dapat mengakibatkan penangguhan akun.',
      ],
    },
    {
      id: 'mail-terms',
      heading: '5. Ketentuan Khusus VZ Mail (Arsitektur Local-First & Pop-and-Purge)',
      paragraphs: [
        'VZ Mail menggunakan arsitektur Local-First di mana riwayat email Anda disimpan langsung di IndexedDB perangkat lokal Anda. Antrean transit di Cloudflare Worker akan segera dihapus (Pop-and-Purge) begitu perangkat Anda menarik pesan masuk.',
        'Karena kami tidak menyimpan salinan arsip kotak masuk permanen di server cloud, Anda bertanggung jawab penuh untuk melakukan pencadangan berkala melalui fitur MyVault (.eml, .mbox, atau berkas terenkripsi .enc) sebelum membersihkan data browser atau berpindah perangkat.',
      ],
    },
    {
      id: 'links-lifecycle',
      heading: '6. Siklus Data VZ Links: Nonaktif Sementara, Recycle Bin 14 Hari & Cooldown 3 Hari',
      paragraphs: [
        'VZ Links menyediakan kendali siklus data yang aman agar pengguna tidak kehilangan data secara tidak sengaja sekaligus melindungi anggaran dan performa database Cloudflare dari penyalahgunaan:',
      ],
      bullets: [
        'Nonaktifkan Sementara (Temporary Deactivate): Anda dapat menonaktifkan sementara seluruh halaman Bio (*.imy.li) atau masing-masing sub-halaman (/$PAGE). Halaman tidak akan terlihat publik sementara data tetap aman tersimpan di database hingga Anda aktifkan kembali.',
        'Recycle Bin 14 Hari (Auto-Purge): Tautan Bio, sub-halaman, maupun shortlink (untuk akun SSO) yang dihapus dapat ditempatkan di Recycle Bin. Redirect aktif langsung berhenti seketika. Item yang tidak dipulihkan dalam 14 hari akan dibersihkan secara permanen dan otomatis dari Cloudflare D1/KV.',
        'Hapus Permanen Bio & Masa Tunggu (Cooldown) 3 Hari: Penghapusan permanen profil Bio mengeksekusi penghapusan nyata (hard DELETE) pada seluruh baris Cloudflare D1, KV, dan file foto AVIF di R2. Untuk mencegah serangan brute-force rewrite database yang membebani kuota Cloudflare, berlaku masa tunggu 3 hari (72 jam) sebelum username yang sama dapat membuat ulang profil Bio.',
        'Penghapusan Shortlink: Penghapusan shortlink imy.li/s/ langsung menghapus rute redirect dari database edge secara nyata (bukan sekadar disembunyikan di tampilan).',
      ],
    },
    {
      id: 'abuse-contact',
      heading: '7. Pelaporan Penyalahgunaan, Perubahan Ketentuan & Kontak',
      paragraphs: [
        'Kami dapat memperbarui Ketentuan ini sewaktu-waktu mengikuti kebijakan registri .gay / .li, pembaruan teknis, atau ketentuan hukum yang berlaku di Republik Indonesia. Tanggal pembaruan terakhir tercantum di bagian atas dokumen ini.',
        'Untuk melaporkan penyalahgunaan, phishing, spam, atau ujaran kebencian pada layanan vz.gay maupun imy.li, hubungi abuse@imy.li. Untuk keperluan hukum dan kepatuhan, hubungi legal@vz.gay.',
      ],
    },
  ];
}

function getPrivacySections(lang: Language): LegalSection[] {
  if (lang === 'en') {
    return [
      {
        id: 'controller',
        heading: '1. Data Controller & Privacy-by-Design Commitment',
        paragraphs: [
          'PT Galeri Langkah Bahagia Yuwana ("galbay", "we") operates VZ Mail (mail.vz.gay / @imy.li) and VZ Links (links.vz.gay / *.imy.li / imy.li/s/) under a strict data-minimization architecture. We never sell personal data, inject third-party advertising trackers into public bio pages, or build behavioral ad profiles.',
        ],
      },
      {
        id: 'auth-data',
        heading: '2. SSO Account Data & Avatar Isolation',
        paragraphs: [
          'When you sign in through accounts.vz.gay (Auth0), we process your canonical username, Auth0 subject identifier (sub), display name, and SSO account email solely to authenticate sessions and enforce 1:1 namespace pairing between username@imy.li and username.imy.li.',
          'Bio profile photos uploaded to VZ Links are completely decoupled from your Auth0 / myaccount.vz.gay SSO avatar. Changing or deleting your Bio photo never alters your SSO account photo, and your SSO photo is never automatically published on public *.imy.li pages.',
        ],
      },
      {
        id: 'mail-privacy',
        heading: '3. VZ Mail Privacy (Device-Local IndexedDB & Pop-and-Purge)',
        paragraphs: [
          'VZ Mail stores your received and sent message history exclusively in your browser local IndexedDB storage. Cloudflare Workers only buffer incoming email messages in temporary transit storage (MAIL_TRANSIT_KV) long enough for your signed-in client to pull them—once pulled, transit copies are immediately purged.',
          'Optional MyVault exports (.enc) are encrypted client-side in your browser using WebCrypto AES-256-GCM; your vault passphrase never leaves your device.',
        ],
      },
      {
        id: 'links-privacy',
        heading: '4. VZ Links Data (Multi-Page Bio, AVIF Photos & Shortlinks)',
        paragraphs: [
          'Information you intentionally publish in VZ Links—such as display name, bio text, social links, sub-pages, and custom AVIF profile photos—is stored in Cloudflare D1/KV and Cloudflare R2 (for media) so it can be served publicly at your *.imy.li URL.',
        ],
        bullets: [
          'EXIF Metadata Stripping: Bio profile photos are cropped and re-encoded client-side via browser Canvas into compact AVIF format (max 256×256 px), automatically stripping camera EXIF, GPS location, and device metadata prior to upload.',
          'Aggregate Click Counters: Bio link clicks and imy.li/s/ shortlink redirects increment a simple numeric counter only. We do not sell visitor IP profiles or embed third-party analytics pixels on *.imy.li or imy.li/s/.',
          'Guest Shortlinks: Anonymous imy.li/s/ shortlinks store only the target URL, slug, optional label, creation timestamp, and numeric click count; your recent guest slugs are saved locally in browser localStorage.',
        ],
      },
      {
        id: 'retention-deletion',
        heading: '5. Retention, 14-Day Recycle Bin & Real Database Erasure',
        paragraphs: [
          'When you permanently delete data in VZ Links, we perform real database erasure rather than hiding rows only in the interface:',
        ],
        bullets: [
          'Active Shortlink & Bio Deletion: Permanently deleted items are immediately removed via SQL DELETE in Cloudflare D1, KV key deletion in LINKS_KV, and object deletion in Cloudflare R2.',
          '14-Day Recycle Bin Auto-Purge: Items moved to the Recycle Bin carry an explicit 14-day expiration timestamp (and native KV TTL) and are automatically purged from the database upon expiry.',
          '3-Day Anti-Brute-Force Cooldown Record: After permanently deleting an entire Bio profile, we retain only your canonical username and unlock timestamp for 72 hours to prevent automated database rewrite abuse, after which the cooldown record expires.',
        ],
      },
      {
        id: 'subprocessors-rights',
        heading: '6. Infrastructure Sub-Processors & Your Data Rights',
        paragraphs: [
          'We rely on vetted infrastructure sub-processors: Cloudflare, Inc. (Workers, D1, KV, R2, Email Routing & Email Sending) and Auth0 / Okta (Universal SSO authentication).',
          'Under Indonesia Personal Data Protection Law (UU PDP) and international privacy standards, you have the right to access, export (MyVault), rectify, temporarily deactivate, or permanently delete your data. For privacy requests, contact privacy@vz.gay or legal@vz.gay.',
        ],
      },
    ];
  }

  return [
    {
      id: 'controller',
      heading: '1. Pengendali Data & Komitmen Privacy-by-Design',
      paragraphs: [
        'PT Galeri Langkah Bahagia Yuwana ("galbay", "kami") mengoperasikan VZ Mail (mail.vz.gay / @imy.li) dan VZ Links (links.vz.gay / *.imy.li / imy.li/s/) dengan prinsip minimisasi data yang ketat. Kami tidak pernah menjual data pribadi pengguna, tidak memasang skrip pelacak iklan pihak ketiga pada halaman Bio publik, dan tidak membangun profil periklanan.',
      ],
    },
    {
      id: 'auth-data',
      heading: '2. Data Akun SSO & Pemisahan Foto Profil',
      paragraphs: [
        'Saat Anda masuk melalui accounts.vz.gay (Auth0), kami memproses username kanonik, ID subjek Auth0 (sub), nama tampilan, dan alamat email akun SSO semata-mata untuk autentikasi sesi serta menjaga pasangan identitas 1:1 antara username@imy.li dan username.imy.li.',
        'Foto profil khusus Bio yang Anda unggah di VZ Links dipisahkan sepenuhnya dari foto akun SSO di myaccount.vz.gay. Mengubah atau menghapus foto Bio tidak mengubah foto akun SSO Anda, dan foto akun SSO tidak pernah ditampilkan otomatis di halaman publik *.imy.li.',
      ],
    },
    {
      id: 'mail-privacy',
      heading: '3. Privasi VZ Mail (IndexedDB Lokal Perangkat & Pop-and-Purge)',
      paragraphs: [
        'VZ Mail menyimpan riwayat pesan masuk dan keluar secara eksklusif pada penyimpanan lokal IndexedDB di perangkat Anda. Cloudflare Worker hanya menahan email masuk sementara di antrean transit (MAIL_TRANSIT_KV) sampai perangkat Anda menariknya—begitu ditarik, salinan di server edge langsung dihapus (Pop-and-Purge).',
        'Ekspor cadangan terenkripsi MyVault (.enc) diproses sepenuhnya di browser Anda menggunakan WebCrypto AES-256-GCM; kata sandi vault Anda tidak pernah dikirim ke server kami.',
      ],
    },
    {
      id: 'links-privacy',
      heading: '4. Privasi Data VZ Links (Multi-Page Bio, Foto AVIF & Shortlink)',
      paragraphs: [
        'Informasi yang secara sadar Anda publikasikan di VZ Links—seperti nama tampilan, bio, tautan sosial media, sub-halaman, dan foto profil AVIF khusus Bio—disimpan pada Cloudflare D1/KV dan Cloudflare R2 (untuk media) agar dapat ditayangkan secara cepat di subdomain *.imy.li Anda.',
      ],
      bullets: [
        'Penghapusan Metadata EXIF Otomatis: Foto profil Bio dipotong dan dikodekan ulang langsung di browser melalui Canvas menjadi format AVIF ringan (maksimal 256×256 px), sehingga metadata EXIF kamera, koordinat GPS, dan info perangkat terhapus sebelum diunggah.',
        'Penghitung Klik Agregat: Klik pada tautan Bio dan pengalihan imy.li/s/ hanya menambah penghitung angka total klik secara agregat. Kami tidak menjual riwayat alamat IP pengunjung atau memasang piksel pelacak pihak ketiga.',
        'Shortlink Mode Tamu: Tautan pendek imy.li/s/ yang dibuat tanpa login hanya menyimpan URL tujuan, slug, label opsional, waktu pembuatan, dan angka klik; daftar riwayat tamu disimpan secara lokal di localStorage browser Anda.',
      ],
    },
    {
      id: 'retention-deletion',
      heading: '5. Retensi Data, Recycle Bin 14 Hari & Penghapusan Nyata dari Database',
      paragraphs: [
        'Saat Anda menghapus data secara permanen di VZ Links, sistem melakukan penghapusan nyata pada lapisan database (bukan sekadar menyembunyikan di antarmuka):',
      ],
      bullets: [
        'Penghapusan Nyata D1, KV & R2: Penghapusan permanen shortlink maupun profil Bio langsung mengeksekusi SQL DELETE pada Cloudflare D1, menghapus kunci di LINKS_KV, serta menghapus berkas media AVIF terkait di Cloudflare R2.',
        'Auto-Purge Recycle Bin 14 Hari: Item yang dipindahkan ke Recycle Bin memiliki batas waktu retensi otomatis 14 hari (termasuk TTL bawaan KV) dan dibersihkan secara permanen dari database begitu masa simpan berakhir.',
        'Catatan Cooldown Anti-Brute-Force 3 Hari: Setelah penghapusan permanen seluruh profil Bio, sistem hanya menyimpan username kanonik dan stempel waktu buka selama 72 jam untuk mencegah penyalahgunaan penulisan ulang database, lalu kedaluwarsa otomatis.',
      ],
    },
    {
      id: 'subprocessors-rights',
      heading: '6. Sub-Pemroses Infrastruktur & Hak Data Pengguna',
      paragraphs: [
        'Infrastruktur kami didukung oleh sub-pemroses terverifikasi: Cloudflare, Inc. (Workers, D1, KV, R2, Email Routing & Email Sending) serta Auth0 / Okta (autentikasi SSO Universal).',
        'Sesuai Undang-Undang Pelindungan Data Pribadi (UU PDP) dan standar privasi global, Anda berhak mengakses, mengekspor (MyVault), memperbarui, menonaktifkan sementara, maupun menghapus data Anda secara permanen. Hubungi privacy@vz.gay atau legal@vz.gay untuk permintaan terkait privasi.',
      ],
    },
  ];
}

export function LegalDocumentView({
  lang,
  docType,
  onSwitchDoc,
  onBack,
}: LegalDocumentViewProps) {
  const isTerms = docType === 'terms';
  const sections = isTerms ? getTermsSections(lang) : getPrivacySections(lang);

  return (
    <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Top Bar: Back + Document Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-[#232732]">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Kembali ke Layanan' : 'Back to Services'}</span>
          </button>

          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>vz.gay · mail.vz.gay · links.vz.gay · imy.li</span>
            <span aria-hidden="true"> · </span>
            <span>{isTerms ? '/terms' : '/privacy'}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            {isTerms
              ? lang === 'id'
                ? 'Syarat & Ketentuan Layanan (Terms of Service)'
                : 'Terms of Service'
              : lang === 'id'
                ? 'Kebijakan Privasi (Privacy Policy)'
                : 'Privacy Policy'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-[68ch]">
            {lang === 'id'
              ? 'Berlaku untuk seluruh layanan VZ Mail (@imy.li) dan VZ Links (*.imy.li & imy.li/s/) yang dioperasikan oleh PT Galeri Langkah Bahagia Yuwana (galbay). Diperbarui: November 2026.'
              : 'Applies to all VZ Mail (@imy.li) and VZ Links (*.imy.li & imy.li/s/) services operated by PT Galeri Langkah Bahagia Yuwana (galbay). Last updated: November 2026.'}
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#141821] border border-slate-200 dark:border-[#232732] self-start sm:self-end shrink-0">
          <button
            type="button"
            onClick={() => onSwitchDoc('terms')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              isTerms
                ? 'bg-white dark:bg-[#212736] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Syarat & Ketentuan' : 'Terms of Service'}</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchDoc('privacy')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              !isTerms
                ? 'bg-white dark:bg-[#212736] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{lang === 'id' ? 'Kebijakan Privasi' : 'Privacy Policy'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout: Sticky TOC + Editorial Legal Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-3">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              {lang === 'id' ? 'Daftar Isi Dokumen' : 'Table of Contents'}
            </div>
            <nav aria-label="Document sections" className="space-y-1">
              {sections.map((sec) => (
                <a
                  key={sec.id}
                  href={`#legal-${sec.id}`}
                  className="block py-1.5 px-2.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-[#191E28] transition-colors"
                >
                  {sec.heading}
                </a>
              ))}
            </nav>
          </div>

          <div className="bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-5 space-y-3 text-xs">
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                {lang === 'id'
                  ? 'Kepatuhan Registri TLD Resmi'
                  : 'Official TLD Registry Compliance'}
              </span>
            </div>
            <div className="space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed">
              <div>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  .gay TLD:
                </span>{' '}
                {lang === 'id'
                  ? 'Tunduk pada .gay Rights Protections Policy (GoDaddy Registry) — anti-kebencian & anti-pelecehan.'
                  : 'Governed by the .gay Rights Protections Policy (GoDaddy Registry) — zero hate speech or harassment.'}
              </div>
              <div>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  .li ccTLD:
                </span>{' '}
                {lang === 'id'
                  ? 'Tunduk pada kebijakan anti-abuse SWITCH Registry (Liechtenstein) — anti-phishing, malware & spam.'
                  : 'Governed by SWITCH Registry (Liechtenstein) anti-abuse policy — zero phishing, malware, or spam.'}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-[#232732] flex flex-col gap-1 font-mono text-[11px]">
              <a
                href="mailto:abuse@imy.li"
                className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:underline"
              >
                <Mail className="w-3 h-3" />
                <span>Abuse: abuse@imy.li</span>
              </a>
              <a
                href="mailto:legal@vz.gay"
                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Mail className="w-3 h-3" />
                <span>Legal / Privacy: legal@vz.gay</span>
              </a>
            </div>
          </div>
        </aside>

        <article className="lg:col-span-8 bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] rounded-xl p-6 sm:p-8 space-y-8">
          {sections.map((sec) => (
            <section
              key={sec.id}
              id={`legal-${sec.id}`}
              className="scroll-mt-20 space-y-3 pb-6 border-b border-slate-200/80 dark:border-[#232732] last:border-b-0 last:pb-0"
            >
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
                {sec.heading}
              </h2>
              {sec.paragraphs.map((para, idx) => (
                <p
                  key={idx}
                  className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-[74ch]"
                >
                  {para}
                </p>
              ))}
              {sec.bullets && sec.bullets.length > 0 && (
                <ul className="space-y-2 pt-1 pl-5 list-disc text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-[74ch]">
                  {sec.bullets.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
