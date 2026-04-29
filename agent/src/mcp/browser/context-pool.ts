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
  /** Monotonic per-pool sequence; tiebreaker for LRU when ms timestamps collide. */
  lastUsedSeq: number;
  /** Set of teardown fns (e.g. screencast detacher). Run in close(). */
  teardowns: Array<() => Promise<void> | void>;
}

let browser: Browser | null = null;
let browserStarting: Promise<Browser> | null = null;
const contexts = new Map<string, PooledContext>();
/**
 * In-flight create promises keyed by chatId. Prevents the TOCTOU race where
 * two concurrent `getOrCreateContext` calls for the same chat both pass the
 * "does it exist?" check and create two BrowserContexts (leaking the first).
 */
const pendingCreates = new Map<string, Promise<PooledContext>>();
let idleTimer: NodeJS.Timeout | null = null;
let agentSocket: Socket | null = null;
let shuttingDown = false;
/** Monotonic counter so `lastUsedSeq` is always strictly increasing per pool. */
let lastUsedSeqCounter = 0;

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
      // We can't await ctx.close() (the browser is gone), but we still
      // emit BROWSER_CONTEXT_CLOSED so subscribers don't see ghosts.
      const orphans = [...contexts.keys()];
      contexts.clear();
      pendingCreates.clear();
      if (orphans.length > 0) {
        console.warn(
          `[browser-pool] Chromium disconnected; dropping ${orphans.length} context(s):`,
          orphans.join(', '),
        );
      }
      for (const id of orphans) {
        emit({ type: 'BROWSER_CONTEXT_CLOSED', chatId: id, reason: 'shutdown' });
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
  if (shuttingDown) {
    throw new Error('browser pool is shutting down');
  }

  const existing = contexts.get(chatId);
  if (existing) {
    touch(chatId);
    return existing;
  }

  // Coalesce concurrent creates for the same chatId so we don't leak
  // a duplicate BrowserContext when two SDK tool calls race.
  const inFlight = pendingCreates.get(chatId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    // LRU evict if at cap. Sort by lastUsed (primary) and lastUsedSeq
    // (tiebreaker for ms-collisions under heavy load).
    if (contexts.size >= MAX_CONTEXTS) {
      const oldest = [...contexts.values()].sort(
        (a, b) => a.lastUsed - b.lastUsed || a.lastUsedSeq - b.lastUsedSeq,
      )[0];
      if (oldest) {
        await closeContext(oldest.chatId, 'evicted');
      }
    }

    const b = await ensureBrowser();
    const ctx = await b.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const now = Date.now();
    const pooled: PooledContext = {
      chatId,
      ctx,
      page,
      lastUsed: now,
      lastUsedSeq: ++lastUsedSeqCounter,
      teardowns: [],
    };
    contexts.set(chatId, pooled);

    // Attach the live screencast. Stored as a teardown so closeContext()
    // also stops the stream cleanly.
    if (agentSocket) {
      const { attachScreencast } = await import('./screencast.js');
      const detach = await attachScreencast({
        ctx,
        page,
        chatId,
        sessionId,
        socket: agentSocket,
      });
      pooled.teardowns.push(detach);
    }

    emit({
      type: 'BROWSER_CONTEXT_OPENED',
      chatId,
      sessionId,
      url: page.url() || 'about:blank',
    });

    ensureIdleTimer();
    return pooled;
  })();

  pendingCreates.set(chatId, promise);
  try {
    return await promise;
  } finally {
    pendingCreates.delete(chatId);
  }
}

/** Mark the context as just-used. Tools call this after every action. */
export function touch(chatId: string): void {
  const ctx = contexts.get(chatId);
  if (ctx) {
    ctx.lastUsed = Date.now();
    ctx.lastUsedSeq = ++lastUsedSeqCounter;
  }
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
    } catch (err) {
      console.warn(`[browser-pool] teardown failed for ${chatId}:`, err);
    }
  }
  try {
    await pooled.ctx.close();
  } catch (err) {
    console.warn(`[browser-pool] context.close() failed for ${chatId}:`, err);
  }
  emit({ type: 'BROWSER_CONTEXT_CLOSED', chatId, reason });
}

/** Close everything. Called on agent SIGTERM. */
export async function closeAll(): Promise<void> {
  shuttingDown = true;
  // Drain any in-flight creates first so they can't slip a context past us.
  if (pendingCreates.size > 0) {
    await Promise.allSettled([...pendingCreates.values()]);
  }
  // Close contexts in parallel — sequential awaits would multiply Chromium
  // round-trip latency by N on SIGTERM and risk hanging the daemon shutdown.
  await Promise.allSettled(
    [...contexts.keys()].map((id) => closeContext(id, 'shutdown')),
  );
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.warn('[browser-pool] browser.close() failed:', err);
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
 * Internal — exposed only for the smoke script. Read-only intent:
 * mutating `contexts` directly will corrupt pool invariants (no
 * BROWSER_CONTEXT_OPENED/CLOSED emit, no LRU bookkeeping).
 */
export const _internal = {
  contexts,
};
