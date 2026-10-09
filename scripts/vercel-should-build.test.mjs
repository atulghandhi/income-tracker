import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBuild } from './vercel-should-build.mjs';

const base = { VERCEL_ENV: 'preview', VERCEL_GIT_REPO_OWNER: 'atulghandhi', VERCEL_GIT_REPO_SLUG: 'income-tracker' };
const noNetwork = () => { throw new Error('Unexpected network call'); };
const prTitle = (title, status = 200) => async (url) => {
  assert.equal(url, 'https://api.github.com/repos/atulghandhi/income-tracker/pulls/7');
  return { ok: status === 200, status, json: async () => ({ title }) };
};

test('production always builds', async () => {
  assert.equal((await shouldBuild({ ...base, VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }, noNetwork)).build, true);
});

test('a branch with "review" in its name builds without asking GitHub', async () => {
  for (const branch of ['review/import', 'claude/Review-sorting', 'feature-review']) {
    assert.equal((await shouldBuild({ ...base, VERCEL_GIT_COMMIT_REF: branch }, noNetwork)).build, true, branch);
  }
});

test('"preview" inside a word does not count as review', async () => {
  assert.equal((await shouldBuild({ ...base, VERCEL_GIT_COMMIT_REF: 'fix-preview-banner' }, noNetwork)).build, false);
  const env = { ...base, VERCEL_GIT_COMMIT_REF: 'x', VERCEL_GIT_PULL_REQUEST_ID: '7' };
  assert.equal((await shouldBuild(env, prTitle('Fix preview banner'))).build, false);
});

test('an ordinary branch with no PR is skipped', async () => {
  assert.equal((await shouldBuild({ ...base, VERCEL_GIT_COMMIT_REF: 'claude/loving-newton', VERCEL_GIT_PULL_REQUEST_ID: '' }, noNetwork)).build, false);
});

test('a PR builds only when its title mentions review', async () => {
  const env = { ...base, VERCEL_GIT_COMMIT_REF: 'claude/loving-newton', VERCEL_GIT_PULL_REQUEST_ID: '7' };
  assert.equal((await shouldBuild(env, prTitle('REVIEW: income sorting'))).build, true);
  assert.equal((await shouldBuild(env, prTitle('Income sorting'))).build, false);
});

test('a failed title lookup skips rather than building', async () => {
  const env = { ...base, VERCEL_GIT_COMMIT_REF: 'x', VERCEL_GIT_PULL_REQUEST_ID: '7' };
  assert.equal((await shouldBuild(env, prTitle('', 403))).build, false);
  assert.equal((await shouldBuild(env, () => Promise.reject(new Error('offline')))).build, false);
});

test('a GITHUB_TOKEN is sent when set', async () => {
  let auth;
  await shouldBuild({ ...base, VERCEL_GIT_COMMIT_REF: 'x', VERCEL_GIT_PULL_REQUEST_ID: '7', GITHUB_TOKEN: 't0k' }, async (_url, options) => {
    auth = options.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ title: 'x' }) };
  });
  assert.equal(auth, 'Bearer t0k');
});
