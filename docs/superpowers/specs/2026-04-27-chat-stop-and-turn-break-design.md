# Chat Stop button + turn_break rendering

## Problems

1. **No way to cancel a running chat turn.** The cancel infrastructure exists on
   the server (`/api/projects/[id]/chat/[chatId]/cancel/route.ts`,
   `src/lib/ai/local-cancel.ts`, `registerLocalAbort` in the stream route), but
   nothing in the UI ever calls it.
2. **Streamed assistant text merges across turns.** The local stream route
   emits `{ type: 'turn_break' }` between consecutive assistant turns
   (e.g. "Let me check…" → tool call → "Here's what I found"); the remote
   handler emits the same. The streaming context exposes
   `appendTurnBreak(chatId)` ready to consume it. But neither `handleEvent`
   nor `handleSubscribedEvent` in `ChatPanel.tsx` handles the `turn_break`
   type, so the events are dropped and the live bubble shows turns glued
   together with no paragraph spacing.

## Scope

Frontend-only fix. No backend route changes, no DB migrations. The cancel
endpoint and the `turn_break` server-side emission are already in place.

## Design

### Stop button (header ActionIcon)

> **Note:** The brainstorming session originally selected option A
> (Send→Stop morph in `ChatInput`), but a previous work-in-progress
> session had already implemented option B (header ActionIcon) before
> this spec was written. The user reviewed both designs and accepted
> option B as-shipped. This spec was updated post-hoc to match.

`ChatPanel.tsx`:
- Add a small red `ActionIcon` with `IconPlayerStopFilled` next to the
  chat title in the header. Renders only when `activeShowsLiveTurn` is
  true (= chat is locally OR server-side streaming).
- Tooltip: "Stop generating" / "Stopping…" depending on state.
- While the cancel request is in flight, show Mantine's built-in
  `loading` state on the ActionIcon and disable further clicks.
- Clicking calls `stopChat(activeChat)`.

`stopChat(chatId)` performs two parallel teardown actions:

1. **Client-side fetch abort.** A per-chat `AbortController` is
   registered in `abortControllersRef` (a `Map<chatId, AbortController>`)
   when `sendMessage` starts the POST `/stream` fetch. Aborting it tears
   the SSE reader down immediately so the UI returns to idle without
   waiting for the network round-trip to `/cancel`.
2. **Server-side cancel POST.** `POST /api/projects/{projectId}/chat/{chatId}/cancel`
   with body `{ sessionId }` when a remote-mode `sessionId` is captured,
   otherwise `{}`. The endpoint flips the SDK `AbortController` (local
   mode) or forwards `CLAUDE_CANCEL` to the device socket (remote mode).

Failures are swallowed — the user's intent was "stop", and a toast
saying "stop failed" after the bubble already disappeared would be more
confusing than helpful. The local fetch teardown alone is enough to
return the UI to a usable state.

`cancellingChats` (a `Set<chatId>`) tracks in-flight stop requests so
the button shows a spinner. It clears via:
- The `sendMessage` `finally` block when the fetch reader exits (local
  driver path).
- A 4-second `setTimeout` fallback for the reattach path where no
  `sendMessage` finally is running in this tab.

The cancel endpoint is idempotent: repeated clicks while the stream is
already winding down return `wasActive: false` without error.

### Stream route abort wiring

`stream/route.ts` (`handleLocalStream`):
- Create an `AbortController`, register it via
  `registerLocalAbort(chatId, controller)` so the cancel endpoint can
  flip it from a separate request.
- Pass it into the SDK `query()` `options.abortController`.
- Track an `aborted` boolean (set when the signal fires) so the catch
  block can distinguish a user-driven cancel from a real failure.
- On abort, persist whatever turns were collected and emit `done` with
  `aborted: true` instead of `error`.
- `unregisterLocalAbort(chatId)` in the `finally` block.

The remote handler does not need its own abort wiring — `CLAUDE_CANCEL`
forwarded over the socket is the analogue.

### turn_break emission (server) and rendering (client)

