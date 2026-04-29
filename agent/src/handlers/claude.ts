import { hostname, homedir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentEvent,
  ClaudeAttachment,
  ClaudePermissionConfig,
} from '../../../src/lib/socket/types.js';
import {
  fetchAttachments,
  rewritePromptPlaceholders,
} from '../attachments.js';
import { createPm2McpServer } from '../mcp/pm2.js';

// ─── In-flight Claude sessions ────────────────────────────
//
// Keyed by sessionId. Each session owns:
//   - an AbortController so CLAUDE_CANCEL can cut the SDK loop
//   - a permission resolver map so canUseTool can wait for the user's
//     answer to a CLAUDE_PERMISSION_REQUEST without blocking the socket
interface ActiveSession {
  abort: AbortController;
  pendingPermissions: Map<
    string,
    {
      resolve: (decision: 'allow' | 'deny') => void;
      timer: NodeJS.Timeout;
    }
  >;
}

const sessions = new Map<string, ActiveSession>();

// 3-minute window for the user to respond to a tool prompt before we
// auto-deny. Long enough that someone can actually read the request,
// short enough that an abandoned tab doesn't pin a session forever.
const PERMISSION_TIMEOUT_MS = 3 * 60_000;

/**
 * Decide whether a tool invocation should run, ask the user, or be denied.
 * Pure function — no side effects — so it's easy to reason about.
 */
function evaluatePermission(
  toolName: string,
  input: Record<string, unknown>,
  config: ClaudePermissionConfig,
): { decision: 'allow' | 'deny' | 'ask'; reason?: string } {
  // Bypass mode trusts everything (use only on machines you fully control).
  if (config.mode === 'bypass') {
    return { decision: 'allow' };
  }

  // Read-only mode: a hardcoded allowlist of safe tools, everything else denied.
  if (config.mode === 'readOnly') {
    const READ_ONLY_TOOLS = new Set([
      'Read',
      'LS',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'TodoRead',
      'TodoWrite',
    ]);
    if (READ_ONLY_TOOLS.has(toolName)) return { decision: 'allow' };
    return {
      decision: 'deny',
      reason: `Read-only mode: ${toolName} is not allowed`,
    };
  }

  // Interactive mode: deny patterns trump everything (so even an "auto-allowed"
  // Bash can be blocked if the command contains `rm -rf /`).
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const cmd = input.command;
    for (const pattern of config.denyPatterns) {
      if (cmd.includes(pattern)) {
        return {
          decision: 'deny',
          reason: `Denied by pattern: ${pattern}`,
        };
      }
    }
  }

  if (config.autoAllowTools.includes(toolName)) {
    return { decision: 'allow' };
  }

  return { decision: 'ask' };
}

interface RunClaudeArgs {
  socket: Socket;
  sessionId: string;
  requestId: string;
  projectPath: string;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTurns?: number;
  claudePath?: string;
  permissions: ClaudePermissionConfig;
  /** When set, mount the PM2 MCP scoped to this pm2Name. */
  pm2Name?: string;
  /** When true and Playwright is installed, mount the Browser MCP. */
  enableBrowserMcp?: boolean;
  // ─── Attachments (optional) ────────────────────────────
  // Present iff the user attached files to this turn. The dashboard
  // hosts the bytes; we download them via HTTP before invoking the SDK.
  attachments?: ClaudeAttachment[];
  chatId?: string;
  projectId?: string;
  dashboardUrl?: string;
  agentToken?: string;
}

/**
 * Run a Claude Agent SDK session locally on the device.
 * All state flows back to the dashboard via socket events; this never returns
 * a payload through the request/response channel.
 */
