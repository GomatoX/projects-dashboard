import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';

export async function GET() {
  try {
    const allDevices = await db.select().from(devices).orderBy(devices.name);
    return NextResponse.json(allDevices);
  } catch (error) {
    console.error('Failed to fetch devices:', error);
    return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, os } = body;

    if (!name || !os) {
      return NextResponse.json(
        { error: 'Name and OS are required' },
        { status: 400 },
      );
    }

    const id = nanoid();
    const rawToken = nanoid(32);
    const hashedToken = await bcrypt.hash(rawToken, 10);

    await db.insert(devices).values({
      id,
      name,
      os,
      agentToken: hashedToken,
      status: 'offline',
    });

    const [newDevice] = await db.select().from(devices).where(
      (await import('drizzle-orm')).eq(devices.id, id),
    );

    // Return the raw token ONLY on creation (for the install script)
    return NextResponse.json(
      { ...newDevice, rawToken },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create device:', error);
    return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
  }
}
