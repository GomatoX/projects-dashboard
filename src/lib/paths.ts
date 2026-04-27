import { homedir } from 'os';

/**
 * Expand a leading `~` (or `~/`) to the current user's home directory.
 *
 * `~` is a shell feature, not an OS feature. `child_process.spawn()` and
 * other low-level APIs treat it as a literal directory name, which causes
 * confusing ENOENT errors deep inside the SDK (e.g. Claude Agent SDK
 * mis-reports a missing cwd as "binary not found").
 *
 * Always run user-supplied paths through this before persisting them or
 * passing them as `cwd`.
 */
export function expandTilde(input: string): string {
  if (!input) return input;
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return `${homedir()}/${input.slice(2)}`;
  return input;
}
