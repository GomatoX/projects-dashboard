// src/app/api/projects/[id]/chat/[chatId]/browser/snapshot/route.ts
//
// POST /api/projects/[id]/chat/[chatId]/browser/snapshot
//
// Asks the device-side agent to take a fresh JPEG screenshot of the
// existing BrowserContext for this chat. Used by <BrowserPreview> on
// mount/refresh: the live screencast only emits frames when the page
// renders something new, so a refreshed dashboard tab on a static page
// would otherwise stay blank.
//
// Response shapes:
//   200 { ok: true, frame: { frameB64, width, height, url, timestamp } }
//   200 { ok: false, reason: 'no_context' }   ← agent has no live browser
//                                               for this chat (idle-evicted,
//                                               never opened, etc.)
//   503 { error: 'Device not connected' }     ← project's device offline
//   400 { error: 'Project has no device' }    ← project unconfigured
//   504 { error: 'Snapshot timed out' }       ← agent didn't respond
//
// Idempotent and side-effect-free on the agent (the screenshot does not
// extend the BrowserContext's idle TTL — see captureSnapshot's docstring).

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import type { AgentCommand, AgentEvent } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as
    | AgentManagerModule
    | null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: projectId, chatId } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!project.deviceId) {
    return Response.json(
      { error: 'Project has no device assigned' },
      { status: 400 },
    );
  }

  const agentManager = getAgentManager();
  if (!agentManager || !agentManager.isDeviceConnected(project.deviceId)) {
    return Response.json({ error: 'Device not connected' }, { status: 503 });
  }

  const command: AgentCommand = {
    type: 'BROWSER_SNAPSHOT_REQUEST',
    id: nanoid(),
    chatId,
  };

  let event: AgentEvent;
  try {
    // Tight timeout — page.screenshot on a healthy context returns in ~50ms.
    // 5s gives generous headroom while still failing fast when the agent
    // is wedged or the device socket is dead.
    event = await agentManager.sendCommand(project.deviceId, command, 5_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // sendCommand throws "Command BROWSER_SNAPSHOT_REQUEST timed out after …"
    // — surface as 504 so the client can distinguish from "no context".
    if (message.includes('timed out')) {
      return Response.json({ error: 'Snapshot timed out' }, { status: 504 });
    }
    return Response.json({ error: message }, { status: 502 });
  }

  if (event.type !== 'BROWSER_SNAPSHOT_RESULT') {
    // Defensive: agent-manager only resolves with the event whose
    // requestId matches our command, but we sanity-check the discriminator
    // so a future protocol drift can't corrupt the response.
    return Response.json(
      { error: `Unexpected response type: ${event.type}` },
      { status: 502 },
    );
  }

  if (event.frame) {
    return Response.json({ ok: true, frame: event.frame });
  }

  // The agent has no BrowserContext for this chat — surface as 200 with a
  // typed "reason" rather than 4xx, because it's an expected steady state
  // (chat never opened a browser, or the context was idle-evicted), not a
  // client-side error worth raising in the UI.
  return Response.json({
    ok: false,
    reason: 'no_context',
    error: event.error,
  });
}
