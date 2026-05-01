// src/app/api/devices/[id]/update/route.ts
//
// POST /api/devices/[id]/update
//
// Trigger a remote self-update on a connected agent. The agent will:
//   1. Emit SELF_UPDATE_STATUS phase='starting' (this is what we wait for
//      before returning a response to the client).
//   2. Spawn a detached helper script that downloads the latest agent
//      tarball, swaps files in $HOME/.dev-dashboard-agent, and pkills the
//      agent so the OS service manager respawns it on the new code.
//   3. Exit cleanly. systemd `Restart=always` / launchd `KeepAlive` brings
//      it back up, by which point the helper has overwritten the install
//      dir.
//
// Response shapes:
//   200 { ok: true, fromVersion?: string }  ← agent acknowledged & started
//   503 { error: 'Device not connected' }   ← agent offline
//   404 { error: 'Device not found' }
//   504 { error: 'Update timed out' }       ← agent didn't ACK starting
//   502 { error: <agent message> }          ← agent reported failure pre-restart
//
// Subsequent SELF_UPDATE_STATUS events (downloading, installing,
// restarting) are emitted by the agent but the request/response
// correlation in agent-manager only resolves the FIRST event matching
// our requestId — that's intentional. The "did the update succeed"
// signal is the agent reconnecting (look for the new banner version
// in the agent.log on the device, or just wait for the device to show
// online again in the UI).

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import type { AgentCommand, AgentEvent } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as
    | AgentManagerModule
    | null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deviceId } = await params;

  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) {
    return Response.json({ error: 'Device not found' }, { status: 404 });
  }

  const agentManager = getAgentManager();
  if (!agentManager || !agentManager.isDeviceConnected(deviceId)) {
    return Response.json({ error: 'Device not connected' }, { status: 503 });
  }

  const command: AgentCommand = {
    type: 'RUN_SELF_UPDATE',
    id: nanoid(),
  };

  let event: AgentEvent;
  try {
    // Generous timeout. The agent's first emit ('starting') happens
    // immediately after pre-flight checks (read package.json, validate
    // install dir) — usually <50ms. 10s gives headroom on slow disks
    // while still failing fast when the socket is dead.
    event = await agentManager.sendCommand(deviceId, command, 10_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('timed out')) {
      return Response.json({ error: 'Update timed out' }, { status: 504 });
    }
    return Response.json({ error: message }, { status: 502 });
  }

  if (event.type !== 'SELF_UPDATE_STATUS') {
    return Response.json(
      { error: `Unexpected response type: ${event.type}` },
      { status: 502 },
    );
  }

  if (event.phase === 'failed') {
    return Response.json(
      { error: event.message || 'Agent reported update failure' },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    phase: event.phase,
    fromVersion: event.fromVersion,
    message: event.message,
  });
}
