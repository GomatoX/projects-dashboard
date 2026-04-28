# Chat Stop button + turn_break rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `/cancel` endpoint to a Send→Stop button morph in `ChatInput`, and handle the already-emitted `turn_break` SSE event so streamed assistant turns no longer visually merge.

**Architecture:** Frontend-only. `ChatInput.tsx` gains `isStreaming` and `onStop` props that conditionally swap the Send icon for a Stop icon. `ChatPanel.tsx` adds a `handleStop` callback that POSTs to `/api/projects/{projectId}/chat/{chatId}/cancel` (server already handles abort + persistence + `done` event), and adds a `turn_break` branch to both SSE event handlers that calls `streaming.appendTurnBreak(chatId)`. Cancel infrastructure on the server (`local-cancel.ts`, `/cancel/route.ts`) already exists as untracked files and gets committed alongside the UI wiring.

**Tech Stack:** Next.js 16, React 19, Mantine 9, `@tabler/icons-react`. No test framework in repo — verification is manual in browser plus `tsc --noEmit` and `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-04-27-chat-stop-and-turn-break-design.md`

---

## File Structure

**Modified:**
- `src/components/chat/ChatInput.tsx` — add `isStreaming`, `onStop` props; conditionally render Stop instead of Send.
- `src/components/chat/ChatPanel.tsx` — add `handleStop` callback; pass new props to `ChatInput`; add `turn_break` event branch in both stream readers.

**Already-untracked (committed alongside the UI wiring, not modified by this plan):**
- `src/lib/ai/local-cancel.ts`
- `src/app/api/projects/[id]/chat/[chatId]/cancel/route.ts`

These two files were left as untracked work-in-progress. The stream route (`src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`) already imports from `local-cancel.ts` (registering/unregistering the AbortController), so they cannot be reverted — they have to ship together with the UI.

---

## Task 1: Handle `turn_break` event in the POST stream reader

