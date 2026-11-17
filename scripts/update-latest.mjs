#!/usr/bin/env node
// Writes docs/latest.json and rewrites the baked download links, version line and the baked-release JSON block in docs/index.html.
// Usage: node update-latest.mjs <releases.json> [docs-dir]
//   releases.json: output of `gh api "repos/ryanStark24/telltale-releases/releases?per_page=5"`
// Picks the first non-draft release that has a Mac zip. Exits 1 (and changes nothing) if there is none.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [, , releasesFile, docsArg] = process.argv;
if (!releasesFile) { console.error('usage: update-latest.mjs <releases.json> [docs-dir]'); process.exit(2); }
const docs = resolve(docsArg || 'docs');
const REL = 'https://github.com/ryanStark24/telltale-releases/releases';
const PREFIX = 'https://github.com/ryanStark24/telltale-releases/'; // the only place a baked link may point
const DIGEST = /^sha256:[0-9a-f]{64}$/;

const raw = JSON.parse(readFileSync(releasesFile, 'utf8'));
const list = (Array.isArray(raw) ? raw : [raw]).flat();
const ARM = 'AppleSilicon-arm64.zip', INTEL = 'Intel-x64.zip';
const find = (r, p) => (r.assets || []).find((a) => a.name && a.name.includes(p) && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(PREFIX));
const rel = list.find((r) => r && !r.draft && (find(r, ARM) || find(r, INTEL)));
if (!rel) { console.error('No non-draft release with a Mac zip found; nothing changed.'); process.exit(1); }

const trim = (x) => ({
  tag_name: x.tag_name, name: x.name, draft: x.draft, prerelease: x.prerelease, published_at: x.published_at, html_url: x.html_url, body: x.body,
  assets: (x.assets || []).filter((a) => typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(PREFIX))
    .map((a) => ({ name: a.name, size: a.size, browser_download_url: a.browser_download_url, ...(DIGEST.test(a.digest) ? { digest: a.digest } : {}) })),
});
const latest = trim(rel);
writeFileSync(join(docs, 'latest.json'), JSON.stringify(latest) + '\n');

// ---- same wording as the page's script (verLabel, mb, date) ----
const verLabel = (tag) => {
  const v = String(tag || '').replace(/^v/i, ''), m = /^(\d+\.\d+\.\d+)-beta\.?(\d+)?/i.exec(v);
  return m ? m[1] + ' beta' + (m[2] && m[2] !== '1' ? ' ' + m[2] : '') : v;
};
const mb = (n) => (n > 0 ? (n / 1048576).toFixed(n >= 1.05e8 ? 0 : 1) + ' MB' : '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const date = rel.published_at ? new Date(rel.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
const ver = verLabel(rel.tag_name);
const dver = ver.replace(/\s+/g, '-');
const SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v10m0 0 4-4m-4 4L6 9M4 16.5h12"/></svg>';
const btn = (id, a, kind, label, desc, primary) => a
  ? `<a class="btn${primary ? '' : ' sec'}" id="${id}" href="${esc(a.browser_download_url)}" data-dl="${kind}" data-ver="${esc(dver)}">${SVG}<span class="bt"><span class="bl">${label}</span><small>${desc}${a.size ? ' · ' + mb(a.size) : ''}</small></span></a>`
  : `<a class="btn sec" id="${id}" href="${REL}" data-dl="releases" data-ver="fallback" hidden>${SVG}<span class="bt"><span class="bl">${label}</span><small>${desc}</small></span></a>`;

const block = `<!--baked:cta-->
        <p class="latest" id="dl-latest"><span class="pill">Latest</span><b>v${esc(ver)}</b>${date ? `<span class="sep">·</span>${esc(date)}` : ''}</p>
        <div class="dls" id="dls">
          ${btn('dl-arm', find(rel, ARM), 'arm64', 'Apple Silicon', 'M1 or later', true)}
          ${btn('dl-intel', find(rel, INTEL), 'x64', 'Intel', 'Intel Mac', false)}
        </div>
        <p class="alt" id="dl-all" hidden><a href="${REL}">All releases on GitHub</a></p>
        <!--/baked:cta-->`;
const json = JSON.stringify({ tag_name: latest.tag_name, published_at: latest.published_at, html_url: latest.html_url, prerelease: latest.prerelease, assets: latest.assets.filter((a) => a.name.endsWith('.zip')) }).replace(/</g, '\\u003c');

const file = join(docs, 'index.html');
let html = readFileSync(file, 'utf8');
const b1 = /<!--baked:cta-->[\s\S]*?<!--\/baked:cta-->/, b2 = /<script type="application\/json" id="baked-release">[\s\S]*?<\/script>/;
if (!b1.test(html) || !b2.test(html)) { console.error('Baked markers not found in index.html'); process.exit(1); }
html = html.replace(b1, () => block).replace(b2, () => `<script type="application/json" id="baked-release">${json}</script>`);
writeFileSync(file, html);
console.log(`latest: ${rel.tag_name} (${date}); arm ${find(rel, ARM) ? 'ok' : 'missing'}, intel ${find(rel, INTEL) ? 'ok' : 'missing'}`);
