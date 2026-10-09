// Vercel "Ignored Build Step" (vercel.json → ignoreCommand). Vercel builds when
// this exits 1 and skips the deployment when it exits 0.
//
// Production (main) always builds. Previews only build when the branch name or
// the pull request title has a word starting with "review" (any case), e.g.
// `review/new-import`, `claude/review-sorting` or a PR titled "Review: income
// sorting". "preview" doesn't count. Everything else is skipped, so normal
// branches and PRs no longer spin up preview environments.
//
// Vercel exposes the PR number but not its title, so the title is read from the
// GitHub API. The repo is public; set GITHUB_TOKEN in the Vercel project if
// unauthenticated requests start hitting GitHub's per-IP rate limit.
import { pathToFileURL } from 'node:url';

const KEYWORD = /(?<![a-z])review/i;

export async function shouldBuild(env = process.env, fetchImpl = globalThis.fetch) {
  if (env.VERCEL_ENV === 'production') return { build: true, reason: 'production deployment' };

  const branch = env.VERCEL_GIT_COMMIT_REF ?? '';
  if (KEYWORD.test(branch)) return { build: true, reason: `branch "${branch}" contains "review"` };

  const pr = env.VERCEL_GIT_PULL_REQUEST_ID;
  if (!pr) return { build: false, reason: `branch "${branch}" has no "review" in its name and no pull request yet` };

  const repo = `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`;
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/pulls/${pr}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'vercel-ignore-build-step',
        ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!response.ok) return { build: false, reason: `could not read PR #${pr} title (GitHub ${response.status})` };
    const { title = '' } = await response.json();
    return KEYWORD.test(title)
      ? { build: true, reason: `PR #${pr} title "${title}" contains "review"` }
      : { build: false, reason: `PR #${pr} title "${title}" has no "review"` };
  } catch (error) {
    return { build: false, reason: `could not read PR #${pr} title (${error.message})` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { build, reason } = await shouldBuild();
  console.log(`${build ? 'Building' : 'Skipping preview'}: ${reason}`);
  process.exit(build ? 1 : 0);
}
