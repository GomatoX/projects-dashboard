import simpleGit from 'simple-git';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute, relative } from 'node:path';
import type {
  AgentEvent,
  GitStatus,
  GitBranch,
  GitLogEntry,
  GitFileChange,
} from '../../../src/lib/socket/types.js';

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function git(cwd: string) {
  return simpleGit({ baseDir: expandHome(cwd), binary: 'git' });
}

export async function handleGitStatus(
  requestId: string,
  projectPath: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const status = await g.status();

    const staged: GitFileChange[] = [
      ...status.created.map((p) => ({ path: p, index: 'A', working_dir: ' ' })),
      ...status.staged.map((p) => ({ path: p, index: 'M', working_dir: ' ' })),
      ...status.deleted.map((p) => ({ path: p, index: 'D', working_dir: ' ' })),
      ...status.renamed.map((r) => ({ path: r.to, index: 'R', working_dir: ' ' })),
    ];

    const unstaged: GitFileChange[] = [
      ...status.modified
        .filter((p) => !status.staged.includes(p))
        .map((p) => ({ path: p, index: ' ', working_dir: 'M' })),
      ...status.deleted
        .filter((p) => !staged.some((s) => s.path === p))
        .map((p) => ({ path: p, index: ' ', working_dir: 'D' })),
    ];

    const data: GitStatus = {
      branch: status.current || 'HEAD',
      ahead: status.ahead,
      behind: status.behind,
      staged,
      unstaged,
      untracked: status.not_added,
      conflicted: status.conflicted,
      isClean: status.isClean(),
    };

    return { type: 'GIT_STATUS_RESULT', requestId, data };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Git status failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

export async function handleGitDiff(
  requestId: string,
  projectPath: string,
  staged: boolean,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const diff = staged ? await g.diff(['--cached']) : await g.diff();

    return { type: 'GIT_DIFF_RESULT', requestId, diff };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Git diff failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Surenka pilną originalią ir naujesnę failo versiją, kad UI galėtų
 * parodyti side-by-side diff. Matome tris atvejus:
 *  - 'unstaged'  → original = HEAD:path,        modified = darbinis failas iš disko
 *  - 'staged'    → original = HEAD:path,        modified = :path (indekso versija)
 *  - 'untracked' → original = '',               modified = darbinis failas iš disko
 *
 * Saugumas: `path` yra reliatyvus iki `projectPath`. Resolvinam ir
 * patikrinam, kad galutinis kelias liktų projekto šaknyje, kitaip
 * agent'as galėtų skaityti bet ką per `..`.
 */
export async function handleGitDiffFile(
  requestId: string,
  projectPath: string,
  filePath: string,
  mode: 'unstaged' | 'staged' | 'untracked',
): Promise<AgentEvent> {
  try {
    const root = resolve(expandHome(projectPath));
    const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
    const rel = relative(root, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return {
        type: 'COMMAND_ERROR',
        requestId,
        message: 'Path escapes project root',
      };
    }

    const g = git(projectPath);

    let original = '';
    let modified = '';
    let isNew = false;
    let isDeleted = false;

    // Original
    if (mode === 'untracked') {
      original = '';
      isNew = true;
    } else {
      try {
        original = await g.show([`HEAD:${rel}`]);
      } catch {
        // Failo HEAD'e nėra → pridėtas (added).
        original = '';
        isNew = true;
      }
    }

    // Modified
    if (mode === 'staged') {
      try {
        modified = await g.show([`:${rel}`]);
      } catch {
        modified = '';
        isDeleted = true;
      }
    } else {
      // unstaged arba untracked → working tree
      try {
        modified = await readFile(abs, 'utf8');
      } catch {
        modified = '';
        isDeleted = true;
      }
    }

    return {
      type: 'GIT_DIFF_FILE_RESULT',
      requestId,
      path: rel,
      original,
      modified,
      isNew,
      isDeleted,
    };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Git diff file failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

export async function handleGitBranches(
  requestId: string,
  projectPath: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const result = await g.branch(['-a', '-v']);

    const branches: GitBranch[] = Object.entries(result.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      label: info.label,
      remote: name.startsWith('remotes/') ? name.split('/')[1] : undefined,
    }));

    return { type: 'GIT_BRANCHES_RESULT', requestId, branches };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Git branches failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

export async function handleGitLog(
  requestId: string,
  projectPath: string,
  limit: number,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const log = await g.log({ maxCount: limit });

    const entries: GitLogEntry[] = log.all.map((entry) => ({
      hash: entry.hash,
      hashShort: entry.hash.slice(0, 7),
      message: entry.message,
      author: entry.author_name || '',
      date: entry.date,
      refs: (entry as Record<string, string>).refs || '',
    }));

    return { type: 'GIT_LOG_RESULT', requestId, entries };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Git log failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

export async function handleGitStage(
  requestId: string,
  projectPath: string,
  files: string[],
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    await g.add(files);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'stage',
      success: true,
      message: `Staged ${files.length} file(s)`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'stage',
      success: false,
      message: error instanceof Error ? error.message : 'Stage failed',
    };
  }
}

export async function handleGitUnstage(
  requestId: string,
  projectPath: string,
  files: string[],
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    await g.reset(['HEAD', '--', ...files]);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'unstage',
      success: true,
      message: `Unstaged ${files.length} file(s)`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'unstage',
      success: false,
      message: error instanceof Error ? error.message : 'Unstage failed',
    };
  }
}

