import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.path !== undefined) updateData.path = body.path;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.deviceId !== undefined) updateData.deviceId = body.deviceId;
    if (body.pm2Name !== undefined) updateData.pm2Name = body.pm2Name;
    if (body.github !== undefined)
      updateData.github = typeof body.github === 'string' ? body.github : JSON.stringify(body.github);
    if (body.tags !== undefined)
      updateData.tags = typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags);

    await db.update(projects).set(updateData).where(eq(projects.id, id));

    const [updated] = await db.select().from(projects).where(eq(projects.id, id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
