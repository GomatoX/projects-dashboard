import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats, chatMessages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET /api/projects/[id]/chat — list all chats for a project
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

  return NextResponse.json(projectChats);
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
    totalTokensIn: 0,
    totalTokensOut: 0,
    estimatedCost: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(chats).values(chat);

  return NextResponse.json(chat, { status: 201 });
}
