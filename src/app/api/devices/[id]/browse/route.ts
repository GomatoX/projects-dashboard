import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// POST /api/devices/[id]/browse — list directories on a device
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deviceId } = await params;
  const body = await request.json();
  const { path = '~' } = body;

  const agentManager = getAgentManager();
  if (!agentManager) {
    return NextResponse.json({ error: 'Agent manager not initialized' }, { status: 503 });
  }

  if (!agentManager.isDeviceConnected(deviceId)) {
    return NextResponse.json({ error: 'Device is not connected' }, { status: 404 });
  }

  try {
    const response = await agentManager.sendCommand(deviceId, {
      type: 'LIST_FILES',
      id: nanoid(),
      path,
      recursive: false,
    });

    if (response.type === 'FILE_LIST' && 'entries' in response) {
      // Filter to only directories
      const dirs = (response.entries as Array<{ name: string; path: string; isDirectory: boolean }>)
        .filter((e) => e.isDirectory)
        .sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({ path, directories: dirs });
    }

    return NextResponse.json({ path, directories: [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to browse' },
      { status: 500 },
    );
  }
}
