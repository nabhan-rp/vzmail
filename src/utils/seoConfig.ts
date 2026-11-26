import {
  CHANGELOG_RELEASE_DATE,
  CHANGELOG_RELEASES,
  CHANGELOG_VERSION,
} from '../data/changelogReleases.ts';
import {
  sanitizeBioIndexingMode,
  type BioIndexingMode,
  type BioPageRecord,
  type BioWorkspaceData,
} from './linksModel.ts';

export const PUBLISHER_NAME = 'PT Galeri Langkah Bahagia Yuwana (galbay)';
export const PUBLISHER_URL = 'https://vz.gay';
export const DEFAULT_OG_IMAGE_MAIL = 'https://mail.vz.gay/og-banner.jpg';
export const DEFAULT_OG_IMAGE_LINKS = 'https://links.vz.gay/og-banner.jpg';

/**
 * Explicit AI search & crawler user-agents allowed on public service domains
 * (mail.vz.gay, links.vz.gay, imy.li/s/) and controllable per-user on *.imy.li Bio pages.
 */
export const AI_CRAWLER_AGENTS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'Meta-ExternalAgent',
  'DuckAssistBot',
];

export const SEARCH_CRAWLER_AGENTS: readonly string[] = [
  'Googlebot',
  'Googlebot-Image',
  'Bingbot',
  'DuckDuckBot',
  'Applebot',
  'Yandex',
  'Baiduspider',
  'Slurp',
];

export interface SeoMetadataPayload {
  title: string;
  description: string;
  canonicalUrl: string;
  robotsMeta: string;
  xRobotsTag: string;
  ogType: 'website' | 'profile' | 'article';
  ogSiteName: string;
  ogImage: string;
  ogImageAlt: string;
  twitterTitle: string;
  twitterDescription: string;
  jsonLd: Record<string, unknown>;
}

export interface BioIndexingPolicyDirectives {
  mode: BioIndexingMode;
  robotsMeta: string;
  xRobotsTag: string;
  allowSearchEngines: boolean;
  allowAiCrawlers: boolean;
}

export function getBioIndexingPolicyDirectives(
  rawMode: unknown
): BioIndexingPolicyDirectives {
  const mode = sanitizeBioIndexingMode(rawMode);

  switch (mode) {
    case 'search_only':
      return {
        mode,
        robotsMeta: 'index, follow, max-image-preview:large, noai, noimageai',
        xRobotsTag: 'index, follow, max-image-preview:large, noai, noimageai',
        allowSearchEngines: true,
        allowAiCrawlers: false,
      };
    case 'ai_only':
      return {
        mode,
        // Prevent traditional search indexers from indexing while permitting AI fetchers via robots.txt
        robotsMeta: 'noindex, nofollow',
        xRobotsTag:
          'googlebot: noindex, nofollow, bingbot: noindex, nofollow, duckduckbot: noindex, nofollow, yandex: noindex, nofollow',
        allowSearchEngines: false,
        allowAiCrawlers: true,
      };
    case 'search_and_ai':
      return {
        mode,
        robotsMeta: 'index, follow, max-image-preview:large',
        xRobotsTag: 'index, follow, max-image-preview:large',
        allowSearchEngines: true,
        allowAiCrawlers: true,
      };
    case 'none':
    default:
      return {
        mode: 'none',
        robotsMeta: 'noindex, nofollow, noai, noimageai',
        xRobotsTag: 'noindex, nofollow, noai, noimageai',
        allowSearchEngines: false,
        allowAiCrawlers: false,
      };
  }
}

export type SeoRouteKind =
  | 'mail.vz.gay'
  | 'links.vz.gay'
  | 'shortlinks'
  | 'bio_public'
  | 'changelog'
  | 'terms'
  | 'privacy'
  | 'worker_console';

