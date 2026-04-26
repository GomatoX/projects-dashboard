import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ConnectedAgent, DiscoveredProject } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: deviceId } = await params;

    // Get device from DB
    const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const agentManager = getAgentManager();
    const isConnected = agentManager?.isDeviceConnected(deviceId) ?? false;
    const connectedInfo = agentManager?.getConnectedAgent(deviceId) ?? null;

    // Get discovered projects from temp cache
    const discoveredProjects = (globalThis as Record<string, unknown>)[
      `__discoveredProjects_${deviceId}`
    ] as DiscoveredProject[] | undefined;

    return NextResponse.json({
      device,
      isConnected,
      connectedInfo,
      discoveredProjects: discoveredProjects || [],
      agentCount: agentManager?.getAgentCount() ?? 0,
    });
  } catch (error) {
    console.error('Failed to get device status:', error);
    return NextResponse.json({ error: 'Failed to get device status' }, { status: 500 });
  }
}
