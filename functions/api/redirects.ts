import type { PagesFunction } from '../types';

export const onRequestGet: PagesFunction = async (context) => {
  if (context.env.DB) {
    try {
      const { results } = await context.env.DB.prepare(
        'SELECT id, source_host, target_url, status_code, service_id FROM redirect_rules'
      ).all();
      return new Response(JSON.stringify({ source: 'd1', redirects: results }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch {
      // Fall through to default rules
    }
  }

  return new Response(
    JSON.stringify({
      source: 'static-edge',
      redirects: [
        {
          id: 'redir-kaca-blog',
          source_host: 'kaca.blog',
          target_url: 'https://go-blog.vz.gay',
          status_code: 301,
          service_id: 'go-blog',
        },
        {
          id: 'redir-blog-vz',
          source_host: 'blog.vz.gay',
          target_url: 'https://goblog.vz.gay',
          status_code: 301,
          service_id: 'go-blog',
        },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
};
