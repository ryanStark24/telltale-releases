// POST /api/hit?k=download-arm64-1.7.4-beta: counts one download click by country.
// Binding: HITS (Workers Analytics Engine dataset). Stores blobs [key, country], never an IP or anything personal.
// Always answers 204 so a counting problem can never get in the visitor's way.
import { validHitKey } from '../_lib/core.js';

export async function onRequestPost({ request, env }) {
  try {
    const k = new URL(request.url).searchParams.get('k');
    if (validHitKey(k) && env.HITS) {
      const country = (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || 'XX';
      env.HITS.writeDataPoint({ blobs: [k, String(country).slice(0, 2)], doubles: [1], indexes: [k] });
    }
  } catch { /* never fail the beacon */ }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequest = () => new Response(null, { status: 405 });
