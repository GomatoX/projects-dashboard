import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchPRDetail } from '@/lib/github';

// GET /api/projects/[id]/github/[prNumber] — fetch PR details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; prNumber: string }> },
) {
  const { id, prNumber } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.github) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 });
  }

  try {
    const detail = await fetchPRDetail(project.github, parseInt(prNumber, 10));
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch PR' },
      { status: 500 },
    );
  }
}
