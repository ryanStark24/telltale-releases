// Shared logic for the Pages Functions. No network here except where a function takes `fetch`.
// (Files under functions/ that export no onRequest* handler are not routes.)

export const REPO = 'ryanStark24/telltale-releases';
export const USES = ['Debugging failures', 'QA testing', 'Reviewing logs', 'Other'];
export const MAX_BODY = 8 * 1024;
export const RATE_LIMIT = 5;
export const RATE_WINDOW_S = 3600;
const VERSION_RE = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;
const HIT_RE = /^download-(arm64|x64|releases)-[0-9A-Za-z.\-]{1,24}$/;

/** Returns { ok:true, data } or { ok:false, error }. Pure: no network. */
export function validate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  if (typeof body.website === 'string' && body.website !== '') return { ok: false, error: 'rejected' }; // honeypot
  const rating = body.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'bad_rating' };
  if (!USES.includes(body.use)) return { ok: false, error: 'bad_use' };
  const version = body.version == null ? '' : body.version;
  if (typeof version !== 'string' || (version !== '' && !VERSION_RE.test(version))) return { ok: false, error: 'bad_version' };
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  if (comments.length < 1 || comments.length > 2000) return { ok: false, error: 'bad_comments' };
  if (typeof body.turnstile !== 'string' || body.turnstile.length < 1 || body.turnstile.length > 2048) return { ok: false, error: 'bad_check' };
  return { ok: true, data: { rating, use: body.use, version, comments, turnstile: body.turnstile } };
}

/** A download-click key such as download-arm64-1.7.4-beta. Anything else is dropped. */
export const validHitKey = (k) => typeof k === 'string' && HIT_RE.test(k);

/** User text goes in a code fence so links, images and mentions stay inert; @ gets a zero-width character too. */
export function neutralise(text) {
  const t = text.replace(/\r\n?/g, '\n').replace(/@/g, '@​');
  const longest = Math.max(0, ...(t.match(/`+/g) || []).map((r) => r.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${t}\n${fence}`;
}

export function buildIssue({ rating, use, version, comments }) {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const labels = ['', 'It did not work for me', 'Hard going', 'Okay', 'Good', 'Great'];
  return {
    title: `Feedback: ${stars} · ${use.toLowerCase()}${version ? ' · ' + version : ''}`,
    labels: ['feedback'],
    body: [
      '### How was Telltale for you?', '', `${rating} - ${labels[rating]}`, '',
      '### What do you use Telltale for?', '', use, '',
      '### Telltale version', '', version || '_No response_', '',
      '### Comments', '', neutralise(comments), '',
    ].join('\n'),
  };
}

/** Same-origin only: a browser sends Origin on a cross-site POST; refuse it unless it is this site. */
export function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return true; // sendBeacon and curl may omit it; Turnstile and the rate limit cover abuse
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
}

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Per-IP limit on Workers KV (binding RATE). Not atomic; enough to stop casual abuse. */
export async function rateLimited(env, ip) {
  if (!env.RATE) return false;
  const key = `rl:${ip}:${Math.floor(Date.now() / (RATE_WINDOW_S * 1000))}`;
  const n = parseInt((await env.RATE.get(key)) || '0', 10);
  if (n >= RATE_LIMIT) return true;
  await env.RATE.put(key, String(n + 1), { expirationTtl: RATE_WINDOW_S + 60 });
  return false;
}
