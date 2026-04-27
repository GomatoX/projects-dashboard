// src/lib/ai/event-journal.ts
//
// Per-chat event journal backing the chat stream. Hybrid storage:
//
//   * SQLite (chat_stream_journals + chat_stream_events) is the durable
//     source of truth. Survives Next.js HMR, dev server restart, full
//     process crash. Used for snapshot replay by /stream/subscribe.
//
//   * Process-scoped Map<chatId, Set<listener>> is the live push channel.
//     Lost on restart, which is fine — `crashRecovery()` at boot seals
//     any orphaned `active` journals so subscribers see a clean ended
//     state.
//
// Lifecycle:
//   startJournal(chatId)   → upserts row to status='active', clears any
//                            previous events, registers listener Set.
//   appendEvent(chatId, d) → INSERT a row, then notify listeners.
//   endJournal(chatId)     → UPDATE status='ended', flush nextSeq, fire
//                            listener end-sentinel, schedule cleanup.
//   getSnapshot(...)       → SELECT events > sinceSeq.
//   subscribe(...)         → add listener to Set.
//   crashRecovery()        → boot-time: any 'active' rows become 'ended'
//                            with a synthetic error event appended.

import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatStreamEvents, chatStreamJournals } from '@/lib/db/schema';

export type JournalEvent = {
  /** Monotonic per-journal sequence number, starting at 1. */
  seq: number;
  /** The exact SSE `data:` payload (already-stringified JSON). */
  data: string;
};

type JournalListener = (event: JournalEvent) => void;

interface ActiveMeta {
  chatId: string;
  /** Authoritative sequence counter while the journal is active. */
  nextSeq: number;
  listeners: Set<JournalListener>;
}

const active = new Map<string, ActiveMeta>();

/**
 * Cleanup timers from `endJournal` keyed by chatId at module scope (not on
 * the dropped `ActiveMeta` instance). Storing them here is what lets a
 * subsequent `startJournal` clear the prior timer — otherwise the old
 * timer would fire mid-retention of a successor journal and delete its
 * rows ~15s into the new 30s window.
 */
const pendingCleanup = new Map<string, ReturnType<typeof setTimeout>>();

function clearPendingCleanup(chatId: string): void {
  const t = pendingCleanup.get(chatId);
  if (t) {
    clearTimeout(t);
    pendingCleanup.delete(chatId);
  }
}

/** How long after a stream ends we keep the journal rows for late readers. */
const POST_END_RETENTION_MS = 30_000;

/**
 * Begin a fresh journal for the given chat. If a journal is already
 * active in this process, returns false — the caller MUST refuse the
 * new stream attempt with HTTP 409.
 *
 * Clears any previous events for this chatId. We treat each turn as a
 * fresh recording — the persisted assistant message in `chat_messages`
 * is the durable artefact; the journal is purely for "live replay
 * during the turn".
 */
export async function startJournal(chatId: string): Promise<boolean> {
  if (active.has(chatId)) return false;

  // Claim the in-memory slot SYNCHRONOUSLY so a concurrent startJournal
  // for the same chatId sees `active.has(chatId)` and returns false BEFORE
  // its DB transaction begins. Without this, two POSTs that both pass
  // `isChatActive` could both enter the tx, both succeed, and both believe
  // they own the journal — corrupting the event log via interleaved seqs.
  active.set(chatId, {
    chatId,
    nextSeq: 1,
    listeners: new Set(),
  });

  // A successor journal claiming this chatId cancels any pending cleanup
  // from the previous turn — those rows are now ours to manage.
  clearPendingCleanup(chatId);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId));
      // Upsert journal row to a fresh active state.
      await tx
        .insert(chatStreamJournals)
        .values({
          chatId,
          status: 'active',
          startedAt: new Date(),
          endedAt: null,
          nextSeq: 1,
        })
        .onConflictDoUpdate({
          target: chatStreamJournals.chatId,
          set: {
            status: 'active',
            startedAt: new Date(),
            endedAt: null,
            nextSeq: 1,
          },
        });
    });
  } catch (err) {
    // Release the slot so the caller can retry rather than be 409'd forever.
    active.delete(chatId);
    throw err;
  }

  return true;
}

