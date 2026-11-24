export type ServiceStatus = 'live' | 'development' | 'coming_soon';

export type ServiceCategory =
  | 'web_business'
  | 'media_content'
  | 'developer_cloud'
  | 'productivity'
  | 'education'
  | 'system_community';

export type ServiceIconName =
  | 'search'
  | 'layout-grid'
  | 'globe'
  | 'pen-line'
  | 'file-up'
  | 'store'
  | 'gamepad-2'
  | 'code-2'
  | 'cloud'
  | 'webhook'
  | 'sparkles'
  | 'mail'
  | 'film'
  | 'music'
  | 'image'
  | 'credit-card'
  | 'graduation-cap'
  | 'database'
  | 'feather'
  | 'smile'
  | 'compass'
  | 'heart-handshake'
  | 'briefcase'
  | 'box'
  | 'palette'
  | 'clapperboard'
  | 'pen-tool'
  | 'clipboard-list'
  | 'file-text'
  | 'presentation'
  | 'table-2'
  | 'calculator'
  | 'trending-up'
  | 'bar-chart-3'
  | 'notebook-pen'
  | 'newspaper'
  | 'git-branch'
  | 'message-square'
  | 'users'
  | 'contact'
  | 'book-open'
  | 'library'
  | 'book-marked'
  | 'layers'
  | 'link-2'
  | 'user-circle'
  | 'wrench'
  | 'megaphone'
  | 'server'
  | 'headphones'
  | 'messages-square'
  | 'shield-alert';

export interface LiveChildApp {
  name: string;
  domain: string;
  altDomain?: string;
  kind: 'app' | 'game' | 'demo';
  description: {
    id: string;
    en: string;
  };
}

export interface RedirectRule {
  from: string;
  to: string;
  code: 301;
}

export interface ServiceHighlight {
  label: {
    id: string;
    en: string;
  };
  value: {
    id: string;
    en: string;
  };
}

export interface ComplianceNotice {
  title: {
    id: string;
    en: string;
  };
  items: {
    id: string;
    en: string;
  }[];
}

export interface VzService {
  id: string;
  primaryDomain: string;
  launchUrl?: string;
  altDomains?: string[];
  category: ServiceCategory;
  secondaryCategories?: ServiceCategory[];
  status: ServiceStatus;
  iconName: ServiceIconName;
  ageRestricted?: boolean;
  name: {
    id: string;
    en: string;
  };
  shortType: {
    id: string;
    en: string;
  };
  description: {
    id: string;
    en: string;
  };
  architectureNotes?: {
    id: string;
    en: string;
  };
  highlights?: ServiceHighlight[];
  complianceNotice?: ComplianceNotice;
  clientDomainPatterns?: string[];
  redirectRules?: RedirectRule[];
  liveChildren?: LiveChildApp[];
  sponsor?: string;
}

export type VzDeskGroupId =
  | 'documents_publishing'
  | 'visual_3d'
  | 'analytics_math'
  | 'communication';

export interface VzDeskTool {
  id: string;
  domain: string;
  group: VzDeskGroupId;
  iconName: ServiceIconName;
  name: {
    id: string;
    en: string;
  };
  reference: {
    id: string;
    en: string;
  };
  description: {
    id: string;
    en: string;
  };
  formatNote: {
    id: string;
    en: string;
  };
}

