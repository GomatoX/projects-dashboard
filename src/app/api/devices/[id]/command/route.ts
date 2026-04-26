import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { AgentCommand } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: deviceId } = await params;
    const body = await request.json();

    if (!body.type) {
      return NextResponse.json(
        { error: 'Command type is required' },
        { status: 400 },
      );
    }

    const agentManager = getAgentManager();
    if (!agentManager) {
      return NextResponse.json(
        { error: 'Agent manager not initialized' },
        { status: 503 },
      );
    }

    if (!agentManager.isDeviceConnected(deviceId)) {
      return NextResponse.json(
        { error: 'Device is not connected' },
        { status: 404 },
      );
    }

    const command: AgentCommand = {
      ...body,
      id: nanoid(),
    };

    const response = await agentManager.sendCommand(deviceId, command);

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    console.error('Command error:', message);

    if (message.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