This is the lowest-risk piece — the streaming context already exposes `appendTurnBreak`; we just have to call it. Doing this first means we can verify the second visible bug fix before touching `ChatInput`.

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx` (around line 562, inside `handleEvent`)

- [ ] **Step 1: Add the `turn_break` branch to `handleEvent`**

Open `src/components/chat/ChatPanel.tsx`. Find `handleEvent` inside `sendMessage` (declared around line 522). It currently has branches for `session_started`, `text`, `done`, `permission_request`, `tool_use`, `error`. Add a new branch between `text` and `done`:

```ts
} else if (event.type === 'turn_break') {
  streaming.appendTurnBreak(chatId);
}
```

The exact insertion point: directly after the closing brace of the `text` branch and before `else if (event.type === 'done')`. The full surrounding shape after edit:

```ts
} else if (event.type === 'text') {
  streaming.appendText(chatId, event.text as string);
} else if (event.type === 'turn_break') {
  streaming.appendTurnBreak(chatId);
} else if (event.type === 'done') {
```

- [ ] **Step 2: Add the `turn_break` branch to `handleSubscribedEvent`**

In the same file, find `handleSubscribedEvent` (declared around line 216 — uses `if`/`return` style instead of `else if`). It has branches for `session_started`, `text`, `tool_use`, `permission_request`, `done`, `error`. Add a new branch directly before the `done` branch:

```ts
if (event.type === 'turn_break') {
  streaming.appendTurnBreak(chatId);
  return;
}
```

The full surrounding shape after edit:

```ts
if (event.type === 'permission_request') {
  // …existing body…
  return;
}
if (event.type === 'turn_break') {
  streaming.appendTurnBreak(chatId);
  return;
}
if (event.type === 'done') {
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`appendTurnBreak` is already on the context value — no new types needed.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in `ChatPanel.tsx`.

- [ ] **Step 5: Manual verify — turn break renders**

Run: `npm run dev`
Open the dashboard, open or create a chat in Local mode. Send a prompt that forces tool use, e.g.: `read package.json and tell me the top 3 dependencies`.

Expected: While streaming, you see something like "Let me check the file." → tool activity badge appears → blank line → "Here are the top 3 dependencies: …". The two assistant fragments must be separated by a paragraph break, not running together on the same line. After the stream completes and the persisted row replaces the bubble, the same paragraph break is preserved.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "fix(chat): render turn_break events as paragraph separators

Both stream readers (POST and subscribe) now call appendTurnBreak so
consecutive assistant turns within one chat-level reply no longer
visually merge."
```

---

## Task 2: Add `isStreaming` and `onStop` props to ChatInput

Set up the new ChatInput API. We don't wire it up from `ChatPanel` yet — that's Task 3 — so this task is purely additive and shippable on its own.

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Update `ChatInputProps` and the icon import**

Open `src/components/chat/ChatInput.tsx`.

Add `IconPlayerStopFilled` to the existing `@tabler/icons-react` import. The current line:

```ts
import {
  IconSend,
  IconPaperclip,
  IconX,
  IconFile,
  IconFileTypePdf,
} from '@tabler/icons-react';
```

becomes:

```ts
import {
  IconSend,
  IconPaperclip,
  IconPlayerStopFilled,
  IconX,
  IconFile,
  IconFileTypePdf,
} from '@tabler/icons-react';
```

Update the `ChatInputProps` interface (currently around line 38):

```ts
interface ChatInputProps {
  onSend: (content: string, attachments: PendingAttachment[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
}
```

Update the destructuring on the function signature:

```ts
export function ChatInput({ onSend, disabled, isStreaming, onStop }: ChatInputProps) {
```

- [ ] **Step 2: Conditionally render Stop in place of Send**

Find the trailing `Tooltip` / `ActionIcon` block that renders the Send button (currently around line 235–248):

```tsx
<Tooltip label="Send (Enter)">
  <ActionIcon
    size="lg"
    color="brand"
    variant="filled"
    disabled={(!value.trim() && attachments.length === 0) || disabled}
    onClick={handleSend}
    style={{
      transition: 'transform 0.1s',
    }}
  >
    <IconSend size={16} />
  </ActionIcon>
</Tooltip>
```

Replace it with a ternary that picks Stop while streaming:

```tsx
{isStreaming ? (
  <Tooltip label="Stop">
    <ActionIcon
      size="lg"
      color="brand"
      variant="filled"
      onClick={onStop}
      aria-label="Stop streaming"
      style={{
        transition: 'transform 0.1s',
      }}
    >
      <IconPlayerStopFilled size={16} />
    </ActionIcon>
  </Tooltip>
) : (
  <Tooltip label="Send (Enter)">
    <ActionIcon
      size="lg"
      color="brand"
      variant="filled"
      disabled={(!value.trim() && attachments.length === 0) || disabled}
      onClick={handleSend}
      style={{
        transition: 'transform 0.1s',
      }}
    >
      <IconSend size={16} />
    </ActionIcon>
  </Tooltip>
)}
```

The Stop button is intentionally never `disabled` — it must remain clickable while a turn is in flight. It only renders when `isStreaming` is true, so there's no separate empty-content guard to worry about.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. `ChatPanel` does not yet pass `isStreaming`/`onStop`, but they are optional, so this is still valid.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat(chat): add isStreaming/onStop props with Stop button morph

The send action button swaps to a Stop control while the parent reports
isStreaming. Wiring lands in ChatPanel in a follow-up commit."
```

---

## Task 3: Wire Stop button + ship cancel infrastructure

Hook the new `ChatInput` props up to a `handleStop` callback in `ChatPanel`, and ship the already-untracked cancel endpoint and `local-cancel.ts` module so the cancel POST has somewhere to land.

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`
- Add (already on disk, untracked): `src/lib/ai/local-cancel.ts`
- Add (already on disk, untracked): `src/app/api/projects/[id]/chat/[chatId]/cancel/route.ts`

- [ ] **Step 1: Verify the untracked cancel files exist and are intact**

Run: `git status --short src/lib/ai/local-cancel.ts src/app/api/projects/'[id]'/chat/'[chatId]'/cancel/`
Expected: each file shows as `??` (untracked). If either is missing, stop and ask the user — they were authored in a prior session and should be present.

Run: `head -5 src/lib/ai/local-cancel.ts`
Expected: file starts with the comment `// src/lib/ai/local-cancel.ts`. Confirms it's the file the stream route already imports from.

- [ ] **Step 2: Add `handleStop` to `ChatPanel`**

Open `src/components/chat/ChatPanel.tsx`. Add a new callback right before the `if (loading)` early return (currently around line 740). Insert:

```ts
const handleStop = useCallback(async () => {
  if (!activeChat) return;
  const chatId = activeChat;
  const sessionId = streaming.get(chatId).sessionId;
  try {
    const res = await fetch(
      `/api/projects/${projectId}/chat/${chatId}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId ?? null }),
      },
    );
    if (!res.ok) {
      notify({
        title: 'Stop failed',
        message: 'Could not stop the chat — try again in a moment.',
        color: 'red',
      });
    }
    // Success path: nothing to do here. The server flips the AbortController
    // (local mode) or forwards CLAUDE_CANCEL (remote mode); the in-flight
    // stream then emits `done` with `aborted: true` and the existing done
    // handler in sendMessage / handleSubscribedEvent clears the bubble and
    // refetches the persisted assistant row.
  } catch {
    notify({
      title: 'Stop failed',
      message: 'Could not stop the chat — try again in a moment.',
      color: 'red',
    });
  }
}, [activeChat, projectId, streaming]);
```

- [ ] **Step 3: Pass the new props into `ChatInput`**

Find the `ChatInput` invocation near the bottom of the JSX (currently around line 1152):

```tsx
{activeChat && (
  <ChatInput onSend={sendMessage} disabled={inputDisabled} />
)}
```

Replace with:

```tsx
{activeChat && (
  <ChatInput
    onSend={sendMessage}
    disabled={inputDisabled}
    isStreaming={activeShowsLiveTurn}
    onStop={handleStop}
  />
)}
```

`activeShowsLiveTurn` is already declared at line 755 and is true exactly when the chat is locally OR server-side streaming — the same condition we want for showing Stop. `inputDisabled` keeps disabling the textarea while streaming (out of scope to allow typing during a turn).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Manual verify — local stop, mid-text**

Run: `npm run dev` (if not already running).
Open a Local-mode chat. Send a long-running prompt: `explain the entire codebase architecture in detail with examples for every layer`.

While text is still streaming (Send icon should have already morphed to Stop):
1. Click the Stop button.
2. Within ~1s the streaming bubble should be replaced by a persisted assistant row.
3. The persisted row contains whatever partial text was streamed before the cancel.
4. No red error toast appears.
5. The Stop icon turns back into Send and the textarea becomes editable again.

If any of those fail, do not commit — debug first.

- [ ] **Step 7: Manual verify — local stop, mid-tool**

Send a new prompt forcing tool use: `read package.json and explain every dependency`.
While a tool activity badge is showing (and possibly before any text has streamed), click Stop.

Expected: the bubble closes; a persisted assistant row appears with whatever text streamed before the tool call (may be empty); no error toast; the chat list spinner for that chat clears.

- [ ] **Step 8: Manual verify — idempotent stop**

Send another prompt and click Stop twice in rapid succession (double-click).
Expected: no red toast. Stream ends cleanly. The cancel endpoint already returns `{ ok: true, wasActive: false }` for the second click; the UI's `res.ok` check passes and nothing is shown.

- [ ] **Step 9: Manual verify — remote stop (skip if no device connected)**

Only if a device is connected to your account: switch the chat to "On device" mode. Send a prompt and click Stop while it's streaming.

Expected: the request body must include `sessionId` (verifiable in DevTools → Network → cancel POST → Request payload — should be the value emitted in the `session_started` SSE event, NOT `null`). Stream ends cleanly. No error toast.

If no device is connected, note in the commit body that remote-mode verification was deferred and skip this step.

- [ ] **Step 10: Manual verify — turn break still works**

Repeat the Task 1 verification (`read package.json and tell me the top 3 dependencies`) to confirm the Stop wiring did not regress turn_break rendering.

- [ ] **Step 11: Commit**

```bash
git add src/lib/ai/local-cancel.ts src/app/api/projects/'[id]'/chat/'[chatId]'/cancel/route.ts src/components/chat/ChatPanel.tsx
git commit -m "feat(chat): wire Stop button to /cancel endpoint