export const VZ_DESK_APPS: VzDeskTool[] = [
  // Documents & Publishing
  {
    id: 'desk-docs',
    domain: 'docs.vz.gay',
    group: 'documents_publishing',
    iconName: 'file-text',
    name: { id: 'VZ Docs', en: 'VZ Docs' },
    reference: {
      id: 'Pengolah Kata & Dokumen (Ekspor DOC/DOCX, PDF, .md)',
      en: 'Word Processor & Documents (Export DOC/DOCX, PDF, .md)',
    },
    description: {
      id: 'Editor dokumen kolaboratif ringan berbasis teks polos (.md) dengan kompresi media WebP/AVIF, autosave SSO, serta dukungan ekspor langsung ke format dokumen kantor DOC/DOCX, ODT, dan PDF.',
      en: 'Lightweight collaborative document editor built on plain text (.md) with WebP/AVIF media compression, SSO autosave, and direct export to office document formats DOC/DOCX, ODT, and PDF.',
    },
    formatNote: {
      id: 'Sumber .md + ekspor DOC/DOCX & PDF · Bundel offline terenkripsi .enc (MyVault)',
      en: '.md source + DOC/DOCX & PDF export · Offline encrypted .enc bundle (MyVault)',
    },
  },
  {
    id: 'desk-sheets',
    domain: 'sheets.vz.gay',
    group: 'documents_publishing',
    iconName: 'table-2',
    name: { id: 'VZ Sheets', en: 'VZ Sheets' },
    reference: {
      id: 'Lembar Kerja & Spreadsheet (Ekspor XLS/XLSX, CSV)',
      en: 'Spreadsheet & Tabular Data (Export XLS/XLSX, CSV)',
    },
    description: {
      id: 'Lembar kerja data tabular berkecepatan tinggi berbasis .csv yang mendukung impor dan ekspor langsung ke format spreadsheet kantor XLS/XLSX, ODS, maupun PDF.',
      en: 'High-speed tabular spreadsheet workspace backed by lightweight .csv storage with full import and export support for office spreadsheet formats XLS/XLSX, ODS, and PDF.',
    },
    formatNote: {
      id: 'Sumber .csv ringan · Ekspor/impor XLS/XLSX & rencana integrasi NurDB (Segera Hadir)',
      en: 'Lightweight .csv source · XLS/XLSX export/import & planned NurDB sync (Coming Soon)',
    },
  },
  {
    id: 'desk-presentations',
    domain: 'presentations.vz.gay',
    group: 'documents_publishing',
    iconName: 'presentation',
    name: { id: 'VZ Presentations', en: 'VZ Presentations' },
    reference: {
      id: 'Slide Presentasi (Ekspor PPT/PPTX, PDF)',
      en: 'Slide Decks & Presentations (Export PPT/PPTX, PDF)',
    },
    description: {
      id: 'Pembuat slide presentasi modern berbasis struktur teks polos yang ringan, siap ditampilkan layar penuh di browser, serta dapat diekspor ke format presentasi kantor PPT/PPTX dan PDF.',
      en: 'Modern plain-text-backed slide deck creator with fullscreen browser presenter view and direct export to office presentation formats PPT/PPTX and PDF.',
    },
    formatNote: {
      id: 'Slide berbasis teks polos (---) · Ekspor PPT/PPTX, PDF & visual WebP/AVIF',
      en: 'Plain-text slide decks (---) · Export to PPT/PPTX, PDF & WebP/AVIF visuals',
    },
  },
  {
    id: 'desk-forms',
    domain: 'forms.vz.gay',
    group: 'documents_publishing',
    iconName: 'clipboard-list',
    name: { id: 'VZ Forms', en: 'VZ Forms' },
    reference: {
      id: 'Formulir & Survei Online (Ekspor CSV, XLS/XLSX)',
      en: 'Online Forms & Surveys (Export CSV, XLS/XLSX)',
    },
    description: {
      id: 'Pembuat formulir survei, pendaftaran, dan kuesioner publik dengan validasi kolom otomatis yang menyimpan respons ke VZ Sheets serta dapat diunduh dalam format CSV maupun XLS/XLSX.',
      en: 'Public survey, registration, and questionnaire builder with automated field validation that streams responses to VZ Sheets and exports to CSV or XLS/XLSX.',
    },
    formatNote: {
      id: 'Formulir publik instan · Ekspor respons ke VZ Sheets, CSV & XLS/XLSX',
      en: 'Instant public forms · Export responses to VZ Sheets, CSV & XLS/XLSX',
    },
  },
  {
    id: 'desk-diary',
    domain: 'diary.vz.gay',
    group: 'documents_publishing',
    iconName: 'notebook-pen',
    name: { id: 'VZ Diary', en: 'VZ Diary' },
    reference: {
      id: 'Buku Catatan & Jurnal Digital (Ekspor .md, DOCX, PDF)',
      en: 'Digital Notebooks & Journals (Export .md, DOCX, PDF)',
    },
    description: {
      id: 'Ruang buku catatan multi-bab, kliping ide, dan jurnal pribadi dengan penandaan YAML frontmatter, tautan silang antar catatan, serta ekspor ke DOC/DOCX, PDF, atau arsip terenkripsi .enc.',
      en: 'Multi-section digital notebooks, idea clippings, and personal journals with YAML metadata, cross-note backlinks, and export to DOC/DOCX, PDF, or encrypted .enc archives.',
    },
    formatNote: {
      id: 'Markdown + YAML Frontmatter · Ekspor DOCX/PDF & arsip offline .enc (MyVault)',
      en: 'Markdown + YAML Frontmatter · DOCX/PDF export & offline .enc vaults (MyVault)',
    },
  },
  {
    id: 'desk-press',
    domain: 'press.vz.gay',
    group: 'documents_publishing',
    iconName: 'newspaper',
    name: { id: 'VZ Press', en: 'VZ Press' },
    reference: {
      id: 'Tata Letak Cetak & Publikasi (Ekspor PDF Cetak, DOCX)',
      en: 'Desktop Publishing & Print Layout (Export Print PDF, DOCX)',
    },
    description: {
      id: 'Alat tata letak publikasi desktop untuk menyusun brosur, buletin, pamflet, zine, dan dokumen siap cetak berpresisi tinggi dengan ekspor PDF resolusi cetak serta DOC/DOCX.',
      en: 'Precision desktop publishing workspace for brochures, newsletters, pamphlets, and print-ready layouts with press-grade PDF and DOC/DOCX export.',
    },
    formatNote: {
      id: 'Sumber tata letak ringan (.typ / HTML+CSS) · Ekspor PDF siap cetak & DOCX',
      en: 'Lightweight layout source (.typ / HTML+CSS) · Print-ready PDF & DOCX output',
    },
  },

  // Visual, 3D & Diagrams
  {
    id: 'desk-craft',
    domain: 'craft.vz.gay',
    group: 'visual_3d',
    iconName: 'box',
    name: { id: 'VZ Craft', en: 'VZ Craft' },
    reference: {
      id: 'Studio Pemodelan Objek 3D (Ekspor .obj, .stl, .gltf)',
      en: '3D Object Modeling Studio (Export .obj, .stl, .gltf)',
    },
    description: {
      id: 'Studio pemodelan 3D berbasis browser untuk merancang, menginspeksi mesh, dan mengekspor aset objek 3D (.obj, .stl, .gltf) secara langsung tanpa instalasi perangkat lunak berat.',
      en: 'Browser-native 3D modeling workspace to design, inspect meshes, and export 3D object (.obj, .stl, .gltf) assets directly online without heavy desktop software.',
    },
    formatNote: {
      id: 'Ekspor standar .obj / .stl / .gltf · Ringan dijalankan langsung di browser',
      en: 'Standard .obj / .stl / .gltf export · Runs smoothly in the browser',
    },
  },
  {
    id: 'desk-design',
    domain: 'design.vz.gay',
    group: 'visual_3d',
    iconName: 'palette',
    name: { id: 'VZ Design', en: 'VZ Design' },
    reference: {
      id: 'Studio Desain Grafis & Olah Gambar (WebP, AVIF, PNG, SVG, PDF)',
      en: 'Graphic Design & Image Editor (WebP, AVIF, PNG, SVG, PDF)',
    },
    description: {
      id: 'Studio desain grafis berbasis layer dan penyuntingan foto di browser untuk membuat poster, materi publikasi, serta aset visual dengan ekspor ke WebP, AVIF, PNG, JPG, SVG, dan PDF.',
      en: 'Layer-based graphic design studio and raster/vector image editor in the browser for posters, visual layouts, and social assets with export to WebP, AVIF, PNG, JPG, SVG, and PDF.',
    },
    formatNote: {
      id: 'Ekspor multi-format WebP/AVIF, PNG, SVG & PDF · Terhubung dengan media.vz.gay',
      en: 'Multi-format WebP/AVIF, PNG, SVG & PDF export · Integrated with media.vz.gay',
    },
  },
  {
    id: 'desk-motion',
    domain: 'motion.vz.gay',
    group: 'visual_3d',
    iconName: 'clapperboard',
    name: { id: 'VZ Motion', en: 'VZ Motion' },
    reference: {
      id: 'Pembuat & Editor Animasi (Ekspor SVG, WebM, MP4, GIF)',
      en: 'Animation Maker & Timeline Editor (Export SVG, WebM, MP4, GIF)',
    },
    description: {
      id: 'Studio animasi berbasis timeline keyframe di browser untuk menyusun motion graphics, animasi vektor, dan klip interaktif dengan ekspor ke SVG animasi, WebM, MP4, atau GIF.',
      en: 'Keyframe timeline animation studio in the browser for motion graphics, vector animations, and interactive clips with export to animated SVG, WebM, MP4, or GIF.',
    },
    formatNote: {
      id: 'Timeline keyframe ringan · Ekspor SVG animasi, WebM, MP4, atau GIF',
      en: 'Lightweight keyframe timeline · Export animated SVG, WebM, MP4, or GIF',
    },
  },
  {
    id: 'desk-draw',
    domain: 'draw.vz.gay',
    group: 'visual_3d',
    iconName: 'pen-tool',
    name: { id: 'VZ Draw', en: 'VZ Draw' },
    reference: {
      id: 'Kanvas Gambar & Ilustrasi Vektor (Ekspor .svg, PNG, PDF)',
      en: 'Vector Drawing & Illustration Canvas (Export .svg, PNG, PDF)',
    },
    description: {
      id: 'Kanvas gambar vektor bebas berbasis SVG/JSON ringan untuk membuat ilustrasi garis, sketsa teknis, dan bagan visual yang dapat diekspor ke .svg, PNG, PDF, atau disematkan ke VZ Docs & Presentations.',
      en: 'Freeform vector drawing canvas stored as lightweight SVG/JSON for line illustrations, technical sketches, and visual callouts with .svg, PNG, and PDF export.',
    },
    formatNote: {
      id: 'Vektor murni .svg / JSON · Ekspor PNG/PDF & sematkan langsung ke dokumen',
      en: 'Pure .svg / JSON vector format · PNG/PDF export & direct document embedding',
    },
  },
  {
    id: 'desk-flowcharts',
    domain: 'flowcharts.vz.gay',
    group: 'visual_3d',
    iconName: 'git-branch',
    name: { id: 'VZ Flowcharts', en: 'VZ Flowcharts' },
    reference: {
      id: 'Diagram Alur & Arsitektur Sistem (Ekspor SVG, PNG, PDF)',
      en: 'Flowcharts & System Architecture Diagrams (Export SVG, PNG, PDF)',
    },
    description: {
      id: 'Perangkat pembuat diagram alur kerja (flowchart), peta jaringan, ERD basis data, dan arsitektur sistem yang memadukan editor node visual dengan kode deklaratif serta ekspor ke SVG, PNG, dan PDF.',
      en: 'Workflow flowchart, network topology, database ERD, and system architecture diagramming tool combining a visual node canvas with declarative syntax and SVG, PNG, and PDF export.',
    },
    formatNote: {
      id: 'Kanvas node visual + sintaks deklaratif · Ekspor SVG, PNG & PDF presisi',
      en: 'Visual node canvas + declarative syntax · Crisp SVG, PNG & PDF export',
    },
  },

  // Analytics & Quantitative
  {
    id: 'desk-math',
    domain: 'math.vz.gay',
    group: 'analytics_math',
    iconName: 'calculator',
    name: { id: 'VZ Math', en: 'VZ Math' },
    reference: {
      id: 'Kalkulator Ilmiah & Editor Persamaan (LaTeX, MathML, CSV)',
      en: 'Scientific Calculator & Equation Workbench (LaTeX, MathML, CSV)',
    },
    description: {
      id: 'Kalkulator ilmiah online, pembuat grafik fungsi multi-variabel, serta penyusun notasi persamaan matematika yang dapat diekspor ke LaTeX, MathML, SVG, atau disisipkan ke VZ Docs.',
      en: 'Online scientific calculator, multi-variable function plotter, and mathematical equation workbench with export to LaTeX, MathML, SVG, and VZ Docs.',
    },
    formatNote: {
      id: 'Ekspor notasi LaTeX / MathML & grafik SVG · Siap disematkan ke VZ Docs',
      en: 'LaTeX / MathML notation & SVG plot export · Ready to embed into VZ Docs',
    },
  },
  {
    id: 'desk-ekonometrics',
    domain: 'ekonometrics.vz.gay',
    group: 'analytics_math',
    iconName: 'trending-up',
    name: { id: 'VZ Ekonometrics', en: 'VZ Ekonometrics' },
    reference: {
      id: 'Analisis Ekonometrika & Statistik (Impor/Ekspor CSV, XLS/XLSX)',
      en: 'Econometrics & Statistical Analysis (Import/Export CSV, XLS/XLSX)',
    },
    description: {
      id: 'Perangkat analisis ekonometrika, regresi linier/panel, pemodelan deret waktu, dan uji hipotesis statistik di browser dengan dukungan impor/ekspor dataset CSV, XLS/XLSX, serta laporan PDF.',
      en: 'Browser-based econometrics, regression, time-series modeling, and statistical hypothesis suite supporting CSV and XLS/XLSX dataset import/export and PDF reports.',
    },
    formatNote: {
      id: 'Impor/ekspor dataset .csv & XLS/XLSX · Rencana integrasi NurDB (Segera Hadir)',
      en: 'Import/export .csv & XLS/XLSX datasets · Planned NurDB pipeline (Coming Soon)',
    },
  },
  {
    id: 'desk-metrics',
    domain: 'metrics.vz.gay',
    group: 'analytics_math',
    iconName: 'bar-chart-3',
    name: { id: 'VZ Metrics', en: 'VZ Metrics' },
    reference: {
      id: 'Analitik Trafik Web & Telemetri (Ekspor Laporan CSV, XLS/XLSX, PDF)',
      en: 'Web Traffic & Product Telemetry Analytics (Export CSV, XLS/XLSX, PDF)',
    },
    description: {
      id: 'Dasbor analitik kunjungan situs web, pemantauan konversi, peta interaksi halaman, dan metrik performa aplikasi yang ringan serta ramah privasi dengan ekspor laporan ke CSV, XLS/XLSX, dan PDF.',
      en: 'Lightweight, privacy-conscious web traffic analytics, conversion funnel tracking, and application performance metrics with report exports to CSV, XLS/XLSX, and PDF.',
    },
    formatNote: {
      id: 'Skrip telemetri ringan · Ekspor laporan CSV/XLSX & rencana sinkronisasi NurDB',
      en: 'Minimal telemetry script · CSV/XLSX report export & planned NurDB sync',
    },
  },

  // Communication & People
  {
    id: 'desk-chat',
    domain: 'chat.vz.gay',
    group: 'communication',
    iconName: 'message-square',
    name: { id: 'VZ Chat', en: 'VZ Chat' },
    reference: {
      id: 'Pesan Instan & Ruang Kolaborasi Tim (Terhubung VZ Mail)',
      en: 'Instant Messaging & Team Channels (Connected to VZ Mail)',
    },
    description: {
      id: 'Layanan pesan instan, kanal diskusi proyek, dan kolaborasi tim real-time yang terhubung langsung dengan utas surat elektronik di mail.vz.gay serta akun SSO.',
      en: 'Real-time instant messaging, project channels, and team collaboration workspace directly bridged with email threads on mail.vz.gay and SSO identity.',
    },
    formatNote: {
      id: 'Terhubung langsung dengan mail.vz.gay · Ekspor riwayat obrolan ke .txt / .json',
      en: 'Directly bridged with mail.vz.gay · Export chat archives to .txt / .json',
    },
  },
  {
    id: 'desk-groups',
    domain: 'groups.vz.gay',
    group: 'communication',
    iconName: 'users',
    name: { id: 'VZ Groups', en: 'VZ Groups' },
    reference: {
      id: 'Milis, Forum Diskusi Tim & Manajemen Hak Akses',
      en: 'Mailing Lists, Team Forums & Access Groups',
    },
    description: {
      id: 'Pengelolaan grup diskusi, milis komunitas, dan pengaturan hak akses kolaborasi dokumen tim secara terpusat untuk seluruh layanan di dalam VZ Desk.',
      en: 'Centralized discussion groups, mailing lists, and team document permission management across all VZ Desk applications.',
    },
    formatNote: {
      id: 'Sinkron dengan mail.vz.gay, chat.vz.gay & izin berbagi berkas VZ Desk',
      en: 'Synced with mail.vz.gay, chat.vz.gay & VZ Desk file sharing permissions',
    },
  },
  {
    id: 'desk-contacts',
    domain: 'contacts.vz.gay',
    group: 'communication',
    iconName: 'contact',
    name: { id: 'VZ Contacts', en: 'VZ Contacts' },
    reference: {
      id: 'Buku Alamat & Direktori Kontak (Ekspor/Impor .vcf, .csv, XLSX)',
      en: 'Address Book & Contact Directory (Export/Import .vcf, .csv, XLSX)',
    },
    description: {
      id: 'Buku alamat dan direktori kontak pribadi maupun organisasi berbasis standar terbuka vCard (.vcf) dengan fitur impor/ekspor ke CSV serta XLS/XLSX yang tersinkron dengan VZ Mail & VZ Chat.',
      en: 'Personal and organizational address book built on open vCard (.vcf) standards with CSV and XLS/XLSX import/export, synced across VZ Mail and VZ Chat.',
    },
    formatNote: {
      id: 'Standar terbuka .vcf + ekspor/impor CSV & XLSX · Rencana sinkronisasi NurDB',
      en: 'Open .vcf standard + CSV & XLSX export/import · Planned NurDB directory sync',
    },
  },
];

