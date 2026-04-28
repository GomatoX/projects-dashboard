// src/lib/ai/local-cancel.ts
//
// Per-chat registry of AbortControllers backing in-flight LOCAL-mode chat
// streams. Lets a separate HTTP request (the `/cancel` endpoint, or the
// chat panel's Stop button) abort an SDK `query()` that's still running
// in another route handler.
//
// Remote mode does NOT use this map — it goes through Socket.io and the
// `/api/projects/[id]/claude/cancel` endpoint instead.
//
// Lifecycle:
//   registerLocalAbort(chatId, controller) → called when handleLocalStream
//                                             starts the SDK query.
//   abortLocal(chatId)                     → called from the cancel endpoint;
//                                             returns true if a controller
//                                             was registered, false otherwise.
//   unregisterLocalAbort(chatId)           → called in the stream's finally
//                                             block, regardless of how it ended.

const localAbortControllers = new Map<string, AbortController>();

export function registerLocalAbort(
  chatId: string,
  controller: AbortController,
): void {
  localAbortControllers.set(chatId, controller);
}

export function unregisterLocalAbort(chatId: string): void {
  localAbortControllers.delete(chatId);
}

/**
 * Abort the in-flight local SDK query for the given chat.
 * Returns true when a controller was found and aborted, false otherwise
 * (no active local stream — caller should fall through to the remote
 * cancel path or return a "not active" response).
 */
export function abortLocal(chatId: string): boolean {
  const c = localAbortControllers.get(chatId);
  if (!c) return false;
  try {
    c.abort();
  } catch {
    // already aborted — no-op
  }
  localAbortControllers.delete(chatId);
  return true;
}

/** Whether a local stream is currently registered for cancellation. */
export function hasLocalAbort(chatId: string): boolean {
  return localAbortControllers.has(chatId);
}