Server-side, both handlers emit `{ type: 'turn_break' }` between
consecutive assistant turns:
- **Local:** explicit emission after each non-empty `assistant` SDK
  message in `handleLocalStream`. The same refactor moves from a
  single-string `fullContent` (which the prior code's
  `fullContent = turnText` overwrite was silently dropping earlier
  turns from) to a `completedTurns: string[]` joined with `\n\n`.
- **Remote:** the device agent does not signal turn boundaries, so we
  infer them — a `pendingTurnBreak` flag arms when any `CLAUDE_TOOL_USE`
  arrives, and the next `CLAUDE_TEXT` consumes it (prepending `\n\n` to
  `fullContent` and emitting the `turn_break` SSE event).

Client-side, `ChatPanel.tsx` adds a `turn_break` branch in both event
handlers that calls `streaming.appendTurnBreak(chatId)`. The helper
itself is added to `streaming-state.tsx` (was missing before this
change). It is idempotent at boundaries — skips when content is empty
or already ends with `\n\n`.

### turn_break event handler

`ChatPanel.tsx`, in both event handlers:

```ts
if (event.type === 'turn_break') {
  streaming.appendTurnBreak(chatId);
  return;
}
```

- `handleEvent` (POST /stream reader): add the branch alongside `tool_use`
  / `permission_request` cases.
- `handleSubscribedEvent` (GET /stream/subscribe reader): add it before the
  `done` branch so a reattaching client sees the same paragraph spacing as
  a client that drove the original POST.

`appendTurnBreak` is already idempotent at boundaries — it skips the prepend
when content is empty or already ends with `\n\n`, so duplicate or
redundant `turn_break` events from the server are harmless.

## Files changed

- `src/components/chat/ChatPanel.tsx` — header Stop `ActionIcon`,
  `stopChat` callback, per-chat `abortControllersRef`,
  `cancellingChats` state, `turn_break` branches in both event handlers.
- `src/components/chat/streaming-state.tsx` — add `appendTurnBreak`
  helper to the context.
- `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts` — register
  the SDK `AbortController` with `local-cancel.ts`, abort-aware error
  handling, `completedTurns[]` refactor, explicit `turn_break` emission
  between assistant turns; remote handler infers turn boundaries from
  tool use.
- `src/lib/ai/local-cancel.ts` — new module: per-chat
  `AbortController` registry consumed by the cancel endpoint.
- `src/app/api/projects/[id]/chat/[chatId]/cancel/route.ts` — new
  POST endpoint: dispatches to local abort (in-process) or forwards
  `CLAUDE_CANCEL` to the device socket (remote).

`ChatInput.tsx` is unchanged.

## Test plan

Manual, in browser, against the dev server:

1. **Local stop, mid-text.** Start a chat in Local mode. Send a long-running
   prompt ("explain the entire codebase architecture"). While text streams,
   click the Stop button.
   - Expected: streaming bubble disappears within ~1s; persisted assistant
     row appears with whatever partial text was streamed; no error toast;
     input becomes editable again.
2. **Local stop, mid-tool.** Send a prompt that forces tool use ("read the
   package.json and explain dependencies"). Click Stop while a tool
   activity badge is showing.
   - Expected: stream ends cleanly; persisted row contains whatever text
     streamed before the tool call.
3. **Remote stop** (only if a device is connected). Switch chat to "On
   device" mode and repeat scenario 1. The cancel POST must include the
   `sessionId` captured from the `session_started` event.
4. **Turn break, single browser.** Send a prompt that triggers tool use
   (same as scenario 2). Watch the live bubble.
   - Expected: a blank line separates the pre-tool text from the
     post-tool text. Persisted row matches what was on screen.
5. **Turn break, reattach path.** Send a multi-turn prompt; switch project
   tabs and come back while the turn is still in flight.
   - Expected: the subscribe-based reattach reader inserts the same
     paragraph breaks as the original POST reader.
6. **Idempotent stop.** Click Stop twice in rapid succession.
   - Expected: no error toast on the second click. The endpoint returns
     `wasActive: false` and the UI ignores it.

Type checking (`tsc --noEmit`) must pass.
