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

### Stop button (Send → Stop morph)

`ChatInput.tsx`:
- Add two props: `isStreaming: boolean`, `onStop: () => void`.
- When `isStreaming` is true, render a Stop button in place of Send:
  `IconPlayerStopFilled` from `@tabler/icons-react`, brand color, tooltip
  "Stop". Click invokes `onStop()`.
- When `isStreaming` is false, render the existing Send button unchanged.
- Textarea and paperclip retain current behavior (disabled while streaming).
  Allowing typing during a turn is out of scope for this change.

`ChatPanel.tsx`:
- Add `handleStop` callback:
  - `POST /api/projects/{projectId}/chat/{activeChat}/cancel` with body
    `{ sessionId: streaming.get(activeChat).sessionId ?? null }`.
  - On non-OK response, surface a Mantine `notify` toast (red, "Stop
    failed"). On success, do nothing — the existing `done` handler
    already cleans up when the stream emits `aborted: true`.
- Pass `isStreaming={activeShowsLiveTurn}` and `onStop={handleStop}` into
  `<ChatInput>`. `disabled` continues to be `inputDisabled`
  (= `activeShowsLiveTurn`).

The cancel endpoint is idempotent: repeated clicks while the stream is
already winding down return `wasActive: false` without error, so we don't
need a client-side debounce.

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

- `src/components/chat/ChatInput.tsx` — add `isStreaming`, `onStop` props,
  conditional Stop/Send button.
- `src/components/chat/ChatPanel.tsx` — add `handleStop` function, pass
  new props to `ChatInput`, handle `turn_break` in both stream readers.

No new files. The already-untracked `src/lib/ai/local-cancel.ts` and
`src/app/api/projects/[id]/chat/[chatId]/cancel/route.ts` will be committed
together with the UI wiring (they are currently dead code without it).

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
