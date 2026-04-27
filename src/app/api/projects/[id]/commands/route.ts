import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  parseCommands,
  serializeCommands,
  validateCommands,
} from '@/lib/commands';

// GET /api/projects/[id]/commands — list commands
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  return NextResponse.json({ commands: parseCommands(project.commands) });
}

// PUT /api/projects/[id]/commands — replace the whole list
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const validated = validateCommands((body as { commands?: unknown }).commands);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await db
    .update(projects)
    .set({ commands: serializeCommands(validated.commands) })
    .where(eq(projects.id, id));

  return NextResponse.json({ commands: validated.commands });
}