ChatPanel forwards stop clicks to the cancel route (with sessionId for
remote mode) and the existing done-with-aborted=true handler does the
cleanup. Also lands the previously-untracked local-cancel module and
cancel route the stream handler has been importing from."
```

---

## Task 4: Verify pending stream route work-in-progress is consistent

The stream route already has uncommitted modifications related to the cancel infrastructure (visible in `git status` as `M src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`). Verify those changes are the abort-controller wiring referenced in the spec, not unrelated work, before deciding whether to ship them with this change set.

**Files:**
- Inspect (no edits): `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`

- [ ] **Step 1: Inspect the uncommitted diff**

Run: `git diff src/app/api/projects/'[id]'/chat/'[chatId]'/stream/route.ts`

Read every hunk. Expected content (allowed):
- Imports of `registerLocalAbort` / `unregisterLocalAbort` from `@/lib/ai/local-cancel`.
- `const abortController = new AbortController(); registerLocalAbort(chatId, abortController);` in `handleLocalStream`.
- Wiring `abortController` into the SDK `query()` options.
- `unregisterLocalAbort(chatId)` in the `finally` block.
- Abort-aware error handling (the `aborted` boolean, `done` event with `aborted: true`).

If anything in the diff falls outside that scope (e.g., unrelated behavior changes, debug logging, schema edits) — stop and ask the user before committing it. Otherwise proceed.

- [ ] **Step 2: Final type-check**

Run: `npx tsc --noEmit`
Expected: no errors across the whole project.

- [ ] **Step 3: Final lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit the stream route changes**

Only if Step 1 confirmed the diff is in scope:

```bash
git add src/app/api/projects/'[id]'/chat/'[chatId]'/stream/route.ts
git commit -m "feat(chat): register local abort controller for cancel endpoint

