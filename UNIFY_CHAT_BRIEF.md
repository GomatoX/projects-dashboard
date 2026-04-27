# Brief: Unify "Chat" + "Claude" tabs into a single Chat tab with execution mode toggle

> **Audience:** A fresh Claude (or engineer) with no prior context on this conversation.
> **Project root:** `/Users/M.Karmaza/Desktop/Projects/personal/projects-dashboard`
> **Stack:** Next.js (custom build per `AGENTS.md` — read `node_modules/next/dist/docs/` if APIs feel off), Drizzle + SQLite, Socket.io, `@anthropic-ai/claude-agent-sdk`.

---

## 1. Goal

The dashboard currently has **two separate tabs** that both invoke Claude on a project:

| Tab | Where Claude runs | Persistence | UI |
|---|---|---|---|
| **Chat** (existing, mature) | Dashboard server (Next.js process) | `chats` + `chat_messages` tables, full history | `src/components/chat/ChatPanel.tsx` |
| **Claude** (new, just wired) | Device-side agent process via Socket.io | In-memory only (lost on agent restart) | `src/components/claude/RemoteClaudePanel.tsx` |

**The user wants ONE tab.** Specifically: Chat UI stays as the front door, but gains a per-chat **execution mode** toggle (`local` vs `remote`). Remote routes through the agent (today's "Claude" tab pipeline). Local stays as today's Chat. After migration, the standalone **Claude tab is deleted**.

### Why
- Single mental model for the user
- Chat already has DB persistence, threading, multi-chat sidebar, project memory injection
- "Claude" tab already has SSE relay, permission modal, on-device tool execution
- Combining yields: persisted remote sessions + on-device file access + offline fallback

### Success criteria
1. Chat panel has a visible mode toggle (`Local` / `On device`).
2. New chats default per-device preference (or `local` if none).
3. Switching mode within a chat changes routing for **subsequent** messages; history is preserved.
4. Remote messages persist to the same `chat_messages` table and survive agent restart (re-loaded on chat open like local).
5. Permission requests (mode=remote, policy != bypass) render in the chat thread inline — same component as before, just relocated.
6. The standalone "Claude" tab is removed from the project page.
7. `RemoteClaudePanel.tsx` is deleted.
8. If `executionMode='remote'` but device offline, the user gets a clear error with a one-click "Switch to local and retry" affordance.

---

## 2. Hard constraints

1. **No API keys.** Both pipelines today use implicit OAuth via `~/.claude` on whichever machine runs the SDK. Do **not** introduce `ANTHROPIC_API_KEY` env var or `apiKey` SDK option. Auth model stays as-is.
2. **Don't break existing chats.** Migration must default existing rows to `'local'` so they keep working.
3. **Read `node_modules/next/dist/docs/` before writing route handlers** — this codebase uses a Next.js variant with breaking changes (per `AGENTS.md`).
4. **Agent runs via `tsx` (not built).** Edits to `agent/src/**` take effect after `Ctrl+C` + `pnpm dev` in `agent/`. No `agent/dist/`.
5. **pnpm workspace gotcha:** `pnpm install` inside `agent/` does nothing because root `pnpm-workspace.yaml` claims it. Use `pnpm install --ignore-workspace` inside `agent/`.
6. **Don't touch ESLint config.** `@eslint/eslintrc` is broken in this repo and unrelated to this task.

---

## 3. Current state — file map (verified 2026-04-27)

### Pipeline A — server-side ("Chat" tab)
| File | Notes |
|---|---|
| `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts` | POST `{ message, attachments }` → SSE. Calls `query()` from `@anthropic-ai/claude-agent-sdk` at ~line 220. `pathToClaudeCodeExecutable` from `CLAUDE_PATH` env or `~/.local/bin/claude` (~line 224). `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `maxTurns: 25`. Persists user msg before query, assistant msg + `toolUses` JSON after. |
| `src/lib/db/schema.ts` (lines 120–172) | `chats`: `id, projectId, title, model, totalTokensIn, totalTokensOut, estimatedCost, createdAt, updatedAt`. `chat_messages`: `id, chatId, role, content, toolUses (JSON), proposedChanges, attachments, tokensIn, tokensOut, timestamp`. |
| `src/components/chat/ChatPanel.tsx` (~line 87) | Multi-chat tabbed UI. Props `{ projectId, deviceId }`. SSE consumed via buffered line-by-line parsing (~line 336). Per-chat streaming Sets in local state. |
| `src/components/chat/ToolApprovalCard.tsx` (~line 124) | Shared tool approval card. Status: `pending | approved | denied | auto`. Icon/color map at lines 65–97. **Reuse this for remote permission UI — do not duplicate.** |
| `src/app/(dashboard)/projects/[id]/page.tsx` (lines 155–193, 289–322) | Tabs config. `<Tabs.Panel value="chat">` mounts `ChatPanel`. `<Tabs.Panel value="claude">` mounts `RemoteClaudePanel`. **Remove the second one.** |

### Pipeline B — device-side ("Claude" tab)
| File | Notes |
|---|---|
| `src/app/api/projects/[id]/claude/stream/route.ts` | POST `{ sessionId, prompt, model?, systemPrompt?, maxTurns? }`. Reads `device.claudeConfig` (or `DEFAULT_CLAUDE_PERMISSIONS`), forwards as `permissions`. Uses `agentManager.getAgentSocket(deviceId)` + filters events by `sessionId`. Emits `CLAUDE_QUERY`. |
| `src/app/api/projects/[id]/claude/cancel/route.ts` | POST `{ sessionId }` → emits `CLAUDE_CANCEL`. |
| `src/app/api/projects/[id]/claude/permission/route.ts` | POST `{ sessionId, requestId, decision }` → emits `CLAUDE_PERMISSION_RESPONSE`. |
| `agent/src/handlers/claude.ts` | `runClaudeQuery`, `cancelClaudeSession`, `handleClaudePermissionResponse`. `query()` called with `permissionMode: 'bypassPermissions'` + custom `canUseTool` that runs `evaluatePermission()`. Emits `CLAUDE_STARTED`, `CLAUDE_TEXT`, `CLAUDE_TOOL_USE` (status `auto|started|completed|denied`), `CLAUDE_PERMISSION_REQUEST`, `CLAUDE_DONE`, `CLAUDE_ERROR`. |
| `agent/src/index.ts` (lines 278–311) | Routes `CLAUDE_QUERY → runClaudeQuery` (fire-and-forget), `CLAUDE_CANCEL`, `CLAUDE_PERMISSION_RESPONSE`. |
| `src/lib/socket/types.ts` | Lines 101–120: command types. Lines 183–226: event types. Lines 367–402: `ClaudePermissionConfig` (`mode: 'bypass' | 'readOnly' | 'interactive'`, `autoAllowTools: string[]`, `denyPatterns: string[]`) + `DEFAULT_CLAUDE_PERMISSIONS`. |
| `src/components/claude/RemoteClaudePanel.tsx` | Props `{ projectId, projectPath, deviceId, deviceName? }`. Inline `PermissionCard` (~line 874), `ToolUseLine` (~line 828), `formatToolInput` (~line 961). **Most of this logic must be ported into ChatPanel, then this file deleted.** |
| `drizzle/0003_add_claude_config.sql` | Adds `devices.claude_config` JSON column. Already applied. |

### Shared infra
| File | Notes |
|---|---|
| `src/lib/socket/agent-manager.ts` | `sendCommand(deviceId, command, timeoutMs=15000): Promise<AgentEvent>` (line 87, request/response). `getAgentSocket(deviceId): Socket \| undefined` (line 160, for streaming). `isDeviceConnected(deviceId): boolean` (line 62). |

---

## 4. Migration plan — execute in this order

> **Tip:** Make a feature branch. Each phase is independently testable.

### Phase 1 — DB schema

1. Add column `executionMode TEXT NOT NULL DEFAULT 'local'` (values: `'local' | 'remote'`) to the `chats` table in `src/lib/db/schema.ts` (around lines 120–145). Use Drizzle's enum-style or `text({ enum: ['local','remote'] })`.
2. Add column `executionMode TEXT` to `chat_messages` (lines 148–172) — nullable, lets you see per-message which path was used (useful when user toggles mid-chat).
3. Generate migration: `pnpm drizzle-kit generate` (or whatever the project uses — check `drizzle.config.ts` and `package.json` scripts). It should create `drizzle/0004_*.sql`.
4. Apply: same script as `drizzle/0003_add_claude_config.sql` was applied (check `package.json` for `db:migrate` or similar).

### Phase 2 — Stream route routing

Edit `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts`:

1. Accept new optional fields in the POST body: `executionMode?: 'local' | 'remote'`, `claudePermissions?: ClaudePermissionConfig` (only used when remote).
2. Resolve effective mode: explicit body field > `chat.executionMode` from DB > `'local'`.
3. Persist `executionMode` on the assistant message row (and on the chat row if it changed via toggle).
4. **Branch on mode:**
   - `'local'`: keep current `query()` invocation untouched.
   - `'remote'`:
     - Validate device is connected via `agentManager.isDeviceConnected(project.deviceId)`. If not, return SSE `error` event `{ code: 'DEVICE_OFFLINE' }` and **do not** run query.
     - Generate `sessionId` (use `crypto.randomUUID()`).
     - Subscribe to agent socket via `agentManager.getAgentSocket(project.deviceId)` and filter events by `sessionId` (mirror logic from `claude/stream/route.ts`).
     - Emit `CLAUDE_QUERY` with `{ sessionId, projectPath: project.path, prompt: message, systemPrompt, model: chat.model, maxTurns?, permissions }`.
     - Translate agent events → SSE events using **the same SSE shape Chat already produces** (`text`, `tool_use`, `done`, `error`). This is the key trick: the UI shouldn't need a separate parser per mode.
     - Translation table:
       - `CLAUDE_TEXT` → SSE `text` (delta-style, accumulate on client)
       - `CLAUDE_TOOL_USE` → SSE `tool_use` with the same `status` field Chat already understands; map `auto/started/completed/denied`
       - `CLAUDE_PERMISSION_REQUEST` → new SSE `permission_request` event (Chat doesn't have this today; we'll add UI in Phase 4). Include `{ requestId, toolName, input, reason }`.
       - `CLAUDE_DONE` → SSE `done` with `{ tokensIn, tokensOut, costUsd, durationMs }` (use these to update `chat.totalTokensIn/Out/estimatedCost`)
       - `CLAUDE_ERROR` → SSE `error`
5. On client disconnect (request abort), emit `CLAUDE_CANCEL` to agent if mode was remote (mirror chat's existing local cancel behavior).

### Phase 3 — Cancel + permission response endpoints

Two options. **Pick A** (simpler):

**A. Reuse existing `/api/projects/[id]/claude/cancel` and `/api/projects/[id]/claude/permission` endpoints from the chat UI.**
The endpoints don't care which UI calls them — they only need `sessionId`. Just have ChatPanel POST there when mode=remote.

**B. Move them under `/api/projects/[id]/chat/[chatId]/cancel` and `/permission` for URL consistency.**
More refactor; only do this if you also want to retire `/api/projects/[id]/claude/*` entirely. Given we're deleting the Claude tab anyway, **B is cleaner long-term** but **A unblocks Phase 4 immediately** — recommend A now, B in a follow-up cleanup PR.

### Phase 4 — ChatPanel UI changes

`src/components/chat/ChatPanel.tsx`:

1. **Mode toggle in chat header.** A small `SegmentedControl` (Mantine) or two icon buttons: `Local` / `On device`. Show device name + online indicator next to "On device" (read from `agentManager` via existing API or pass `deviceConnected` prop down from page).
2. **Persist toggle.** When user clicks, optimistically update chat's `executionMode` and PATCH `/api/chats/:id` (or whatever update endpoint exists — find via `Grep "chats.id, eq" --type ts`). If no update endpoint exists, add one.
3. **Send `executionMode` in stream POST body** so server uses correct branch.
4. **Permission request handling.** When SSE delivers `permission_request`:
   - Render an inline `<ToolApprovalCard>` (the existing component at `src/components/chat/ToolApprovalCard.tsx`) at the bottom of the messages list.
   - Allow/Deny buttons POST to `/api/projects/[id]/claude/permission` (option A) with `{ sessionId, requestId, decision }`.
   - On response, update card state and remove from pending list.
5. **Tool use rendering.** Compare ChatPanel's existing tool-use UI vs `RemoteClaudePanel.ToolUseLine`. If they diverge, port any improvements from `ToolUseLine` (status badges, `formatToolInput`) into ChatPanel. Otherwise leave as-is.
6. **Offline fallback.** If POST to stream returns SSE `error` with `code: 'DEVICE_OFFLINE'`, render a notice with two buttons: "Switch to Local & retry" (auto-toggles mode and re-sends) and "Wait for device".

### Phase 5 — Project page cleanup

`src/app/(dashboard)/projects/[id]/page.tsx`:

1. Remove the `<Tabs.Tab value="claude">` entry from `<Tabs.List>`.
2. Remove the `<Tabs.Panel value="claude">` block.
3. Remove the import of `RemoteClaudePanel`.

### Phase 6 — Delete dead code

Only after Phase 5 is confirmed working (manual test):

1. Delete `src/components/claude/RemoteClaudePanel.tsx`.
2. **Don't** delete `src/app/api/projects/[id]/claude/{cancel,permission}/route.ts` if Phase 3A — they're now used by Chat. **Do** delete `src/app/api/projects/[id]/claude/stream/route.ts` (it's superseded by chat stream's remote branch).
3. Search for any other `RemoteClaudePanel` imports: `Grep "RemoteClaudePanel"`. Should be zero.
4. Search for any remaining hits on `/api/projects/.*?/claude/stream` and remove.

### Phase 7 — Per-device default mode (optional, do if time)

In `src/components/devices/*` settings UI, add a "Default chat execution mode" select. Store on `device.claudeConfig` (already a JSON column) — extend the type with `defaultExecutionMode?: 'local' | 'remote'`. New chats read this when creating.

---

## 5. Test plan

Run **after each phase** that touches running code:

### Smoke
1. Restart dashboard (`pnpm dev` in repo root).
2. Restart agent (`Ctrl+C` then `pnpm dev` in `agent/`). Confirm "agent connected" log on dashboard side.
3. Open a project, open Chat tab.

### Phase 2 (server routing)
4. Send a message with `executionMode='local'` — should behave exactly as before.
5. Send with `executionMode='remote'` and device online — agent logs `CLAUDE_QUERY`, response streams back.
6. Send with `executionMode='remote'` and device disconnected (kill agent) — SSE returns `DEVICE_OFFLINE` error promptly.

### Phase 4 (UI)
7. Toggle mode in chat header — visual feedback, persists across page reload.
8. Send "List files in current directory" in remote mode — `Read`/`LS` tool use auto-allows (default config), files listed.
9. Send "Run `echo hello`" in remote mode with `mode: 'interactive'` policy — permission card renders inline; clicking Allow proceeds; clicking Deny aborts.
10. Send a long-running prompt and click Cancel — agent abort fires, chat returns to idle.
11. Mid-chat, switch local↔remote and send another message — both messages persist with correct `executionMode` per row.
12. Reload page — full history is there, including remote messages.

### Phase 5–6 (cleanup)
13. Project page no longer shows "Claude" tab.
14. `pnpm tsc --noEmit` passes for files we touched (pre-existing errors elsewhere are out of scope).
15. No broken imports of deleted files.

---

## 6. Pitfalls (read before coding)

1. **`pnpm install` in `agent/` is silent.** Use `--ignore-workspace`. Already learned the hard way in this repo.
2. **`maxTurns`** — the existing local route hardcodes 25. The agent handler now respects `undefined` (no limit). For consistency, **make local also pass-through** (default to undefined, and let UI optionally set it). Don't reintroduce a hard 25 on remote.
3. **`pathToClaudeCodeExecutable`** — both pipelines resolve from `CLAUDE_PATH` env, fallback `~/.local/bin/claude`. If user doesn't have Claude Code CLI installed on the device, remote mode breaks at startup. The existing Claude tab already had this; not new. Don't try to "help" by hardcoding a path.
4. **SSE buffering.** ChatPanel parses SSE with line buffering; agent-relay events sometimes arrive packed (multiple newline-separated events in a single chunk). Confirm buffer logic in ChatPanel handles this — if not, port the parser from `RemoteClaudePanel.tsx` (~line 360–379).
5. **sessionId ↔ chatId.** They are different. `sessionId` is per-message-stream (one per send). `chatId` is per-chat. Don't conflate. The agent handler is keyed on `sessionId`.
6. **Cost / token tallies.** When remote returns `CLAUDE_DONE`, those tokens were spent on the device's OAuth account, not the dashboard server's. Update `chat.totalTokensIn/Out/estimatedCost` the same way. Probably accurate enough; add a note in UI later if user wants to distinguish.
7. **AGENTS.md says this is a Next.js variant.** Read `node_modules/next/dist/docs/` for any route handler API you're unsure about (e.g. how `request.signal` aborts work, how `ReadableStream` is wired into `Response`). Don't assume mainline Next.js semantics.
8. **Don't run any commit/push without user confirmation.** Stage and show diffs; let the user commit.

---

## 7. Out of scope (don't get distracted)

- Refactoring `@eslint/eslintrc` setup
- Migrating `/api/projects/[id]/claude/*` URLs (Phase 3 option B) — leave for later
- New skills/MCP integrations
- UI for editing per-device `claudeConfig` policies (probably useful, but separate task)
- Replacing implicit OAuth with explicit credentials

---

## 8. Quick reference — minimal diff summary

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `executionMode` column to `chats` and `chat_messages` |
| `drizzle/0004_*.sql` | Generated migration |
| `src/app/api/projects/[id]/chat/[chatId]/stream/route.ts` | Branch on `executionMode`; remote branch mirrors `claude/stream` logic and translates events to existing SSE shape |
| `src/components/chat/ChatPanel.tsx` | Mode toggle, send `executionMode`, render `permission_request` SSE → `<ToolApprovalCard>`, offline fallback |
| `src/app/(dashboard)/projects/[id]/page.tsx` | Remove Claude tab + panel + import |
| `src/components/claude/RemoteClaudePanel.tsx` | **Delete** |
| `src/app/api/projects/[id]/claude/stream/route.ts` | **Delete** (after Phase 5 verified) |
| `src/app/api/projects/[id]/claude/cancel/route.ts` | Keep — Chat now uses it |
| `src/app/api/projects/[id]/claude/permission/route.ts` | Keep — Chat now uses it |

---

## 9. If you get stuck

- **Agent doesn't pick up code changes:** restart `pnpm dev` in `agent/`. It runs via `tsx watch`, but watcher sometimes misses moves/renames.
- **Dashboard doesn't pick up new types:** restart Next.js dev server. Hot reload handles most things but type-only changes occasionally need a full restart.
- **`Device is not connected` on every request:** the agent's `tokenHash` doesn't match what's in the `devices` table. Re-register the device via whatever onboarding flow exists (check `src/app/(dashboard)/devices/*`).
- **Permission card never shows up:** confirm `device.claudeConfig.mode !== 'bypass'`. Default config has `mode: 'interactive'` but only for non-`autoAllowTools`. Try a `Bash` command — that won't be in the auto-allow list.

---

End of brief.
