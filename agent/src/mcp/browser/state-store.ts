// agent/src/mcp/browser/state-store.ts
//
// Persists Playwright BrowserContext.storageState() to disk so chats can survive
// the 10-min idle eviction window with their cookies + localStorage intact.
// Files contain auth tokens / session cookies — written with mode 0600 inside
// a 0700 directory so other local users can't read them.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.dev-dashboard-agent', 'browser-state');

function pathFor(chatId: string): string {
  // chatId is a nanoid; safe-ish for filenames but be conservative.
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(DIR, `${safe}.json`);
}

export async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true, mode: 0o700 });
}

/** Persist a Playwright storageState() result, keyed by chatId. */
export async function saveStorageState(
  chatId: string,
  state: unknown,
): Promise<string> {
  await ensureDir();
  const p = pathFor(chatId);
  await writeFile(p, JSON.stringify(state), { encoding: 'utf-8', mode: 0o600 });
  return p;
}

/** Load a previously saved storageState. Returns undefined if missing. */
export async function loadStorageState(
  chatId: string,
): Promise<unknown | undefined> {
  try {
    const raw = await readFile(pathFor(chatId), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}
