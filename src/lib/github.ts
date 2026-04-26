import { Octokit } from 'octokit';

// ─── GitHub Client ────────────────────────────────────────

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!_octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is not set');
    }
    _octokit = new Octokit({ auth: token });
  }
  return _octokit;
}

// ─── Types ────────────────────────────────────────────────

export interface PRListItem {
  number: number;
  title: string;
  state: string;
  author: string;
  authorAvatar: string;
  branch: string;
  baseBranch: string;
  labels: Array<{ name: string; color: string }>;
  commentsCount: number;
  reviewDecision: string | null;
  isDraft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export interface PRDetail extends PRListItem {
  body: string;
  files: PRFile[];
  diff: string;
  checksStatus: 'success' | 'failure' | 'pending' | 'neutral' | null;
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function parseRepo(github: string): { owner: string; repo: string } {
  // Handle formats: "owner/repo", "https://github.com/owner/repo", etc.
  const cleaned = github
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();

  const parts = cleaned.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub repo format: "${github}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Fetch PRs for a repo (open + recently closed/merged).
 */
export async function fetchPRs(
  github: string,
  state: 'open' | 'closed' | 'all' = 'all',
  perPage = 30,
): Promise<PRListItem[]> {
  const octokit = getOctokit();
  const { owner, repo } = parseRepo(github);

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    sort: 'updated',
    direction: 'desc',
    per_page: perPage,
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : pr.state,
    author: pr.user?.login || 'unknown',
    authorAvatar: pr.user?.avatar_url || '',
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    labels: pr.labels.map((l) => ({
      name: typeof l === 'string' ? l : l.name || '',
      color: typeof l === 'string' ? '888888' : l.color || '888888',
    })),
    commentsCount: (pr as unknown as Record<string, number>).comments || 0,
    reviewDecision: null,
    isDraft: pr.draft || false,
    additions: (pr as unknown as Record<string, number>).additions || 0,
    deletions: (pr as unknown as Record<string, number>).deletions || 0,
    changedFiles: (pr as unknown as Record<string, number>).changed_files || 0,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at || null,
  }));
}

/**
 * Fetch full PR details including files and diff.
 */
export async function fetchPRDetail(
  github: string,
  prNumber: number,
): Promise<PRDetail> {
  const octokit = getOctokit();
  const { owner, repo } = parseRepo(github);

  // Fetch PR, files, and diff in parallel
  const [prRes, filesRes, diffRes] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
    octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    }),
  ]);

  const pr = prRes.data;

  // Get check status
  let checksStatus: PRDetail['checksStatus'] = null;
  try {
    const { data: checks } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha,
    });
    if (checks.total_count > 0) {
      const statuses = checks.check_runs.map((c) => c.conclusion);
      if (statuses.every((s) => s === 'success')) checksStatus = 'success';
      else if (statuses.some((s) => s === 'failure')) checksStatus = 'failure';
      else checksStatus = 'pending';
    }
  } catch {
    // Checks API might not be available
  }

  return {
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : pr.state,
    author: pr.user?.login || 'unknown',
    authorAvatar: pr.user?.avatar_url || '',
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    body: pr.body || '',
    labels: pr.labels.map((l) => ({
      name: typeof l === 'string' ? l : l.name || '',
      color: typeof l === 'string' ? '888888' : l.color || '888888',
    })),
    commentsCount: pr.comments + pr.review_comments,
    reviewDecision: null,
    isDraft: pr.draft || false,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changedFiles: pr.changed_files || 0,
    checksStatus,
    files: filesRes.data.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    })),
    diff: typeof diffRes.data === 'string' ? diffRes.data : String(diffRes.data),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at || null,
  };
}

/**
 * Validate a GitHub repo exists and is accessible.
 */
export async function validateRepo(
  github: string,
): Promise<{ valid: boolean; name: string; description: string; error?: string }> {
  try {
    const octokit = getOctokit();
    const { owner, repo } = parseRepo(github);
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      valid: true,
      name: data.full_name,
      description: data.description || '',
    };
  } catch (error) {
    return {
      valid: false,
      name: '',
      description: '',
      error: error instanceof Error ? error.message : 'Failed to validate repo',
    };
  }
}

export { parseRepo };
