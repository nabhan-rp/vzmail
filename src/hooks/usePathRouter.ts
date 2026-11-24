import { useCallback, useEffect, useState } from 'react';
import type { DirectoryFilter } from '../components/ServiceDirectory';

export type RouteView = 'home' | 'services' | 'desk' | 'live_domains' | 'about';

export interface ParsedRoute {
  view: RouteView;
  filter: DirectoryFilter;
  pathname: string;
}

const SLUG_TO_FILTER: Record<string, DirectoryFilter> = {
  all: 'all',
  live: 'live',
  productivity: 'productivity',
  web: 'web_business',
  web_business: 'web_business',
  cloud: 'developer_cloud',
  developer_cloud: 'developer_cloud',
  media: 'media_content',
  media_content: 'media_content',
  edu: 'education',
  education: 'education',
  system: 'system_community',
  system_community: 'system_community',
};

const FILTER_TO_PATH: Record<DirectoryFilter, string> = {
  all: '/services',
  live: '/services/live',
  productivity: '/services/productivity',
  web_business: '/services/web',
  developer_cloud: '/services/cloud',
  media_content: '/services/media',
  education: '/services/edu',
  system_community: '/services/system',
};

export function filterToPath(filter: DirectoryFilter): string {
  return FILTER_TO_PATH[filter] || '/services';
}

export function parsePathname(rawPathname: string): ParsedRoute {
  const clean = rawPathname.replace(/\/+$/, '') || '/';

  if (clean === '/') {
    return { view: 'home', filter: 'all', pathname: '/' };
  }

  if (clean === '/desk' || clean === '/vz-desk') {
    return { view: 'desk', filter: 'all', pathname: '/desk' };
  }

  if (clean === '/live-domains' || clean === '/live' || clean === '/domains') {
    return { view: 'live_domains', filter: 'all', pathname: '/live-domains' };
  }

  if (clean === '/about' || clean === '/infrastructure' || clean === '/partners') {
    return { view: 'about', filter: 'all', pathname: '/about' };
  }

  if (clean === '/services') {
    return { view: 'services', filter: 'all', pathname: '/services' };
  }

  if (clean.startsWith('/services/')) {
    const slug = clean.slice('/services/'.length).split('/')[0].toLowerCase();
    const mappedFilter = SLUG_TO_FILTER[slug] || 'all';
    return {
      view: 'services',
      filter: mappedFilter,
      pathname: filterToPath(mappedFilter),
    };
  }

  return { view: 'home', filter: 'all', pathname: '/' };
}

export function usePathRouter() {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window === 'undefined') return;
    const target = to.startsWith('/') ? to : `/${to}`;
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
      setPathname(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const route = parsePathname(pathname);

  return {
    route,
    navigate,
  };
}
