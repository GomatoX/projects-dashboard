# Chat Stream Resume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat panel's live turn (streaming text, tool activity, permission requests) survive tab switches, project switches, page reloads — **and Next.js server restarts** — with full live replay (Variant A fidelity).

**Architecture:** Persist every SSE event into SQLite via Drizzle as it is produced (`chat_stream_events`), with a per-chat lifecycle row (`chat_stream_journals`). The chat stream route writes every event into the journal *and* the active HTTP response. A new `GET …/stream/subscribe` endpoint replays the journal as a snapshot from SQLite and then tails new events for late joiners. A process-scoped in-memory listener `Map` provides the low-latency push fan-out — the DB is the durable source of truth, the in-memory listeners are the live notification channel. The agent's lifecycle is **decoupled from the HTTP request signal** so the agent keeps running when the client disconnects. A boot-time `crashRecovery()` step seals any journals left `active` by a server restart so subscribers see a clean "ended" state. The client lifts streaming state to a dashboard-layout-scoped React context that survives project navigation, and uses `keepMounted` on Mantine `<Tabs.Panel>` to survive in-project tab switches without remounting `ChatPanel`.

**Tech Stack:** Next.js 16 (App Router) / React 19 / Mantine 9 / TypeScript / Drizzle ORM with libsql (SQLite) / `@anthropic-ai/claude-agent-sdk` / SSE. No automated test framework is configured — verification is via runtime checks (curl, dev server logs, browser DevTools, sqlite3 CLI) described per task.

---

## Pre-flight

- [ ] **Pre-flight 1: Verify branch & worktree**

The brainstorming session did not create a dedicated worktree, and `main` has uncommitted unrelated changes. Before starting:

```bash
git status
git branch --show-current
```

Expected: on `main` (or a fresh feature branch). If executing this plan inline, create a feature branch first:

```bash
git checkout -b feat/chat-stream-resume
```

If executing via subagents, use `superpowers:using-git-worktrees` to spin a worktree off `main`.

- [ ] **Pre-flight 2: Confirm dev server boots cleanly**

```bash
pnpm dev
```

Expected: server starts at `http://localhost:3000` without errors. Stop with Ctrl+C once confirmed. We will need this server running during verification steps below.

- [ ] **Pre-flight 3: Back up the dev database**

The schema migration in Task 1 modifies `data/dashboard.db`. Make a backup so we can roll back:

```bash
cp data/dashboard.db data/dashboard.db.pre-stream-resume.bak
```

Expected: file copy succeeds; revert later via `cp data/dashboard.db.pre-stream-resume.bak data/dashboard.db` if needed.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/db/schema.ts` | Modify | Add `chatStreamJournals` and `chatStreamEvents` tables |
| `drizzle/0004_chat_stream_journal.sql` | **Create** (via `pnpm exec drizzle-kit generate`) | Migration that creates the two new tables and their index |
| `src/lib/ai/event-journal.ts` | **Create** | DB-backed event journal with in-memory listener fan-out + boot-time crash recovery |
| `src/lib/ai/active-streams.ts` | Modify | Wire `markStreamStart`/`markStreamEnd` to also create/end the journal |
| `server.mts` | Modify | Call `crashRecovery()` once at boot, before listening |
| `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts` | Modify | Tee events into journal (`appendEvent`); decouple agent from `request.signal`; reject duplicate POSTs with 409 |
| `src/app/api/projects/[id]/chat/[chatId]/stream/subscribe/route.ts` | **Create** | New `GET` SSE endpoint that snapshots the journal from SQLite and tails new events via the listener Map |
| `src/components/chat/streaming-state.tsx` | **Create** | Dashboard-scoped React context holding per-chat live state across project navigation |
| `src/app/(dashboard)/layout.tsx` | Modify | Wrap dashboard children in `<StreamingStateProvider>` |
| `src/app/(dashboard)/projects/[id]/page.tsx` | Modify | Add `keepMounted` to chat `<Tabs.Panel>` to survive in-project tab switches |
| `src/components/chat/ChatPanel.tsx` | Modify | Read/write streaming state via context; subscribe to live streams on mount |

`StreamingStateProvider` is intentionally placed in the dashboard layout (not the project page) so navigating between projects does not unmount it — the live state for any in-flight chat is preserved across project switches. Page reloads still wipe context (browser memory is gone), but the new `subscribe` endpoint replays from the SQLite journal — and now even a Next.js server restart preserves the prefix of the turn that already produced events (the agent itself dies with the server, but the recorded transcript is intact and can be replayed and sealed via `crashRecovery()`).

The persistent journal is keyed by `chatId` with `chat_stream_journals.chat_id` as primary key (one active journal per chat at a time). Events are append-only in `chat_stream_events`, with a `(chat_id, seq)` unique index for ordered replay. Old journals are pruned 30 s after they end (post-stream cleanup) and again at boot during crash recovery.

---

## Task 1: Add SQLite schema for the event journal

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0004_chat_stream_journal.sql` (generated)

The journal needs durable storage so it survives Next.js dev server restarts and HMR. Two tables: a per-chat lifecycle row (`chat_stream_journals`) and an append-only events log (`chat_stream_events`).

- [ ] **Step 1.1: Add the two tables to `schema.ts`**

Open `src/lib/db/schema.ts` and append at the bottom (after `soundSettings`):

```typescript
// ─── Chat Stream Journals ─────────────────────────────────
//
// Per-chat record of a streaming "turn" (user message + agent response).
// Created in 'active' status when POST /stream begins, transitions to
// 'ended' when the turn finishes naturally — or when boot-time
// `crashRecovery()` seals an orphaned journal whose owning agent died
// with the previous Next.js process.
//
// One active journal per chatId at a time (PRIMARY KEY on chat_id, plus
// the in-memory `markStreamStart` guard that returns false on duplicate
// starts so the route can answer HTTP 409).
//
// `next_seq` mirrors the in-memory counter while the journal is active and
// is synced on endJournal so a post-restart caller can still order events
// correctly. `events` are stored separately in `chat_stream_events`.
export const chatStreamJournals = sqliteTable('chat_stream_journals', {
  chatId: text('chat_id')
    .primaryKey()
    .references(() => chats.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['active', 'ended'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  // Highest seq + 1 for the next event. Authoritative while active is
  // the in-memory counter; this column is synced on endJournal so a
  // post-restart reader still has a correct latestSeq.
  nextSeq: integer('next_seq').notNull().default(1),
});

// ─── Chat Stream Events ───────────────────────────────────
//
// Individual SSE events captured during a chat turn. Append-only.
// `seq` is a per-chat monotonic sequence (1-indexed) so subscribers can
// dedupe and resume via the SSE Last-Event-ID header / `?since=` query.
//
// `data` holds the raw JSON payload (no `data: ` SSE prefix); the
// subscribe endpoint re-frames it consistently.
//
// Cascades on chat delete so dropping a chat also drops its journal log.
export const chatStreamEvents = sqliteTable(
  'chat_stream_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chatStreamJournals.chatId, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Hot path: `WHERE chat_id=? AND seq > ? ORDER BY seq ASC` (snapshot
    // replay). Uniqueness also acts as a safety net against a double-
    // append for the same logical event.
    chatIdSeqIdx: uniqueIndex('chat_stream_events_chat_id_seq_idx').on(
      t.chatId,
      t.seq,
    ),
  }),
);
```

- [ ] **Step 1.2: Generate the migration SQL**

```bash
pnpm exec drizzle-kit generate
```

