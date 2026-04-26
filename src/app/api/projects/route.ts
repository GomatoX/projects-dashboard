import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, devices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function GET() {
  try {
    const allProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        deviceId: projects.deviceId,
        path: projects.path,
        type: projects.type,
        pm2Name: projects.pm2Name,
        github: projects.github,
        tags: projects.tags,
        createdAt: projects.createdAt,
        deviceName: devices.name,
        deviceStatus: devices.status,
        deviceOs: devices.os,
      })
      .from(projects)
      .leftJoin(devices, eq(projects.deviceId, devices.id))
      .orderBy(projects.name);

    return NextResponse.json(allProjects);
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, deviceId, path, type, pm2Name, github, tags } = body;

    if (!name || !path) {
      return NextResponse.json(
        { error: 'Name and path are required' },
        { status: 400 },
      );
    }

    const id = nanoid();
    await db.insert(projects).values({
      id,
      name,
      deviceId: deviceId || null,
      path,
      type: type || 'node',
      pm2Name: pm2Name || null,
      github: github ? JSON.stringify(github) : null,
      tags: JSON.stringify(tags || []),
    });

    const [newProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    return NextResponse.json(newProject, { status: 201 });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
