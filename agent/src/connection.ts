import { io, Socket } from 'socket.io-client';
import { hostname, platform } from 'node:os';
import type { AgentConfig } from './config.js';
import type { AgentCommand, AgentEvent, AgentAuth } from '../../src/lib/socket/types.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ConnectionCallbacks {
  onConnected: (socket: Socket) => void;
  onDisconnected: (reason: string) => void;
  onCommand: (command: AgentCommand, respond: (event: AgentEvent) => void) => void;
}

export function createConnection(
  config: AgentConfig,
  callbacks: ConnectionCallbacks,
): { socket: Socket; getState: () => ConnectionState } {
  let state: ConnectionState = 'disconnected';

  const auth: AgentAuth = {
    token: config.agentToken,
    hostname: hostname(),
    os: platform(),
  };

  const socket = io(config.dashboardUrl, {
    path: '/api/ws',
    auth,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    state = 'connected';
    console.log(`✅ Connected to dashboard (${config.dashboardUrl})`);
    callbacks.onConnected(socket);
  });

  socket.on('disconnect', (reason) => {
    state = 'disconnected';
    console.log(`⚡ Disconnected: ${reason}`);
    callbacks.onDisconnected(reason);
  });

  socket.on('connect_error', (err) => {
    state = 'disconnected';
    console.error(`❌ Connection error: ${err.message}`);
  });

  // Listen for commands from dashboard
  socket.on('command', (command: AgentCommand) => {
    const respond = (event: AgentEvent) => {
      socket.emit('event', event);
    };
    callbacks.onCommand(command, respond);
  });

  // Auth rejection
  socket.on('auth_error', (msg: string) => {
    console.error(`❌ Authentication failed: ${msg}`);
    console.error('Check your AGENT_TOKEN in .env');
    process.exit(1);
  });

  state = 'connecting';

  return {
    socket,
    getState: () => state,
  };
}

// Heartbeat loop
export function startHeartbeat(socket: Socket, intervalMs = 30_000): NodeJS.Timeout {
  const send = () => {
    if (socket.connected) {
      socket.emit('event', {
        type: 'HEARTBEAT',
        timestamp: Date.now(),
        uptime: process.uptime(),
      } satisfies AgentEvent);
    }
  };

  // Send immediately, then every interval
  send();
  return setInterval(send, intervalMs);
}