export interface BuildServiceSeoParams {
  routeKind: SeoRouteKind;
  hostname?: string;
  pathname?: string;
  lang?: 'id' | 'en';
  bioUsername?: string | null;
  bioPageSlug?: string;
  bioWorkspace?: BioWorkspaceData | null;
  bioActivePage?: BioPageRecord | null;
}

function getPublisherOrgNode(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': `${PUBLISHER_URL}/#organization`,
    name: PUBLISHER_NAME,
    url: PUBLISHER_URL,
    sameAs: ['https://mail.vz.gay', 'https://links.vz.gay', 'https://imy.li'],
  };
}

function getMailSoftwareNode(): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    '@id': 'https://mail.vz.gay/#app',
    name: 'VZ Mail',
    alternateName: 'mail.vz.gay',
    url: 'https://mail.vz.gay/',
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web, iOS, Android, macOS, Windows, Linux',
    softwareVersion: '1.0.0',
    inLanguage: ['id', 'en'],
    description:
      'Layanan email privat lokal tanpa penyimpanan kotak surat permanen di server (@imy.li) berbasis Cloudflare Email Routing, Pop-and-Purge KV, IndexedDB, alias tak terbatas (+ dan .), QR mailto/vCard, serta cadangan terenkripsi MyVault.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'IDR',
    },
    publisher: { '@id': `${PUBLISHER_URL}/#organization` },
  };
}

function getLinksSoftwareNode(): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    '@id': 'https://links.vz.gay/#app',
    name: 'VZ Links',
    alternateName: 'links.vz.gay & *.imy.li',
    url: 'https://links.vz.gay/',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web, iOS, Android, macOS, Windows, Linux',
    softwareVersion: '1.0.0',
    inLanguage: ['id', 'en'],
    description:
      'Platform Link-in-Bio multi-halaman ($USERNAME.imy.li & /$PAGE) berpasangan 1:1 dengan VZ Mail, pemendek URL mandiri (imy.li/s/), Studio desain QR Code kustom, foto profil AVIF, dan kontrol privasi indeksasi mesin pencari & AI.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'IDR',
    },
    publisher: { '@id': `${PUBLISHER_URL}/#organization` },
  };
}

function normalizeServiceOrigin(hostname?: string, fallback = 'https://mail.vz.gay'): string {
  const host = (hostname || '').trim().toLowerCase();
  if (host === 'mail.vz.gay' || host === 'links.vz.gay' || host === 'imy.li') {
    return `https://${host}`;
  }
  return fallback;
}

