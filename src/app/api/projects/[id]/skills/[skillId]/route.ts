import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';
import { validateSkillInput, type Skill } from '@/lib/skills';

/**
 * PATCH /api/projects/[id]/skills/[skillId]
 *
 * Replaces the skill's editable fields with the validated body. The body
 * must be a complete SkillInput (same shape as POST) — we don't support
 * partial updates because the editor always submits the whole form.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const { id, skillId } = await params;
  const body = await request.json().catch(() => null);

  const validated = validateSkillInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // Scope the update to this project so a leaked skillId from another
  // project can't be mutated through this route.
  const [existing] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, skillId), eq(skills.projectId, id)));
  if (!existing) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const now = new Date();
  await db
    .update(skills)
    .set({ ...validated.value, updatedAt: now })
    .where(eq(skills.id, skillId));

  const updated: Skill = {
    id: existing.id,
    projectId: existing.projectId,
    ...validated.value,
    createdAt: existing.createdAt.toISOString(),
    updatedAt: now.toISOString(),
  };

  return NextResponse.json({ skill: updated });
}

/**
 * DELETE /api/projects/[id]/skills/[skillId]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const { id, skillId } = await params;

  const result = await db
    .delete(skills)
    .where(and(eq(skills.id, skillId), eq(skills.projectId, id)))
    .returning({ id: skills.id });

  if (result.length === 0) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
