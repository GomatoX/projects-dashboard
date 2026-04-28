import { NextRequest } from 'next/server';
import path from 'node:path';
import crypto from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats, chatMessages, projects, projectMemory, devices } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { shouldAutoAllow, getToolMeta } from '@/lib/ai/tools';
import { createPermissionRequest } from '@/lib/ai/permission-store';
import { markStreamStart, markStreamEnd, isChatActive } from '@/lib/ai/active-streams';
import { appendEvent } from '@/lib/ai/event-journal';
import {
  registerLocalAbort,
  unregisterLocalAbort,
} from '@/lib/ai/local-cancel';
import {
  registerRemoteCancel,
  unregisterRemoteCancel,
} from '@/lib/ai/remote-cancel';
import {
  DEFAULT_CLAUDE_PERMISSIONS,
  type AgentCommand,
  type ClaudeAttachment,
  type ClaudePermissionConfig,
} from '@/lib/socket/types';
import { PreviewDetector } from '@/lib/ai/preview-detector';
import { PREVIEW_SYSTEM_PROMPT } from '@/lib/ai/preview-system-prompt';

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

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as
    | AgentManagerModule
    | null;
}

// Shape of the metadata POST /attachments returns. Matches what the client
// stores on the user message and what we read back here when building the
// prompt note that points Claude at the on-disk files.
interface AttachmentMeta {
  id: string;
  filename: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: projectId, chatId } = await params;

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

  const body = await request.json();
  const userMessage: string = body.message ?? '';
  const executionMode: 'local' | 'remote' | undefined = body.executionMode;

  // `attachments` arrives as a JSON-encoded string (the same blob we persist
  // on chatMessages.attachments). Parse defensively — a bad payload should
  // not block the message, just drop the attachments.
  let attachments: AttachmentMeta[] = [];
  if (typeof body.attachments === 'string' && body.attachments) {
    try {
      const parsed = JSON.parse(body.attachments);
      if (Array.isArray(parsed)) attachments = parsed as AttachmentMeta[];
    } catch {
      // ignore — treat as no attachments
    }
  }

  // A turn is valid if there's text OR at least one attachment (e.g. a
  // screenshot pasted with no caption is still a meaningful prompt).
  if (!userMessage.trim() && attachments.length === 0) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get chat + project metadata
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
  if (!chat) {
    return new Response(JSON.stringify({ error: 'Chat not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve effective execution mode: explicit body field > chat row > 'local'
  const effectiveMode: 'local' | 'remote' =
    executionMode ?? chat.executionMode ?? 'local';

  // If the mode changed, persist it on the chat row so it sticks.
  if (effectiveMode !== chat.executionMode) {
    await db
      .update(chats)
      .set({ executionMode: effectiveMode, updatedAt: new Date() })
      .where(eq(chats.id, chatId));
  }

  // Save user message (with executionMode tag)
  const userMsgId = nanoid();
  await db.insert(chatMessages).values({
    id: userMsgId,
    chatId,
    role: 'user',
    content: userMessage,
    toolUses: '[]',
    proposedChanges: '[]',
    attachments: body.attachments || '[]',
    executionMode: effectiveMode,
    timestamp: new Date(),
  });

  // Build system prompt from project memory
  let systemPrompt =
    'You are a helpful coding assistant integrated into a developer dashboard. You have direct access to read, edit, and create files in the project. Provide concise, actionable responses. Use Markdown formatting.';

  const [memory] = await db
    .select()
    .from(projectMemory)
    .where(eq(projectMemory.projectId, projectId));

  if (memory) {
    const sections: string[] = [];
    if (memory.systemPrompt) sections.push(memory.systemPrompt);
    if (memory.architecture) sections.push(`## Architecture\n${memory.architecture}`);
    if (memory.conventions) sections.push(`## Conventions\n${memory.conventions}`);
    if (memory.notes) sections.push(`## Notes\n${memory.notes}`);

    const pinnedFiles = JSON.parse(memory.pinnedFiles || '[]') as string[];
    if (pinnedFiles.length > 0) {
      sections.push(
        `## Pinned Files\nThe following files are important context for this project:\n${pinnedFiles.map((f) => `- ${f}`).join('\n')}`,
      );
    }

    if (sections.length > 0) {
      systemPrompt += '\n\n--- Project Context ---\n\n' + sections.join('\n\n');
    }
  }

  // Inject preview panel instructions for every chat
  systemPrompt += '\n\n' + PREVIEW_SYSTEM_PROMPT;

  // Build the prompt with conversation history
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.timestamp));

  // Build a full prompt that includes conversation history context
  const historyContext = history
    .slice(0, -1) // Exclude the last message (just saved user msg)
    .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');

  // If the user attached files, surface them to the agent as absolute paths
  // on disk. The agent (local or remote) uses the Claude Code multimodal
  // Read tool — pointing it at an image/PDF path is enough for the model
  // to "see" the contents. We deliberately do NOT inline the bytes (no
  // base64 in the prompt) because that would balloon token usage and
  // duplicate work the Read tool already does optimally.
  //
  // The prompt is built once with `__ATTACHMENT_<index>__` placeholders.
  //   • LOCAL mode resolves them to dashboard-side absolute paths right
  //     here, since the SDK runs in this same Next.js process.
  //   • REMOTE mode leaves the placeholders in the prompt and ships the
  //     attachment metadata over the socket; the device-side agent
  //     downloads each file via HTTP and rewrites the placeholders to
  //     device-local absolute paths just before invoking the SDK.
  // Either way the model sees clean absolute paths — never a placeholder.
  const attachmentTokens: ClaudeAttachment[] = attachments.map((a, i) => ({
    filename: a.filename,
    name: a.name,
    type: a.type,
    placeholder: `__ATTACHMENT_${i}__`,
  }));

  let attachmentNote = '';
  if (attachmentTokens.length > 0) {
    const lines = attachmentTokens.map(
      (t) => `- ${t.name} (${t.type}) → ${t.placeholder}`,
    );
    attachmentNote =
      `\n\n[The user attached ${attachmentTokens.length} file(s). ` +
      `Use the Read tool on the absolute paths below to inspect them — ` +
      `images and PDFs are rendered visually.]\n` +
      lines.join('\n');
  }

  const userTurn = `${userMessage}${attachmentNote}`;
  const promptWithPlaceholders = historyContext
    ? `Previous conversation:\n${historyContext}\n\nHuman: ${userTurn}`
    : userTurn;

  // ─── Route to the correct execution backend ──────────────
  if (effectiveMode === 'remote') {
    return handleRemoteStream({
      request,
      projectId,
      chatId,
      chat,
      project,
      fullPrompt: promptWithPlaceholders,
      systemPrompt,
      userMessage,
      history,
      attachments: attachmentTokens,
    });
  }

  // LOCAL: substitute placeholders with dashboard-side absolute paths.
  // `process.cwd()` is the Next.js server cwd, which is where
  // `data/uploads/chats/<chatId>/...` lives.
  let fullPrompt = promptWithPlaceholders;
  for (const t of attachmentTokens) {
    const abs = path.join(
      process.cwd(),
      'data',
      'uploads',
      'chats',
      chatId,
      t.filename,
    );
    fullPrompt = fullPrompt.split(t.placeholder).join(abs);
  }

  return handleLocalStream({
    request,
    projectId,
    chatId,
    chat,
    project,
    fullPrompt,
    systemPrompt,
    userMessage,
    history,
  });
}

// ─── LOCAL execution (existing pipeline, unchanged) ─────────

interface StreamArgs {
  request: NextRequest;
  projectId: string;
  chatId: string;
  chat: typeof chats.$inferSelect;
  project: typeof projects.$inferSelect;
  fullPrompt: string;
  systemPrompt: string;
  userMessage: string;
  history: (typeof chatMessages.$inferSelect)[];
}

// Remote-only — local mode pre-substitutes placeholders inline so it
// doesn't need this metadata.
interface RemoteStreamArgs extends StreamArgs {
  attachments: ClaudeAttachment[];
}

function handleLocalStream(args: StreamArgs) {
  const { projectId, chatId, chat, project, fullPrompt, systemPrompt, userMessage, history } =
    args;

  const encoder = new TextEncoder();
  const assistantMsgId = nanoid();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      // Register this project + chat as having an active streaming session.
      // The project entry feeds the sidebar "in progress" loader; the chat
      // entry lets the chat panel itself recover the "Thinking..." indicator
      // after a page refresh (the original SSE connection dies with the page,
      // but the agent turn keeps running here). Always paired with
      // markStreamEnd in the finally block below.
      const ok = await markStreamStart(projectId, chatId);
      if (!ok) {
        const json = JSON.stringify({
          type: 'error',
          message: 'stream_already_active',
        });
        try {
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
          controller.close();
        } catch {
          // Request already aborted — nothing to write.
        }
        return;
      }

      const safeEnqueue = (data: Uint8Array) => {
        if (!closed) {
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
          }
        }
      };

      const safeClose = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      // Each "turn" is one assistant message. A single chat-level turn can
      // produce multiple SDK turns when tools are used: deltas → assistant →
      // tool_use → tool_result → deltas → assistant → … The previous code
      // collapsed everything into a single string, which (a) discarded all
      // but the last turn's text on the server (the `fullContent = turnText`
      // overwrite below was the bug) and (b) made the live streaming display
      // visually merge consecutive turns ("Let me check…" + "Here it is")
      // with no separator. We track turns explicitly and emit a `turn_break`
      // event between them so the client can insert `\n\n` in its live
      // buffer; the journal stores the same break so reattaching subscribers
      // see the identical separators.
      const completedTurns: string[] = [];
      let currentTurnDeltas = '';
      const toolUses: Array<{
        id: string;
        toolName: string;
        input: Record<string, unknown>;
        status: string;
      }> = [];
      let totalCost = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      // AbortController for the SDK `query()`. Registered in the per-chat
      // map so the /cancel endpoint can abort us from another request. The
      // SDK propagates abort through its async iterator, which surfaces
      // here as either a thrown AbortError (clean break) or the iterator
      // simply ending — both paths land in `finally` for cleanup.
      const abortController = new AbortController();
      registerLocalAbort(chatId, abortController);
      // `aborted` lets the catch / finally blocks distinguish a user-driven
      // cancel from a real failure, so we surface a clean `done` event
      // (with whatever partial content arrived) instead of an error toast.
      let aborted = false;
      abortController.signal.addEventListener('abort', () => {
        aborted = true;
      });
      // We deliberately do NOT subscribe to `request.signal` here — a
      // tab/page navigation should leave the agent running so the user
      // can come back via /stream/subscribe (mirrors the remote handler's
      // documented behavior at the bottom of this file). The /cancel
      // endpoint calls `abortLocal(chatId)` to flip the SDK controller
      // when the user explicitly clicks Stop.

      try {

        const agentQuery = query({
          prompt: fullPrompt,
          options: {
            abortController,
            pathToClaudeCodeExecutable:
              process.env.CLAUDE_PATH || `${process.env.HOME}/.local/bin/claude`,
            cwd: project.path,
            model: chat.model,
            maxTurns: 25,
            includePartialMessages: true,
            persistSession: false,
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
            systemPrompt,
            tools: { type: 'preset', preset: 'claude_code' },
            canUseTool: async (toolName, input, opts) => {
              // Preview content is delivered exclusively via fenced blocks detected by
              // PreviewDetector — `show_preview` is not in the claude_code tool preset
              // so this callback will never fire for it.

              // Emit tool activity for all tools (UI tracking)
              const meta = getToolMeta(toolName);

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
                // 'ask' tools (Bash, Task) — still show activity but auto-allow
                // since bypassPermissions handles the SDK side
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
              }

              return {
                behavior: 'allow' as const,
                toolUseID: opts.toolUseID,
                updatedPermissions: opts.suggestions,
              };
            },
          },
        });

        const previewDetector = new PreviewDetector();

        for await (const message of agentQuery) {
          const msg = message as SDKMessage;

          switch (msg.type) {
            case 'assistant': {
              previewDetector.reset();
              // Complete assistant turn — extract text content
              const assistantMsg = msg as SDKAssistantMessage;
              const textBlocks = assistantMsg.message.content.filter(
                (b) => b.type === 'text',
              );
              // Always capture the complete text from assistant turn. We
              // prefer the SDK-canonical turn text over the concatenated
              // deltas — they should match, but if a delta was dropped we
              // want the full turn text to be saved.
              const turnText = textBlocks
                .map((b) => (b.type === 'text' ? b.text : ''))
                .join('');
              if (turnText) {
                completedTurns.push(turnText);
                // Tell the client this turn is done. The next turn (after
                // any tool calls) will start fresh, so the live buffer
                // needs `\n\n` between them. We always emit — a trailing
                // turn_break at the very end is harmless (it just adds
                // empty trailing space in the live bubble, which the
                // refetch on `done` overwrites with the persisted row).
                await writeEvent(safeEnqueue, encoder, chatId, {
                  type: 'turn_break',
                });
              }
              currentTurnDeltas = '';
              // Extract tool use info
              const toolBlocks = assistantMsg.message.content.filter(
                (b) => b.type === 'tool_use',
              );
              for (const tb of toolBlocks) {
                if (tb.type === 'tool_use') {
                  toolUses.push({
                    id: tb.id,
                    toolName: tb.name,
                    input: tb.input as Record<string, unknown>,
                    status: 'completed',
                  });
                }
              }
              break;
            }

            case 'result': {
              // Final result — extract usage & cost
              const resultMsg = msg as SDKResultMessage;
              totalCost = resultMsg.total_cost_usd;
              inputTokens = resultMsg.usage.input_tokens;
              outputTokens = resultMsg.usage.output_tokens;

              if (
                resultMsg.subtype === 'success' &&
                resultMsg.result &&
                completedTurns.length === 0
              ) {
                // No assistant turns observed (rare — bypass path). Use
                // the result text as a single synthetic turn so we still
                // persist something.
                completedTurns.push(resultMsg.result);
              }
              break;
            }

            case 'stream_event': {
              // SDKPartialAssistantMessage — raw streaming events
              const partial = msg as SDKPartialAssistantMessage;
              const event = partial.event;

              if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta.type === 'text_delta' && delta.text) {
                  currentTurnDeltas += delta.text;
                  await writeEvent(safeEnqueue, encoder, chatId, { type: 'text', text: delta.text });
                  for (const preview of previewDetector.feed(delta.text)) {
                    await writeEvent(safeEnqueue, encoder, chatId, { ...preview });
                  }
                }
              }
              break;
            }

            default:
              // Ignore system messages, tool progress, etc.
              break;
          }
        }

        // If the loop exited mid-turn (abort or max_turns hit between
        // assistant messages), salvage whatever deltas we did receive so
        // they aren't lost from the persisted record.
        if (currentTurnDeltas.trim().length > 0) {
          completedTurns.push(currentTurnDeltas);
          currentTurnDeltas = '';
        }

        // Authoritative full content for DB / done event. Joining with a
        // blank line between turns mirrors what the live streaming buffer
        // displays after consuming `turn_break` events.
        const fullContent = completedTurns.join('\n\n');

        // Persist the assistant row BEFORE signaling done. The client's
        // done handler refetches /messages so the optimistic streaming
        // bubble is replaced by the canonical row (which includes
        // tool_uses, tokens, etc. that the live text accumulator does
        // not capture). Emitting done first would race with this insert
        // and the refetch would see a stale message list.
        if (fullContent) {
          console.log(
            `[Chat] Saving assistant message: ${assistantMsgId}, content length: ${fullContent.length}, aborted: ${aborted}`,
          );
          try {
            await db.insert(chatMessages).values({
              id: assistantMsgId,
              chatId,
              role: 'assistant',
              content: fullContent,
              toolUses: JSON.stringify(toolUses),
              proposedChanges: '[]',
              attachments: '[]',
              executionMode: 'local',
              tokensIn: inputTokens,
              tokensOut: outputTokens,
              timestamp: new Date(),
            });

            await db
              .update(chats)
              .set({
                totalTokensIn: chat.totalTokensIn + inputTokens,
                totalTokensOut: chat.totalTokensOut + outputTokens,
                estimatedCost: chat.estimatedCost + totalCost,
                updatedAt: new Date(),
              })
              .where(eq(chats.id, chatId));

            if (history.length <= 1) {
              const title =
                userMessage.length > 50 ? userMessage.slice(0, 50) + '...' : userMessage;
              await db.update(chats).set({ title }).where(eq(chats.id, chatId));
            }
          } catch (saveError) {
            console.error('[Chat] Failed to save message:', saveError);
          }
        }

        // Done event — `aborted: true` lets the client distinguish a
        // user-cancelled turn from a normal completion (e.g. to skip
        // the success chime).
        await writeEvent(safeEnqueue, encoder, chatId, {
          type: 'done',
          messageId: assistantMsgId,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          cost: totalCost,
          aborted,
        });
      } catch (error) {
        // AbortError surfaces here when the SDK observed the controller
        // flip. Treat as a clean stop, not a failure — persist whatever
        // turns we collected and emit `done` with `aborted: true`.
        const errMsg =
          error instanceof Error ? error.message : 'AI request failed';
        const isAbort =
          aborted ||
          abortController.signal.aborted ||
          (error instanceof Error &&
            (error.name === 'AbortError' || /aborted/i.test(error.message)));
        if (!isAbort) {
          console.error('[Chat] Stream error:', error);
        }

        if (currentTurnDeltas.trim().length > 0) {
          completedTurns.push(currentTurnDeltas);
        }
        const partialContent = completedTurns.join('\n\n');

        // Best-effort persist whatever the agent managed to produce
        // (works for both real errors and aborts). If the try block
        // already inserted the row, PK collision is caught and ignored.
        if (partialContent) {
          try {
            await db.insert(chatMessages).values({
              id: assistantMsgId,
              chatId,
              role: 'assistant',
              content: partialContent,
              toolUses: JSON.stringify(toolUses),
              proposedChanges: '[]',
              attachments: '[]',
              executionMode: 'local',
              tokensIn: inputTokens,
              tokensOut: outputTokens,
              timestamp: new Date(),
            });
          } catch {
            // Either already persisted or PK collision; both are fine.
          }
        }

        if (isAbort) {
          await writeEvent(safeEnqueue, encoder, chatId, {
            type: 'done',
            messageId: assistantMsgId,
            tokensIn: inputTokens,
            tokensOut: outputTokens,
            cost: totalCost,
            aborted: true,
          });
        } else {
          await writeEvent(safeEnqueue, encoder, chatId, {
            type: 'error',
            message: errMsg,
          });
        }
      } finally {
        unregisterLocalAbort(chatId);
        await markStreamEnd(projectId, chatId);
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ─── REMOTE execution (device-side agent via Socket.io) ─────

function handleRemoteStream(args: RemoteStreamArgs) {
  const {
    request,
    projectId,
    chatId,
    chat,
    project,
    fullPrompt,
    systemPrompt,
    userMessage,
    history,
    attachments: queryAttachments,
  } = args;

  const encoder = new TextEncoder();
  const assistantMsgId = nanoid();
  const sessionId = crypto.randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const ok = await markStreamStart(projectId, chatId);
      if (!ok) {
        const json = JSON.stringify({
          type: 'error',
          message: 'stream_already_active',
        });
        try {
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
          controller.close();
        } catch {
          // Request already aborted — nothing to write.
        }
        return;
      }

      const safeEnqueue = (data: Uint8Array) => {
        if (!closed) {
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
          }
        }
      };

      const safeClose = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      // ─── Validate device connectivity ───────────────────
      if (!project.deviceId) {
        await writeEvent(safeEnqueue, encoder, chatId, {
          type: 'error',
          message: 'Project has no device assigned',
          code: 'DEVICE_OFFLINE',
        });
        await markStreamEnd(projectId, chatId);
        safeClose();
        return;
      }

      const agentManager = getAgentManager();
      if (!agentManager || !agentManager.isDeviceConnected(project.deviceId)) {
        await writeEvent(safeEnqueue, encoder, chatId, {
          type: 'error',
          message: 'Device is not connected',
          code: 'DEVICE_OFFLINE',
        });
        await markStreamEnd(projectId, chatId);
        safeClose();
        return;
      }

      const socket = agentManager.getAgentSocket(project.deviceId);
      if (!socket) {
        await writeEvent(safeEnqueue, encoder, chatId, {
          type: 'error',
          message: 'Agent socket not available',
          code: 'DEVICE_OFFLINE',
        });
        await markStreamEnd(projectId, chatId);
        safeClose();
        return;
      }

      // ─── Load device permission policy ──────────────────
      let permissions: ClaudePermissionConfig = DEFAULT_CLAUDE_PERMISSIONS;
      try {
        const [device] = await db
          .select()
          .from(devices)
          .where(eq(devices.id, project.deviceId));
        if (device?.claudeConfig) {
          permissions = JSON.parse(device.claudeConfig) as ClaudePermissionConfig;
        }
      } catch {
        // Use defaults on parse error
      }

      // ─── Stream state ──────────────────────────────────
      let fullContent = '';
      // The remote (device-side) agent does not emit turn boundaries —
      // we infer them: any tool_use event flips this flag on, the next
      // CLAUDE_TEXT consumes it (emits a turn_break first, prepends \n\n
      // into the persisted content). Mirrors the explicit `turn_break`
      // emission in the local handler so the live bubble in the UI shows
      // the same paragraph spacing in both modes.
      let pendingTurnBreak = false;
      const toolUses: Array<{
        id: string;
        toolName: string;
        input: Record<string, unknown>;
        status: string;
      }> = [];
      let tokensIn = 0;
      let tokensOut = 0;
      let costUsd = 0;

      // Emit session_started so the client knows the sessionId for
      // cancel/permission round-trips.
      await writeEvent(safeEnqueue, encoder, chatId, {
        type: 'session_started',
        sessionId,
      });

      // ─── Listen for agent events filtered by sessionId ──
      const previewDetector = new PreviewDetector();
      const onEvent = async (event: Record<string, unknown>) => {
        if (event.sessionId !== sessionId) return;

        const type = event.type as string;

        switch (type) {
          case 'CLAUDE_TEXT': {
            const text = event.text as string;
            // First text after a tool_use → that's a fresh assistant turn,
            // insert a paragraph break so it doesn't visually merge with
            // whatever the agent said before invoking the tool.
            if (pendingTurnBreak) {
              pendingTurnBreak = false;
              previewDetector.reset(); // new assistant turn — clear accumulated text
              fullContent += '\n\n';
              await writeEvent(safeEnqueue, encoder, chatId, {
                type: 'turn_break',
              });
            }
            fullContent += text;
            await writeEvent(safeEnqueue, encoder, chatId, { type: 'text', text });
            for (const preview of previewDetector.feed(text)) {
              await writeEvent(safeEnqueue, encoder, chatId, { ...preview });
            }
            break;
          }

          case 'CLAUDE_TOOL_USE': {
            const toolStatus = event.status as string;
            const toolUseId = event.toolUseId as string;
            const toolName = event.toolName as string;
            const input = event.input as Record<string, unknown>;

            // Track tool uses for DB persistence
            const existing = toolUses.find((t) => t.id === toolUseId);
            if (existing) {
              existing.status = toolStatus;
            } else {
              toolUses.push({ id: toolUseId, toolName, input, status: toolStatus });
            }

            // Any tool activity arms the turn-break — the next CLAUDE_TEXT
            // is the start of a new turn. We only need to arm it once per
            // run of consecutive tool events; the consumer (CLAUDE_TEXT)
            // disarms it.
            pendingTurnBreak = true;

            // Translate to the SSE shape ChatPanel already understands
            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'tool_use',
              tool: {
                id: toolUseId,
                toolName,
                displayName: toolName,
                status: toolStatus,
                input,
              },
            });
            break;
          }

          case 'CLAUDE_PERMISSION_REQUEST': {
            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'permission_request',
              sessionId,
              requestId: event.requestId as string,
              toolName: event.toolName as string,
              input: event.input as Record<string, unknown>,
              reason: event.reason as string,
            });
            break;
          }

          case 'CLAUDE_DONE': {
            tokensIn = (event.tokensIn as number) ?? 0;
            tokensOut = (event.tokensOut as number) ?? 0;
            costUsd = (event.costUsd as number) ?? 0;

            // Persist BEFORE signaling done so the client's refetch sees
            // the assistant row immediately. (See local handler for the
            // same race rationale.)
            try {
              if (fullContent) {
                await db.insert(chatMessages).values({
                  id: assistantMsgId,
                  chatId,
                  role: 'assistant',
                  content: fullContent,
                  toolUses: JSON.stringify(toolUses),
                  proposedChanges: '[]',
                  attachments: '[]',
                  executionMode: 'remote',
                  tokensIn,
                  tokensOut,
                  timestamp: new Date(),
                });
              }

              await db
                .update(chats)
                .set({
                  totalTokensIn: chat.totalTokensIn + tokensIn,
                  totalTokensOut: chat.totalTokensOut + tokensOut,
                  estimatedCost: chat.estimatedCost + costUsd,
                  updatedAt: new Date(),
                })
                .where(eq(chats.id, chatId));

              if (history.length <= 1) {
                const title =
                  userMessage.length > 50
                    ? userMessage.slice(0, 50) + '...'
                    : userMessage;
                await db.update(chats).set({ title }).where(eq(chats.id, chatId));
              }
            } catch (err) {
              console.error('[Chat/Remote] Failed to save message:', err);
            }

            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'done',
              messageId: assistantMsgId,
              tokensIn,
              tokensOut,
              cost: costUsd,
              sessionId,
            });

            await cleanup();
            break;
          }

          case 'CLAUDE_ERROR': {
            const errorMessage = event.message as string;
            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'error',
              message: errorMessage,
            });

            // Persist partial content if any
            try {
              if (fullContent) {
                await db.insert(chatMessages).values({
                  id: assistantMsgId,
                  chatId,
                  role: 'assistant',
                  content: fullContent,
                  toolUses: JSON.stringify(toolUses),
                  proposedChanges: '[]',
                  attachments: '[]',
                  executionMode: 'remote',
                  tokensIn,
                  tokensOut,
                  timestamp: new Date(),
                });
              }
            } catch (err) {
              console.error('[Chat/Remote] Failed to save partial message:', err);
            } finally {
              await cleanup();
            }
            break;
          }

          default:
            // CLAUDE_STARTED, PROXY_READY — informational, no SSE needed
            break;
        }
      };

      // Single tear-down closure: detaches the socket listener, ends the
      // active-streams counter + journal, and closes the SSE response.
      // Idempotent — safe to call from multiple terminal paths.
      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          socket.off('event', onEvent);
        } catch {
          // best-effort
        }
        await markStreamEnd(projectId, chatId);
        unregisterRemoteCancel(chatId);
        safeClose();
      };

      // Expose cleanup to the cancel endpoint so a stuck stream (device
      // disconnected before sending CLAUDE_DONE/CLAUDE_ERROR) can be
      // force-released without a server restart.
      registerRemoteCancel(chatId, cleanup);

      socket.on('event', onEvent);

      // ─── Send the CLAUDE_QUERY command ──────────────────
      const requestId = nanoid();
      const command: AgentCommand = {
        type: 'CLAUDE_QUERY',
        id: requestId,
        sessionId,
        projectPath: project.path,
        prompt: fullPrompt,
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(chat.model ? { model: chat.model } : {}),
        permissions,
        // Only attach the metadata block when there's actually something to
        // download — a 0-length array would make the agent log "fetching 0
        // attachments" which is just noise.
        ...(queryAttachments.length > 0
          ? {
              attachments: queryAttachments,
              chatId,
              projectId,
            }
          : {}),
      };
      socket.emit('command', command);

      // ─── Client disconnect → keep agent running, stop forwarding ──
      // The agent must continue independently of this HTTP request — the
      // user may have switched tabs/projects or reloaded the page. Late
      // subscribers can pick up the in-flight turn via the subscribe
      // endpoint, which reads from the journal. We do NOT detach the
      // socket listener here either: it must keep appending events to
      // the journal, and it self-detaches inside `cleanup()` when
      // CLAUDE_DONE or CLAUDE_ERROR fires.
      //
      // If the device disconnects without ever sending a terminal event,
      // the `cleanup` closure is still registered with `remote-cancel.ts`
      // — `POST /cancel` will release it even with no live socket. The
      // boot-time `crashRecovery()` is the last-resort backstop.
      request.signal.addEventListener('abort', () => {
        // Mark the response closed so safeEnqueue stops trying to write.
        // Do NOT call markStreamEnd, do NOT cancel the agent, do NOT
        // detach onEvent.
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
