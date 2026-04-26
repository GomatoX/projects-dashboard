import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

// Claude Code stores sessions in ~/.claude/projects/<hash>/
function getClaudeProjectDir(projectPath: string): string {
  // Claude Code uses a hash of the project path
  const hash = createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
  return join(homedir(), '.claude', 'projects', hash);
}

interface SessionMeta {
  id: string;
  filename: string;
  title: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}

// GET /api/projects/[id]/claude-sessions — list sessions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const claudeDir = getClaudeProjectDir(project.path);

  try {
    const files = await readdir(claudeDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    const sessions: SessionMeta[] = [];

    for (const file of jsonlFiles) {
      const filePath = join(claudeDir, file);
      const fileStat = await stat(filePath);

      // Read first few lines to extract metadata
      const { createReadStream } = await import('fs');
      const firstLines = await new Promise<string[]>((resolve) => {
        const lines: string[] = [];
        const stream = createReadStream(filePath, { encoding: 'utf-8' });
        let buffer = '';

        stream.on('data', (chunk: string | Buffer) => {
          buffer += chunk;
          const newLines = buffer.split('\n');
          buffer = newLines.pop() || '';
          for (const line of newLines) {
            if (line.trim()) {
              lines.push(line);
              if (lines.length >= 5) {
                stream.destroy();
                break;
              }
            }
          }
        });

        stream.on('close', () => resolve(lines));
        stream.on('end', () => resolve(lines));
      });

      // Parse first message to get metadata
      let title = file.replace('.jsonl', '');
      let model = 'unknown';
      let messageCount = 0;

      for (const line of firstLines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'summary' || entry.summary) {
            title = entry.summary || entry.title || title;
          }
          if (entry.model) {
            model = entry.model;
          }
          if (entry.type === 'human' || entry.type === 'assistant') {
            messageCount++;
          }
        } catch {
          // Skip malformed lines
        }
      }

      sessions.push({
        id: file.replace('.jsonl', ''),
        filename: file,
        title,
        model,
        messageCount,
        createdAt: fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size,
      });
    }

    // Sort by updated date, newest first
    sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json({ sessions, projectDir: claudeDir });
  } catch (error) {
    // Directory doesn't exist — no sessions yet
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ sessions: [], projectDir: claudeDir });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read sessions' },
      { status: 500 },
    );
  }
}