export function deskToolToService(tool: VzDeskTool): VzService {
  return {
    id: tool.id,
    primaryDomain: tool.domain,
    category: 'productivity',
    status: 'development',
    iconName: tool.iconName,
    name: tool.name,
    shortType: tool.reference,
    description: tool.description,
    architectureNotes: {
      id: `Bagian dari ekosistem VZ Desk (desk.vz.gay). ${tool.formatNote.id}. Mendukung ekspor ke format standar industri & perkantoran (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF, CSV, SVG), autentikasi SSO (accounts.vz.gay), enkripsi offline .enc lewat myvault.app.vz.gay, serta rencana integrasi dengan NurDB (nurdb.vz.gay — Segera Hadir / Belum Tersedia).`,
      en: `Part of the VZ Desk suite (desk.vz.gay). ${tool.formatNote.en}. Supports industry and office file exports (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF, CSV, SVG), Auth0 SSO autosave (accounts.vz.gay), optional offline .enc encryption via myvault.app.vz.gay, and future integration with NurDB (nurdb.vz.gay — Coming Soon / Not Yet Available).`,
    },
    highlights: [
      {
        label: { id: 'Payung Suite', en: 'Parent Suite' },
        value: { id: 'VZ Desk (desk.vz.gay)', en: 'VZ Desk (desk.vz.gay)' },
      },
      {
        label: { id: 'Format & Ekspor', en: 'Formats & Export' },
        value: tool.formatNote,
      },
      {
        label: { id: 'Rencana Integrasi', en: 'Planned Integrations' },
        value: {
          id: 'MyVault (.enc) · VZ Media · NurDB (nurdb.vz.gay — Segera Hadir)',
          en: 'MyVault (.enc) · VZ Media · NurDB (nurdb.vz.gay — Coming Soon)',
        },
      },
    ],
  };
}