Expected: a new file `drizzle/0004_*.sql` is created containing `CREATE TABLE chat_stream_journals`, `CREATE TABLE chat_stream_events`, and the unique index. Inspect it:

```bash
ls drizzle/
cat drizzle/0004_*.sql
```

If the generator picked an unfortunate name suffix, leave it — drizzle-kit numbering is what matters.

- [ ] **Step 1.3: Apply the migration to the dev database**

The project uses `db:push` for dev iteration (per `package.json`). That will read the schema and apply differences directly:

```bash
pnpm db:push
```

Expected: prompt-driven migration applies cleanly. Verify with sqlite3:

```bash
sqlite3 data/dashboard.db '.schema chat_stream_journals'
sqlite3 data/dashboard.db '.schema chat_stream_events'
```

Expected: both `CREATE TABLE` statements print, and the second includes the unique index.

- [ ] **Step 1.4: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors. The new exports `chatStreamJournals` and `chatStreamEvents` are unused at this point (Task 2 consumes them).

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0004_*.sql
git commit -m "feat(db): add chat_stream_journals and chat_stream_events tables"
```

---

## Task 2: Build the DB-backed event journal

**Files:**
- Create: `src/lib/ai/event-journal.ts`

This module wraps the two tables behind the existing journal API the rest of the plan was designed against (`startJournal`, `appendEvent`, `endJournal`, `getSnapshot`, `subscribe`, plus a new `crashRecovery`). Live tail uses an in-memory listener `Map` for sub-millisecond push fan-out; durable replay uses SQLite. The two are kept consistent because every `appendEvent` writes to the DB *and* fires listeners synchronously after the insert resolves.

- [ ] **Step 2.1: Create `event-journal.ts`**

```typescript
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
  /** Cleanup timer set by endJournal — stored so re-start can clear it. */
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const active = new Map<string, ActiveMeta>();

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

  active.set(chatId, {
    chatId,
    nextSeq: 1,
    listeners: new Set(),
    cleanupTimer: null,
  });
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

  meta.cleanupTimer = setTimeout(() => {
    void deleteJournal(chatId).catch(() => {});
  }, POST_END_RETENTION_MS);
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

  const latestSeq = Math.max(0, journal.nextSeq - 1);
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
 * called immediately with the end sentinel.
 *
 * Caller is responsible for combining `getSnapshot` + `subscribe` so
 * that:
 *   1. subscribe BEFORE getSnapshot (so a concurrent appendEvent that
 *      lands between the two calls is not lost),
 *   2. dedupe by seq (the snapshot may overlap with the first listener
 *      events).
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
  for (const meta of active.values()) {
    if (meta.cleanupTimer) clearTimeout(meta.cleanupTimer);
  }
  active.clear();
  await db.delete(chatStreamEvents);
  await db.delete(chatStreamJournals);
}
```

- [ ] **Step 2.2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors. Drizzle's `eq`/`and`/`gt`/`lt`/`asc` imports are all standard.

- [ ] **Step 2.3: Manual semantics check**

Create a temporary script `scratch/journal-check.ts` (delete after):

```typescript
// scratch/journal-check.ts
import {
  startJournal,
  appendEvent,
  getSnapshot,
  subscribe,
  endJournal,
  crashRecovery,
  __resetJournalsForTest,
} from '../src/lib/ai/event-journal';