export function buildServiceSeoMeta(params: BuildServiceSeoParams): SeoMetadataPayload {
  const lang = params.lang === 'en' ? 'en' : 'id';
  const host = (params.hostname || '').trim().toLowerCase();

  if (params.routeKind === 'bio_public') {
    const cleanUser = (params.bioUsername || '').trim().toLowerCase();
    const cleanSlug = (params.bioPageSlug || '').trim().toLowerCase();
    const ws = params.bioWorkspace || null;
    const isDeactivated = Boolean(ws?.isDeactivated);
    const activePage =
      params.bioActivePage ||
      ws?.pages.find((p) => p.pageSlug === cleanSlug && p.isPublished !== false) ||
      null;

    // Fail-closed: if user is missing, not configured, deactivated, or subpage hidden -> always 'none'
    const effectiveMode: BioIndexingMode =
      cleanUser && ws && ws.configured && !isDeactivated && activePage
        ? sanitizeBioIndexingMode(ws.indexingMode)
        : 'none';
    const policy = getBioIndexingPolicyDirectives(effectiveMode);

    const canonicalBase = cleanUser
      ? `https://${cleanUser}.imy.li`
      : 'https://links.vz.gay';
    const canonicalUrl = cleanSlug ? `${canonicalBase}/${cleanSlug}` : `${canonicalBase}/`;

    const displayName =
      ws?.displayName?.trim() || (cleanUser ? `@${cleanUser}` : 'VZ Links Bio');
    const pageTitlePart =
      cleanSlug && activePage?.title?.trim()
        ? `${activePage.title.trim()} — ${displayName}`
        : displayName;
    const title = cleanUser
      ? `${pageTitlePart} (${cleanUser}.imy.li) | VZ Links`
      : 'Link-in-Bio ($USERNAME.imy.li) | VZ Links';

    const rawDesc =
      (cleanSlug ? activePage?.description : '') ||
      ws?.headline ||
      ws?.bio ||
      (cleanUser
        ? `Halaman Link-in-Bio resmi ${displayName} di ${cleanUser}.imy.li — ditenagai VZ Links.`
        : 'Buat halaman Link-in-Bio pribadi $USERNAME.imy.li dengan sub-halaman tak terbatas dan QR Code kustom.');
    const description = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 160);

    const rawAvatar = activePage?.avatarUrl || ws?.avatarUrl || '';
    const ogImage = rawAvatar.startsWith('/api/')
      ? `${canonicalBase}${rawAvatar}`
      : rawAvatar.startsWith('https://')
        ? rawAvatar
        : DEFAULT_OG_IMAGE_LINKS;

    const sameAsUrls = ws
      ? Object.values(ws.socials || {}).filter(
          (v): v is string => typeof v === 'string' && v.startsWith('https://')
        )
      : [];

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: canonicalUrl,
      name: title,
      description,
      dateModified: ws?.updatedAt || CHANGELOG_RELEASE_DATE,
      mainEntity: {
        '@type': 'Person',
        name: displayName,
        alternateName: cleanUser || undefined,
        description: ws?.bio || ws?.headline || undefined,
        image: ogImage,
        url: canonicalUrl,
        ...(sameAsUrls.length > 0 ? { sameAs: sameAsUrls } : {}),
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'VZ Links',
        url: 'https://links.vz.gay/',
      },
    };

    return {
      title,
      description,
      canonicalUrl,
      robotsMeta: policy.robotsMeta,
      xRobotsTag: policy.xRobotsTag,
      ogType: 'profile',
      ogSiteName: 'VZ Links',
      ogImage,
      ogImageAlt: `${displayName} — ${cleanUser || 'imy.li'} Bio`,
      twitterTitle: title.slice(0, 70),
      twitterDescription: description,
      jsonLd,
    };
  }

  if (params.routeKind === 'links.vz.gay') {
    const title =
      lang === 'en'
        ? 'VZ Links — Multi-Page Link-in-Bio & imy.li/s/ Shortener'
        : 'VZ Links — Link-in-Bio *.imy.li & Shortlink imy.li/s/';
    const description =
      lang === 'en'
        ? 'Create multi-page Link-in-Bio subdomains ($USERNAME.imy.li/$PAGE), standalone imy.li/s/ shortlinks, custom QR codes, and opt-in Search/AI privacy controls.'
        : 'Buat halaman Link-in-Bio multi-halaman ($USERNAME.imy.li/$PAGE), shortlink mandiri imy.li/s/, Studio QR Code kustom, dan kontrol opt-in SEO & AI.';

    return {
      title,
      description,
      canonicalUrl: 'https://links.vz.gay/',
      robotsMeta: 'index, follow, max-image-preview:large',
      xRobotsTag: 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogSiteName: 'VZ Links',
      ogImage: DEFAULT_OG_IMAGE_LINKS,
      ogImageAlt: 'VZ Links (links.vz.gay) — Multi-Page Link-in-Bio & imy.li/s/ URL Shortener',
      twitterTitle: title,
      twitterDescription: description,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          getPublisherOrgNode(),
          getLinksSoftwareNode(),
          {
            '@type': 'WebSite',
            '@id': 'https://links.vz.gay/#website',
            url: 'https://links.vz.gay/',
            name: 'VZ Links',
            inLanguage: ['id', 'en'],
            publisher: { '@id': `${PUBLISHER_URL}/#organization` },
          },
        ],
      },
    };
  }

  if (params.routeKind === 'shortlinks') {
    const title =
      lang === 'en'
        ? 'imy.li/s/ URL Shortener & Instant QR Code — VZ Links'
        : 'Pemendek URL imy.li/s/ & QR Code Instan — VZ Links';
    const description =
      lang === 'en'
        ? 'Shorten any URL instantly into imy.li/s/code with optional custom slugs, real click tracking, and downloadable PNG/SVG QR codes. Works with or without login.'
        : 'Singkatkan URL panjang ke imy.li/s/kode secara instan dengan slug kustom, hitungan klik nyata, dan QR Code PNG/SVG. Dapat dipakai dengan atau tanpa login.';

    return {
      title,
      description,
      canonicalUrl: 'https://imy.li/',
      robotsMeta: 'index, follow, max-image-preview:large',
      xRobotsTag: 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogSiteName: 'VZ Links — imy.li/s/',
      ogImage: DEFAULT_OG_IMAGE_LINKS,
      ogImageAlt: 'Pemendek URL imy.li/s/ oleh VZ Links',
      twitterTitle: title,
      twitterDescription: description,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          getPublisherOrgNode(),
          getLinksSoftwareNode(),
          {
            '@type': 'WebPage',
            url: 'https://imy.li/',
            name: title,
            description,
            isPartOf: { '@id': 'https://links.vz.gay/#app' },
          },
        ],
      },
    };
  }

  if (params.routeKind === 'changelog') {
    const origin = normalizeServiceOrigin(host, 'https://mail.vz.gay');
    const canonicalUrl = `${origin}/changelog`;
    const title =
      lang === 'en'
        ? `Changelog Releases ${CHANGELOG_VERSION} — VZ Mail & VZ Links`
        : `Changelog Rilis ${CHANGELOG_VERSION} — VZ Mail & VZ Links`;
    const description =
      lang === 'en'
        ? 'Official release notes for VZ Mail v1.0.0 (mail.vz.gay) and VZ Links v1.0.0 (links.vz.gay, *.imy.li): Zero-Retention email, multi-page Bio, custom QR codes, and AI/SEO controls.'
        : 'Catatan rilis resmi VZ Mail v1.0.0 (mail.vz.gay) dan VZ Links v1.0.0 (links.vz.gay, *.imy.li): email Zero-Retention, Bio multi-halaman, QR Code kustom, dan kontrol SEO/AI.';

    return {
      title,
      description,
      canonicalUrl,
      robotsMeta: 'index, follow, max-image-preview:large',
      xRobotsTag: 'index, follow, max-image-preview:large',
      ogType: 'article',
      ogSiteName: 'VZ Mail & VZ Links',
      ogImage: host === 'links.vz.gay' ? DEFAULT_OG_IMAGE_LINKS : DEFAULT_OG_IMAGE_MAIL,
      ogImageAlt: `Changelog Rilis ${CHANGELOG_VERSION} VZ Mail & VZ Links`,
      twitterTitle: title,
      twitterDescription: description,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          getPublisherOrgNode(),
          getMailSoftwareNode(),
          getLinksSoftwareNode(),
          {
            '@type': 'CollectionPage',
            '@id': `${canonicalUrl}#changelog`,
            url: canonicalUrl,
            name: title,
            description,
            datePublished: CHANGELOG_RELEASE_DATE,
            dateModified: CHANGELOG_RELEASE_DATE,
            inLanguage: ['id', 'en'],
            publisher: { '@id': `${PUBLISHER_URL}/#organization` },
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: CHANGELOG_RELEASES.map((rel, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: `${rel.serviceName} v${rel.version}`,
                description: rel.summary[lang],
              })),
            },
          },
        ],
      },
    };
  }

  if (params.routeKind === 'terms' || params.routeKind === 'privacy') {
    const origin = normalizeServiceOrigin(host, 'https://mail.vz.gay');
    const isTerms = params.routeKind === 'terms';
    const canonicalUrl = `${origin}/${params.routeKind}`;
    const title = isTerms
      ? lang === 'en'
        ? 'Terms of Service — VZ Mail & VZ Links'
        : 'Syarat & Ketentuan — VZ Mail & VZ Links'
      : lang === 'en'
        ? 'Privacy Policy — VZ Mail & VZ Links'
        : 'Kebijakan Privasi — VZ Mail & VZ Links';
    const description = isTerms
      ? 'Ketentuan resmi penggunaan layanan email lokal privat VZ Mail (mail.vz.gay), Link-in-Bio (*.imy.li), dan pemendek URL VZ Links (links.vz.gay).'
      : 'Kebijakan privasi arsitektur Zero-Retention Pop-and-Purge VZ Mail (@imy.li) dan pengolahan data opt-in VZ Links oleh PT Galeri Langkah Bahagia Yuwana (galbay).';

    return {
      title,
      description,
      canonicalUrl,
      robotsMeta: 'index, follow',
      xRobotsTag: 'index, follow',
      ogType: 'website',
      ogSiteName: 'VZ Mail & VZ Links',
      ogImage: DEFAULT_OG_IMAGE_MAIL,
      ogImageAlt: title,
      twitterTitle: title,
      twitterDescription: description,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          getPublisherOrgNode(),
          {
            '@type': 'WebPage',
            url: canonicalUrl,
            name: title,
            description,
            publisher: { '@id': `${PUBLISHER_URL}/#organization` },
          },
        ],
      },
    };
  }

  if (params.routeKind === 'worker_console') {
    return {
      title: 'Worker & Domain Console — VZ Mail & VZ Links',
      description: 'Panel diagnostik internal Cloudflare Worker dan registrasi domain.',
      canonicalUrl: 'https://mail.vz.gay/',
      robotsMeta: 'noindex, nofollow, noai',
      xRobotsTag: 'noindex, nofollow, noai',
      ogType: 'website',
      ogSiteName: 'VZ Mail & VZ Links',
      ogImage: DEFAULT_OG_IMAGE_MAIL,
      ogImageAlt: 'VZ Mail & VZ Links Worker Console',
      twitterTitle: 'Worker & Domain Console',
      twitterDescription: 'Panel diagnostik internal.',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [getPublisherOrgNode()],
      },
    };
  }

  // Default: VZ Mail (mail.vz.gay)
  const title =
    lang === 'en'
      ? 'VZ Mail — Private Local-First @imy.li Email (Zero Retention)'
      : 'VZ Mail — Email Lokal Privat @imy.li Tanpa Simpan Server';
  const description =
    lang === 'en'
      ? 'Zero-retention local-first conversational email (@imy.li) powered by Cloudflare Email Routing, IndexedDB, unlimited +/. aliases, QR mailto/vCard, and encrypted MyVault.'
      : 'Email percakapan lokal privat (@imy.li) tanpa penyimpanan server permanen, ditenagai Cloudflare Email Routing, IndexedDB, alias +/., QR vCard, dan MyVault terenkripsi.';

  return {
    title,
    description,
    canonicalUrl: 'https://mail.vz.gay/',
    robotsMeta: 'index, follow, max-image-preview:large',
    xRobotsTag: 'index, follow, max-image-preview:large',
    ogType: 'website',
    ogSiteName: 'VZ Mail',
    ogImage: DEFAULT_OG_IMAGE_MAIL,
    ogImageAlt: 'VZ Mail (mail.vz.gay) — Email Lokal Privat Zero-Retention @imy.li',
    twitterTitle: title,
    twitterDescription: description,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        getPublisherOrgNode(),
        getMailSoftwareNode(),
        getLinksSoftwareNode(),
        {
          '@type': 'WebSite',
          '@id': 'https://mail.vz.gay/#website',
          url: 'https://mail.vz.gay/',
          name: 'VZ Mail',
          inLanguage: ['id', 'en'],
          publisher: { '@id': `${PUBLISHER_URL}/#organization` },
        },
      ],
    },
  };
}

