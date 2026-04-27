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
  DEFAULT_CLAUDE_PERMISSIONS,
  type AgentCommand,
  type ClaudePermissionConfig,
} from '@/lib/socket/types';

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
  // on disk. The agent runs through the Claude Code CLI, whose built-in Read
  // tool is multimodal — pointing it at an image/PDF path is enough for the
  // model to "see" the contents. We deliberately do NOT inline the bytes
  // (no base64 in the prompt) because that would balloon token usage and
  // duplicate work the Read tool already does optimally.
  //
  // Paths are resolved against the Next server's cwd (where data/uploads
  // lives), not the project's cwd that the agent is launched in — the
  // absolute path makes the difference irrelevant to the agent.
  let attachmentNote = '';
  if (attachments.length > 0) {
    const lines = attachments.map((a) => {
      const abs = path.join(
        process.cwd(),
        'data',
        'uploads',
        'chats',
        chatId,
        a.filename,
      );
      return `- ${a.name} (${a.type}) → ${abs}`;
    });
    attachmentNote =
      `\n\n[The user attached ${attachments.length} file(s). ` +
      `Use the Read tool on the absolute paths below to inspect them — ` +
      `images and PDFs are rendered visually.]\n` +
      lines.join('\n');
  }

  const userTurn = `${userMessage}${attachmentNote}`;
  const fullPrompt = historyContext
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
      fullPrompt,
      systemPrompt,
      userMessage,
      history,
    });
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

      let fullContent = '';
      const toolUses: Array<{
        id: string;
        toolName: string;
        input: Record<string, unknown>;
        status: string;
      }> = [];
      let totalCost = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      try {

        const agentQuery = query({
          prompt: fullPrompt,
          options: {
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

        for await (const message of agentQuery) {
          const msg = message as SDKMessage;

          switch (msg.type) {
            case 'assistant': {
              // Complete assistant turn — extract text content
              const assistantMsg = msg as SDKAssistantMessage;
              const textBlocks = assistantMsg.message.content.filter(
                (b) => b.type === 'text',
              );
              // Always capture the complete text from assistant turn
              const turnText = textBlocks
                .map((b) => (b.type === 'text' ? b.text : ''))
                .join('');
              if (turnText) {
                // Use assistant turn text as authoritative (in case streaming missed it)
                fullContent = turnText;
              }
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

              if (resultMsg.subtype === 'success' && resultMsg.result) {
                // Use result text if available and fullContent is still empty
                if (!fullContent) {
                  fullContent = resultMsg.result;
                }
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
                  fullContent += delta.text;
                  await writeEvent(safeEnqueue, encoder, chatId, { type: 'text', text: delta.text });
                }
              }
              break;
            }

            default:
              // Ignore system messages, tool progress, etc.
              break;
          }
        }

        // Send done event
        await writeEvent(safeEnqueue, encoder, chatId, {
          type: 'done',
          messageId: assistantMsgId,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          cost: totalCost,
        });
      } catch (error) {
        console.error('[Chat] Stream error:', error);
        const errorMsg =
          error instanceof Error ? error.message : 'AI request failed';
        await writeEvent(safeEnqueue, encoder, chatId, { type: 'error', message: errorMsg });
      } finally {
        // Always save assistant message to DB (even if stream errored)
        if (fullContent) {
          console.log(
            `[Chat] Saving assistant message: ${assistantMsgId}, content length: ${fullContent.length}`,
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

function handleRemoteStream(args: StreamArgs) {
  const { request, projectId, chatId, chat, project, fullPrompt, systemPrompt, userMessage, history } =
    args;

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
      const onEvent = async (event: Record<string, unknown>) => {
        if (event.sessionId !== sessionId) return;

        const type = event.type as string;

        switch (type) {
          case 'CLAUDE_TEXT': {
            const text = event.text as string;
            fullContent += text;
            await writeEvent(safeEnqueue, encoder, chatId, { type: 'text', text });
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

            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'done',
              messageId: assistantMsgId,
              tokensIn,
              tokensOut,
              cost: costUsd,
              sessionId,
            });

            socket.off('event', onEvent);

            // Persist and close
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
            } finally {
              await markStreamEnd(projectId, chatId);
              safeClose();
            }
            break;
          }

          case 'CLAUDE_ERROR': {
            const errorMessage = event.message as string;
            await writeEvent(safeEnqueue, encoder, chatId, {
              type: 'error',
              message: errorMessage,
            });

            socket.off('event', onEvent);

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
              await markStreamEnd(projectId, chatId);
              safeClose();
            }
            break;
          }

          default:
            // CLAUDE_STARTED, PROXY_READY — informational, no SSE needed
            break;
        }
      };

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
      };
      socket.emit('command', command);

      // ─── Client disconnect → keep agent running, stop forwarding ──
      // The agent must continue independently of this HTTP request — the
      // user may have switched tabs/projects or reloaded the page. Late
      // subscribers can pick up the in-flight turn via the subscribe
      // endpoint, which reads from the journal. We do NOT detach the
      // socket listener here either: it must keep appending events to
      // the journal, and it self-detaches inside `onEvent` when CLAUDE_DONE
      // or CLAUDE_ERROR fires.
      //
      // Known gap: if the device disconnects without ever sending a
      // terminal event (network partition, agent crash), `onEvent` stays
      // attached and the journal stays `active` until the next server
      // restart's `crashRecovery()` seals it. See task #12 for follow-up.
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
