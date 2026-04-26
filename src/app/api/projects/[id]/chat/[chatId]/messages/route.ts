import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chats, chatMessages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

// GET /api/projects/[id]/chat/[chatId]/messages — get all messages for a chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.timestamp));

  return NextResponse.json(messages);
}
