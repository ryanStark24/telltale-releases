// Pure aggregation for GET /api/stats. No network, no globals: unit-tested in test/stats.test.mjs.

/** A real download-click key (version required). Drops test rows such as download-arm64-test and the releases fallback. */
export const REAL_KEY = /^download-(arm64|x64)-\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
/** Countries with fewer clicks than this are folded into "Other" so no single person stands out. */
export const MIN_COUNTRY_CLICKS = 3;

const num = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * GitHub releases -> { totalDownloads, byVersion:[{version, arm64, x64}] }. Zip assets only; drafts skipped.
 * Arch comes from the asset name (…-arm64.zip / …-x64.zip). Release order is kept (GitHub lists newest first).
 */
export function aggregateReleases(releases) {
  let totalDownloads = 0;
  const byVersion = [];
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || typeof r.tag_name !== 'string') continue;
    let arm64 = 0, x64 = 0, any = false;
    for (const a of Array.isArray(r.assets) ? r.assets : []) {
      const name = a && typeof a.name === 'string' ? a.name : '';
      if (!/\.zip$/i.test(name)) continue;
      const n = num(a.download_count);
      if (/arm64\.zip$/i.test(name)) { arm64 += n; any = true; }
      else if (/x64\.zip$/i.test(name)) { x64 += n; any = true; }
      else continue;
      totalDownloads += n;
    }
    if (any) byVersion.push({ version: r.tag_name.replace(/^v/i, ''), arm64, x64 });
  }
  return { totalDownloads, byVersion };
}

/**
 * Analytics Engine rows [{ k, country, clicks }] -> { clicksByCountry, countries }.
 * Only keys matching REAL_KEY count. Valid 2-letter countries below MIN_COUNTRY_CLICKS, and unknown ones
 * (XX, T1, anything else), become "Other" (country: "ZZ"). Keys are never returned.
 * `countries` is the number of distinct real countries seen (a count, not who).
 */
export function aggregateClicks(rows) {
  const per = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !REAL_KEY.test(String(r.k))) continue;
    const n = num(r.clicks);
    if (!n) continue;
    const c = String(r.country || '').toUpperCase();
    per.set(c, (per.get(c) || 0) + n);
  }
  const named = []; let other = 0, countries = 0;
  for (const [c, n] of per) {
    const real = /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1';
    if (real) countries++;
    if (real && n >= MIN_COUNTRY_CLICKS) named.push({ country: c, clicks: n }); else other += n;
  }
  named.sort((a, b) => b.clicks - a.clicks || a.country.localeCompare(b.country));
  const clicksByCountry = other ? [...named, { country: 'ZZ', clicks: other }] : named;
  return { clicksByCountry, countries };
}