/**
 * Append an event. Persists to SQLite, then notifies all live listeners.
 * Returns the assigned event (with seq) or null if the journal is not
 * active in this process.
 *
 * Live listeners ARE notified even if the DB insert throws — losing the
 * persisted copy of one event is preferable to dropping a frame from
 * the live UI. The error is logged so it shows up in the dev console.
 *
 * Note: a failed insert leaves a gap in the persisted seq sequence
 * (e.g. 1, 2, 4 if seq=3 fails). Subscribe replay (`getSnapshot`) will
 * not see the failed event; live listeners did. The subscribe endpoint
 * tolerates non-contiguous seq because its dedupe is `seq <= lastSentSeq`,
 * which works correctly across gaps.
 *
 * Concurrency: seq assignment is atomic (synchronous reservation before
 * the first await), so persisted seqs are always uniquely allocated in
 * call order. But listener fan-out runs after the awaited DB insert, so
 * if two `appendEvent` calls overlap, listeners may observe their events
 * in commit order rather than seq order. Subscribers must dedupe/sort by
 * `event.seq` rather than relying on listener arrival order.
 */
export async function appendEvent(
  chatId: string,
  data: string,
): Promise<JournalEvent | null> {
  const meta = active.get(chatId);
  if (!meta) return null;

  const seq = meta.nextSeq;
  meta.nextSeq += 1;

  try {
    await db.insert(chatStreamEvents).values({
      chatId,
      seq,
      data,
      createdAt: new Date(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[event-journal] persist failed', { chatId, seq, err });
    // fall through — still notify listeners so the live UI sees the event
  }

  const event: JournalEvent = { seq, data };
  for (const listener of meta.listeners) {
    try {
      listener(event);
    } catch {
      // listener errors must not break the journal
    }
  }
  return event;
}

/**
 * Mark the journal ended. Notifies listeners (so they flush + close)
 * and schedules cleanup. Idempotent; safe to call from finally blocks.
 */
export async function endJournal(chatId: string): Promise<void> {
  const meta = active.get(chatId);
  if (!meta) return;
  active.delete(chatId);

  try {
    await db
      .update(chatStreamJournals)
      .set({ status: 'ended', endedAt: new Date(), nextSeq: meta.nextSeq })
      .where(eq(chatStreamJournals.chatId, chatId));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[event-journal] endJournal persist failed', { chatId, err });
  }

  // Wake up listeners so they observe the end and detach.
  for (const listener of meta.listeners) {
    try {
      listener({ seq: -1, data: '__END__' });
    } catch {
      // ignore
    }
  }
  meta.listeners.clear();

  // Replace any stale cleanup timer for this chatId — only the most
  // recent endJournal's retention window applies. Without this, an old
  // timer from a previous turn could fire ~15s into a successor journal's
  // retention and delete its rows.
  clearPendingCleanup(chatId);
  const timer = setTimeout(() => {
    pendingCleanup.delete(chatId);
    // Guard: a fresh journal may have claimed this chatId during the
    // retention window. If so, leave its rows alone — startJournal
    // already cleared this timer, but check defensively.
    if (active.has(chatId)) return;
    void deleteJournal(chatId).catch(() => {});
  }, POST_END_RETENTION_MS);
  pendingCleanup.set(chatId, timer);
}

async function deleteJournal(chatId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId));
    await tx
      .delete(chatStreamJournals)
      .where(eq(chatStreamJournals.chatId, chatId));
  });
}

export interface JournalSnapshot {
  status: 'active' | 'ended' | 'missing';
  events: JournalEvent[];
  /** Highest seq present in the journal (0 if none). */
  latestSeq: number;
  /** True if older events are missing from the snapshot. (Always false now — we don't truncate.) */
  truncated: boolean;
}

/**
 * Read all events with `seq > sinceSeq` from SQLite. If no journal row
 * exists, returns status='missing'.
 *
 * Note: a snapshot can race against a concurrent `appendEvent` — events
 * inserted after our SELECT runs are simply not in the snapshot. Callers
 * that pair `getSnapshot` with `subscribe` rely on the listener fan-out
 * to receive those events; the `lastSentSeq` dedupe in the subscribe
 * endpoint protects against double-emission at the seam.
 */
export async function getSnapshot(
  chatId: string,
  sinceSeq = 0,
): Promise<JournalSnapshot> {
  const journals = await db
    .select()
    .from(chatStreamJournals)
    .where(eq(chatStreamJournals.chatId, chatId))
    .limit(1);
  const journal = journals[0];
  if (!journal) {
    return { status: 'missing', events: [], latestSeq: 0, truncated: false };
  }

  const rows = await db
    .select({ seq: chatStreamEvents.seq, data: chatStreamEvents.data })
    .from(chatStreamEvents)
    .where(
      and(
        eq(chatStreamEvents.chatId, chatId),
        gt(chatStreamEvents.seq, sinceSeq),
      ),
    )
    .orderBy(asc(chatStreamEvents.seq));

  // For an active journal, nextSeq in DB is only synced on endJournal — use
  // the in-memory counter when available so latestSeq reflects recent appends.
  const inMemMeta = active.get(chatId);
  const effectiveNextSeq = inMemMeta ? inMemMeta.nextSeq : journal.nextSeq;
  const latestSeq = Math.max(0, effectiveNextSeq - 1);
  const events: JournalEvent[] = rows.map((r) => ({ seq: r.seq, data: r.data }));

  return {
    status: journal.status,
    events,
    latestSeq,
    truncated: false,
  };
}

