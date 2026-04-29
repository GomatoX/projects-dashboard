// agent/src/mcp/browser/context-pool.ts
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Socket } from 'socket.io-client';
import type { AgentEvent } from '../../../../src/lib/socket/types.js';

const MAX_CONTEXTS = 5;
const IDLE_TTL_MS = 10 * 60_000;
const VIEWPORT = { width: 1280, height: 800 };

interface PooledContext {
  chatId: string;
  ctx: BrowserContext;
  page: Page;
  /** Most recent tool-call wallclock ms — used for LRU + idle eviction. */
  lastUsed: number;
  /** Set of teardown fns (e.g. screencast detacher). Run in close(). */
  teardowns: Array<() => Promise<void> | void>;
}

let browser: Browser | null = null;
let browserStarting: Promise<Browser> | null = null;
const contexts = new Map<string, PooledContext>();
let idleTimer: NodeJS.Timeout | null = null;
let agentSocket: Socket | null = null;

/** Wire the pool to the agent socket so close events emit BROWSER_CONTEXT_CLOSED. */
export function setAgentSocket(socket: Socket): void {
  agentSocket = socket;
}

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (browserStarting) return browserStarting;

  browserStarting = (async () => {
    const b = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // CDP screencast needs --disable-gpu off explicitly on some
        // headless Linux distros to avoid black frames. Default is fine.
      ],
    });
    b.on('disconnected', () => {
      browser = null;
      // Drop all contexts — they're unusable once the browser is gone.
      for (const [id] of contexts) {
        contexts.delete(id);
      }
    });
    browser = b;
    return b;
  })();

  try {
    return await browserStarting;
  } finally {
    browserStarting = null;
  }
}

function emit(event: AgentEvent): void {
  if (!agentSocket) return;
  agentSocket.emit('event', event);
}

/** Get or create the context for this chat. */
export async function getOrCreateContext(
  chatId: string,
  sessionId: string,
): Promise<PooledContext> {
  const existing = contexts.get(chatId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  // LRU evict if at cap.
  if (contexts.size >= MAX_CONTEXTS) {
    const oldest = [...contexts.values()].sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (oldest) {
      await closeContext(oldest.chatId, 'evicted');
    }
  }

  const b = await ensureBrowser();
  const ctx = await b.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const pooled: PooledContext = {
    chatId,
    ctx,
    page,
    lastUsed: Date.now(),
    teardowns: [],
  };
  contexts.set(chatId, pooled);

  emit({
    type: 'BROWSER_CONTEXT_OPENED',
    chatId,
    sessionId,
    url: page.url() || 'about:blank',
  });

  ensureIdleTimer();
  return pooled;
}

/** Mark the context as just-used. Tools call this after every action. */
export function touch(chatId: string): void {
  const ctx = contexts.get(chatId);
  if (ctx) ctx.lastUsed = Date.now();
}

/** Look up without creating. Used for idle sweep + diagnostics. */
export function peek(chatId: string): PooledContext | undefined {
  return contexts.get(chatId);
}

export function listChatIds(): string[] {
  return [...contexts.keys()];
}

/** Close one context and emit the close event. */
export async function closeContext(
  chatId: string,
  reason: 'idle' | 'evicted' | 'shutdown' | 'explicit',
): Promise<void> {
  const pooled = contexts.get(chatId);
  if (!pooled) return;
  contexts.delete(chatId);
  for (const fn of pooled.teardowns) {
    try {
      await fn();
    } catch {
      // best-effort
    }
  }
  try {
    await pooled.ctx.close();
  } catch {
    // best-effort
  }
  emit({ type: 'BROWSER_CONTEXT_CLOSED', chatId, reason });
}

/** Close everything. Called on agent SIGTERM. */
export async function closeAll(): Promise<void> {
  for (const id of [...contexts.keys()]) {
    await closeContext(id, 'shutdown');
  }
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    try {
      await browser.close();
    } catch {
      // best-effort
    }
    browser = null;
  }
}

function ensureIdleTimer(): void {
  if (idleTimer) return;
  // Sweep every minute; cheap.
  idleTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, ctx] of contexts) {
      if (now - ctx.lastUsed > IDLE_TTL_MS) {
        await closeContext(id, 'idle');
      }
    }
    if (contexts.size === 0 && idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  }, 60_000);
  // Don't keep the event loop alive for sweeps alone.
  idleTimer.unref?.();
}

// ─── Test seam ─────────────────────────────────────────────
/**
 * Internal — used by the smoke script to inject fake clock & cap.
 * Production code should never call these.
 */
export const _internal = {
  setMaxContexts(_n: number) {
    // Compile-time constant in production; the smoke test uses
    // contexts directly via the public API. Stub kept for symmetry.
    void _n;
  },
  contexts,
};
