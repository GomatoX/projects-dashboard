import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

function getClaudeProjectDir(projectPath: string): string {
  const hash = createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
  return join(homedir(), '.claude', 'projects', hash);
}

interface ConversationEntry {
  type: 'human' | 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'summary' | string;
  content?: string;
  model?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  result?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// GET /api/projects/[id]/claude-sessions/[sessionId] — read session content
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const claudeDir = getClaudeProjectDir(project.path);
  const filePath = join(claudeDir, `${sessionId}.jsonl`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const entries: ConversationEntry[] = [];
    let model = 'unknown';
    let summary = '';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ConversationEntry;
        entries.push(entry);

        if (entry.model) model = entry.model;
        if (entry.type === 'summary' && entry.content) summary = entry.content;
      } catch {
        // Skip malformed lines
      }
    }

    // Group into conversation turns
    const turns: Array<{
      role: string;
      content: string;
      toolUses?: Array<{ name: string; input: Record<string, unknown>; result?: string }>;
      model?: string;
      timestamp?: string;
    }> = [];

    let currentToolUses: Array<{
      name: string;
      input: Record<string, unknown>;
      result?: string;
    }> = [];

    for (const entry of entries) {
      if (entry.type === 'human') {
        turns.push({
          role: 'user',
          content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
          timestamp: entry.timestamp,
        });
      } else if (entry.type === 'assistant') {
        // Attach accumulated tool uses to this assistant turn
        turns.push({
          role: 'assistant',
          content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
          model: entry.model || model,
          toolUses: currentToolUses.length > 0 ? [...currentToolUses] : undefined,
          timestamp: entry.timestamp,
        });
        currentToolUses = [];
      } else if (entry.type === 'tool_use') {
        currentToolUses.push({
          name: entry.toolName || 'unknown',
          input: entry.toolInput || {},
        });
      } else if (entry.type === 'tool_result') {
        // Attach result to last tool use
        if (currentToolUses.length > 0) {
          currentToolUses[currentToolUses.length - 1].result =
            typeof entry.result === 'string'
              ? entry.result
              : typeof entry.content === 'string'
                ? entry.content
                : JSON.stringify(entry.content || entry.result);
        }
      }
    }

    return NextResponse.json({
      sessionId,
      summary,
      model,
      turns,
      totalEntries: entries.length,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read session' },
      { status: 500 },
    );
  }
}