/**
 * Subscribe to new events. The listener fires for each subsequent
 * `appendEvent` and once with the sentinel `{seq:-1, data:'__END__'}`
 * when the journal ends.
 *
 * Returns an unsubscribe function. If the journal is not active (either
 * already ended or never started in this process), the listener is
 * called immediately with the end sentinel via `queueMicrotask` so
 * callers can finish setup before the sentinel fires.
 *
 * Recommended pairing with `getSnapshot`:
 *   1. `const snapshot = await getSnapshot(chatId, since)`
 *   2. `const off = subscribe(chatId, listener)`
 *   3. flush snapshot.events through `listener` (dedupe by seq inside
 *      the listener — `event.seq <= lastSentSeq` skips)
 *   4. let live appendEvents flow through `listener` naturally
 *
 * The narrow window between (1)'s SELECT and (2)'s register can miss
 * events that landed in the DB after the SELECT but before subscribe.
 * For chat streams this is acceptable: the next `getSnapshot` (e.g.
 * if the SSE client reconnects with `?since=lastSeq`) will pick them
 * up. If you need stronger guarantees, buffer events locally between
 * (2) and (3) and dedupe across the seam.
 */
export function subscribe(
  chatId: string,
  listener: JournalListener,
): () => void {
  const meta = active.get(chatId);
  if (!meta) {
    queueMicrotask(() => listener({ seq: -1, data: '__END__' }));
    return () => {};
  }
  meta.listeners.add(listener);
  return () => {
    meta.listeners.delete(listener);
  };
}

/**
 * Boot-time recovery. Any `active` journal in the DB is necessarily
 * orphaned: the agent that was producing events died when the previous
 * Next.js process exited.
 *
 * For each orphan we:
 *   1. Append a synthetic error event so subscribers see a reason for
 *      the abrupt end.
 *   2. Flip status='ended' with endedAt=now.
 *   3. Schedule cleanup (or delete immediately for very old journals).
 *
 * Also runs a sweep that drops journals ended longer ago than 1 hour —
 * the in-process setTimeout cleanup wouldn't have fired across the
 * restart.
 */
export async function crashRecovery(): Promise<void> {
  const orphans = await db
    .select()
    .from(chatStreamJournals)
    .where(eq(chatStreamJournals.status, 'active'));

  for (const j of orphans) {
    const errPayload = JSON.stringify({
      type: 'error',
      message: 'Stream interrupted by server restart',
    });
    try {
      await db.transaction(async (tx) => {
        // Append the error as the next event.
        await tx.insert(chatStreamEvents).values({
          chatId: j.chatId,
          seq: j.nextSeq,
          data: errPayload,
          createdAt: new Date(),
        });
        await tx
          .update(chatStreamJournals)
          .set({
            status: 'ended',
            endedAt: new Date(),
            nextSeq: j.nextSeq + 1,
          })
          .where(eq(chatStreamJournals.chatId, j.chatId));
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[event-journal] crashRecovery seal failed', {
        chatId: j.chatId,
        err,
      });
    }
  }

  // Sweep stale ended journals.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const stale = await db
    .select({ chatId: chatStreamJournals.chatId })
    .from(chatStreamJournals)
    .where(
      and(
        eq(chatStreamJournals.status, 'ended'),
        lt(chatStreamJournals.endedAt, cutoff),
      ),
    );
  for (const s of stale) {
    try {
      await deleteJournal(s.chatId);
    } catch {
      // best-effort
    }
  }

  if (orphans.length > 0 || stale.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[event-journal] crashRecovery: sealed ${orphans.length} orphan(s), pruned ${stale.length} stale journal(s)`,
    );
  }
}

/** Test/diagnostic only — do not use from request handlers. */
export async function __resetJournalsForTest(): Promise<void> {
  for (const t of pendingCleanup.values()) clearTimeout(t);
  pendingCleanup.clear();
  active.clear();
  await db.delete(chatStreamEvents);
  await db.delete(chatStreamJournals);
}
