import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [device] = await db.select().from(devices).where(eq(devices.id, id));

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    return NextResponse.json(device);
  } catch (error) {
    console.error('Failed to fetch device:', error);
    return NextResponse.json({ error: 'Failed to fetch device' }, { status: 500 });
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
    if (body.localIp !== undefined) updateData.localIp = body.localIp;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.lastSeen !== undefined) updateData.lastSeen = new Date(body.lastSeen);
    if (body.projectPaths !== undefined) updateData.projectPaths = JSON.stringify(body.projectPaths);
    if (body.capabilities !== undefined) updateData.capabilities = JSON.stringify(body.capabilities);

    await db.update(devices).set(updateData).where(eq(devices.id, id));

    const [updated] = await db.select().from(devices).where(eq(devices.id, id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update device:', error);
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(devices).where(eq(devices.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete device:', error);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
