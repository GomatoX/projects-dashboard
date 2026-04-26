import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateRepo } from '@/lib/github';

// POST /api/projects/[id]/github/connect — validate and save GitHub repo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  let github: string = body.github || '';

  // Clean up URL format → owner/repo
  github = github
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();

  if (!github || !github.includes('/')) {
    return NextResponse.json(
      { error: 'Invalid format. Use "owner/repo".' },
      { status: 400 },
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Validate repo exists
  const validation = await validateRepo(github);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || 'Repository not found or inaccessible' },
      { status: 400 },
    );
  }

  // Save to project
  await db.update(projects).set({ github }).where(eq(projects.id, id));

  return NextResponse.json({
    connected: true,
    repo: validation.name,
    description: validation.description,
  });
}

// DELETE /api/projects/[id]/github/connect — disconnect GitHub repo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await db.update(projects).set({ github: null }).where(eq(projects.id, id));

  return NextResponse.json({ disconnected: true });
}
