import type { PagesFunction } from '../types';

export const onRequestGet: PagesFunction = async (context) => {
  const cacheKey = 'portal:services:v1';

  // 1. Fast edge read from Cloudflare KV
  if (context.env.PORTAL_KV) {
    try {
      const cached = await context.env.PORTAL_KV.get(cacheKey, 'json');
      if (cached) {
        return new Response(JSON.stringify({ source: 'kv-edge', services: cached }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=60, s-maxage=300',
          },
        });
      }
    } catch {
      // Fallback to D1
    }
  }

  // 2. Query Cloudflare D1 SQLite database
  if (context.env.DB) {
    try {
      const { results } = await context.env.DB.prepare(
        'SELECT * FROM services ORDER BY sort_order ASC'
      ).all();

      if (results.length > 0 && context.env.PORTAL_KV) {
        await context.env.PORTAL_KV.put(cacheKey, JSON.stringify(results), {
          expirationTtl: 300,
        });
      }

      return new Response(JSON.stringify({ source: 'd1-sqlite', services: results }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=300',
        },
      });
    } catch {
      // Fallback response when D1 table is not yet seeded
    }
  }

  return new Response(
    JSON.stringify({
      source: 'edge-ready',
      bindings: {
        d1: Boolean(context.env.DB),
        kv: Boolean(context.env.PORTAL_KV),
        r2: Boolean(context.env.ASSETS_BUCKET),
      },
      services: [],
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
};
