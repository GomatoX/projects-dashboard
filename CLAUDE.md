@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick context

Personal multi-device dev dashboard. Two runtimes live in this repo:

- **Dashboard** (`src/`, `server.mts`) — Next.js 16 + a custom HTTP server that mounts Socket.io on the same port at path `/api/ws`. Holds the SQLite DB, the AI/chat backend, and the UI.
- **Agent** (`agent/`) — separate Node daemon installed on each managed host (Linux/Mac). Connects out to the dashboard over Socket.io with a per-device token, executes git/pm2/file/terminal/Claude SDK commands locally.

The dashboard is intended to run on a LAN (default bind `0.0.0.0:3000`); agents dial home over Socket.io. There is no client-side fan-out — the dashboard is the only Socket.io server.

A pnpm workspace links them (`pnpm-workspace.yaml`); `agent/` has its own `package.json` and is installed/run independently in production.

Long-form context lives in `plan.md` (vision, roadmap, security model), `README.md` (deploy steps for systemd / launchd), and `UNIFY_CHAT_BRIEF.md` (chat subsystem spec). Skim those before architectural changes.

## Common commands

Run from repo root unless noted.

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (`tsx watch server.mts`) — Next + Socket.io on :3000 |
| `pnpm build` | `next build` |
| `pnpm start` | Production server via `server.mts` |
| `pnpm lint` | ESLint over `src/` only |
| `pnpm format` | Prettier over `src/**/*.{ts,tsx,css}` |
| `pnpm db:push` | Apply Drizzle schema to `./data/dashboard.db` |
| `pnpm db:studio` | Drizzle Studio UI |

Agent (run from `agent/`):

| Command | Purpose |
|---|---|
| `pnpm dev` | `tsx watch src/index.ts` against `agent/.env` |
| `pnpm start` | Production agent (used by systemd/launchd) |
| `pnpm build` | `tsc` typecheck |

There is no test runner configured. `pnpm lint` does not cover `agent/`.

## Architecture notes worth knowing up front

### Custom server (`server.mts`)
- Boots Next, then attaches a single Socket.io server to the same `httpServer` at path `/api/ws` (not `/socket.io/`). Anything talking to the WS must use that path.
- `destroyUpgrade: false` is set deliberately — engine.io's default 1s timer races Next's HMR upgrade requests on `/_next/webpack-hmr`. Don't flip it.
- `crashRecovery()` from `src/lib/ai/event-journal.ts` MUST run before `httpServer.listen()` — it seals any chat journals left `active` by a prior process so SSE subscribers see a clean ended state.
- The auth middleware does fast SHA-256 lookup (indexed `tokenHash`) with a bcrypt fallback for legacy device rows; the fallback lazily backfills `tokenHash` on first hit. Don't remove the fallback until all rows are migrated.
- `globalThis.__socketIO` and `globalThis.__agentManager` are how API route handlers reach the live socket layer — they're populated here, consumed in `src/app/api/**`.

### Streaming chat (event journal)
`src/lib/ai/event-journal.ts` is the chat stream's source of truth: SQLite tables (`chat_stream_journals` / `chat_stream_events`) for durable replay, plus an in-process `Map<chatId, Set<listener>>` for live push. `markStreamStart` / `markStreamEnd` in `src/lib/ai/active-streams.ts` are the only sanctioned entry points — they create/end journals atomically with the active-stream registry. A second POST while a journal is active must return HTTP 409.

### Agent ↔ dashboard contract
The full message union is in `src/lib/socket/types.ts` (imported by both runtimes via the workspace). When you add or rename a message:
1. Update `types.ts`.
2. Add the case in the agent's `onCommand` switch (`agent/src/index.ts`).
3. **Bump `agent/src/index.ts`'s startup banner version** (currently `v0.2.0`). The version string is how we confirm a deployed agent has a given fix without shelling in.

Streaming workloads (Claude SDK, terminal, PM2 logs) emit events directly via `socket.emit('event', …)` rather than calling the `respond` callback — the dashboard's relay listens to all agent events and routes by `sessionId` / `requestId`. Don't `await` `runClaudeQuery` from the command switch; it would block every other command behind a multi-minute SDK loop.

### Auth
- User auth: `better-auth` (`src/lib/auth.ts`, schema in `src/lib/db/auth-schema.ts`).
- Agent auth: per-device tokens (nanoid(32)) issued by the dashboard UI, stored as `tokenHash` (sha256) + legacy `agentToken` (bcrypt). See `src/lib/auth/agent-token.ts`.

### DB
libsql + Drizzle. Schema split into `src/lib/db/schema.ts` (app) and `src/lib/db/auth-schema.ts` (better-auth). Both are listed in `drizzle.config.ts`. Use `pnpm db:push` after schema changes — there is no migration-file workflow checked in beyond what Drizzle generates in `./drizzle/`.

## Conventions

- **Next.js 16 has breaking changes from your training data.** Before writing route handlers, server actions, params, caching, or `next/*` imports, read the relevant page in `node_modules/next/dist/docs/`. Heed deprecation notices. (This is why `AGENTS.md` is imported at the top.)
- **React Compiler is on** (`next.config.ts: reactCompiler: true`). Don't hand-roll `useMemo`/`useCallback` for plain referential stability — let the compiler handle it. Reach for them only when you have a measured reason.
- **`no-console` is `warn` with `console.warn` and `console.error` allowed.** Use those in server code; avoid `console.log` in `src/`. The agent (`agent/`) is not linted and uses `console.log` freely.
- **Prettier**: 100 col, single quotes, semis, trailing commas. `pnpm format` before committing if you've touched many files.
- **Path alias**: `@/*` → `src/*` (see `tsconfig.json`).
- **Don't expose the dashboard publicly without an auth proxy.** README and `plan.md` repeat this; treat it as a hard rule.
