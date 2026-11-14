// GET /api/stats: public download numbers for the page.
//  - totalDownloads, byVersion: exact, from GitHub release assets (zip files only).
//  - clicksByCountry, countries: download clicks on this page, from Analytics Engine (it keeps about 90 days).
// Needs (all optional; each missing piece just leaves its part empty): CF_ACCOUNT_ID (var), CF_API_TOKEN (Secret,
// Account Analytics: Read), GITHUB_TOKEN (Secret, only for higher rate limits). Never returns keys or IPs.
// Never answers 5xx for a partial failure. The whole answer is cached 10 minutes (Cache API + Cache-Control).
import { REPO } from '../_lib/core.js';
import { aggregateReleases, aggregateClicks } from '../_lib/stats-core.js';

const CACHE_URL = 'https://telltale-stats.internal/api/stats/v1';
const TTL = 600;
const DATASET = 'telltale_hits';

async function githubStats(env, fetchFn) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'telltale-download-page' };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('github ' + res.status);
  return aggregateReleases(await res.json());
}

async function clickStats(env, fetchFn) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return { clicksByCountry: [], countries: 0 };
  // Grouped by key and country so the pattern filter (which drops test rows) runs in JS, in one place.
  const sql = `SELECT blob1 AS k, blob2 AS country, SUM(_sample_interval) AS clicks FROM ${DATASET} WHERE blob1 LIKE 'download-%' GROUP BY k, country LIMIT 1000 FORMAT JSON`;
  const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: sql, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('ae ' + res.status);
  const body = await res.json();
  return aggregateClicks(body && body.data);
}

/** Builds the payload; either half may fail on its own. Exported for tests (fetch injected). */
export async function buildStats(env, fetchFn = fetch, now = new Date()) {
  const [gh, ae] = await Promise.allSettled([githubStats(env, fetchFn), clickStats(env, fetchFn)]);
  if (gh.status === 'rejected' && ae.status === 'rejected') return null;
  const g = gh.status === 'fulfilled' ? gh.value : { totalDownloads: 0, byVersion: [] };
  const a = ae.status === 'fulfilled' ? ae.value : { clicksByCountry: [], countries: 0 };
  return { totalDownloads: g.totalDownloads, byVersion: g.byVersion, clicksByCountry: a.clicksByCountry, countries: a.countries, updatedAt: now.toISOString() };
}

const reply = (payload, status, cc) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cc } });

export async function onRequestGet({ env }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(CACHE_URL);
  try { const hit = cache && await cache.match(key); if (hit) return hit; } catch { /* no cache: carry on */ }
  let payload = null;
  try { payload = await buildStats(env || {}); } catch { /* fall through */ }
  // Nothing at all (both sources down): say so briefly and do not cache, so the page hides the section and retries later.
  if (!payload) return reply({ error: 'unavailable' }, 503, 'no-store');
  const res = reply(payload, 200, `public, max-age=${TTL}`);
  try { if (cache) await cache.put(key, res.clone()); } catch { /* ignore */ }
  return res;
}

export const onRequest = () => new Response(null, { status: 405, headers: { Allow: 'GET' } });
