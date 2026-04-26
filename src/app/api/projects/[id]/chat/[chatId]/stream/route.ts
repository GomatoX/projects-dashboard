import { NextRequest } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats, chatMessages, projects, projectMemory } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { shouldAutoAllow, getToolMeta } from '@/lib/ai/tools';
import { createPermissionRequest } from '@/lib/ai/permission-store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: projectId, chatId } = await params;
  const body = await request.json();
  const userMessage: string = body.message;

  if (!userMessage?.trim()) {
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

  // Save user message
  const userMsgId = nanoid();
  await db.insert(chatMessages).values({
    id: userMsgId,
    chatId,
    role: 'user',
    content: userMessage,
    toolUses: '[]',
    proposedChanges: '[]',
    attachments: body.attachments || '[]',
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

  const fullPrompt = historyContext
    ? `Previous conversation:\n${historyContext}\n\nHuman: ${userMessage}`
    : userMessage;

  // Stream response
  const encoder = new TextEncoder();
  const assistantMsgId = nanoid();

  // Reference for the SSE controller so canUseTool can emit events
  let sseController: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      sseController = controller;

      try {
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
            systemPrompt,
            tools: { type: 'preset', preset: 'claude_code' },
            canUseTool: async (toolName, input, opts) => {
              // Auto-allow read-only tools
              if (shouldAutoAllow(toolName)) {
                // Emit a brief tool activity event
                const meta = getToolMeta(toolName);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'tool_use',
                      tool: {
                        id: opts.toolUseID,
                        toolName,
                        displayName: meta.displayName,
                        status: 'auto',
                      },
                    })}\n\n`,
                  ),
                );
                return { behavior: 'allow' as const };
              }

              // Need user approval — emit permission request via SSE
              const meta = getToolMeta(toolName);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'permission_request',
                    toolUseId: opts.toolUseID,
                    toolName,
                    displayName: meta.displayName,
                    category: meta.category,
                    input,
                    title: opts.title,
                    description: opts.description,
                  })}\n\n`,
                ),
              );

              // Wait for user response via the permission store
              return createPermissionRequest(
                opts.toolUseID,
                toolName,
                input,
                opts.title,
                opts.description,
              );
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
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'text', text: delta.text })}\n\n`,
                    ),
                  );
                }
              }
              break;
            }

            default:
              // Ignore system messages, tool progress, etc.
              break;
          }
        }

        // Save assistant message to DB
        await db.insert(chatMessages).values({
          id: assistantMsgId,
          chatId,
          role: 'assistant',
          content: fullContent,
          toolUses: JSON.stringify(toolUses),
          proposedChanges: '[]',
          attachments: '[]',
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          timestamp: new Date(),
        });

        // Update chat metadata with exact cost from SDK
        await db
          .update(chats)
          .set({
            totalTokensIn: chat.totalTokensIn + inputTokens,
            totalTokensOut: chat.totalTokensOut + outputTokens,
            estimatedCost: chat.estimatedCost + totalCost,
            updatedAt: new Date(),
          })
          .where(eq(chats.id, chatId));

        // Auto-title on first message
        if (history.length <= 1) {
          const title =
            userMessage.length > 50 ? userMessage.slice(0, 50) + '...' : userMessage;
          await db.update(chats).set({ title }).where(eq(chats.id, chatId));
        }

        // Send done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'done',
              messageId: assistantMsgId,
              tokensIn: inputTokens,
              tokensOut: outputTokens,
              cost: totalCost,
            })}\n\n`,
          ),
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'AI request failed';
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
          ),
        );
      } finally {
        controller.close();
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
