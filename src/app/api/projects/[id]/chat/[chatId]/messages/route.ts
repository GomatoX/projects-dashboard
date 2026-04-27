import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { isChatActive } from '@/lib/ai/active-streams';

// GET /api/projects/[id]/chat/[chatId]/messages — get all messages for a chat,
// plus a flag indicating whether an agent turn is currently streaming for
// this chat. The flag lets the client restore the "Thinking..." indicator
// after a page refresh, since the original SSE connection died but the
// server-side turn is still running.
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

  return NextResponse.json({
    messages,
    isStreaming: isChatActive(chatId),
  });
}
