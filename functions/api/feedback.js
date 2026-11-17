// POST /api/feedback: validates the form, checks Turnstile, creates a public GitHub issue.
// Secrets: TURNSTILE_SECRET, GITHUB_TOKEN. Binding: RATE (KV). Comment text is never logged.
import { MAX_BODY, REPO, buildIssue, json, rateLimited, sameOrigin, validate } from '../_lib/core.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'origin' }, 403);
  const len = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(len) && len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400); }

  const v = validate(body);
  if (!v.ok) return json({ ok: false, error: v.error }, v.error === 'rejected' ? 200 : 400); // honeypot gets a quiet 200
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  try {
    if (await rateLimited(env, ip)) return json({ ok: false, error: 'rate' }, 429);

    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', v.data.turnstile);
    form.append('remoteip', ip);
    const t = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    const tj = await t.json();
    if (!tj.success) return json({ ok: false, error: 'check_failed' }, 403);

    const g = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'telltale-feedback',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(buildIssue(v.data)),
      signal: AbortSignal.timeout(8000),
    });
    if (!g.ok) return json({ ok: false, error: 'github' }, 502);
    const created = await g.json();
    return json({ ok: true, url: created.html_url });
  } catch {
    return json({ ok: false, error: 'upstream' }, 502);
  }
}

// Any other method: not allowed.
export const onRequest = () => json({ ok: false, error: 'method' }, 405);
