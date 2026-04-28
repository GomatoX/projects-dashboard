// src/lib/ai/remote-cancel.ts
//
// Per-chat registry of cleanup closures backing in-flight REMOTE-mode chat
// streams. Mirrors `local-cancel.ts` for the device-side path: the remote
// stream handler registers a closure that detaches its socket `event`
// listener and ends the journal/active-stream counters; a separate HTTP
// request (the `/cancel` endpoint) can then force the cleanup even when
// the device socket has already disconnected without ever emitting a
// terminal event.
//
// Local mode does NOT use this map — it goes through `local-cancel.ts`
// and an in-process AbortController.
//
// Lifecycle:
//   registerRemoteCancel(chatId, cleanup) → called when handleRemoteStream
//                                            finishes initial setup (after
//                                            markStreamStart succeeded).
//   abortRemote(chatId)                    → called from the cancel endpoint
//                                            when the regular CLAUDE_CANCEL
//                                            path is unavailable or as a
//                                            belt-and-braces alongside it.
//                                            Returns true if a closure was
//                                            registered (and is now released),
//                                            false otherwise.
//   unregisterRemoteCancel(chatId)         → called from every terminal path
//                                            in handleRemoteStream (CLAUDE_DONE,
//                                            CLAUDE_ERROR, early device-offline
//                                            errors). Idempotent.
//
// The registered closure MUST itself be idempotent — `abortRemote` and the
// in-stream terminal path can race, and we don't want to end the journal
// twice or `socket.off` twice. (`socket.off` is already a no-op on a missing
// listener; `markStreamEnd` is idempotent because `endJournal` checks the
// in-memory active map first.)

type Cleanup = () => void | Promise<void>;

const remoteCleanups = new Map<string, Cleanup>();

export function registerRemoteCancel(chatId: string, cleanup: Cleanup): void {
  remoteCleanups.set(chatId, cleanup);
}

export function unregisterRemoteCancel(chatId: string): void {
  remoteCleanups.delete(chatId);
}

/**
 * Run the cleanup closure for the given chat (if any) and remove it from
 * the registry. Returns true when a closure was found and run, false
 * otherwise (no active remote stream — caller should treat as a no-op).
 *
 * Errors thrown by the closure are swallowed (logged) — cancel must be
 * best-effort and never wedge on a stale listener.
 */
export async function abortRemote(chatId: string): Promise<boolean> {
  const cleanup = remoteCleanups.get(chatId);
  if (!cleanup) return false;
  remoteCleanups.delete(chatId);
  try {
    await cleanup();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[remote-cancel] cleanup threw', { chatId, err });
  }
  return true;
}

/** Whether a remote stream is currently registered for cancellation. */
export function hasRemoteCancel(chatId: string): boolean {
  return remoteCleanups.has(chatId);
}