async function main() {
  await __resetJournalsForTest();

  console.assert(await startJournal('c1'), 'first start succeeds');
  console.assert(!(await startJournal('c1')), 'second start is rejected');

  await appendEvent('c1', '{"type":"text","text":"hi"}');
  await appendEvent('c1', '{"type":"text","text":" world"}');

  const snap = await getSnapshot('c1', 0);
  console.assert(snap.status === 'active', 'status active');
  console.assert(snap.events.length === 2, `two events, got ${snap.events.length}`);
  console.assert(snap.events[0].seq === 1, 'seq starts at 1');
  console.assert(snap.latestSeq === 2, `latestSeq, got ${snap.latestSeq}`);

  const snapTail = await getSnapshot('c1', 1);
  console.assert(snapTail.events.length === 1, 'sinceSeq filters');

  let received = 0;
  const off = subscribe('c1', (e) => {
    if (e.seq !== -1) received++;
  });
  await appendEvent('c1', '{"type":"done"}');
  console.assert(received === 1, `subscriber got new events, received=${received}`);

  let endedFired = false;
  subscribe('c1', (e) => {
    if (e.seq === -1) endedFired = true;
  });
  await endJournal('c1');
  console.assert(endedFired, 'end sentinel fires on subscribed listeners');

  off();

  // crashRecovery: simulate a server restart by manually reopening then
  // running recovery without ending.
  await startJournal('c2');
  await appendEvent('c2', '{"type":"text","text":"unfinished"}');
  // Drop in-memory state to simulate process restart.
  await __resetJournalsForTest();
  // The events table is empty after reset, so re-prime: re-create the
  // orphan via raw inserts before calling crashRecovery would be more
  // realistic. For now we just verify crashRecovery is safe to call on a
  // clean DB.
  await crashRecovery();

  console.log('OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run with:

```bash
pnpm tsx scratch/journal-check.ts
```

Expected output: `OK` and no assertion failures. Then delete the scratch file:

```bash
rm scratch/journal-check.ts
```

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/ai/event-journal.ts
git commit -m "feat(chat): add SQLite-backed event journal with live listener fan-out"
```

---

## Task 3: Wire `active-streams` to the journal + boot-time crash recovery

**Files:**
- Modify: `src/lib/ai/active-streams.ts`
- Modify: `server.mts`

The existing `markStreamStart`/`markStreamEnd` already fire at the right places in both stream routes. We extend them so the journal is created/ended at exactly the same moments — that way the rest of the stream route just calls `appendEvent` and the journal exists. Both functions become async because the journal is now persisted.

We also call `crashRecovery()` once at server boot to seal any journals left orphaned by the previous process.

- [ ] **Step 3.1: Update `markStreamStart` and `markStreamEnd`**

Replace the body of `src/lib/ai/active-streams.ts` with:

```typescript
// src/lib/ai/active-streams.ts
// ─── Active Streams Store ─────────────────────────────────
// In-memory registry of project IDs (and chat IDs) that currently have a
// streaming chat session in flight. The chat stream route registers itself
// when it starts and unregisters in `finally`, so the sidebar can show a
// real "work in progress" indicator instead of relying on a stale
// `chats.updatedAt` window.
//
// The per-chat map additionally lets the chat panel decide whether to
// open a /stream/subscribe SSE on mount (if active) or just render the
// persisted `messages` array (if not).
//
// markStreamStart / markStreamEnd ALSO create / end the per-chat
// event journal so late subscribers can replay the in-flight turn from
// SQLite.

import { startJournal, endJournal } from './event-journal';

const activeProjectStreams = new Map<string, number>();
const activeChatStreams = new Map<string, number>();

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function drop(map: Map<string, number>, key: string): void {
  const count = map.get(key) ?? 0;
  if (count <= 1) {
    map.delete(key);
  } else {
    map.set(key, count - 1);
  }
}

/**
 * Mark that a streaming chat has started for the given project + chat.
 * Returns `true` if this is a fresh start (caller may proceed) or `false`
 * if a journal is already active for this chat (caller MUST refuse the
 * new POST with HTTP 409 — there is already a live stream).
 */
export async function markStreamStart(
  projectId: string,
  chatId?: string,
): Promise<boolean> {
  if (chatId) {
    const ok = await startJournal(chatId);
    if (!ok) return false; // already active
    bump(activeChatStreams, chatId);
  }
  bump(activeProjectStreams, projectId);
  return true;
}

/** Mark that a streaming chat has finished for the given project + chat. */
export async function markStreamEnd(
  projectId: string,
  chatId?: string,
): Promise<void> {
  drop(activeProjectStreams, projectId);
  if (chatId) {
    drop(activeChatStreams, chatId);
    await endJournal(chatId);
  }
}

/** Snapshot of project IDs that currently have at least one active stream. */
export function getActiveProjectIds(): Set<string> {
  return new Set(activeProjectStreams.keys());
}

/** Whether the given project currently has an active stream. */
export function isProjectActive(projectId: string): boolean {
  return activeProjectStreams.has(projectId);
}

/** Whether the given chat currently has an active stream. */
export function isChatActive(chatId: string): boolean {
  return activeChatStreams.has(chatId);
}
```

- [ ] **Step 3.2: Add `crashRecovery()` invocation in `server.mts`**

Open `server.mts`. Find the `app.prepare().then(...)` block (or equivalent — wherever the Next handler is wired up before `httpServer.listen(...)`). Insert:

```typescript
import { crashRecovery } from './src/lib/ai/event-journal';

// …existing code…

await app.prepare();
await crashRecovery();
// …then continue with existing setup (socket.io, listen, etc.)
```

If the existing structure uses `.then(...)` chains rather than `await`, switch to `await` for these two lines and wrap them in `(async () => { … })()` if necessary. The exact location matters less than the ordering: **`crashRecovery()` must run before `httpServer.listen()` so any in-flight POST to `/stream` doesn't observe a stale `active` journal during the recovery window.**

- [ ] **Step 3.3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors. The signatures of `markStreamStart` and `markStreamEnd` changed from sync to async. Existing callers that ignored their return values will now be passing a `Promise<void>` to nothing — TypeScript allows that without an error in default mode, but Task 4 will explicitly `await` them.

- [ ] **Step 3.4: Smoke-test boot**

```bash
pnpm dev
```

Expected: server boots; if any orphaned `active` journals exist (unlikely on a fresh DB), the recovery log fires. With a clean DB, you should see no `[event-journal]` log line at all (zero orphans, zero stale).

Stop with Ctrl+C.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/ai/active-streams.ts server.mts
git commit -m "feat(chat): wire stream lifecycle to journal + boot crash recovery"
```

---

## Task 4: Refactor POST stream route — tee into journal, decouple from request signal

**Files:**
- Modify: `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`

Three behavior changes:

1. **Tee every SSE event into the journal.** Wrap every existing `safeEnqueue(encoder.encode(\`data: …\n\n\`))` call in a `writeEvent` helper that also calls `appendEvent`. The HTTP response keeps working exactly as today; new readers can pick up the events from the journal.
2. **Remove the agent-cancel-on-abort coupling in remote mode.** Currently `request.signal.addEventListener('abort')` fires `CLAUDE_CANCEL` and detaches the socket listener — meaning if the user closes the tab, the agent dies. Instead, we keep the agent running and just stop forwarding to the dead HTTP response. The journal collects events; reattach via the subscribe endpoint.
3. **409 on duplicate start.** If `markStreamStart` returns `false`, the chat already has a live stream. Reject with 409 + `{error: 'stream_already_active', chatId}`. The client uses this to fall back to subscribing.

`appendEvent` is now async, so `writeEvent` is async too — every call site must `await` it (or `void` it for fire-and-forget). For correctness during HTTP backpressure we await it: order matters, and the inserts are sub-millisecond on local SQLite.

- [ ] **Step 4.1: Add the imports and a `writeEvent` helper at the top of the file**

In `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`, change the existing `markStreamStart, markStreamEnd` import to also pull `isChatActive`:

```typescript
import { markStreamStart, markStreamEnd, isChatActive } from '@/lib/ai/active-streams';
```

Then add directly underneath:

```typescript
import { appendEvent } from '@/lib/ai/event-journal';

/**
 * Tee an SSE event into both the HTTP response and the per-chat journal.
 *
 * `data` is the JSON payload (a JS object). The journal stores the raw
 * stringified JSON (no `data: ` SSE prefix), so the subscribe endpoint
 * can re-frame it consistently. The HTTP response side gets the full SSE
 * line including the prefix and `\n\n` terminator.
 *
 * Awaits the journal write so DB inserts stay ordered; callers that are
 * already in async generator/for-await loops pay sub-ms latency per call.
 */
async function writeEvent(
  controllerEnqueue: (chunk: Uint8Array) => void,
  encoder: TextEncoder,
  chatId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const json = JSON.stringify(data);
  await appendEvent(chatId, json);
  controllerEnqueue(encoder.encode(`data: ${json}\n\n`));
}
```

- [ ] **Step 4.2: Add 409 handling in the POST handler**

In `POST`, immediately after the request is parsed and `chatId` is in scope but BEFORE saving the user message and BEFORE `markStreamStart`, insert:

```typescript
  // Reject if a stream is already in flight for this chat. Late joiners
  // should hit GET …/stream/subscribe, not start a duplicate turn. The
  // authoritative guard is `markStreamStart` returning false (which the
  // start callback also checks), but rejecting here is cheaper.
  if (isChatActive(chatId)) {
    return new Response(
      JSON.stringify({ error: 'stream_already_active', chatId }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
```

- [ ] **Step 4.3: Make the `start(controller)` callback async, and `await markStreamStart`**

`ReadableStream`'s `start` may return a `Promise`. Convert the existing `start(controller) { … markStreamStart(projectId, chatId); … }` to:

```typescript
    async start(controller) {
      const ok = await markStreamStart(projectId, chatId);
      if (!ok) {
        const json = JSON.stringify({
          type: 'error',
          message: 'stream_already_active',
        });
        controller.enqueue(encoder.encode(`data: ${json}\n\n`));
        controller.close();
        return;
      }
      // … existing body …
    },
```

Apply the same change to `handleRemoteStream`'s `start` callback.

- [ ] **Step 4.4: Replace local-mode `safeEnqueue` SSE writes with `await writeEvent`**

In `handleLocalStream`'s `start()`, the current code calls `safeEnqueue(encoder.encode(\`data: ${JSON.stringify(...)}\n\n\`))` in five places (auto-allowed `tool_use`, ask-tool `tool_use`, `text` delta, `done`, `error`). Replace each with an `await writeEvent` call.

Concretely, find the auto-allowed tool block (around lines 309-322 in the current source):

```typescript
              if (shouldAutoAllow(toolName)) {
                // Auto-allowed tool — show brief activity badge
                safeEnqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'tool_use',
                      tool: {
                        id: opts.toolUseID,
                        toolName,
                        displayName: meta.displayName,
                        status: 'auto',
                        input,
                      },
                    })}\n\n`,
                  ),
                );
              } else {
```

Change to:

```typescript
              if (shouldAutoAllow(toolName)) {
                // Auto-allowed tool — show brief activity badge
                await writeEvent(safeEnqueue, encoder, chatId, {
                  type: 'tool_use',
                  tool: {
                    id: opts.toolUseID,
                    toolName,
                    displayName: meta.displayName,
                    status: 'auto',
                    input,
                  },
                });
              } else {
```

Apply the same shape rewrite to the `else` branch (also a `tool_use` event), the `text` delta path, the `done` event, and the `error` event. After the rewrite, the local handler should have **zero remaining `safeEnqueue(encoder.encode('data: …'))` calls** — every SSE write goes through `writeEvent`. `safeEnqueue` itself stays (it's still passed into `writeEvent`), and so does `safeClose`.

If the surrounding callback is not already async (e.g. the permission `canUseTool` callback is `async`, but the `for await` loop body is inside an already-async function), the `await` works directly.

- [ ] **Step 4.5: Replace remote-mode `safeEnqueue` SSE writes with `await writeEvent`**

In `handleRemoteStream`, repeat the rewrite for: `error` (DEVICE_OFFLINE and agent_socket_unavailable), `session_started`, `text`, `tool_use`, `permission_request`, `done`, `error` (CLAUDE_ERROR). Each `safeEnqueue(encoder.encode(\`data: ${JSON.stringify({...})}\n\n\`))` becomes `await writeEvent(safeEnqueue, encoder, chatId, {...})`.

The `onEvent` callback that's attached to `socket.on('event', onEvent)` MUST be declared `async` for the `await writeEvent` calls inside it to compile. Update the declaration:

```typescript
      const onEvent = async (event: AgentEvent) => {
        // … existing body, now using `await writeEvent(...)` ...
      };
```

Socket.io accepts async listeners (it just doesn't await them). That's the right semantics: each event is independently persisted.

After this step, neither `handleLocalStream` nor `handleRemoteStream` should write SSE frames directly via `encoder.encode('data: ...')` — only `writeEvent` does that.

- [ ] **Step 4.6: Decouple the agent from the request signal in remote mode**

Currently the abort handler in `handleRemoteStream` (around lines 822-832) is:

```typescript
      // ─── Client disconnect → cancel on device ──────────
      request.signal.addEventListener('abort', () => {
        socket.off('event', onEvent);
        socket.emit('command', {
          type: 'CLAUDE_CANCEL',
          id: nanoid(),
          sessionId,
        } satisfies AgentCommand);
        markStreamEnd(projectId, chatId);
        safeClose();
      });
```

The bug: closing a tab kills the device-side agent. Replace with a version that keeps the agent running and just stops forwarding to this (now-dead) HTTP response:

```typescript
      // ─── Client disconnect → keep agent running, stop forwarding ──
      // The agent must continue independently of this HTTP request — the
      // user may have switched tabs/projects or reloaded the page. Late
      // subscribers can pick up the in-flight turn via the subscribe
      // endpoint, which reads from the journal. We do NOT detach the
      // socket listener here either: it must keep appending events to
      // the journal, and it self-detaches inside `onEvent` when CLAUDE_DONE
      // or CLAUDE_ERROR fires.
      request.signal.addEventListener('abort', () => {
        // Mark the response closed so safeEnqueue stops trying to write.
        // Do NOT call markStreamEnd, do NOT cancel the agent, do NOT
        // detach onEvent.
        safeClose();
      });
```

- [ ] **Step 4.7: Decouple local-mode HTTP from agent loop too**

The local for-await loop is already independent of the HTTP request signal (it polls the SDK iterator, not `request.signal`), so the agent already continues after disconnect. The `writeEvent` rewrite already routes events into the journal so they're not lost.

Sanity-check by reading through `handleLocalStream`'s `start()` once more: the `for await (const message of agentQuery)` loop has no awareness of `request.signal`. Confirmed.

- [ ] **Step 4.8: Update the `finally` block to `await markStreamEnd`**

Wherever the existing code calls `markStreamEnd(projectId, chatId)` (typically inside the `finally` of the agent loop), change to:

```typescript
      } finally {
        await markStreamEnd(projectId, chatId);
      }
```

If there are multiple call sites (one per error path, one in normal completion), update them all.

- [ ] **Step 4.9: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 4.10: Manually verify the existing single-window happy path still works**

Start the dev server (`pnpm dev`), open a project, send a chat message, watch the assistant reply stream. Goal: confirm the refactor did not break the baseline.

Expected:
- Message streams character-by-character as before.
- Tool activity badges appear and disappear as before.
- Final message persists in DB (refresh the page → it's there).

Check the dev server stdout for: no warnings about closed controllers, no journal errors.

In another shell, peek at the events table while a turn is in progress:

```bash
sqlite3 data/dashboard.db 'SELECT chat_id, COUNT(*) AS events FROM chat_stream_events GROUP BY chat_id;'
```

Expected: a row appears for the active chat, and the count grows as the turn streams.

- [ ] **Step 4.11: Verify 409 on duplicate POST**

While a turn is in flight (start a long message — e.g. "write a 500-word essay about x"), in another shell:

```bash
curl -i -X POST http://localhost:3000/api/projects/<PROJECT_ID>/chat/<CHAT_ID>/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello again","executionMode":"local"}' \
  --cookie '<your dev session cookie>'
```

Expected: `HTTP/1.1 409` and body `{"error":"stream_already_active","chatId":"…"}`.

- [ ] **Step 4.12: Commit**

```bash
git add src/app/api/projects/[id]/chat/[chatId]/stream/route.ts
git commit -m "feat(chat): tee SSE events into journal, decouple agent from request lifecycle"
```

---

## Task 5: Build the subscribe endpoint

**Files:**
- Create: `src/app/api/projects/[id]/chat/[chatId]/stream/subscribe/route.ts`

A late joiner (page reload, project return, server-restart-then-resume) calls `GET …/subscribe?since=<seq>` and gets:
1. A snapshot SSE block from SQLite: every event with `seq > since`, framed as `id: <seq>\ndata: <json>\n\n`.
2. A live tail: each new `appendEvent` is forwarded to the client via the in-memory listener.
3. Closes with a synthetic `{type:'__subscribe_end__'}` frame when the journal ends.

The `id:` field on each SSE frame is the journal seq, so `Last-Event-ID` on EventSource reconnect is supported transparently.

- [ ] **Step 5.1: Create the subscribe route**

```typescript
// src/app/api/projects/[id]/chat/[chatId]/stream/subscribe/route.ts
//
// GET /api/projects/[id]/chat/[chatId]/stream/subscribe[?since=<seq>]
//
// SSE stream that replays the in-flight chat turn from the SQLite
// journal and then forwards new events in real time via the in-memory
// listener. Used when the original POST connection is gone (tab/project
// switch, page reload, server restart) but the agent is still working
// (or just finished) server-side.
//
// Query params:
//   since: number — last journal seq the client has already seen.
//                   Defaults to 0 (full replay). Last-Event-ID header
//                   takes precedence if present.
//
// Response: text/event-stream. Each frame: `id: <seq>\ndata: <json>\n\n`.
// A final frame `data: {"type":"__subscribe_end__"}\n\n` is emitted once
// the journal is closed, then the response closes.

import { NextRequest } from 'next/server';
import {
  getSnapshot,
  subscribe,
  type JournalEvent,
} from '@/lib/ai/event-journal';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  const lastEventIdHeader = request.headers.get('last-event-id');
  const since = Math.max(
    0,
    Number(sinceParam ?? lastEventIdHeader ?? 0) || 0,
  );

  // Resolve the snapshot up front so we can return 404 for unknown chats.
  const initialSnapshot = await getSnapshot(chatId, since);
  if (initialSnapshot.status === 'missing') {
    return new Response(
      JSON.stringify({ error: 'no_active_stream', chatId }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSentSeq = since;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const emit = (event: JournalEvent) => {
        if (event.seq <= lastSentSeq) return; // dedupe seam
        lastSentSeq = event.seq;
        safeEnqueue(
          encoder.encode(`id: ${event.seq}\ndata: ${event.data}\n\n`),
        );
      };

      // Subscribe FIRST so any event that arrives during the snapshot
      // flush is captured. We dedupe by seq inside `emit`.
      let unsubscribe: (() => void) | null = null;
      if (initialSnapshot.status === 'active') {
        unsubscribe = subscribe(chatId, (event) => {
          if (event.seq === -1) {
            // Journal end sentinel
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: '__subscribe_end__' })}\n\n`,
              ),
            );
            unsubscribe?.();
            unsubscribe = null;
            safeClose();
            return;
          }
          emit(event);
        });
      }

      // Flush the snapshot synchronously after subscribing.
      for (const event of initialSnapshot.events) {
        emit(event);
      }

      // If the journal was already ended at snapshot time, close out now.
      if (initialSnapshot.status === 'ended') {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: '__subscribe_end__' })}\n\n`,
          ),
        );
        safeClose();
        return;
      }

      // If the client disconnects mid-tail, just detach. Do NOT end the
      // journal — other readers may still be subscribed, and the agent
      // is producing real work that should land in DB regardless.
      request.signal.addEventListener('abort', () => {
        unsubscribe?.();
        unsubscribe = null;
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

- [ ] **Step 5.2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 5.3: Manual end-to-end verification — replay a live turn**

With `pnpm dev` running:

1. Open the project's chat tab in a browser tab.
2. Send a long-running message (e.g. "Write a 1000-word essay about distributed systems, slowly.").
3. While the response is still streaming, in a terminal run:

```bash
curl -N "http://localhost:3000/api/projects/<PROJECT_ID>/chat/<CHAT_ID>/stream/subscribe?since=0" \
  --cookie '<your dev session cookie>'
