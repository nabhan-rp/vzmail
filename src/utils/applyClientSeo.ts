import type { SeoMetadataPayload } from './seoConfig';

function upsertMeta(attrName: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attrName}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, key);
    document.head.appendChild(el);
  }
  if (el.getAttribute('content') !== content) {
    el.setAttribute('content', content);
  }
}

function upsertLink(rel: string, href: string): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  if (el.getAttribute('href') !== href) {
    el.setAttribute('href', href);
  }
}

/**
 * Synchronizes document <head> SEO tags, OpenGraph, Twitter Card, canonical URL,
 * robots directives, and Schema.org JSON-LD safely without innerHTML injection.
 */
export function applyClientSeo(meta: SeoMetadataPayload): void {
  if (typeof document === 'undefined') return;

  if (document.title !== meta.title) {
    document.title = meta.title;
  }

  upsertMeta('name', 'description', meta.description);
  upsertMeta('name', 'robots', meta.robotsMeta);
  upsertLink('canonical', meta.canonicalUrl);

  upsertMeta('property', 'og:type', meta.ogType);
  upsertMeta('property', 'og:site_name', meta.ogSiteName);
  upsertMeta('property', 'og:url', meta.canonicalUrl);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:image', meta.ogImage);
  upsertMeta('property', 'og:image:alt', meta.ogImageAlt);

  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', meta.twitterTitle);
  upsertMeta('name', 'twitter:description', meta.twitterDescription);
  upsertMeta('name', 'twitter:image', meta.ogImage);

  let jsonLdScript = document.getElementById('vz-jsonld') as HTMLScriptElement | null;
  if (!jsonLdScript) {
    jsonLdScript = document.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"]'
    );
  }
  if (!jsonLdScript) {
    jsonLdScript = document.createElement('script');
    jsonLdScript.type = 'application/ld+json';
    document.head.appendChild(jsonLdScript);
  }
  jsonLdScript.id = 'vz-jsonld';
  const serialized = JSON.stringify(meta.jsonLd);
  if (jsonLdScript.textContent !== serialized) {
    jsonLdScript.textContent = serialized;
  }
}
