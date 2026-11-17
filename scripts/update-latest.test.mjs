// Run: node --test scripts/update-latest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const D1 = 'sha256:' + 'a'.repeat(64), D2 = 'sha256:' + 'b'.repeat(64);
const P = 'https://github.com/ryanStark24/telltale-releases/releases/download/';
function run(releases) {
  const dir = mkdtempSync(join(tmpdir(), 'ul-'));
  cpSync(join(root, 'docs'), join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'releases.json'), JSON.stringify(releases));
  const r = spawnSync(process.execPath, [join(root, 'scripts/update-latest.mjs'), join(dir, 'releases.json'), join(dir, 'docs')], { encoding: 'utf8' });
  return { r, html: readFileSync(join(dir, 'docs/index.html'), 'utf8'), latest: () => JSON.parse(readFileSync(join(dir, 'docs/latest.json'), 'utf8')) };
}
const baked = (html) => JSON.parse(/<script type="application\/json" id="baked-release">([\s\S]*?)<\/script>/.exec(html)[1]);

test('writes digests, pins URLs, escapes the tag', () => {
  const tag = 'v1.8.0"x<y';
  const { r, html, latest } = run([{ tag_name: tag, draft: false, published_at: '2026-11-17T00:00:00Z', html_url: P.replace('download/', 'tag/x'), body: 'b', assets: [
    { name: 'T-mac-AppleSilicon-arm64.zip', size: 134234939, browser_download_url: P + 'a/arm.zip', digest: D1 },
    { name: 'T-mac-Intel-x64.zip', size: 141211794, browser_download_url: P + 'a/intel.zip', digest: 'sha256:nothex' },
    { name: 'Other-Intel-x64.zip', size: 1, browser_download_url: 'https://evil.example.org/x.zip', digest: D2 },
  ] }]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^latest: v1\.8\.0"x<y .*arm ok, intel ok/);
  const b = baked(html);
  assert.equal(b.tag_name, tag);
  assert.deepEqual(b.assets.map((a) => a.digest), [D1, undefined]);
  assert.ok(!b.assets.some((a) => a.browser_download_url.includes('evil')));
  assert.deepEqual(latest().assets.map((a) => a.digest), [D1, undefined]);
  assert.equal(latest().assets.length, 2);
  assert.ok(!html.includes('evil.example.org'));
  assert.match(html, /id="baked-release">[^\n]*\\u003cy/); // < stays escaped in the JSON block
  assert.ok(html.includes('data-ver="1.8.0&quot;x&lt;y"'));
  assert.ok(!html.includes('data-ver="1.8.0"x'));
  assert.match(html, /<!--baked:cta-->[\s\S]*href="https:\/\/github\.com\/ryanStark24\/telltale-releases\/releases\/download\/a\/arm\.zip"[\s\S]*<!--\/baked:cta-->/);
  assert.match(html, /<script src="page\.js" defer><\/script>/);
});

test('a foreign-only release is skipped: exit 1, nothing changed', () => {
  const { r, html } = run([{ tag_name: 'v9', draft: false, assets: [{ name: 'x-Intel-x64.zip', browser_download_url: 'https://evil.example.org/x.zip' }] }]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No non-draft release with a Mac zip found; nothing changed\./);
  assert.equal(html, readFileSync(join(root, 'docs/index.html'), 'utf8'));
});