```

Expected:
- A burst of `id: 1`, `id: 2`, … events appears immediately (the SQLite snapshot replay).
- Then new `id: N` events stream in real time as the agent produces text (via the in-memory listener).
- Eventually a `data: {"type":"done", ...}` event lands (forwarded from the journal), followed by `data: {"type":"__subscribe_end__"}`, then the curl exits.

- [ ] **Step 5.4: Verify 404 for non-active chats**

```bash
curl -i "http://localhost:3000/api/projects/<PROJECT_ID>/chat/<INACTIVE_CHAT_ID>/stream/subscribe" \
  --cookie '<your dev session cookie>'
```

Expected: `HTTP/1.1 404` and `{"error":"no_active_stream","chatId":"…"}`.

- [ ] **Step 5.5: Verify post-restart replay**

This is the SQLite payoff that an in-memory journal could not deliver:

1. Start a long message. Wait until ~5-10 events are in the journal:

```bash
sqlite3 data/dashboard.db "SELECT seq FROM chat_stream_events WHERE chat_id='<CHAT_ID>' ORDER BY seq DESC LIMIT 1;"
```

Expected: a number ≥ 5.

2. Kill the dev server (Ctrl+C) BEFORE the turn finishes.
3. Start it again: `pnpm dev`.
4. Watch the boot log — expect: `[event-journal] crashRecovery: sealed 1 orphan(s), pruned 0 stale journal(s)`.
5. Hit subscribe:

```bash
curl -N "http://localhost:3000/api/projects/<PROJECT_ID>/chat/<CHAT_ID>/stream/subscribe?since=0" \
  --cookie '<your dev session cookie>'