export async function handleGitCommit(
  requestId: string,
  projectPath: string,
  message: string,
  amend: boolean,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const opts = amend ? ['--amend', '-m', message] : ['-m', message];
    await g.commit(message, undefined, amend ? { '--amend': null } : undefined);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'commit',
      success: true,
      message: `Committed: ${message}`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'commit',
      success: false,
      message: error instanceof Error ? error.message : 'Commit failed',
    };
  }
}

export async function handleGitPush(
  requestId: string,
  projectPath: string,
  force: boolean,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const opts = force ? ['--force'] : [];
    await g.push(opts);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'push',
      success: true,
      message: 'Pushed successfully',
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'push',
      success: false,
      message: error instanceof Error ? error.message : 'Push failed',
    };
  }
}

export async function handleGitPull(
  requestId: string,
  projectPath: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    const result = await g.pull();
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'pull',
      success: true,
      message: result.summary
        ? `Pulled: ${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`
        : 'Already up to date',
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'pull',
      success: false,
      message: error instanceof Error ? error.message : 'Pull failed',
    };
  }
}

export async function handleGitFetch(
  requestId: string,
  projectPath: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    await g.fetch();
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'fetch',
      success: true,
      message: 'Fetch complete',
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'fetch',
      success: false,
      message: error instanceof Error ? error.message : 'Fetch failed',
    };
  }
}

export async function handleGitCheckout(
  requestId: string,
  projectPath: string,
  branch: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    await g.checkout(branch);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'checkout',
      success: true,
      message: `Switched to ${branch}`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'checkout',
      success: false,
      message: error instanceof Error ? error.message : 'Checkout failed',
    };
  }
}

export async function handleGitCreateBranch(
  requestId: string,
  projectPath: string,
  name: string,
  from: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    await g.checkoutBranch(name, from);
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'create_branch',
      success: true,
      message: `Created and checked out ${name} from ${from}`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'create_branch',
      success: false,
      message: error instanceof Error ? error.message : 'Create branch failed',
    };
  }
}

export async function handleGitDeleteBranch(
  requestId: string,
  projectPath: string,
  name: string,
  remote: boolean,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);
    if (remote) {
      await g.push('origin', name, { '--delete': null });
    } else {
      await g.deleteLocalBranch(name, true);
    }
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'delete_branch',
      success: true,
      message: `Deleted ${remote ? 'remote' : 'local'} branch ${name}`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: 'delete_branch',
      success: false,
      message: error instanceof Error ? error.message : 'Delete branch failed',
    };
  }
}

export async function handleGitStash(
  requestId: string,
  projectPath: string,
  action: 'save' | 'pop' | 'apply' | 'drop',
  message?: string,
): Promise<AgentEvent> {
  try {
    const g = git(projectPath);

    switch (action) {
      case 'save':
        await g.stash(['push', ...(message ? ['-m', message] : [])]);
        break;
      case 'pop':
        await g.stash(['pop']);
        break;
      case 'apply':
        await g.stash(['apply']);
        break;
      case 'drop':
        await g.stash(['drop']);
        break;
    }

    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: `stash_${action}`,
      success: true,
      message: `Stash ${action} completed`,
    };
  } catch (error) {
    return {
      type: 'GIT_ACTION_RESULT',
      requestId,
      action: `stash_${action}`,
      success: false,
      message: error instanceof Error ? error.message : `Stash ${action} failed`,
    };
  }
}
