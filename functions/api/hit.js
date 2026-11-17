// POST /api/hit?k=download-arm64-1.7.4-beta: counts one download click by country.
// Binding: HITS (Workers Analytics Engine dataset). Stores blobs [key, country], never an IP or anything personal.
// Only same-origin beacons count (the Origin header must be present and be this site), and one IP counts at most
// once per key per hour: the Cache API remembers a SHA-256 of ip + key + hour, never the IP itself.
// Always answers 204 so a counting problem can never get in the visitor's way.
import { HIT_WINDOW_S, hitCacheKey, strictSameOrigin, validHitKey } from '../_lib/core.js';

export async function onRequestPost({ request, env }) {
  try {
    const k = new URL(request.url).searchParams.get('k');
    if (strictSameOrigin(request) && validHitKey(k) && env.HITS) {
      let cache = null, cacheReq = null;
      try {
        const ip = request.headers.get('CF-Connecting-IP');
        if (ip && typeof caches !== 'undefined' && caches.default) {
          cache = caches.default;
          cacheReq = new Request(await hitCacheKey(ip, k));
          if (await cache.match(cacheReq)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
        }
      } catch { cache = null; } // a cache problem must not stop the count
      const country = (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || 'XX';
      env.HITS.writeDataPoint({ blobs: [k, String(country).slice(0, 2)], doubles: [1], indexes: [k] });
      if (cache) {
        try { await cache.put(cacheReq, new Response('1', { headers: { 'Cache-Control': `max-age=${HIT_WINDOW_S}` } })); } catch { /* ignore */ }
      }
    }
  } catch { /* never fail the beacon */ }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequest = () => new Response(null, { status: 405 });
