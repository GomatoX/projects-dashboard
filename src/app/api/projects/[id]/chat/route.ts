import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { isChatActive } from '@/lib/ai/active-streams';

// GET /api/projects/[id]/chat — list all chats for a project. Each chat is
// annotated with `isStreaming` so the chat panel can render a per-chat
// activity indicator (the chat list inside the panel doesn't drive its own
// streams — it polls this endpoint for cross-tab / cross-session awareness).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const projectChats = await db
    .select()
    .from(chats)
    .where(eq(chats.projectId, projectId))
    .orderBy(desc(chats.updatedAt));

  const annotated = projectChats.map((c) => ({
    ...c,
    isStreaming: isChatActive(c.id),
  }));

  return NextResponse.json(annotated);
}

// POST /api/projects/[id]/chat — create a new chat
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const id = nanoid();
  const chat = {
    id,
    projectId,
    title: body.title || 'New Chat',
    model: body.model || 'claude-sonnet-4-6',
    executionMode: body.executionMode === 'remote' ? 'remote' as const : 'local' as const,
    totalTokensIn: 0,
    totalTokensOut: 0,
    estimatedCost: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(chats).values(chat);

  return NextResponse.json(chat, { status: 201 });
}
