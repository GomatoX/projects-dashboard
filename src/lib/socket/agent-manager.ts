import type { Server, Socket } from 'socket.io';
import type {
  AgentCommand,
  AgentEvent,
  ConnectedAgent,
  SystemStats,
  AgentAuth,
  DiscoveredProject,
} from './types';

// ─── Connected Agents Registry ────────────────────────────
const connectedAgents = new Map<string, ConnectedAgent & { socket: Socket }>();

// ─── Pending Command Responses ────────────────────────────
const pendingCommands = new Map<
  string,
  {
    resolve: (event: AgentEvent) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();

// ─── Public API ───────────────────────────────────────────

export function registerAgent(
  deviceId: string,
  socket: Socket,
  auth: AgentAuth,
): void {
  connectedAgents.set(deviceId, {
    deviceId,
    socketId: socket.id,
    hostname: auth.hostname,
    os: auth.os,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
    socket,
  });

  console.warn(`[Agent Manager] Agent registered: ${auth.hostname} (${deviceId})`);
}

export function unregisterAgent(deviceId: string): void {
  connectedAgents.delete(deviceId);
  console.warn(`[Agent Manager] Agent unregistered: ${deviceId}`);
}

export function getConnectedAgent(deviceId: string): ConnectedAgent | undefined {
  const agent = connectedAgents.get(deviceId);
  if (!agent) return undefined;

  // Return without the socket (public API)
  const { socket: _socket, ...publicInfo } = agent;
  return publicInfo;
}

export function getConnectedDevices(): ConnectedAgent[] {
  return Array.from(connectedAgents.values()).map(({ socket: _socket, ...info }) => info);
}

export function isDeviceConnected(deviceId: string): boolean {
  return connectedAgents.has(deviceId);
}

export function updateHeartbeat(deviceId: string, stats?: SystemStats): void {
  const agent = connectedAgents.get(deviceId);
  if (agent) {
    agent.lastHeartbeat = new Date();
    if (stats) {
      agent.systemStats = stats;
    }
  }
}

export function updateSystemStats(deviceId: string, stats: SystemStats): void {
  const agent = connectedAgents.get(deviceId);
  if (agent) {
    agent.systemStats = stats;
  }
}

/**
 * Send a command to a connected agent and wait for the response.
 * Throws if the agent is not connected or the command times out.
 */
export async function sendCommand(
  deviceId: string,
  command: AgentCommand,
  timeoutMs = 15_000,
): Promise<AgentEvent> {
  const agent = connectedAgents.get(deviceId);

  if (!agent) {
    throw new Error(`Device ${deviceId} is not connected`);
  }

  return new Promise<AgentEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(command.id);
      reject(new Error(`Command ${command.type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingCommands.set(command.id, { resolve, reject, timer });

    // Send command to agent
    agent.socket.emit('command', command);
  });
}

/**
 * Handle an incoming event from an agent. If it's a response to a pending
 * command, resolve the promise. Otherwise, handle it as a push event.
 */
export function handleAgentEvent(
  deviceId: string,
  event: AgentEvent,
): { handled: boolean; discoveredProjects?: DiscoveredProject[] } {
  // Check if this is a response to a pending command
  const requestId = getRequestId(event);
  if (requestId && pendingCommands.has(requestId)) {
    const pending = pendingCommands.get(requestId)!;
    clearTimeout(pending.timer);
    pendingCommands.delete(requestId);
    pending.resolve(event);
    return { handled: true };
  }

  // Handle push events
  switch (event.type) {
    case 'HEARTBEAT':
      updateHeartbeat(deviceId);
      return { handled: true };

    case 'SYSTEM_STATS':
      updateSystemStats(deviceId, event.data);
      return { handled: true };

    case 'AGENT_HELLO': {
      const agent = connectedAgents.get(deviceId);
      if (agent) {
        agent.hostname = event.hostname;
        agent.os = event.os;
      }
      return { handled: true, discoveredProjects: event.projects };
    }

    default:
      return { handled: false };
  }
}

// ─── Helpers ──────────────────────────────────────────────

function getRequestId(event: AgentEvent): string | undefined {
  if ('requestId' in event) return (event as { requestId: string }).requestId;
  return undefined;
}

export function getAgentCount(): number {
  return connectedAgents.size;
}