```

Expected: all the persisted events from before the kill, followed by a synthetic `data: {"type":"error","message":"Stream interrupted by server restart"}` event, followed by `data: {"type":"__subscribe_end__"}`, then the curl exits.

- [ ] **Step 5.6: Commit**

```bash
git add src/app/api/projects/[id]/chat/[chatId]/stream/subscribe/route.ts
git commit -m "feat(chat): add stream/subscribe endpoint replaying the journal from SQLite"
```

---

## Task 6: Lift streaming state into a dashboard-scoped React context

**Files:**
- Create: `src/components/chat/streaming-state.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

Current `ChatPanel` keeps `streamingContents`, `toolActivitiesByChat`, `permissionsByChat`, `sessionIdsByChat` in component state. When `ChatPanel` unmounts (project switch), all of that vanishes. Lifting it to a context that is mounted at the dashboard layout level means it survives any in-app navigation.

The context exposes per-chat state plus an imperative API to mutate it — `ChatPanel` reads from context and dispatches updates instead of using `useState`.

- [ ] **Step 6.1: Create the context module**

```typescript
// src/components/chat/streaming-state.tsx
//
// Dashboard-scoped React context holding live streaming state per chatId.
// Lives ABOVE the project page so it survives navigation between projects
// without losing in-flight turn state. Hard reloads still wipe this
// context — the server-side journal handles that case via the subscribe
// endpoint.
//
// State shape per chat:
//   - content: accumulated assistant text streamed so far
//   - toolActivities: ordered list of tool activity badges
//   - permissions: pending / responded permission requests
//   - sessionId: remote-mode SDK session id (for cancel/permission RPC)
//   - lastEventSeq: highest journal seq this client has consumed (for
//                   resubscribe deduplication)
//   - active: true while a stream is producing events for this chat
//
// All updates go through dispatch helpers exposed by the context — the
// helpers preserve immutability so consumer components re-render correctly.

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  PermissionRequest,
  ToolActivity,
} from './ToolApprovalCard';

export interface ChatStreamState {
  content: string;
  toolActivities: ToolActivity[];
  permissions: PermissionRequest[];
  sessionId: string | null;
  lastEventSeq: number;
  active: boolean;
}

const EMPTY_STATE: ChatStreamState = {
  content: '',
  toolActivities: [],
  permissions: [],
  sessionId: null,
  lastEventSeq: 0,
  active: false,
};

interface StreamingStateContextValue {
  /** Returns the current state (or EMPTY_STATE) for a chat. */
  get: (chatId: string) => ChatStreamState;
  /** Begin a fresh turn — clears prior content/tools/perms and marks active. */
  begin: (chatId: string) => void;
  appendText: (chatId: string, text: string) => void;
  setSessionId: (chatId: string, sessionId: string) => void;
  addToolActivity: (chatId: string, activity: ToolActivity) => void;
  addPermission: (chatId: string, perm: PermissionRequest) => void;
  updatePermission: (
    chatId: string,
    toolUseId: string,
    status: PermissionRequest['status'],
  ) => void;
  bumpSeq: (chatId: string, seq: number) => void;
  /** Stream finished — leave content visible briefly for the consumer to fold into history, then call clear. */
  end: (chatId: string) => void;
  /** Drop all streaming state for a chat (e.g. after assistant message persisted). */
  clear: (chatId: string) => void;
}

const StreamingStateContext = createContext<StreamingStateContextValue | null>(
  null,
);

export function StreamingStateProvider({ children }: { children: ReactNode }) {
  const [byChat, setByChat] = useState<Record<string, ChatStreamState>>({});

  const update = useCallback(
    (chatId: string, mut: (prev: ChatStreamState) => ChatStreamState) => {
      setByChat((prev) => {
        const current = prev[chatId] ?? EMPTY_STATE;
        const next = mut(current);
        if (next === current) return prev;
        return { ...prev, [chatId]: next };
      });
    },
    [],
  );

  const get = useCallback(
    (chatId: string) => byChat[chatId] ?? EMPTY_STATE,
    [byChat],
  );

  const begin = useCallback(
    (chatId: string) => {
      update(chatId, () => ({
        content: '',
        toolActivities: [],
        permissions: [],
        sessionId: null,
        lastEventSeq: 0,
        active: true,
      }));
    },
    [update],
  );

  const appendText = useCallback(
    (chatId: string, text: string) => {
      update(chatId, (s) => ({ ...s, content: s.content + text }));
    },
    [update],
  );

  const setSessionId = useCallback(
    (chatId: string, sessionId: string) => {
      update(chatId, (s) => ({ ...s, sessionId }));
    },
    [update],
  );

  const addToolActivity = useCallback(
    (chatId: string, activity: ToolActivity) => {
      update(chatId, (s) => ({
        ...s,
        toolActivities: [...s.toolActivities, activity],
      }));
    },
    [update],
  );

  const addPermission = useCallback(
    (chatId: string, perm: PermissionRequest) => {
      update(chatId, (s) => ({ ...s, permissions: [...s.permissions, perm] }));
    },
    [update],
  );

  const updatePermission = useCallback(
    (chatId: string, toolUseId: string, status: PermissionRequest['status']) => {
      update(chatId, (s) => ({
        ...s,
        permissions: s.permissions.map((p) =>
          p.toolUseId === toolUseId ? { ...p, status } : p,
        ),
      }));
    },
    [update],
  );

  const bumpSeq = useCallback(
    (chatId: string, seq: number) => {
      update(chatId, (s) => (seq > s.lastEventSeq ? { ...s, lastEventSeq: seq } : s));
    },
    [update],
  );

  const end = useCallback(
    (chatId: string) => {
      update(chatId, (s) => ({ ...s, active: false }));
    },
    [update],
  );

  const clear = useCallback(
    (chatId: string) => {
      setByChat((prev) => {
        if (!(chatId in prev)) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    },
    [],
  );

  const value: StreamingStateContextValue = {
    get,
    begin,
    appendText,
    setSessionId,
    addToolActivity,
    addPermission,
    updatePermission,
    bumpSeq,
    end,
    clear,
  };

  return (
    <StreamingStateContext.Provider value={value}>
      {children}
    </StreamingStateContext.Provider>
  );
}

export function useStreamingState(): StreamingStateContextValue {
  const ctx = useContext(StreamingStateContext);
  if (!ctx) {
    throw new Error(
      'useStreamingState must be used within <StreamingStateProvider>',
    );
  }
  return ctx;
}
```