export function buildHostRobotsTxt(
  hostname: string,
  bioIndexingMode?: BioIndexingMode | null
): string {
  const host = hostname.trim().toLowerCase();
  const isBioSubdomain =
    host.endsWith('.imy.li') && host !== 'www.imy.li' && host !== 'mail.imy.li';

  if (isBioSubdomain) {
    const policy = getBioIndexingPolicyDirectives(bioIndexingMode ?? 'none');

    if (policy.mode === 'none') {
      return [
        `# VZ Links Bio Privacy Policy (${host})`,
        '# Owner indexing mode: none (private by default — opt-in required)',
        'User-agent: *',
        'Disallow: /',
        '',
        ...AI_CRAWLER_AGENTS.flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /', '']),
      ].join('\n');
    }

    if (policy.mode === 'search_only') {
      return [
        `# VZ Links Bio Indexing Policy (${host})`,
        '# Owner indexing mode: search_only (Search engines allowed, AI crawlers blocked)',
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        ...AI_CRAWLER_AGENTS.flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /', '']),
        'User-agent: CCBot',
        'Disallow: /',
        '',
        'User-agent: Bytespider',
        'Disallow: /',
        '',
      ].join('\n');
    }

    if (policy.mode === 'ai_only') {
      return [
        `# VZ Links Bio Indexing Policy (${host})`,
        '# Owner indexing mode: ai_only (AI search/crawlers allowed, traditional search engines blocked)',
        'User-agent: *',
        'Disallow: /',
        '',
        ...SEARCH_CRAWLER_AGENTS.flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /', '']),
        ...AI_CRAWLER_AGENTS.flatMap((bot) => [
          `User-agent: ${bot}`,
          'Allow: /',
          'Disallow: /api/',
          '',
        ]),
      ].join('\n');
    }

    // search_and_ai
    return [
      `# VZ Links Bio Indexing Policy (${host})`,
      '# Owner indexing mode: search_and_ai (Search engines and AI crawlers both opted in)',
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      ...AI_CRAWLER_AGENTS.flatMap((bot) => [
        `User-agent: ${bot}`,
        'Allow: /',
        'Disallow: /api/',
        '',
      ]),
    ].join('\n');
  }

  // Main service domains: mail.vz.gay, links.vz.gay, imy.li
  const sitemapOrigin =
    host === 'links.vz.gay'
      ? 'https://links.vz.gay'
      : host === 'imy.li' || host === 'www.imy.li'
        ? 'https://imy.li'
        : 'https://mail.vz.gay';

  return [
    '# VZ Mail (mail.vz.gay) & VZ Links (links.vz.gay, imy.li/s/)',
    '# Search engines and AI Search / LLM Crawlers are welcome on public service pages.',
    `# AI Documentation: ${sitemapOrigin}/llms.txt`,
    `# Full AI Reference: ${sitemapOrigin}/llms-full.txt`,
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    ...AI_CRAWLER_AGENTS.flatMap((bot) => [
      `User-agent: ${bot}`,
      'Allow: /',
      'Disallow: /api/',
      '',
    ]),
    `Sitemap: ${sitemapOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildHostSitemapXml(hostname: string): string {
  const host = hostname.trim().toLowerCase();
  const lastmod = CHANGELOG_RELEASE_DATE;

  const isLinksHost = host === 'links.vz.gay';
  const isImyHost = host === 'imy.li' || host === 'www.imy.li';

  const urls = isLinksHost
    ? [
        { loc: 'https://links.vz.gay/', changefreq: 'weekly', priority: '1.0' },
        { loc: 'https://imy.li/', changefreq: 'weekly', priority: '0.9' },
        { loc: 'https://links.vz.gay/changelog', changefreq: 'monthly', priority: '0.8' },
        { loc: 'https://links.vz.gay/terms', changefreq: 'yearly', priority: '0.5' },
        { loc: 'https://links.vz.gay/privacy', changefreq: 'yearly', priority: '0.5' },
        { loc: 'https://links.vz.gay/llms.txt', changefreq: 'monthly', priority: '0.6' },
      ]
    : isImyHost
      ? [
          { loc: 'https://imy.li/', changefreq: 'weekly', priority: '1.0' },
          { loc: 'https://links.vz.gay/', changefreq: 'weekly', priority: '0.9' },
          { loc: 'https://mail.vz.gay/', changefreq: 'weekly', priority: '0.9' },
          { loc: 'https://imy.li/changelog', changefreq: 'monthly', priority: '0.7' },
        ]
      : [
          { loc: 'https://mail.vz.gay/', changefreq: 'weekly', priority: '1.0' },
          { loc: 'https://links.vz.gay/', changefreq: 'weekly', priority: '0.95' },
          { loc: 'https://imy.li/', changefreq: 'weekly', priority: '0.9' },
          { loc: 'https://mail.vz.gay/changelog', changefreq: 'monthly', priority: '0.85' },
          { loc: 'https://mail.vz.gay/terms', changefreq: 'yearly', priority: '0.5' },
          { loc: 'https://mail.vz.gay/privacy', changefreq: 'yearly', priority: '0.5' },
          { loc: 'https://mail.vz.gay/llms.txt', changefreq: 'monthly', priority: '0.6' },
        ];

  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export function buildLlmsTxt(): string {
  return `# VZ Mail & VZ Links

> Privacy-first local email (@imy.li) and paired Link-in-Bio (*.imy.li) + URL Shortener (imy.li/s/) suite built by ${PUBLISHER_NAME} (${PUBLISHER_URL}) and running on Cloudflare Workers.

## Services

- [VZ Mail (mail.vz.gay)](https://mail.vz.gay/): Zero-retention local-first email service for @imy.li handles. Inbound mail uses Cloudflare Email Routing with 72-hour ephemeral KV transit (Pop-and-Purge), local IndexedDB storage, unlimited +tag and dot (.) aliases, mailto:/vCard QR codes, DNS/RDAP sender verification, and password-encrypted MyVault (.vzvault) backups.
- [VZ Links (links.vz.gay)](https://links.vz.gay/): Multi-page Link-in-Bio Studio paired 1:1 with VZ Mail handles ($USERNAME.imy.li and $USERNAME.imy.li/$PAGE). Includes per-page themes, AVIF/WebP profile photos, custom QR Code design studio (colors, dot/corner styles, text frames, centered Bio avatar), 14-day Recycle Bin, and Meta-style opt-in Search/AI indexing privacy controls.
- [imy.li/s/ URL Shortener](https://imy.li/): Standalone URL shortener (imy.li/s/$CODE) usable with or without login, supporting custom slugs, uncached HTTP 302 click counting, and instant QR Code PNG/SVG downloads.

## Releases & Documentation

- [Changelog Releases ${CHANGELOG_VERSION}](https://mail.vz.gay/changelog): Official v1.0.0 release notes for both VZ Mail and VZ Links (${CHANGELOG_RELEASE_DATE}).
- [Full AI Reference (llms-full.txt)](https://mail.vz.gay/llms-full.txt): Complete architecture, domain mapping, privacy guarantees, and v1.0.0 feature reference for LLMs and AI search engines.
- [Terms of Service](https://mail.vz.gay/terms): Official terms governing VZ Mail, VZ Links, and *.imy.li subdomains.
- [Privacy Policy](https://mail.vz.gay/privacy): Zero-retention data handling and user opt-in indexing controls.

## User Bio Subdomain Privacy Policy (*.imy.li)

- Individual user Bio pages on https://$USERNAME.imy.li/ are private to crawlers by default (noindex, nofollow, noai, noimageai).
- Bio owners can explicitly opt in to Search Engine indexing, AI Crawler access, or both via VZ Links Studio -> Settings.
- Always respect each subdomain's individual https://$USERNAME.imy.li/robots.txt and X-Robots-Tag HTTP response headers.
`;
}

export function buildLlmsFullTxt(): string {
  const releaseSections = CHANGELOG_RELEASES.map((rel) => {
    const items = rel.highlights
      .map((item) => `- **${item.title.en}** (${item.title.id}): ${item.description.en}`)
      .join('\n');
    return `### ${rel.serviceName} v${rel.version} (${rel.releaseDate})
Domains: ${rel.domains.join(', ')}
Summary: ${rel.summary.en}

${items}`;
  }).join('\n\n');

  return `# VZ Mail & VZ Links — Full Technical & Product Reference

Publisher: ${PUBLISHER_NAME} (${PUBLISHER_URL})
Latest Stable Version: ${CHANGELOG_VERSION} (${CHANGELOG_RELEASE_DATE})
Universal SSO: https://accounts.vz.gay (Account Portal: https://myaccount.vz.gay)

## 1. Domain Architecture (2-in-1 Cloudflare Worker)

1. **https://mail.vz.gay** — VZ Mail web application & PWA for @imy.li accounts.
2. **https://links.vz.gay** — VZ Links Studio for managing multi-page Link-in-Bio, QR designs, Recycle Bin, and Bio indexing preferences.
3. **https://imy.li** & **https://imy.li/s/$CODE** — Standalone URL shortener & HTTP 302 redirector.
4. **https://$USERNAME.imy.li** & **https://$USERNAME.imy.li/$PAGE** — Public Link-in-Bio pages isolated with Zero-Cookie PSL headers and strict CSP.
5. **https://mail.vz.gay/changelog** & **https://links.vz.gay/changelog** — Public bilingual release changelog.

## 2. Privacy & Security Guarantees

- **VZ Mail Zero-Retention Pop-and-Purge**: Inbound emails received via Cloudflare Email Routing are held transiently in Cloudflare KV (\`MAIL_TRANSIT_KV\`, max 72-hour TTL). As soon as the user's browser saves the message to local IndexedDB and calls \`POST /api/mail/ack\`, the server deletes the transit packet immediately. No permanent server-side mailbox exists.
- **Client-Side Encrypted Backups**: Users can export/restore local mail history into AES-GCM encrypted \`.vzvault\` files without exposing passphrases to the server.
- **User Bio Opt-In Indexing (Meta-Style Controls)**: Every \`$USERNAME.imy.li\` profile defaults to \`none\` (\`noindex, nofollow, noai, noimageai\`). Owners can choose one of four explicit modes enforced at the edge via \`robots.txt\`, \`X-Robots-Tag\`, and HTML \`<meta name="robots">\`:
  - \`none\`: Blocked from both search engines and AI crawlers (default).
  - \`search_only\`: Indexed by search engines, blocked for AI crawlers (\`noai, noimageai\`).
  - \`ai_only\`: Accessible to AI search/crawler agents, blocked from traditional search engine indexes.
  - \`search_and_ai\`: Opted in for both search engines and AI crawlers.

## 3. Official Releases (${CHANGELOG_VERSION})

${releaseSections}

## 4. Public Discovery Endpoints

- \`/robots.txt\` — Host-aware crawler directives (allows AI & search crawlers on main service domains; reflects owner opt-in policy on \`*.imy.li\`).
- \`/sitemap.xml\` — Host-aware XML sitemap covering service homepages, \`/changelog\`, \`/terms\`, \`/privacy\`, and \`/llms.txt\`.
- \`/llms.txt\` — Concise markdown index for LLMs and AI search engines.
- \`/llms-full.txt\` — This complete reference document.
`;
}
