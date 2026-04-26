import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMemory } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/projects/[id]/memory — get project memory
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const [memory] = await db
    .select()
    .from(projectMemory)
    .where(eq(projectMemory.projectId, projectId));

  if (!memory) {
    // Return default empty memory
    return NextResponse.json({
      projectId,
      systemPrompt: '',
      pinnedFiles: '[]',
      conventions: '',
      notes: '',
      architecture: '',
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json(memory);
}

// PUT /api/projects/[id]/memory — upsert project memory
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const values = {
    projectId,
    systemPrompt: body.systemPrompt ?? '',
    pinnedFiles: body.pinnedFiles ?? '[]',
    conventions: body.conventions ?? '',
    notes: body.notes ?? '',
    architecture: body.architecture ?? '',
    updatedAt: new Date(),
  };

  // Upsert: try insert, on conflict update
  const [existing] = await db
    .select()
    .from(projectMemory)
    .where(eq(projectMemory.projectId, projectId));

  if (existing) {
    await db
      .update(projectMemory)
      .set(values)
      .where(eq(projectMemory.projectId, projectId));
  } else {
    await db.insert(projectMemory).values(values);
  }

  return NextResponse.json(values);
}
