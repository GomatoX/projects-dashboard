import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, skills } from '@/lib/db/schema';
import {
  BUILTIN_SKILLS,
  validateSkillInput,
  type Skill,
} from '@/lib/skills';

/**
 * GET /api/projects/[id]/skills
 *
 * Lists skills for a project. On first call (project has zero skills) we
 * lazily seed the two built-in templates so the user has a useful starting
 * point. After that they can edit/delete freely.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  let rows = await db.select().from(skills).where(eq(skills.projectId, id));

  if (rows.length === 0) {
    const now = new Date();
    const seeds = BUILTIN_SKILLS.map((s) => ({
      id: `skl-${nanoid(8)}`,
      projectId: id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      systemPrompt: s.systemPrompt,
      contextSource: s.contextSource,
      model: 'claude-sonnet-4-20250514',
      outputMode: s.outputMode,
      createdAt: now,
      updatedAt: now,
    }));
    if (seeds.length > 0) {
      await db.insert(skills).values(seeds);
      rows = seeds;
    }
  }

  return NextResponse.json({ skills: rows.map(serializeSkill) });
}

/**
 * POST /api/projects/[id]/skills
 *
 * Creates a new skill from the validated body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const validated = validateSkillInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const now = new Date();
  const row = {
    id: `skl-${nanoid(8)}`,
    projectId: id,
    ...validated.value,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(skills).values(row);

  return NextResponse.json({ skill: serializeSkill(row) }, { status: 201 });
}

// ─── Helpers ──────────────────────────────────────────────

type SkillRow = typeof skills.$inferSelect;

function serializeSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    icon: row.icon ?? null,
    systemPrompt: row.systemPrompt,
    contextSource: row.contextSource,
    model: row.model,
    outputMode: row.outputMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
