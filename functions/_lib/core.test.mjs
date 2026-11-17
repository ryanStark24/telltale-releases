// Run: node --test functions/_lib/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, buildIssue, titleText, KINDS } from './core.js';

const base = { use: 'QA testing', version: '1.7.6-beta.1', comments: 'It works.', turnstile: 'tok' };
const ok = (o) => { const r = validate({ ...base, ...o }); assert.ok(r.ok, JSON.stringify(r)); return r.data; };
const bad = (o, err) => assert.deepEqual(validate({ ...base, ...o }), { ok: false, error: err });

test('kind defaults to feedback (old clients)', () => {
  assert.equal(ok({ rating: 5 }).kind, 'feedback');
  assert.equal(ok({ rating: 5, kind: '' }).kind, 'feedback');
});
test('unknown kind is rejected', () => bad({ kind: 'rant', rating: 5 }, 'bad_kind'));
test('rating is required only for feedback', () => {
  bad({}, 'bad_rating');
  bad({ kind: 'feedback', rating: 6 }, 'bad_rating');
  bad({ kind: 'feedback', rating: 2.5 }, 'bad_rating');
  for (const kind of ['bug', 'feature', 'question']) assert.equal(ok({ kind }).rating, null);
});
test('use is required for feedback, optional otherwise, but never invalid', () => {
  bad({ rating: 4, use: '' }, 'bad_use');
  bad({ kind: 'bug', use: 'Something else' }, 'bad_use');
  assert.equal(ok({ kind: 'bug', use: '' }).use, '');
  assert.equal(ok({ kind: 'bug', use: undefined }).use, '');
  assert.equal(ok({ kind: 'bug' }).use, 'QA testing');
});
test('other fields keep their rules', () => {
  bad({ rating: 5, comments: '   ' }, 'bad_comments');
  bad({ rating: 5, comments: 'x'.repeat(2001) }, 'bad_comments');
  ok({ rating: 5, comments: 'x'.repeat(2000) });
  bad({ rating: 5, version: 'v1' }, 'bad_version');
  bad({ rating: 5, turnstile: '' }, 'bad_check');
  assert.deepEqual(validate({ ...base, rating: 5, website: 'x' }), { ok: false, error: 'rejected' });
  assert.deepEqual(validate(null), { ok: false, error: 'bad_request' });
});

