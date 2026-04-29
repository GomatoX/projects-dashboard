// agent/src/mcp/browser/state-store.ts
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
  await mkdir(DIR, { recursive: true });
}

/** Persist a Playwright storageState() result, keyed by chatId. */
export async function saveStorageState(
  chatId: string,
  state: unknown,
): Promise<string> {
  await ensureDir();
  const p = pathFor(chatId);
  await writeFile(p, JSON.stringify(state), 'utf-8');
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