- [ ] **Step 6.2: Mount the provider in the dashboard layout**

Open `src/app/(dashboard)/layout.tsx` and find the JSX root. Wrap the existing children with `<StreamingStateProvider>`. Example diff (the exact existing structure may differ — adapt accordingly, the rule is: provider must wrap everything that could ever render `<ChatPanel>`):

```typescript
import { StreamingStateProvider } from '@/components/chat/streaming-state';

// …existing imports/code…

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // existing wrappers (e.g. <AppShell> or similar)
      <StreamingStateProvider>
        {children}
      </StreamingStateProvider>
    // /existing wrappers
  );
}
```

If the layout already has another provider, nest `<StreamingStateProvider>` inside it (or alongside, order doesn't matter — there are no cross-provider dependencies).

- [ ] **Step 6.3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero new errors. (No consumer imports `useStreamingState` yet — that's Task 7.)

- [ ] **Step 6.4: Smoke-test**

```bash
pnpm dev
```

Open any dashboard page. Expected: page loads with no console errors. The provider is in place but inert until `ChatPanel` consumes it.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/chat/streaming-state.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat(chat): add dashboard-scoped streaming state context"
```

---

## Task 7: Refactor `ChatPanel` to use context + subscribe-on-mount

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

The largest change. We strip the per-chat live state out of `useState` and read it from `useStreamingState()` instead. We also add a "reattach on mount" effect that opens a subscribe stream when the active chat is server-streaming but no local fetch is feeding it.

This is one cohesive change but I've broken it into bite-sized rewrites that each leave the file compiling and runnable.

- [ ] **Step 7.1: Import the context hook and remove local-only state pieces that move to context**

At the top of `src/components/chat/ChatPanel.tsx`, add:

```typescript
import { useStreamingState } from './streaming-state';
```

Then inside `ChatPanel`, immediately after the existing `const scrollRef = useRef<HTMLDivElement>(null);` line, add:

```typescript
  const streaming = useStreamingState();
```

Remove these `useState` hooks (they are replaced by context):

- `const [streamingContents, setStreamingContents] = useState<Record<string, string>>({});`
- `const [permissionsByChat, setPermissionsByChat] = useState<Record<string, PermissionRequest[]>>({});`
- `const [toolActivitiesByChat, setToolActivitiesByChat] = useState<Record<string, ToolActivity[]>>({});`
- `const [sessionIdsByChat, setSessionIdsByChat] = useState<Record<string, string>>({});`

Keep:
- `streamingChats` (per-this-tab "I am the one driving the POST" set)
- `serverStreamingChats` (server-derived flag)
- `respondingTo`, `selectedModel`, etc.

- [ ] **Step 7.2: Rewrite the auto-scroll effect's deps**

The auto-scroll `useEffect` references `streamingContents[activeChat]`, `permissionsByChat[activeChat]?.length`, `toolActivitiesByChat[activeChat]?.length`. Replace its deps array with values pulled from context:

```typescript
  const activeStreamState = activeChat ? streaming.get(activeChat) : null;
  // …
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [
    messages,
    activeChat,
    activeStreamState?.content,
    activeStreamState?.permissions.length ?? 0,
    activeStreamState?.toolActivities.length ?? 0,
  ]);
```

(Define `activeStreamState` once near the top of the component body so other places can reuse it.)

- [ ] **Step 7.3: Rewrite the `handleEvent` closure inside `sendMessage`**

The current `handleEvent` mutates the four removed `useState` setters. Replace those branches to call context methods. Concretely:

- `session_started` → `streaming.setSessionId(chatId, event.sessionId as string);`
- `text` → `accumulated += text; streaming.appendText(chatId, text as string);`
- `tool_use` → `streaming.addToolActivity(chatId, activity);`
- `permission_request` → `streaming.addPermission(chatId, perm);`
- `done` → keep the assistant message construction; replace the `setStreamingContents({…})` cleanup with `streaming.clear(chatId);`. Remove the `setSessionIdsByChat` cleanup (covered by `clear`).
- `error` notification — unchanged.

Also, BEFORE the fetch starts, replace:

```typescript
    setStreamingChats((prev) => withAdded(prev, chatId));
    setStreamingContents((prev) => ({ ...prev, [chatId]: '' }));
```

with:

```typescript
    setStreamingChats((prev) => withAdded(prev, chatId));
    streaming.begin(chatId);
```

And the `finally` block:

```typescript
    } finally {
      setStreamingChats((prev) => withRemoved(prev, chatId));
      setStreamingContents((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      // Drop any tool-activity badges that were tied to this turn — they're
      // ephemeral UI signals, not persisted state.
      setToolActivitiesByChat((prev) => {
        if (!(chatId in prev)) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    }
```

becomes:

```typescript
    } finally {
      setStreamingChats((prev) => withRemoved(prev, chatId));
      // Mark the in-context stream ended; the `done` handler already
      // called `clear(chatId)` once the assistant row landed in `messages`.
      // If we got here without a `done` (network error mid-turn), end()
      // ensures the spinner stops without nuking a partial transcript the
      // user might want to read.
      streaming.end(chatId);
    }
```

The `accumulated` local var stays — it's still the source of truth for the optimistic assistant `ChatMsg` we push on `done`.

Note: in the `done` handler, replace `setStreamingContents({…delete chatId})` with:

```typescript
        streaming.clear(chatId);
```

…and remove the `setSessionIdsByChat({…delete chatId})` block entirely (also handled by `clear`).

- [ ] **Step 7.4: Rewrite `approvePermission` / `denyPermission` to read sessionId and write status via context**

In both functions, replace `const sessionId = sessionIdsByChat[chatId];` with:

```typescript
    const sessionId = streaming.get(chatId).sessionId;
```

Replace the `setPermissionsByChat(...)` status-update block with:

```typescript
      streaming.updatePermission(chatId, toolUseId, 'approved');
```

(or `'denied'` in the deny path).

- [ ] **Step 7.5: Rewrite the JSX render derivations**

Replace these derived values near the bottom of the component:

```typescript
  const activeStreamingContent = activeChat ? streamingContents[activeChat] : undefined;
  const activeToolActivities = activeChat ? toolActivitiesByChat[activeChat] ?? [] : [];
  const activePermissions = activeChat ? permissionsByChat[activeChat] ?? [] : [];
```

with:

```typescript
  const activeStreamingContent = activeStreamState?.content || undefined;
  const activeToolActivities = activeStreamState?.toolActivities ?? [];
  const activePermissions = activeStreamState?.permissions ?? [];
```

(`activeStreamState` was defined in Step 7.2.)

- [ ] **Step 7.6: Add the reattach-on-mount-or-chat-switch effect**

Add a new `useEffect` after the existing "poll for completion" effect:

```typescript
  // ─── Reattach to a server-side live stream ──────────────────────
  // When the server reports a chat is mid-turn but this browser is not
  // driving the POST (page reload, project switch return, tab switch with
  // a different active chat), open a SSE subscription to /stream/subscribe
  // and pipe its events through the same handleEvent shape used by
  // sendMessage. This restores live text deltas, tool activity badges,
  // and pending permission requests with full fidelity.
  useEffect(() => {
    if (!activeChat) return;
    if (!serverStreamingChats.has(activeChat)) return;
    if (streamingChats.has(activeChat)) return; // we're already feeding events ourselves

    const chatId = activeChat;
    const since = streaming.get(chatId).lastEventSeq;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/stream/subscribe?since=${since}`,
          { signal: controller.signal },
        );
        if (!res.ok || !res.body) {
          // 404 == no longer active — the polling effect will catch the new state
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // We need to process SSE frames that contain BOTH `id:` and `data:`
        // lines; collect lines per frame and dispatch on blank-line terminator.
        let pendingId: number | null = null;

        const dispatch = (rawData: string) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            return;
          }
          // Internal subscribe-protocol events:
          if (parsed.type === '__subscribe_end__') {
            // The stream ended — context will drop active=false via the
            // poll effect's next tick; for now just close out our reader.
            cancelled = true;
            controller.abort();
            return;
          }
          // Reuse the same handler shape sendMessage uses. We need a
          // chatId-bound copy because `handleEvent` in sendMessage closes
          // over its own chatId.
          handleSubscribedEvent(chatId, parsed);
          if (pendingId != null) {
            streaming.bumpSeq(chatId, pendingId);
            pendingId = null;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('id: ')) {
              const n = Number(line.slice(4));
              if (!Number.isNaN(n)) pendingId = n;
              continue;
            }
            if (line.startsWith('data: ')) {
              dispatch(line.slice(6));
              continue;
            }
            // blank line — frame boundary; nothing to do (dispatch already happened on data: line)
          }
        }
      } catch (err) {
        // AbortError is expected on cleanup; everything else: log & give up.
        if ((err as Error).name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.warn('[ChatPanel] subscribe failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, serverStreamingChats, streamingChats, projectId]);
```

Add the `handleSubscribedEvent` helper as a `useCallback` defined in the component body (near `sendMessage`):

```typescript
  const handleSubscribedEvent = useCallback(
    (chatId: string, event: Record<string, unknown>) => {
      // Mirrors `handleEvent` in sendMessage, but uses context exclusively
      // (no local accumulator — context.content IS the accumulator).
      if (event.type === 'session_started') {
        streaming.setSessionId(chatId, event.sessionId as string);
        return;
      }
      if (event.type === 'text') {
        // begin() is idempotent if already active; ensures we initialize
        // empty content even if we joined mid-turn.
        const cur = streaming.get(chatId);
        if (!cur.active) streaming.begin(chatId);
        streaming.appendText(chatId, event.text as string);
        return;
      }
      if (event.type === 'tool_use') {
        const tool = event.tool as Record<string, unknown>;
        streaming.addToolActivity(chatId, {
          id: tool.id as string,
          toolName: tool.toolName as string,
          displayName: tool.displayName as string,
          status: tool.status as ToolActivity['status'],
          input: tool.input as Record<string, unknown>,
        });
        return;
      }
      if (event.type === 'permission_request') {
        streaming.addPermission(chatId, {
          toolUseId: (event.toolUseId ?? event.requestId) as string,
          toolName: event.toolName as string,
          displayName: (event.displayName ?? event.toolName) as string,
          category: (event.category ?? 'execute') as PermissionRequest['category'],
          input: event.input as Record<string, unknown>,
          title: (event.title ?? event.reason ?? `${event.toolName}`) as string,
          description: event.description as string | undefined,
          status: 'pending',
        });
        return;
      }
      if (event.type === 'done') {
        // Fold the streamed assistant content into messages, then clear.
        // Note: the messages-poll effect will also pick up the persisted
        // row on the next tick; clear() before that lands would briefly
        // hide the bubble, so we let the poll do the swap.
        streaming.end(chatId);
        // Trigger an immediate refetch to show the persisted assistant row.
        if (activeChatRef.current === chatId) {
          fetchMessages(chatId);
        }
        fetchChats();
        return;
      }
      if (event.type === 'error') {
        notify({
          title: 'AI Error',
          message: event.message as string,
          color: 'red',
        });
        streaming.end(chatId);
      }
    },
    [streaming, fetchMessages, fetchChats],
  );
```

- [ ] **Step 7.7: Update the messages-poll effect to clear context once assistant row appears**

In the existing "Poll for completion when the server says a turn is streaming" effect, after `setMessages(msgs)` and the `if (!stillStreaming)` block, add a `streaming.clear` for chats whose final assistant row is now in `msgs`:

```typescript
        if (!stillStreaming) {
          // Stream just finished — refresh the sidebar so the chat title /
          // cost / token totals reflect the new turn.
          fetchChats();
          playSound('taskComplete');
          // The persisted assistant row is now in `msgs`; drop the live
          // streaming state so we don't double-render.
          streaming.clear(chatId);
        }
```

- [ ] **Step 7.8: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: zero errors. Watch in particular for unused imports (`PermissionRequest`, `ToolActivity` should still be needed for handleSubscribedEvent).

- [ ] **Step 7.9: Manual happy-path test (no scenario change yet)**

```bash
pnpm dev
```

Open the chat tab, send a normal message, watch it stream. Expected: indistinguishable from the pre-refactor experience. Streaming text appears live; tool badges appear and disappear; final message persists. (We have not yet enabled `keepMounted` — that's Task 8.)

- [ ] **Step 7.10: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "refactor(chat): consume streaming state from context and subscribe on reattach"
```

---

## Task 8: Enable `keepMounted` on the project tabs

**Files:**
- Modify: `src/app/(dashboard)/projects/[id]/page.tsx`

`<Tabs.Panel>` from Mantine 9 unmounts hidden panels by default. Setting `keepMounted` on the chat panel keeps `ChatPanel` mounted across in-project tab switches, so the active POST stream's reader continues running uninterrupted. Combined with the journal+context plumbing from Tasks 1-7, this turns scenario A (tab switch) into a no-op — nothing detaches.

- [ ] **Step 8.1: Add `keepMounted` to the chat tab panel**

In `src/app/(dashboard)/projects/[id]/page.tsx`, find:

```typescript
        <Tabs.Panel value="chat" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <ChatPanel
            projectId={project.id}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>
```

Replace with:

```typescript
        <Tabs.Panel
          value="chat"
          keepMounted
          style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          <ChatPanel
            projectId={project.id}
            deviceId={project.deviceId}
          />
        </Tabs.Panel>
```

Do NOT add `keepMounted` to the other panels — those (terminal, editor, etc.) have their own resource implications and are out of scope.

- [ ] **Step 8.2: Verify tab switch preserves live stream (Scenario A)**

```bash
pnpm dev
```

1. Open the project, send a long message in chat.
2. **While it's streaming**, click the Git tab.
3. Wait 5–10 seconds.
4. Click back to the Chat tab.

Expected:
- The streaming text continues seamlessly — every character that arrived while you were on the Git tab is visible.
- Tool badges that fired during the absence are present in the timeline.
- No duplicate streaming bubble, no "Thinking..." flash, no console errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/app/\(dashboard\)/projects/\[id\]/page.tsx
git commit -m "feat(chat): keep chat panel mounted across project tab switches"
```

---

## Task 9: End-to-end verification of all four scenarios

These are full-system checks. Each must pass before merging.

- [ ] **Step 9.1: Scenario A — tab switch within project**

(Already covered by Step 8.2; reconfirm here in a clean session.)

Pass criteria: live text and tool badges are uninterrupted across tab toggles.

- [ ] **Step 9.2: Scenario B — project switch round-trip**

1. In project A's chat, send a long message.
2. While it's streaming, navigate to a different project (project B) via the projects list / sidebar.
3. Wait 10 seconds.
4. Navigate back to project A.

Expected:
- The chat tab opens already showing accumulated streamed text up through "now".
- The stream continues live from there.
- The final assistant message lands in `messages` and the live bubble disappears cleanly.

What's happening under the hood: `ChatPanel` for project A is unmounted on navigation to B (only the chat tab's panel is `keepMounted` *within* its `<Tabs>`, not across pages — Next.js routing unmounts the page entirely). The streaming context survives because it lives in the dashboard layout. On return to project A, `ChatPanel` mounts; the reattach effect sees `serverStreamingChats.has(activeChat)` is true (per the chat-list poll) and opens a `subscribe` request with `since = lastEventSeq` from context — which deduplicates to send only events that arrived during the unmount.

- [ ] **Step 9.3: Scenario C — page reload mid-turn**

1. Send a long message.
2. While streaming, hit Cmd/Ctrl+R to fully reload the browser tab.
3. Once the project loads back, click the chat tab.

Expected:
- The chat opens with `Thinking…` for a fraction of a second.
- Then the entire prefix of streamed text already produced appears (snapshot replay from SQLite).
- Then live tail continues.
- Final assistant message persists.

What's happening: context starts empty (browser memory was wiped); reattach effect uses `since=0` and replays the full journal from SQLite; the journal's in-process listener Set is still receiving live events because the agent is still running.

- [ ] **Step 9.4: Scenario D — server restart mid-turn (the SQLite payoff)**

This is what an in-memory journal could not deliver.

1. Send a long message.
2. While streaming and after at least 5-10 events have been persisted (verify with `sqlite3 data/dashboard.db "SELECT COUNT(*) FROM chat_stream_events;"`), kill the dev server (Ctrl+C in the `pnpm dev` shell).
3. Restart: `pnpm dev`.
4. Once the server is back up, reload the browser tab.

Expected:
- The chat opens with the streamed prefix that was persisted before the kill.
- A red error toast / inline error appears: "Stream interrupted by server restart" (the synthetic event from `crashRecovery()`).
- The live bubble closes (no longer "active") because the journal was sealed by recovery.
- The user can send a new message immediately (the chat is no longer marked active).

- [ ] **Step 9.5: Scenario E (regression check) — remote mode close-tab no longer kills the agent**

This was the secret bug surfaced during brainstorming.

1. Configure a chat in remote mode against a connected device.
2. Send a long message.
3. While streaming, close the browser tab entirely.
4. Wait 30 seconds.
5. Open a new browser tab, navigate back to the chat.

Expected:
- The chat shows the assistant message fully landed (final transcript).
- Cost/token counters updated.
- Device-side agent logs show the turn ran to completion (not cancelled).

(Pre-fix, the agent received `CLAUDE_CANCEL` the moment the tab closed. Post-fix, the request abort listener no longer issues that command.)

- [ ] **Step 9.6: Lint + typecheck for the whole change set**

```bash
pnpm lint
pnpm tsc --noEmit
```

Expected: clean (or no new violations introduced by this branch).

- [ ] **Step 9.7: Cleanup verification — old journals are pruned**

After Scenarios A–E, check that ended journals get cleaned up:

```bash
sqlite3 data/dashboard.db "SELECT chat_id, status, started_at, ended_at FROM chat_stream_journals;"
sqlite3 data/dashboard.db "SELECT COUNT(*) FROM chat_stream_events;"
```

Expected: rows for any actively-streaming chats only; ended journals from > 30 s ago are gone (via the post-end timer). If you wait an hour between turns and restart the server, the boot-time sweep also drops them.

- [ ] **Step 9.8: If everything passes, mark plan complete**

The plan has produced working software per the original spec (all four scenarios + the remote-mode bug). At this point you can use `superpowers:finishing-a-development-branch` to decide between merge / PR / cleanup.

---

## Self-Review Notes (already addressed during plan-write)

- **Spec coverage:**
  - Scenario A (tab switch): Task 8 (`keepMounted`) + the subscribe fallback for any case where `keepMounted` doesn't apply.
  - Scenario B (project switch): Tasks 6 + 7 — context persists across project navigation; reattach effect resubscribes from `lastEventSeq`.
  - Scenario C (page reload): Tasks 2 + 5 + 7 — SQLite journal + subscribe endpoint + reattach effect.
  - Scenario D (server restart): Tasks 1 + 2 + 3 + 5 — persisted journal in SQLite, `crashRecovery()` at boot seals orphans with a synthetic error event, subscribe endpoint replays the persisted prefix.
  - Variant A fidelity (live replay, not just snapshot): the journal stores every text delta and tool-use event, so subscribe replays the full trajectory.
  - Hidden remote-mode bug: Task 4, Step 4.6.
- **Type consistency:** `ChatStreamState`, `JournalEvent`, `JournalSnapshot`, `PermissionRequest`, `ToolActivity`, `chatStreamJournals`, `chatStreamEvents` are referenced consistently. The `__subscribe_end__` sentinel type is internal to the subscribe protocol and is filtered out by the client before reaching `handleSubscribedEvent`'s normal branches.
- **Async signature changes:** `markStreamStart`, `markStreamEnd`, `appendEvent`, `endJournal`, `getSnapshot` are all now `Promise`-returning. Every caller in the plan (`writeEvent`, the `start()` callback, the `finally` blocks, the subscribe route) explicitly `await`s them.
- **No placeholders:** All steps have concrete code or concrete commands. The dashboard layout edit is the one step where exact existing structure varies — Step 6.2 explicitly tells the engineer to adapt the wrapper insertion to whatever wrappers already exist there. The `server.mts` edit (Step 3.2) likewise adapts to the existing prepare/listen ordering.
