import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, pullRequests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchPRs } from '@/lib/github';
import { nanoid } from 'nanoid';

// GET /api/projects/[id]/github — fetch PRs for the project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.github) {
    return NextResponse.json({ connected: false, prs: [] });
  }

  try {
    const stateParam = request.nextUrl.searchParams.get('state') || 'all';
    const state = stateParam as 'open' | 'closed' | 'all';
    const prs = await fetchPRs(project.github, state);

    // Cache PRs in DB
    for (const pr of prs) {
      const existing = await db
        .select()
        .from(pullRequests)
        .where(eq(pullRequests.id, `${id}-${pr.number}`));

      if (existing.length === 0) {
        await db.insert(pullRequests).values({
          id: `${id}-${pr.number}`,
          projectId: id,
          number: pr.number,
          title: pr.title,
          state: pr.state,
          createdAt: new Date(pr.createdAt),
        });
      } else {
        await db
          .update(pullRequests)
          .set({ title: pr.title, state: pr.state })
          .where(eq(pullRequests.id, `${id}-${pr.number}`));
      }
    }

    return NextResponse.json({ connected: true, repo: project.github, prs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch PRs' },
      { status: 500 },
    );
  }
}