export async function runClaudeQuery(args: RunClaudeArgs): Promise<void> {
  const {
    socket,
    sessionId,
    requestId,
    projectPath,
    prompt,
    systemPrompt,
    model,
    maxTurns,
    claudePath,
    permissions,
    pm2Name,        // NEW — unused in Phase 0
    enableBrowserMcp, // NEW — unused in Phase 0
    attachments,
    chatId,
    projectId,
    dashboardUrl,
    agentToken,
  } = args;

  // Touched in Phase 2 — keep referenced so lint doesn't complain.
  void enableBrowserMcp;

  const emit = (event: AgentEvent) => socket.emit('event', event);

  // Reject duplicate sessionIds — surfaces bugs in the dashboard rather
  // than silently sharing state between two browser tabs.
  if (sessions.has(sessionId)) {
    emit({
      type: 'CLAUDE_ERROR',
      sessionId,
      requestId,
      message: `Session ${sessionId} is already running`,
    });
    return;
  }

  const abort = new AbortController();
  const session: ActiveSession = { abort, pendingPermissions: new Map() };
  sessions.set(sessionId, session);

  emit({
    type: 'CLAUDE_STARTED',
    sessionId,
    requestId,
    cwd: projectPath,
    hostname: hostname(),
  });

  const startTime = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  try {
    // ─── Resolve attachments (if any) ─────────────────────
    // The dashboard sent us metadata + placeholder tokens in the prompt.
    // Download the bytes to a local temp dir and rewrite the placeholders
    // before handing the prompt to the SDK — the multimodal Read tool
    // needs a real device-local path. Any download failure is fatal:
    // letting the SDK loose with `__ATTACHMENT_0__` literals in the
    // prompt would produce a confused, unhelpful reply.
    let resolvedPrompt = prompt;
    if (attachments && attachments.length > 0) {
      console.log(
        `[claude] CLAUDE_QUERY has ${attachments.length} attachment(s): ` +
          attachments.map((a) => a.name).join(', '),
      );
      if (!chatId || !projectId || !dashboardUrl || !agentToken) {
        throw new Error(
          'CLAUDE_QUERY has attachments but is missing chatId/projectId/dashboardUrl/agentToken',
        );
      }
      const fetched = await fetchAttachments({
        dashboardUrl,
        agentToken,
        projectId,
        chatId,
        attachments,
      });
      const pairs = Object.entries(fetched.pathByPlaceholder);
      console.log(
        `[claude] downloaded ${pairs.length} attachment(s) → ` +
          pairs.map(([k, v]) => `${k}=${v}`).join(', '),
      );
      resolvedPrompt = rewritePromptPlaceholders(prompt, fetched.pathByPlaceholder);
    } else if (attachments) {
      // Empty array — informational, not an error
      console.log('[claude] CLAUDE_QUERY: attachments array empty');
    }

    const resolvedClaudePath =
      claudePath ||
      process.env.CLAUDE_PATH ||
      `${process.env.HOME}/.local/bin/claude`;
    const resolvedCwd = expandHome(projectPath);

    // Build the per-call MCP map. Each entry is an in-process SDK MCP
    // server bound to data this chat is authorized to see.
    const mcpServers: Record<string, McpServerConfig> = {};
    if (pm2Name) {
      mcpServers.pm2 = createPm2McpServer(pm2Name);
      console.log(`[claude] mounted pm2 MCP for "${pm2Name}" (sessionId=${sessionId})`);
    }
    // (Browser MCP added in Phase 2.)

    const agentQuery = query({
      prompt: resolvedPrompt,
      options: {
        pathToClaudeCodeExecutable: resolvedClaudePath,
        cwd: resolvedCwd,
        ...(model ? { model } : {}),
        // Only forward maxTurns when the caller specified one. The SDK's
        // own default (no cap) is what we want for real-device work — a
        // hardcoded 25 here means trivial tasks hit the limit while the
        // model is still reading files.
        ...(typeof maxTurns === 'number' ? { maxTurns } : {}),
        includePartialMessages: true,
        persistSession: false,
        // We do our own permission decisions in canUseTool below. Setting
        // bypassPermissions on the SDK side means it won't prompt on its
        // own CLI — every gate runs through us.
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        ...(systemPrompt ? { systemPrompt } : {}),
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers,
        abortController: abort,
        canUseTool: async (toolName, input, opts) => {
          const verdict = evaluatePermission(
            toolName,
            input as Record<string, unknown>,
            permissions,
          );

          if (verdict.decision === 'allow') {
            emit({
              type: 'CLAUDE_TOOL_USE',
              sessionId,
              toolUseId: opts.toolUseID,
              toolName,
              input: input as Record<string, unknown>,
              status: 'auto',
            });
            return {
              behavior: 'allow' as const,
              toolUseID: opts.toolUseID,
              updatedPermissions: opts.suggestions,
            };
          }

          if (verdict.decision === 'deny') {
            emit({
              type: 'CLAUDE_TOOL_USE',
              sessionId,
              toolUseId: opts.toolUseID,
              toolName,
              input: input as Record<string, unknown>,
              status: 'denied',
              result: verdict.reason,
            });
            return {
              behavior: 'deny' as const,
              message: verdict.reason || 'Denied by device policy',
              interrupt: false,
            };
          }

          // 'ask' — wait for user via socket round-trip.
          const permRequestId = opts.toolUseID;
          emit({
            type: 'CLAUDE_PERMISSION_REQUEST',
            sessionId,
            requestId: permRequestId,
            toolName,
            input: input as Record<string, unknown>,
            reason:
              toolName === 'Bash'
                ? `Run shell command on ${hostname()}`
                : `${toolName} on ${hostname()}`,
          });

          const decision = await new Promise<'allow' | 'deny'>((resolve) => {
            const timer = setTimeout(() => {
              session.pendingPermissions.delete(permRequestId);
              resolve('deny');
            }, PERMISSION_TIMEOUT_MS);
            session.pendingPermissions.set(permRequestId, { resolve, timer });
          });

          if (decision === 'allow') {
            emit({
              type: 'CLAUDE_TOOL_USE',
              sessionId,
              toolUseId: opts.toolUseID,
              toolName,
              input: input as Record<string, unknown>,
              status: 'started',
            });
            return {
              behavior: 'allow' as const,
              toolUseID: opts.toolUseID,
              updatedPermissions: opts.suggestions,
            };
          }

          emit({
            type: 'CLAUDE_TOOL_USE',
            sessionId,
            toolUseId: opts.toolUseID,
            toolName,
            input: input as Record<string, unknown>,
            status: 'denied',
            result: 'User denied permission',
          });
          return {
            behavior: 'deny' as const,
            message: 'User denied permission',
            interrupt: false,
          };
        },
      },
    });

    for await (const message of agentQuery) {
      if (abort.signal.aborted) break;

      const msg = message as SDKMessage;

      switch (msg.type) {
        case 'stream_event': {
          const partial = msg as SDKPartialAssistantMessage;
          const event = partial.event;
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta' &&
            event.delta.text
          ) {
            emit({
              type: 'CLAUDE_TEXT',
              sessionId,
              text: event.delta.text,
            });
          }
          break;
        }

        case 'assistant': {
          // Surface tool_use blocks that the SDK already approved through
          // canUseTool — the UI uses these to mark "completed" state.
          const assistantMsg = msg as SDKAssistantMessage;
          for (const block of assistantMsg.message.content) {
            if (block.type === 'tool_use') {
              emit({
                type: 'CLAUDE_TOOL_USE',
                sessionId,
                toolUseId: block.id,
                toolName: block.name,
                input: block.input as Record<string, unknown>,
                status: 'completed',
              });
            }
          }
          break;
        }

        case 'result': {
          const resultMsg = msg as SDKResultMessage;
          tokensIn = resultMsg.usage.input_tokens;
          tokensOut = resultMsg.usage.output_tokens;
          costUsd = resultMsg.total_cost_usd;
          break;
        }

        default:
          break;
      }
    }

    emit({
      type: 'CLAUDE_DONE',
      sessionId,
      requestId,
      tokensIn,
      tokensOut,
      costUsd,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude session failed';
    emit({
      type: 'CLAUDE_ERROR',
      sessionId,
      requestId,
      message,
    });
  } finally {
    // Clear any orphaned permission timers — leaving them around would
    // hold the event loop open and block graceful shutdown.
    for (const { timer } of session.pendingPermissions.values()) {
      clearTimeout(timer);
    }
    sessions.delete(sessionId);
  }
}

/**
 * User answered a CLAUDE_PERMISSION_REQUEST. Resolve the waiting promise
 * inside the canUseTool callback so the SDK can proceed.
 */
export function handleClaudePermissionResponse(
  sessionId: string,
  requestId: string,
  decision: 'allow' | 'deny',
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  const pending = session.pendingPermissions.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  session.pendingPermissions.delete(requestId);
  pending.resolve(decision);
}

/** User clicked Cancel — abort the in-flight SDK loop. */
export function cancelClaudeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.abort.abort();
  // Auto-deny anything still waiting so the canUseTool promise resolves
  // and the for-await loop above exits cleanly.
  for (const [, pending] of session.pendingPermissions) {
    clearTimeout(pending.timer);
    pending.resolve('deny');
  }
  session.pendingPermissions.clear();
}

/** Cancel everything on agent shutdown. */
export function cancelAllClaudeSessions(): void {
  for (const sessionId of sessions.keys()) {
    cancelClaudeSession(sessionId);
  }
}