export const VZ_SERVICES: VzService[] = [
  {
    id: 'search',
    primaryDomain: 'search.vz.gay',
    category: 'productivity',
    status: 'live',
    iconName: 'search',
    name: {
      id: 'VZ Search',
      en: 'VZ Search',
    },
    shortType: {
      id: 'Mesin Pencari Web',
      en: 'Web Search Engine',
    },
    description: {
      id: 'Mesin pencari web utama di ekosistem vz.gay untuk menelusuri informasi dan layanan lintas web secara cepat.',
      en: 'Primary web search engine in the vz.gay ecosystem for fast discovery across the open web and network services.',
    },
    architectureNotes: {
      id: 'Sudah aktif dan terhubung langsung dengan bilah pencarian utama di halaman beranda vz.gay.',
      en: 'Live in production and integrated directly with the main search bar on the vz.gay home portal.',
    },
  },
  {
    id: 'files',
    primaryDomain: 'files.vz.gay',
    altDomains: ['file.vz.gay'],
    category: 'productivity',
    status: 'live',
    iconName: 'file-up',
    name: {
      id: 'VZ Files',
      en: 'VZ Files',
    },
    shortType: {
      id: 'Transfer File Sementara',
      en: 'Ephemeral File Transfer',
    },
    description: {
      id: 'Layanan berbagi dan transfer file sementara menggunakan API VikingFiles tanpa menyimpan berkas di server vz.gay.',
      en: 'Temporary file transfer powered by the VikingFiles API without storing user files on vz.gay servers.',
    },
    architectureNotes: {
      id: 'Sudah aktif dengan URL kanonik SEO https://files.vz.gay dan alias file.vz.gay. Seluruh unggahan ditangani melalui API VikingFiles tanpa penyimpanan server.',
      en: 'Live with SEO canonical https://files.vz.gay and alias file.vz.gay. All uploads are delegated cleanly to the VikingFiles API with zero server storage.',
    },
  },
  {
    id: 'demo-jajanan',
    primaryDomain: 'demo.jajanan.online',
    category: 'developer_cloud',
    secondaryCategories: ['web_business'],
    status: 'live',
    iconName: 'store',
    name: {
      id: 'SkripX Marketplace & Reseller Code',
      en: 'SkripX Marketplace & Reseller Code',
    },
    shortType: {
      id: 'Source Code Self-Hosted Marketplace & SaaS Reseller',
      en: 'Self-Hosted Marketplace & SaaS Reseller Code',
    },
    description: {
      id: 'Source code platform marketplace & portal reseller multi-tenant siap Self-Hosted (termasuk layanan pengecekan dokumen & kemiripan AI). Menggunakan domain tunggal demo.jajanan.online untuk edisi kode mandiri, sedangkan *.jajanan.online dialokasikan khusus untuk edisi SaaS.',
      en: 'Self-hosted multi-tenant marketplace and reseller portal source code (featuring document checking & AI similarity business modules). Hosted on the single domain demo.jajanan.online for the self-hosted code edition, while *.jajanan.online is reserved for the SaaS edition.',
    },
    clientDomainPatterns: ['demo.jajanan.online'],
    sponsor: 'jajanserver.com',
    architectureNotes: {
      id: 'Ditampilkan pada kategori Developer & Cloud (Codeplace) sekaligus Web & Bisnis. Hanya memiliki 1 domain demo resmi (demo.jajanan.online) untuk paket kode self-hosting, terpisah dari domain wildcard *.jajanan.online milik versi SaaS.',
      en: 'Indexed under both Developer & Cloud (Codeplace) and Web & Business. Uses the single dedicated domain demo.jajanan.online for self-hosted code buyers, distinct from the *.jajanan.online wildcard used by the managed SaaS platform.',
    },
  },
  {
    id: 'omnipostai',
    primaryDomain: 'omnipostai.code.vz.gay',
    category: 'developer_cloud',
    secondaryCategories: ['web_business'],
    status: 'live',
    iconName: 'sparkles',
    name: {
      id: 'OmniPost AI',
      en: 'OmniPost AI',
    },
    shortType: {
      id: 'Otomasi Konten & Penerbitan Multi-Kanal AI',
      en: 'AI Multi-Channel Content & Publishing Suite',
    },
    description: {
      id: 'Platform otomasi pembuatan konten, penjadwalan, dan penerbitan lintas kanal berbasis kecerdasan buatan yang berjalan aktif di bawah ekosistem Codeplace (*.code.vz.gay).',
      en: 'AI-driven content creation, scheduling, and multi-channel publishing platform live under the Codeplace (*.code.vz.gay) ecosystem.',
    },
    architectureNotes: {
      id: 'Sudah aktif dan dapat diakses langsung melalui omnipostai.code.vz.gay.',
      en: 'Live and directly accessible at omnipostai.code.vz.gay.',
    },
  },
  {
    id: 'lovelogicalai',
    primaryDomain: 'lovelogicalai.kopi.pw',
    altDomains: ['lovelogicalai.pages.dev'],
    launchUrl: 'https://lovelogicalai.pages.dev',
    category: 'media_content',
    secondaryCategories: ['developer_cloud'],
    status: 'live',
    iconName: 'heart-handshake',
    name: {
      id: 'LoveLogical AI',
      en: 'LoveLogical AI',
    },
    shortType: {
      id: 'Aplikasi Web Analisis Relasi & Logika AI',
      en: 'AI Relationship & Logic Analysis Web App',
    },
    description: {
      id: 'Aplikasi web interaktif berbasis AI untuk eksplorasi perspektif komunikasi, kompatibilitas, dan penalaran logis dalam dinamika relasi.',
      en: 'Interactive AI-powered web application exploring communication dynamics, compatibility insights, and logical reasoning in relationships.',
    },
    architectureNotes: {
      id: 'Tersedia melalui domain klien lovelogicalai.kopi.pw serta mirror aktif lovelogicalai.pages.dev.',
      en: 'Available across client domain lovelogicalai.kopi.pw and active mirror lovelogicalai.pages.dev.',
    },
  },
  {
    id: 'wiyataxlms',
    primaryDomain: 'wiyataxlms.code.vz.gay',
    altDomains: ['wiyataxlms.orgz.top'],
    category: 'education',
    status: 'live',
    iconName: 'graduation-cap',
    name: {
      id: 'WiyataxLMS',
      en: 'WiyataxLMS',
    },
    shortType: {
      id: 'Portal Akademik & LMS Multi-Tenant',
      en: 'Multi-Tenant Academic Portal & LMS',
    },
    description: {
      id: 'Template portal akademik & sistem manajemen pembelajaran (LMS) white-label multi-tenant siap Self-Hosted maupun SaaS Cloud dengan modul PPDB Online, Rapor Digital, Portal Siswa, CMS, AI FAQ, dan Open API.',
      en: 'Multi-tenant white-label academic portal & LMS platform ready for Self-Hosted or SaaS Cloud with Online Admissions (PPDB), Digital Gradebook, Student Portal, Theme Studio, AI FAQ, and Open API.',
    },
    architectureNotes: {
      id: 'Demo aktif di *.code.vz.gay dengan domain alias wiyataxlms.orgz.top.',
      en: 'Active demo service under *.code.vz.gay with live alias domain wiyataxlms.orgz.top.',
    },
  },
  {
    id: 'marimenulis',
    primaryDomain: 'marimenulis.web.id',
    launchUrl: 'https://www.marimenulis.web.id/',
    category: 'education',
    status: 'live',
    iconName: 'feather',
    name: {
      id: 'Mari Menulis',
      en: 'Mari Menulis',
    },
    shortType: {
      id: 'Platform Literasi & Kepenulisan',
      en: 'Writing & Literacy Portal',
    },
    description: {
      id: 'Platform ekosistem edukasi dan literasi kepenulisan Indonesia. Saat ini sudah online pada tahap awal (rilis fondasi 0) dan terus dikembangkan secara bertahap.',
      en: 'Indonesian writing and digital literacy ecosystem platform. Live in its initial foundation stage (release 0) with ongoing editorial expansion.',
    },
    architectureNotes: {
      id: 'Tersedia di marimenulis.web.id (www.marimenulis.web.id) sebagai bagian dari ekosistem edukasi dan literasi vz.gay.',
      en: 'Live at marimenulis.web.id (www.marimenulis.web.id) as part of the vz.gay education and literacy network.',
    },
  },
  {
    id: 'republikjomokerto',
    primaryDomain: 'republikjomokerto.vercel.app',
    category: 'media_content',
    status: 'live',
    iconName: 'smile',
    name: {
      id: 'Republik Jomokerto',
      en: 'Republik Jomokerto',
    },
    shortType: {
      id: 'Portal Komunitas Hiburan',
      en: 'Community & Entertainment Portal',
    },
    description: {
      id: 'Portal warga & komunitas hiburan Republik Jomokerto dengan Kartu Tanda Penjomok (KTP), link-in-bio, timeline teks dan gambar, chat real-time, serta peta hybrid Ngawi dan dunia game.',
      en: 'Republik Jomokerto entertainment community portal featuring digital citizen cards (KTP), link-in-bio, text/image timeline, real-time chat, and hybrid maps.',
    },
    architectureNotes: {
      id: 'Sudah aktif dan dapat langsung diakses di republikjomokerto.vercel.app.',
      en: 'Live and directly accessible at republikjomokerto.vercel.app.',
    },
  },
  {
    id: 'desk',
    primaryDomain: 'desk.vz.gay',
    category: 'productivity',
    status: 'development',
    iconName: 'briefcase',
    name: {
      id: 'VZ Desk',
      en: 'VZ Desk',
    },
    shortType: {
      id: 'Suite Produktivitas & Kreatif (17 Layanan)',
      en: 'Productivity & Creative Suite (17 Apps)',
    },
    description: {
      id: 'Meja kerja digital terpadu (Docs, Sheets, Presentations, Craft 3D, Design, Motion, Draw, Forms, Math, Ekonometrics, Metrics, Diary, Press, Flowcharts, Chat, Groups, Contacts) berbasis penyimpanan teks polos yang ringan dengan dukungan ekspor penuh ke format dokumen perkantoran (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF, CSV, SVG, OBJ, VCF).',
      en: 'Unified cloud workspace uniting 17 productivity, creative, analytics, and communication tools built on lightweight plain-text storage with full export compatibility for standard office formats (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF, CSV, SVG, OBJ, VCF).',
    },
    clientDomainPatterns: [
      'docs.vz.gay',
      'sheets.vz.gay',
      'presentations.vz.gay',
      'craft.vz.gay',
      'design.vz.gay',
      'motion.vz.gay',
      'draw.vz.gay',
      'forms.vz.gay',
      'math.vz.gay',
      'ekonometrics.vz.gay',
      'metrics.vz.gay',
      'diary.vz.gay',
      'press.vz.gay',
      'flowcharts.vz.gay',
      'chat.vz.gay',
      'groups.vz.gay',
      'contacts.vz.gay',
    ],
    architectureNotes: {
      id: 'Menyimpan berkas sumber secara hemat ruang (.md, .csv, .svg, .typ, .vcf) dengan konversi ekspor/impor ke format dokumen kantor (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF), kompresi media WebP/AVIF, cloud autosave lewat accounts.vz.gay, opsi enkripsi offline .enc menggunakan myvault.app.vz.gay, serta rencana integrasi dengan NurDB (Segera Hadir / Belum Tersedia).',
      en: 'Stores compact plain-text source files (.md, .csv, .svg, .typ, .vcf) with seamless export/import for office document formats (DOC/DOCX, XLS/XLSX, PPT/PPTX, PDF), WebP/AVIF media compression, accounts.vz.gay SSO autosave, offline .enc encryption via myvault.app.vz.gay, and future integration with NurDB (Coming Soon / Not Yet Available).',
    },
    highlights: [
      {
        label: { id: 'Ekspor Format Kantor & Standar', en: 'Office & Open Format Exports' },
        value: {
          id: 'DOC/DOCX · XLS/XLSX · PPT/PPTX · PDF · CSV · SVG · OBJ · VCF · WebP/AVIF',
          en: 'DOC/DOCX · XLS/XLSX · PPT/PPTX · PDF · CSV · SVG · OBJ · VCF · WebP/AVIF',
        },
      },
      {
        label: { id: 'Mode Web & Offline (.enc)', en: 'Web & Offline Modes (.enc)' },
        value: {
          id: 'Autosave SSO di browser + kontainer terenkripsi AES .enc via myvault.app.vz.gay',
          en: 'Browser SSO autosave + encrypted .enc containers via myvault.app.vz.gay',
        },
      },
      {
        label: { id: 'Integrasi Ekosistem', en: 'Ecosystem Integration' },
        value: {
          id: 'Terhubung ke mail.vz.gay & media.vz.gay · Rencana konektor nurdb.vz.gay (Segera Hadir)',
          en: 'Connected to mail.vz.gay & media.vz.gay · Planned nurdb.vz.gay connector (Coming Soon)',
        },
      },
    ],
  },
  {
    id: 'app',
    primaryDomain: 'app.vz.gay',
    category: 'productivity',
    status: 'development',
    iconName: 'layout-grid',
    name: {
      id: 'VZ App Hub',
      en: 'VZ App Hub',
    },
    shortType: {
      id: 'Peluncur Aplikasi',
      en: 'App Workspace',
    },
    description: {
      id: 'Pusat aplikasi web terpadu untuk mengelola ruang kerja, utilitas harian, dan integrasi akun terpusat.',
      en: 'Unified web application launcher for managing daily workspaces, utilities, and central account integrations.',
    },
    architectureNotes: {
      id: 'Saat ini sedang dalam pengembangan aktif dan akan terhubung ke SSO accounts.vz.gay.',
      en: 'Currently under active development and will integrate directly with accounts.vz.gay SSO.',
    },
  },
  {
    id: 'mail',
    primaryDomain: 'mail.vz.gay',
    category: 'productivity',
    status: 'development',
    iconName: 'mail',
    name: {
      id: 'VZ Mail',
      en: 'VZ Mail',
    },
    shortType: {
      id: 'Email Privat Antarmuka Percakapan',
      en: 'Offline-First Conversational Email',
    },
    description: {
      id: 'Klien surat elektronik dengan tampilan gelembung percakapan cepat yang terhubung dengan chat.vz.gay. Data disimpan lokal di perangkat tanpa retensi kotak surat di server.',
      en: 'Email client with a fast conversational bubble interface connected to chat.vz.gay. Messages live locally on your device with zero server mailbox retention.',
    },
    architectureNotes: {
      id: 'Privasi maksimal tanpa penyimpanan email di server. Sinkronisasi antar perangkat dilakukan melalui fitur ekspor & impor berkas cadangan terenkripsi (.eml, .mbox, .enc).',
      en: 'Privacy-first local-device architecture: zero server mailbox storage; cross-device sync works via export/import backup files (.eml, .mbox, .enc).',
    },
  },
  {
    id: 'builder',
    primaryDomain: 'builder.cloud.vz.gay',
    category: 'web_business',
    status: 'development',
    iconName: 'globe',
    name: {
      id: 'VZ Web Builder',
      en: 'VZ Web Builder',
    },
    shortType: {
      id: 'Website Builder',
      en: 'Website Builder',
    },
    description: {
      id: 'Pembuat situs web instan berbasis cloud dengan penerbitan cepat dan dukungan banyak subdomain klien.',
      en: 'Cloud-powered website builder with rapid publishing and multi-domain client routing.',
    },
    clientDomainPatterns: [
      '*.orgz.top',
      '*.kopi.pw',
      '*.jajanan.online',
      '*.web.vz.gay',
      '*.site.vz.gay',
    ],
    liveChildren: [
      {
        name: 'LoveLogical AI',
        domain: 'lovelogicalai.kopi.pw',
        altDomain: 'lovelogicalai.pages.dev',
        kind: 'app',
        description: {
          id: 'Aplikasi web interaktif analisis relasi & penalaran logis berbasis AI',
          en: 'Interactive AI relationship dynamics and logical reasoning web app',
        },
      },
    ],
    architectureNotes: {
      id: 'Menargetkan publikasi situs statis dan dinamis secara instan dengan opsi domain kustom klien yang beragam.',
      en: 'Designed to publish static and dynamic sites rapidly with flexible client subdomain choices.',
    },
  },
  {
    id: 'go-blog',
    primaryDomain: 'go-blog.vz.gay',
    altDomains: ['goblog.vz.gay'],
    category: 'web_business',
    status: 'development',
    iconName: 'pen-line',
    name: {
      id: 'Go-Blog',
      en: 'Go-Blog',
    },
    shortType: {
      id: 'Platform Penerbitan Blog & Artikel',
      en: 'Blog & Article Publishing Platform',
    },
    description: {
      id: 'Platform penerbitan blog dan manajemen artikel modern dengan editor Markdown/WYSIWYG, umpan RSS otomatis, ekspor arsip tulisan, serta dukungan subdomain penulis khusus.',
      en: 'Modern blog and article publishing platform featuring Markdown/rich-text editing, automatic RSS feeds, content export archives, and dedicated writer subdomains.',
    },
    clientDomainPatterns: ['*.kaca.blog', '*.blog.vz.gay'],
    redirectRules: [
      { from: 'kaca.blog', to: 'https://go-blog.vz.gay', code: 301 },
      { from: 'blog.vz.gay', to: 'https://goblog.vz.gay', code: 301 },
    ],
    architectureNotes: {
      id: 'Domain root kaca.blog dan blog.vz.gay diarahkan permanen (HTTP 301) menuju go-blog.vz.gay dan goblog.vz.gay.',
      en: 'Root domains kaca.blog and blog.vz.gay perform a permanent HTTP 301 redirect to go-blog.vz.gay and goblog.vz.gay.',
    },
  },
  {
    id: 'business',
    primaryDomain: 'business.vz.gay',
    category: 'web_business',
    status: 'development',
    iconName: 'store',
    name: {
      id: 'VZ Business',
      en: 'VZ Business',
    },
    shortType: {
      id: 'Generator Marketplace & Toko SaaS',
      en: 'SaaS Marketplace & Storefront Generator',
    },
    description: {
      id: 'Generator marketplace dan etalase toko online SaaS siap pakai bagi pelaku usaha dengan subdomain bisnis instan (*.jajanan.online, *.biz.orgz.top, *.biz.vz.gay), dilengkapi opsi paket source code self-hosted di demo.jajanan.online.',
      en: 'Turnkey SaaS marketplace and online storefront generator for merchants with instant business subdomains (*.jajanan.online, *.biz.orgz.top, *.biz.vz.gay), complemented by a self-hosted code edition at demo.jajanan.online.',
    },
    clientDomainPatterns: [
      '*.jajanan.online',
      '*.biz.orgz.top',
      '*.biz.vz.gay',
    ],
    liveChildren: [
      {
        name: 'SkripX Self-Hosted Marketplace Demo',
        domain: 'demo.jajanan.online',
        kind: 'demo',
        description: {
          id: 'Demo tunggal source code marketplace & portal reseller self-hosted (edisi SaaS menggunakan *.jajanan.online)',
          en: 'Single-domain demo for the self-hosted marketplace & reseller portal code (SaaS edition uses *.jajanan.online)',
        },
      },
    ],
    sponsor: 'jajanserver.com',
    architectureNotes: {
      id: 'Didukung dan disponsori oleh jajanserver.com. Domain wildcard *.jajanan.online digunakan untuk tenant versi SaaS, sedangkan domain tunggal demo.jajanan.online dikhususkan untuk demo source code self-hosting.',
      en: 'Supported and sponsored by jajanserver.com. Wildcard *.jajanan.online powers multi-tenant SaaS storefronts, while the single domain demo.jajanan.online showcases the self-hosted source code package.',
    },
  },
  {
    id: 'pay',
    primaryDomain: 'pay.vz.gay',
    category: 'web_business',
    status: 'development',
    iconName: 'credit-card',
    name: {
      id: 'VZ Pay',
      en: 'VZ Pay',
    },
    shortType: {
      id: 'Gerbang Pembayaran & Transaksi',
      en: 'Payment & Checkout Gateway',
    },
    description: {
      id: 'Layanan pembayaran digital, faktur otomatis, dan manajemen transaksi terpadu untuk layanan vz.gay serta toko klien dengan ekspor mutasi CSV/XLSX.',
      en: 'Unified digital payment, automated invoicing, and transaction management service for vz.gay tools and merchant storefronts with CSV/XLSX ledger exports.',
    },
    architectureNotes: {
      id: 'Saat ini sedang dalam pengembangan dan akan terhubung dengan business.vz.gay serta SSO accounts.vz.gay.',
      en: 'Currently in development and designed to integrate with business.vz.gay and accounts.vz.gay SSO.',
    },
  },
  {
    id: 'links',
    primaryDomain: 'links.vz.gay',
    category: 'web_business',
    status: 'development',
    iconName: 'link-2',
    name: {
      id: 'VZ Links',
      en: 'VZ Links',
    },
    shortType: {
      id: 'SaaS Link-in-Bio & Pemendek Tautan',
      en: 'Link-in-Bio & URL Shortener',
    },
    description: {
      id: 'Platform SaaS untuk membuat halaman tautan profil (link-in-bio), pemendek URL cepat, pembuatan kode QR, dan statistik klik terintegrasi.',
      en: 'SaaS platform for customizable link-in-bio pages, fast short URLs, QR generation, and integrated click statistics.',
    },
    architectureNotes: {
      id: 'Dapat dihubungkan dengan analitik metrics.vz.gay serta halaman profil publik profile.vz.gay/$USERNAME.',
      en: 'Connects cleanly with metrics.vz.gay analytics and public pages on profile.vz.gay/$USERNAME.',
    },
  },
  {
    id: 'ads',
    primaryDomain: 'ads.vz.gay',
    category: 'web_business',
    status: 'development',
    iconName: 'megaphone',
    name: {
      id: 'VZ Ads',
      en: 'VZ Ads',
    },
    shortType: {
      id: 'Jaringan Periklanan & Monetisasi Penerbit',
      en: 'Publisher Ad & Monetization Network',
    },
    description: {
      id: 'Jaringan monetisasi tampilan iklan kontekstual dan manajemen kampanye mandiri bagi penerbit situs, blog, serta aplikasi di ekosistem vz.gay.',
      en: 'Contextual display advertising and self-serve campaign monetization network for web publishers, blogs, and applications across the vz.gay ecosystem.',
    },
    architectureNotes: {
      id: 'Terintegrasi dengan pelaporan performa di metrics.vz.gay dan pencairan pendapatan melalui pay.vz.gay.',
      en: 'Designed to integrate with metrics.vz.gay performance reporting and payouts through pay.vz.gay.',
    },
  },
  {
    id: 'nurdb',
    primaryDomain: 'nurdb.vz.gay',
    category: 'developer_cloud',
    status: 'coming_soon',
    iconName: 'database',
    name: {
      id: 'NurDB',
      en: 'NurDB',
    },
    shortType: {
      id: 'Native Universal Rapid Databases (Segera Hadir / Belum Tersedia)',
      en: 'Native Universal Rapid Databases (Coming Soon / Not Yet Available)',
    },
    description: {
      id: '[SEGERA HADIR — BELUM TERSEDIA] Native Universal Rapid Databases — terinspirasi dari makna "Nur" (cahaya), rancangan basis data multi-model (Dokumen JSON + Relasional) berkecepatan tinggi dalam satu kontainer portabel (.nur) untuk self-host maupun managed cloud di masa mendatang.',
      en: '[COMING SOON — NOT YET AVAILABLE] Native Universal Rapid Databases — inspired by "Nur" (light), a planned high-velocity multi-model database engine (JSON Document + Relational) packaged in a single portable .nur vault for future self-hosted and managed cloud deployments.',
    },
    clientDomainPatterns: [
      'nurdb.vz.gay/docs',
      'cloud.vz.gay/nurdb',
      'cloud.vz.gay/console/nurdb',
      '[vault-id]-nurdb.vz.gay',
      'nurdb.vz.gay/v1/[vault-id]',
    ],
    architectureNotes: {
      id: 'STATUS: SEGERA HADIR (COMING SOON — belum tersedia dan belum masuk tahap rilis pengembangan publik). Cetak biru arsitektur mencakup dokumen JSON fleksibel (Schema-on-Read), pemodelan relasi visual antartabel, isolasi multi-vault .nur per proyek, instant CoW branching, sinkronisasi local-first, TTL ephemeral micro-DB, ekspor/impor CSV/JSON/SQL, serta rencana Fase 3 Polymorphic Query Engine.',
      en: 'STATUS: COMING SOON (not yet available and not yet in active public development release). Architectural blueprint covers schemaless JSON documents, visual relational modeling, isolated per-project multi-vault .nur packaging, instant CoW branching, local-first sync, TTL ephemeral micro-DBs, CSV/JSON/SQL import-export, and a Phase 3 Polymorphic Query Engine.',
    },
    highlights: [
      {
        label: { id: 'Status Ketersediaan', en: 'Availability Status' },
        value: {
          id: 'Segera Hadir (Coming Soon) — Saat ini belum tersedia; masih berupa rancangan arsitektur masa depan ekosistem vz.gay',
          en: 'Coming Soon — Not yet available; currently an upcoming architectural blueprint for the vz.gay ecosystem',
        },
      },
      {
        label: { id: 'Rancangan NURDB Studio', en: 'Planned NURDB Studio' },
        value: {
          id: 'Grids (Tables) · Synapse (Relations) · Lenses (Queries) · Portals (Forms) · Canvas (Reports) · Flows (Triggers)',
          en: 'Grids (Tables) · Synapse (Relations) · Lenses (Queries) · Portals (Forms) · Canvas (Reports) · Flows (Triggers)',
        },
      },
      {
        label: { id: 'Target Inovasi Inti', en: 'Planned Core Innovations' },
        value: {
          id: 'Instant Branching (<50ms) · Bundel Portabel .nur (Data + UI + Logic) · Ekspor CSV/JSON/XLSX · Auto-Expire TTL Vaults',
          en: 'Instant Branching (<50ms) · Portable .nur Bundles (Data + UI + Logic) · CSV/JSON/XLSX Export · Auto-Expire TTL Vaults',
        },
      },
      {
        label: { id: 'Rencana Keamanan Fase 3', en: 'Phase 3 Security Blueprint' },
        value: {
          id: 'Polymorphic Query Engine dengan Custom Dictionary / Tokenizer per-tenant (C/Rust/LLVM)',
          en: 'Polymorphic Query Engine with per-tenant Custom Dictionary / Tokenizer (C/Rust/LLVM)',
        },
      },
    ],
  },
  {
    id: 'codeplace',
    primaryDomain: 'codeplace.vz.gay',
    category: 'developer_cloud',
    status: 'development',
    iconName: 'code-2',
    name: {
      id: 'Codeplace',
      en: 'Codeplace',
    },
    shortType: {
      id: 'Katalog Source Code & Template Aplikasi',
      en: 'Source Code & App Template Marketplace',
    },
    description: {
      id: 'Pusat distribusi template aplikasi dan source code siap pakai berbasis Node.js, TypeScript, PHP, hingga aplikasi Android Kotlin yang masing-masing dilengkapi demo aktif langsung.',
      en: 'Source code and application template marketplace for Node.js, TypeScript, PHP, and Kotlin Android projects, each paired with a live interactive preview.',
    },
    clientDomainPatterns: ['*.code.vz.gay', 'demo.jajanan.online'],
    liveChildren: [
      {
        name: 'Lensa Studio',
        domain: 'lensastudio.code.vz.gay',
        kind: 'demo',
        description: {
          id: 'Demo aplikasi & showcase template kreatif aktif',
          en: 'Live creative studio application & template showcase',
        },
      },
      {
        name: 'WiyataxLMS',
        domain: 'wiyataxlms.code.vz.gay',
        altDomain: 'wiyataxlms.orgz.top',
        kind: 'demo',
        description: {
          id: 'Portal akademik & LMS white-label multi-tenant (PPDB Online, Rapor, CMS, AI FAQ, Open API)',
          en: 'Multi-tenant white-label academic portal & LMS (Online PPDB, Gradebook, CMS, AI FAQ, Open API)',
        },
      },
      {
        name: 'OmniPost AI',
        domain: 'omnipostai.code.vz.gay',
        kind: 'demo',
        description: {
          id: 'Platform otomasi konten & penerbitan multi-kanal berbasis AI',
          en: 'AI-powered multi-channel content creation & publishing platform',
        },
      },
      {
        name: 'SkripX Marketplace Code',
        domain: 'demo.jajanan.online',
        kind: 'demo',
        description: {
          id: 'Source code self-hosted marketplace & portal reseller multi-tenant (1 domain demo khusus kode mandiri)',
          en: 'Self-hosted multi-tenant marketplace & reseller portal code (single dedicated demo domain)',
        },
      },
    ],
    architectureNotes: {
      id: 'Setiap paket kode atau template aplikasi memiliki lingkungan pratinjau langsung di bawah *.code.vz.gay atau domain demo khusus seperti demo.jajanan.online.',
      en: 'Every template or self-hosted code package includes a live preview environment under *.code.vz.gay or dedicated demo hostnames such as demo.jajanan.online.',
    },
  },
  {
    id: 'cloud',
    primaryDomain: 'cloud.vz.gay',
    category: 'developer_cloud',
    status: 'coming_soon',
    iconName: 'cloud',
    name: {
      id: 'VZ Cloud',
      en: 'VZ Cloud',
    },
    shortType: {
      id: 'Layanan Infrastruktur Cloud (Segera Hadir)',
      en: 'Cloud Infrastructure (Coming Soon)',
    },
    description: {
      id: '[SEGERA HADIR] Payung layanan komputasi, hosting aplikasi, konsol manajemen proyek (cloud.vz.gay/console), dan rencana Managed NurDB Cloud.',
      en: '[COMING SOON] Managed cloud umbrella for compute, app hosting, centralized project console (cloud.vz.gay/console), and future Managed NurDB Cloud.',
    },
    clientDomainPatterns: ['cloud.vz.gay/nurdb', 'cloud.vz.gay/console/nurdb'],
    sponsor: 'jajanserver.com',
    architectureNotes: {
      id: 'Berstatus Segera Hadir (Coming Soon) melalui kolaborasi infrastruktur bersama sponsor jajanserver.com.',
      en: 'Status: Coming Soon in infrastructure partnership with sponsor jajanserver.com.',
    },
  },
  {
    id: 'platform',
    primaryDomain: 'platform.vz.gay',
    category: 'developer_cloud',
    status: 'development',
    iconName: 'webhook',
    name: {
      id: 'VZ Platform API',
      en: 'VZ Platform API',
    },
    shortType: {
      id: 'Gerbang REST API & Webhook',
      en: 'REST API & Webhook Gateway',
    },
    description: {
      id: 'Dokumentasi pengembang (OpenAPI/JSON), manajemen kunci akses, dan endpoint REST API terpadu untuk mengintegrasikan seluruh layanan vz.gay.',
      en: 'Developer documentation (OpenAPI/JSON), access key management, and unified REST API endpoints connecting the vz.gay ecosystem.',
    },
    architectureNotes: {
      id: 'Menyediakan endpoint REST API standar dengan pertukaran payload JSON dan skema OpenAPI.',
      en: 'Provides standard REST API endpoints with JSON payload exchange and OpenAPI schema exports.',
    },
  },
  {
    id: 'tools',
    primaryDomain: 'tools.vz.gay',
    category: 'developer_cloud',
    status: 'development',
    iconName: 'wrench',
    name: {
      id: 'VZ Dev Tools',
      en: 'VZ Dev Tools',
    },
    shortType: {
      id: 'Utilitas Publik Developer & Konverter Format',
      en: 'Public Developer Utilities & Format Converters',
    },
    description: {
      id: 'Kumpulan alat bantu publik serbaguna untuk developer (formatter JSON/YAML/SQL, encoder/decoder, validator, inspektor payload, serta konverter dokumen & tabel CSV/JSON/XLSX cepat).',
      en: 'Collection of fast public developer utilities including JSON/YAML/SQL formatters, encoders, validators, payload inspectors, and quick CSV/JSON/XLSX format converters.',
    },
    architectureNotes: {
      id: 'Dirancang berjalan ringan langsung di browser agar instan dipakai tanpa login wajib.',
      en: 'Designed to run lightweight directly in the browser for instant access without friction.',
    },
  },
  {
    id: 'ai',
    primaryDomain: 'ai.vz.gay',
    category: 'developer_cloud',
    status: 'development',
    iconName: 'sparkles',
    name: {
      id: 'VZ AI',
      en: 'VZ AI',
    },
    shortType: {
      id: 'Ruang Kerja Kecerdasan Buatan',
      en: 'AI Tools & Workspace',
    },
    description: {
      id: 'Rangkaian alat bantu kecerdasan buatan untuk produktivitas penulisan, ringkasan dokumen (DOCX/PDF/MD), analisis data tabel (CSV/XLSX), dan otomasi alur kerja lintas VZ Desk.',
      en: 'Focused AI workspace for writing assistance, document summarization (DOCX/PDF/MD), tabular data analysis (CSV/XLSX), and workflow automation across VZ Desk.',
    },
  },
  {
    id: 'play',
    primaryDomain: 'play.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'gamepad-2',
    name: {
      id: 'VZ Play',
      en: 'VZ Play',
    },
    shortType: {
      id: 'Pusat Game & Aplikasi Web',
      en: 'Games & Web Apps Hub',
    },
    description: {
      id: 'Direktori game ringan dan aplikasi utilitas web interaktif. Beberapa aplikasi dan game sudah aktif dan dapat langsung digunakan sekarang.',
      en: 'Hub for browser games and interactive web utilities. Several standalone apps and games are already live today.',
    },
    clientDomainPatterns: ['*.game.vz.gay', '*.app.vz.gay'],
    liveChildren: [
      {
        name: 'MyVault',
        domain: 'myvault.app.vz.gay',
        kind: 'app',
        description: {
          id: 'Aplikasi penyimpanan catatan & mesin enkripsi berkas .enc (CipherVaultPro)',
          en: 'Personal vault and .enc file encryption engine (CipherVaultPro)',
        },
      },
      {
        name: 'PDF to Blade',
        domain: 'pdftoblade.app.vz.gay',
        kind: 'app',
        description: {
          id: 'Konversi dokumen PDF ke sintaks template HTML/Blade secara cepat',
          en: 'Fast PDF document to HTML/Blade template converter',
        },
      },
      {
        name: 'DirectQR',
        domain: 'directqr.app.vz.gay',
        kind: 'app',
        description: {
          id: 'Generator kode QR instan (ekspor PNG/SVG) tanpa perantara pelacakan',
          en: 'Instant direct QR code generator (PNG/SVG export) without tracking hops',
        },
      },
      {
        name: 'InkFrame Flipbook',
        domain: 'inkframeflipbook.game.vz.gay',
        altDomain: 'flipbook.semangatliterasi.orgz.top',
        kind: 'game',
        description: {
          id: 'Pengalaman flipbook interaktif & literasi digital',
          en: 'Interactive digital flipbook and storytelling game',
        },
      },
    ],
    architectureNotes: {
      id: 'Memisahkan namespace *.game.vz.gay untuk game dan *.app.vz.gay untuk aplikasi utilitas web non-game.',
      en: 'Separates *.game.vz.gay for games and *.app.vz.gay for non-game web utilities.',
    },
  },
  {
    id: 'wonderplace',
    primaryDomain: 'wonderplace.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'heart-handshake',
    name: {
      id: 'Wonderplace',
      en: 'Wonderplace',
    },
    shortType: {
      id: 'Jejaring Sosial Ruang Aman & Inklusif',
      en: 'Inclusive Safe-Space Social Network',
    },
    description: {
      id: 'Platform jejaring sosial komunitas sebagai ruang aman inklusif berlandaskan humanisme universal, kesetaraan, dan penghormatan martabat manusia sesuai dengan ToS TLD .gay.',
      en: 'Community social networking platform built as an inclusive safe space rooted in universal humanism, equality, and human dignity in full alignment with .gay TLD Terms of Service.',
    },
    architectureNotes: {
      id: 'Dikelola dengan moderasi komunitas aktif untuk menjaga ruang interaksi yang aman, setara, dan bebas ujaran kebencian sesuai kebijakan TLD .gay.',
      en: 'Operated with active community moderation to uphold an inclusive, harassment-free environment aligned with .gay TLD policy.',
    },
  },
  {
    id: 'film',
    primaryDomain: 'film.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'film',
    name: {
      id: 'VZ Film',
      en: 'VZ Film',
    },
    shortType: {
      id: 'Basis Data & Ensiklopedia Sinema',
      en: 'Cinema & Film Reference Database',
    },
    description: {
      id: 'Direktori referensi film, serial, profil pemeran, kru produksi, sinopsis, serta ulasan dan penilaian kurasi komunitas.',
      en: 'Comprehensive reference database for movies, series, cast and crew credits, synopses, and community reviews.',
    },
  },
  {
    id: 'music',
    primaryDomain: 'music.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'music',
    name: {
      id: 'VZ Music Library',
      en: 'VZ Music Library',
    },
    shortType: {
      id: 'Pustaka Lirik, Kredit & Makna Lagu',
      en: 'Lyrics, Credits & Song Meanings Library',
    },
    description: {
      id: 'Pustaka referensi musik untuk menelusuri teks lirik, kredit pencipta lagu, metadata rilisan, dan anotasi makna lagu—bukan layanan pemutar audio streaming.',
      en: 'Curated music reference library for exploring song lyrics, composer credits, release metadata, and lyrical interpretations—not an audio streaming player.',
    },
    architectureNotes: {
      id: 'Berfokus murni pada pengarsipan teks lirik, struktur kredit karya, dan bedah makna lagu tanpa distribusi berkas audio streaming.',
      en: 'Focused strictly on lyrical text archives, songwriting credits, and meaning annotations without audio streaming playback.',
    },
  },
  {
    id: 'photo',
    primaryDomain: 'photo.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'image',
    name: {
      id: 'VZ Photo',
      en: 'VZ Photo',
    },
    shortType: {
      id: 'Papan Inspirasi Visual & Hosting Gambar Publik',
      en: 'Visual Moodboards & Public Image Hosting',
    },
    description: {
      id: 'Platform ganda 2-in-1 untuk menyusun papan kurasi inspirasi visual sekaligus layanan hosting tautan gambar publik yang cepat dan ringan (mendukung WebP, AVIF, PNG, JPG).',
      en: '2-in-1 visual discovery moodboard and fast public image hosting service supporting optimized WebP, AVIF, PNG, and JPG delivery.',
    },
    architectureNotes: {
      id: 'Aset visual publik dioptimalkan dengan kompresi WebP/AVIF untuk pemuatan gambar berkecepatan tinggi dan penyematan lintas dokumen.',
      en: 'Public visual uploads are optimized with WebP/AVIF compression for high-speed delivery and direct document embedding.',
    },
  },
  {
    id: 'comic',
    primaryDomain: 'comic.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'layers',
    name: {
      id: 'VZ Comic',
      en: 'VZ Comic',
    },
    shortType: {
      id: 'Pustaka Komik Digital (WebP/AVIF, CBZ, PDF)',
      en: 'Digital Comics Hub (WebP/AVIF, CBZ, PDF)',
    },
    description: {
      id: 'Ruang baca dan katalog komik digital independen maupun seri grafis lintas genre dengan pembaca web ringan serta dukungan arsip komik (.cbz, .pdf).',
      en: 'Reading platform and catalog for independent digital comics and graphic series with a lightweight web reader and comic archive (.cbz, .pdf) support.',
    },
  },
  {
    id: 'manga',
    primaryDomain: 'manga.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'book-marked',
    name: {
      id: 'VZ Manga',
      en: 'VZ Manga',
    },
    shortType: {
      id: 'Pustaka Manga Digital',
      en: 'Digital Manga Library',
    },
    description: {
      id: 'Direktori dan pembaca manga digital dengan mode gulir vertikal maupun navigasi halaman kanan-ke-kiri yang responsif di perangkat mobile dan desktop.',
      en: 'Digital manga catalog and reader supporting smooth vertical scroll and right-to-left page navigation across mobile and desktop.',
    },
  },
  {
    id: 'culture',
    primaryDomain: 'culture.vz.gay',
    category: 'education',
    status: 'development',
    iconName: 'compass',
    name: {
      id: 'VZ Culture',
      en: 'VZ Culture',
    },
    shortType: {
      id: 'Portal Edukasi Budaya Global',
      en: 'International Culture Education',
    },
    description: {
      id: 'Portal edukasi terbuka seputar sejarah, tradisi, seni, bahasa, dan warisan budaya dari berbagai penjuru dunia.',
      en: 'Open educational portal exploring history, traditions, arts, languages, and cultural heritage from around the world.',
    },
  },
  {
    id: 'books',
    primaryDomain: 'books.vz.gay',
    category: 'education',
    status: 'development',
    iconName: 'book-open',
    name: {
      id: 'VZ Books',
      en: 'VZ Books',
    },
    shortType: {
      id: 'Katalog & Buku Digital (EPUB, PDF)',
      en: 'Digital Books Catalog (EPUB, PDF)',
    },
    description: {
      id: 'Platform katalog, resensi, dan ruang baca buku digital terstruktur (mendukung format standar EPUB dan PDF) untuk literasi umum maupun akademik.',
      en: 'Structured catalog, reviews, and digital reading hub (supporting standard EPUB and PDF formats) for general and academic literature.',
    },
  },
  {
    id: 'library',
    primaryDomain: 'library.vz.gay',
    category: 'education',
    status: 'development',
    iconName: 'library',
    name: {
      id: 'VZ Library',
      en: 'VZ Library',
    },
    shortType: {
      id: 'Perpustakaan Digital Lintas Format',
      en: 'Multi-Format Digital Library',
    },
    description: {
      id: 'Perpustakaan digital serba guna yang tidak hanya menghimpun buku (EPUB/PDF), melainkan juga arsip riset, dataset (CSV/XLSX), naskah dokumen (DOCX/MD), materi ajar, dan koleksi multimedia.',
      en: 'Comprehensive digital library housing not only books (EPUB/PDF), but also research archives, datasets (CSV/XLSX), manuscripts (DOCX/MD), courseware, and multimedia collections.',
    },
  },
  {
    id: 'journal',
    primaryDomain: 'journal.vz.gay',
    category: 'education',
    status: 'development',
    iconName: 'file-text',
    name: {
      id: 'VZ Journal',
      en: 'VZ Journal',
    },
    shortType: {
      id: 'Sistem Penerbitan Jurnal Ilmiah Terbuka (PDF, DOCX, BibTeX)',
      en: 'Academic Peer-Reviewed Journal Publishing (PDF, DOCX, BibTeX)',
    },
    description: {
      id: 'Sistem manajemen dan penerbitan jurnal ilmiah akses terbuka untuk pengiriman naskah (DOC/DOCX, LaTeX, PDF), proses telaah sejawat (peer-review), pengindeksan metadata DOI/BibTeX, dan publikasi riset.',
      en: 'Open-access academic journal management and publishing platform for manuscript submissions (DOC/DOCX, LaTeX, PDF), peer-review workflows, DOI/BibTeX metadata indexing, and research publication.',
    },
  },
  {
    id: 'cdn',
    primaryDomain: 'cdn.vz.gay',
    category: 'system_community',
    status: 'development',
    iconName: 'server',
    name: {
      id: 'VZ CDN',
      en: 'VZ CDN',
    },
    shortType: {
      id: 'Layanan Sistem & Distribusi Aset',
      en: 'System Service & Content Delivery',
    },
    description: {
      id: 'Jaringan distribusi konten (CDN) internal & publik untuk mempercepat pengiriman aset statis di seluruh ekosistem vz.gay.',
      en: 'System-level content delivery network accelerating static assets across the vz.gay ecosystem and user deployments.',
    },
    clientDomainPatterns: [
      'cdn.vz.gay',
      '$RANDOM-GENERATED_$ZONE-OR-NODES_$USER-cdn.vz.gay',
    ],
    architectureNotes: {
      id: 'Mendukung endpoint zona/node khusus pengguna dengan format $RANDOM-GENERATED_$ZONE-OR-NODES_$USER-cdn.vz.gay.',
      en: 'Supports per-user zone/node distribution hostnames using the $RANDOM-GENERATED_$ZONE-OR-NODES_$USER-cdn.vz.gay pattern.',
    },
  },
  {
    id: 'media',
    primaryDomain: 'media.vz.gay',
    category: 'system_community',
    status: 'development',
    iconName: 'image',
    name: {
      id: 'VZ Media',
      en: 'VZ Media',
    },
    shortType: {
      id: 'Layanan Sistem Media Terpusat',
      en: 'Centralized Media System',
    },
    description: {
      id: 'Layanan sistem penyimpanan, optimasi format (WebP/AVIF), dan penyajian aset media bersama bagi seluruh aplikasi vz.gay.',
      en: 'Core media hosting, format optimization (WebP/AVIF), and delivery service shared across vz.gay applications.',
    },
  },
  {
    id: 'profile',
    primaryDomain: 'profile.vz.gay/$USERNAME',
    launchUrl: 'https://profile.vz.gay',
    category: 'system_community',
    status: 'development',
    iconName: 'user-circle',
    name: {
      id: 'VZ Profile',
      en: 'VZ Profile',
    },
    shortType: {
      id: 'Profil Publik Kustom Pengguna',
      en: 'Customizable Public Profiles',
    },
    description: {
      id: 'Halaman profil publik terpusat (profile.vz.gay/$USERNAME) yang dapat diatur, dikustomisasi tampilannya, dan dihubungkan dengan layanan ekosistem.',
      en: 'Customizable public user profile page (profile.vz.gay/$USERNAME) with flexible layout settings and ecosystem links.',
    },
    clientDomainPatterns: ['profile.vz.gay/$USERNAME'],
  },
  {
    id: 'support',
    primaryDomain: 'support.vz.gay',
    category: 'system_community',
    status: 'development',
    iconName: 'headphones',
    name: {
      id: 'VZ Support',
      en: 'VZ Support',
    },
    shortType: {
      id: 'Tiket Bantuan, Live Chat & Kontak',
      en: 'Ticketing, Live Chat & Contact',
    },
    description: {
      id: 'Pusat bantuan resmi untuk seluruh platform vz.gay yang menyediakan sistem tiket (ticketing), live chat, dan kanal kontak pengguna.',
      en: 'Official help center for the vz.gay platform offering ticketing, live chat support, and direct contact channels.',
    },
  },
  {
    id: 'forum',
    primaryDomain: 'forum.vz.gay',
    category: 'system_community',
    status: 'development',
    iconName: 'messages-square',
    name: {
      id: 'VZ Forum',
      en: 'VZ Forum',
    },
    shortType: {
      id: 'Forum Terbuka Publik & Developer',
      en: 'Open Public & Developer Forum',
    },
    description: {
      id: 'Forum diskusi terbuka untuk berbagi pengetahuan, tanya-jawab layanan vz.gay, serta kolaborasi komunitas publik dan developer.',
      en: 'Open community forum for public sharing, platform Q&A, and collaboration among users and developers.',
    },
  },
  {
    id: '21zone',
    primaryDomain: '21zone.vz.gay',
    category: 'media_content',
    status: 'development',
    iconName: 'shield-alert',
    ageRestricted: true,
    name: {
      id: '21Zone (21+)',
      en: '21Zone (21+)',
    },
    shortType: {
      id: 'Area Dewasa Terverifikasi (SSO 21+)',
      en: 'Age-Verified Adult Zone (SSO 21+)',
    },
    description: {
      id: 'Layanan konten dewasa (NSFW) khusus pengguna terverifikasi SSO dengan usia 21 tahun ke atas, tunduk penuh pada pembatasan wilayah IP dan hukum internasional.',
      en: 'Restricted adult (NSFW) service visible exclusively to SSO-authenticated users aged 21+, governed by regional IP restrictions and strict international compliance.',
    },
    architectureNotes: {
      id: 'Hanya ditampilkan setelah pengguna masuk melalui SSO (accounts.vz.gay) dan memverifikasi tanggal lahir usia 21+.',
      en: 'Only revealed after signing in via SSO (accounts.vz.gay) with a verified Date of Birth of 21 years or older.',
    },
    complianceNotice: {
      title: {
        id: 'Pembatasan Regional IP Cloudflare & Kebijakan Nol Toleransi',
        en: 'Cloudflare Regional IP Restriction & Zero-Tolerance Policy',
      },
      items: [
        {
          id: 'Pembatasan Wilayah IP (Cloudflare Regional IP Restriction): Akses otomatis diblokir di negara/yurisdiksi yang melarang konten NSFW demi mematuhi regulasi setempat dan mencegah pemblokiran pemerintah.',
          en: 'Regional IP Restriction (Cloudflare Geo-Blocking): Access is automatically blocked in countries or jurisdictions prohibiting NSFW content to comply with local laws and avoid government restrictions.',
        },
        {
          id: 'Verifikasi Wajib SSO + Usia 21+: Layanan ini disembunyikan dari publik dan hanya tampil bagi akun SSO terautentikasi dengan tanggal lahir (BoD) berusia 21 tahun ke atas.',
          en: 'Mandatory SSO + 21+ Verification: Hidden from public directories and accessible only to authenticated SSO accounts with a verified Date of Birth of 21+.',
        },
        {
          id: 'Kepatuhan Ketat Aturan TLD .gay & Hukum Internasional (DILARANG KERAS): Konten yang berkaitan dengan narkotika/obat ilegal, eksploitasi/pornografi anak (CSAM), perdagangan manusia, senjata api/terkait, kekerasan, kejahatan siber berat, atau tindak kriminal fisik dalam bentuk apa pun dilarang mutlak.',
          en: 'Strict .gay TLD Rules & International Law (STRICTLY PROHIBITED): Illegal drugs, child exploitation/CSAM, human trafficking, firearms/weapons, violence, severe cybercrime, and any physical or criminal activity are strictly forbidden.',
        },
      ],
    },
  },
];

