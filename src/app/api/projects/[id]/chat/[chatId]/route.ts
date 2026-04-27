import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chats, chatMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// DELETE /api/projects/[id]/chat/[chatId] — delete a chat and its messages
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;

  try {
    // Delete messages first (foreign key)
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));
    // Delete the chat
    await db.delete(chats).where(eq(chats.id, chatId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chat:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/chat/[chatId] — update chat fields (e.g. model)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;
  const body = await request.json();

  try {
    await db
      .update(chats)
      .set({ model: body.model, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update chat:', error);
    return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
  }
}