The stream route now registers its SDK AbortController with
local-cancel.ts so the /cancel endpoint can flip it from a separate
request, and treats abort as a clean done with aborted=true."
```

(Skip this step if the diff was already committed earlier or if Step 1 flagged content out of scope.)

---

## Task 5: Reattach-path verification

The reattach (subscribe) path is harder to trigger but matters — it's how the UI recovers after a tab/project switch. Verify both fixes work over that path before declaring done.

- [ ] **Step 1: Manual verify — reattach turn break**

Run: `npm run dev` (if not already running).
In Local mode, send a prompt that triggers tool use: `read AGENTS.md and summarize`.
Immediately after sending, switch to a different project tab in the dashboard, wait ~3 seconds, then switch back.

Expected: the streaming bubble re-appears (driven by `/stream/subscribe`). When the assistant's second turn arrives, it is separated from the first by a paragraph break — same as if you'd watched the original POST response. This proves the `turn_break` branch in `handleSubscribedEvent` is exercised.

- [ ] **Step 2: Manual verify — reattach Stop**

Send another tool-using prompt. Switch to another project tab, wait ~2s, switch back. While the reattached bubble is still streaming, click Stop.

Expected: stream ends; persisted row replaces the bubble; no error toast. (The `/cancel` endpoint flips the AbortController in the original request handler, so it works regardless of which path the client is consuming.)

- [ ] **Step 3: No commit**

This task is verification-only; no code changes.

---

## Self-Review

**1. Spec coverage:**
- Stop button (Send→Stop morph): Tasks 2 + 3.
- Cancel POST with sessionId for remote: Task 3 Step 2 (`sessionId: sessionId ?? null`).
- Error toast on cancel failure: Task 3 Step 2 (red `notify` on non-OK).
- Idempotent stop: Task 3 Step 8.
- `turn_break` in `handleEvent`: Task 1 Step 1.
- `turn_break` in `handleSubscribedEvent`: Task 1 Step 2.
- Untracked cancel route + `local-cancel.ts` shipped together with UI: Task 3 Step 11.
- Test plan scenarios from spec: Task 3 Steps 6–10 + Task 5.
- `tsc --noEmit` clean: Tasks 1, 2, 3, 4 each include a type-check step.

**2. Placeholder scan:** No "TODO", "TBD", "implement later". All code blocks are complete.

**3. Type consistency:** `isStreaming?: boolean` and `onStop?: () => void` declared in Task 2 are read by `ChatPanel` exactly under those names in Task 3. `streaming.appendTurnBreak(chatId)` and `streaming.get(chatId).sessionId` match the existing context API in `streaming-state.tsx`.