test('feedback issue is unchanged', () => {
  const i = buildIssue(ok({ rating: 5 }));
  assert.equal(i.title, 'Feedback: ★★★★★ · qa testing · 1.7.6-beta.1');
  assert.deepEqual(i.labels, ['feedback']);
  assert.match(i.body, /### How was Telltale for you\?\n\n5 - Great/);
  assert.match(i.body, /### Comments\n\n```text\nIt works\.\n```/);
  assert.equal(buildIssue({ rating: 1, use: 'Other', version: '', comments: 'x' }).title, 'Feedback: ★☆☆☆☆ · other');
  assert.equal(buildIssue({ rating: 3, use: 'Other', version: '', comments: 'x' }).labels[0], 'feedback'); // kind absent
});
test('bug, feature and question titles and labels', () => {
  const cases = { bug: ['Bug', 'bug'], feature: ['Feature idea', 'enhancement'], question: ['Question', 'question'] };
  for (const [kind, [t, label]] of Object.entries(cases)) {
    const i = buildIssue(ok({ kind, comments: 'Something broke on launch' }));
    assert.equal(i.title, `${t}: Something broke on launch · 1.7.6-beta.1`);
    assert.deepEqual(i.labels, [label]);
    assert.match(i.body, /```text\nSomething broke on launch\n```/);
  }
  const noVer = buildIssue(ok({ kind: 'bug', version: '' }));
  assert.equal(noVer.title, 'Bug: It works.');
  assert.match(noVer.body, /_No response_/);
  assert.doesNotMatch(buildIssue(ok({ kind: 'bug', use: '' })).body, /What do you use/);
});
test('title is cut to about 60 characters on whole characters', () => {
  const t = buildIssue(ok({ kind: 'bug', version: '', comments: 'a'.repeat(100) })).title;
  assert.equal(t, 'Bug: ' + 'a'.repeat(60) + '…');
  assert.equal(Array.from(titleText('😀'.repeat(70))).length, 61);
});
test('title text is sanitised: no mentions, newlines or markdown', () => {
  const nasty = 'hi @octocat\r\nand @org/team\n# heading [x](http://e.com) ![i](u) `code` **b** <img src=x> | ‮​';
  const i = buildIssue(ok({ kind: 'question', version: '', comments: nasty }));
  assert.doesNotMatch(i.title, /[@\n\r`*#\[\]()<>!|‮​]/);
  assert.match(i.title, /^Question: hi octocat and org\/team heading x http:\/\/e\.com i u code b im…$/);
  assert.equal(buildIssue(ok({ kind: 'bug', version: '', comments: '@@@ ``` ###' })).title, 'Bug:');
  // the body keeps the fence and the zero-width @ treatment
  assert.match(i.body, /@​octocat/);
});
test('body fence grows past backticks in user text', () => {
  const i = buildIssue(ok({ kind: 'bug', comments: 'x ```` y' }));
  assert.match(i.body, /`````text\nx ```` y\n`````/);
});
test('KINDS', () => assert.deepEqual(KINDS, ['feedback', 'bug', 'feature', 'question']));

// ---- click beacon: strict origin, per-hour cache key ----
import { strictSameOrigin, hitCacheKey } from './core.js';
const req = (origin) => new Request('https://dl.example.com/api/hit?k=download-arm64-1.7.4-beta', { method: 'POST', headers: origin === undefined ? {} : { Origin: origin } });
test('strictSameOrigin needs an Origin that matches the host', () => {
  assert.equal(strictSameOrigin(req('https://dl.example.com')), true);
  assert.equal(strictSameOrigin(req()), false); // missing Origin is refused here
  assert.equal(strictSameOrigin(req('https://evil.example.org')), false);
  assert.equal(strictSameOrigin(req('https://dl.example.com.evil.org')), false);
  assert.equal(strictSameOrigin(req('null')), false);
  assert.equal(strictSameOrigin(req('not a url')), false);
});
test('hitCacheKey: stable, hashed, one per ip + key + hour', async () => {
  const t = Date.UTC(2026, 10, 17, 10, 30);
  const a = await hitCacheKey('203.0.113.7', 'download-arm64-1.7.4-beta', t);
  assert.match(a, /^https:\/\/telltale-hits\.internal\/h\/[0-9a-f]{64}$/);
  assert.ok(!a.includes('203.0.113.7'));
  assert.equal(a, await hitCacheKey('203.0.113.7', 'download-arm64-1.7.4-beta', t + 20 * 60 * 1000)); // same hour
  assert.notEqual(a, await hitCacheKey('203.0.113.7', 'download-arm64-1.7.4-beta', t + 40 * 60 * 1000)); // next hour
  assert.notEqual(a, await hitCacheKey('203.0.113.8', 'download-arm64-1.7.4-beta', t));
  assert.notEqual(a, await hitCacheKey('203.0.113.7', 'download-x64-1.7.4-beta', t));
});

import { onRequestPost as hit } from '../api/hit.js';
test('/api/hit counts once per ip per key per hour, only same-origin, always 204', async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async (r) => store.get(r.url), put: async (r, res) => { store.set(r.url, res); } } };
  const points = [];
  const env = { HITS: { writeDataPoint: (p) => points.push(p) } };
  const call = (origin, ip, k = 'download-arm64-1.7.4-beta') => hit({ env, request: new Request(`https://dl.example.com/api/hit?k=${k}`, { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip } }) });
  try {
    for (const r of [await call('https://dl.example.com', '198.51.100.1'), await call('https://dl.example.com', '198.51.100.1'), await call(null, '198.51.100.2'), await call('https://evil.example.org', '198.51.100.3'), await call('https://dl.example.com', '198.51.100.1', 'bogus')]) assert.equal(r.status, 204);
    assert.equal(points.length, 1);
    assert.deepEqual(points[0].blobs, ['download-arm64-1.7.4-beta', 'XX']);
    await call('https://dl.example.com', '198.51.100.1', 'download-x64-1.7.4-beta'); // other key counts
    await call('https://dl.example.com', '198.51.100.4'); // other ip counts
    assert.equal(points.length, 3);
    assert.ok([...store.keys()].every((u) => !u.includes('198.51.100')));
  } finally { delete globalThis.caches; }
});