export const CLIENT_DOMAIN_MATRIX = [
  {
    service: 'builder.cloud.vz.gay',
    roleId: 'Website Builder',
    roleEn: 'Website Builder',
    patterns: ['*.orgz.top', '*.kopi.pw', '*.jajanan.online', '*.web.vz.gay', '*.site.vz.gay'],
    routingNoteId: 'Subdomain situs klien otomatis (termasuk lovelogicalai.kopi.pw)',
    routingNoteEn: 'Automated client site routing (including lovelogicalai.kopi.pw)',
  },
  {
    service: 'go-blog.vz.gay / goblog.vz.gay',
    roleId: 'Platform Blogging',
    roleEn: 'Blogging Platform',
    patterns: ['*.kaca.blog', '*.blog.vz.gay'],
    routingNoteId: '301 kaca.blog & blog.vz.gay ke portal blog',
    routingNoteEn: '301 kaca.blog & blog.vz.gay to blog portal',
  },
  {
    service: 'business.vz.gay',
    roleId: 'Marketplace Generator (SaaS & Self-Hosted)',
    roleEn: 'Marketplace Generator (SaaS & Self-Hosted)',
    patterns: ['*.jajanan.online (SaaS)', 'demo.jajanan.online (Self-Hosted Code)', '*.biz.orgz.top', '*.biz.vz.gay'],
    routingNoteId: 'Sponsor jajanserver.com · *.jajanan.online untuk SaaS & demo.jajanan.online khusus kode self-host',
    routingNoteEn: 'Sponsored by jajanserver.com · *.jajanan.online for SaaS & demo.jajanan.online for self-hosted code',
  },
  {
    service: 'play.vz.gay',
    roleId: 'Pusat Game & Aplikasi',
    roleEn: 'Games & Apps Hub',
    patterns: ['*.game.vz.gay', '*.app.vz.gay'],
    routingNoteId: '4 aplikasi & game aktif tersedia',
    routingNoteEn: '4 live apps & games available',
  },
  {
    service: 'codeplace.vz.gay',
    roleId: 'Katalog Source Code & Template',
    roleEn: 'Source Code & Template Hub',
    patterns: ['*.code.vz.gay', 'demo.jajanan.online'],
    routingNoteId: '4 demo aktif: lensastudio, wiyataxlms, omnipostai.code.vz.gay & demo.jajanan.online',
    routingNoteEn: '4 live demos: lensastudio, wiyataxlms, omnipostai.code.vz.gay & demo.jajanan.online',
  },
  {
    service: 'nurdb.vz.gay (Segera Hadir)',
    roleId: 'Native Universal Rapid Databases (Belum Tersedia)',
    roleEn: 'Native Universal Rapid Databases (Coming Soon)',
    patterns: ['[vault-id]-nurdb.vz.gay', 'nurdb.vz.gay/v1/[vault-id]', 'cloud.vz.gay/console/nurdb'],
    routingNoteId: 'Segera Hadir (Coming Soon) — Cetak biru hostname satu tingkat & konsol',
    routingNoteEn: 'Coming Soon (Not Yet Available) — Planned single-level hostnames & console',
  },
  {
    service: 'cdn.vz.gay',
    roleId: 'Sistem CDN & Node Pengguna',
    roleEn: 'System CDN & User Nodes',
    patterns: ['cdn.vz.gay', '$RANDOM-GENERATED_$ZONE-OR-NODES_$USER-cdn.vz.gay'],
    routingNoteId: 'Distribusi aset dinamis per zona/node & user',
    routingNoteEn: 'Dynamic asset routing per zone/node & user',
  },
  {
    service: 'profile.vz.gay',
    roleId: 'Profil Publik Pengguna',
    roleEn: 'Public User Profile',
    patterns: ['profile.vz.gay/$USERNAME'],
    routingNoteId: 'Halaman publik kustom per akun SSO',
    routingNoteEn: 'Customizable public page per SSO account',
  },
];
