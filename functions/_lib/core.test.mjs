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
