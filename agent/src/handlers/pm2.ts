import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentEvent, PM2Process } from '../../../src/lib/socket/types.js';

const execFileAsync = promisify(execFile);

/**
 * Get list of all PM2 processes using CLI (more reliable than programmatic API
 * which has connection state issues with ESM).
 */
export async function handlePM2List(requestId: string): Promise<AgentEvent> {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], {
      timeout: 10000,
    });

    const rawProcesses = JSON.parse(stdout);
    const processes: PM2Process[] = rawProcesses.map(mapPM2Process);

    return { type: 'PM2_LIST_RESULT', requestId, processes };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `PM2 list failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function handlePM2Action(
  requestId: string,
  action: 'start' | 'stop' | 'restart' | 'delete',
  name: string,
): Promise<AgentEvent> {
  try {
    await execFileAsync('pm2', [action, name], { timeout: 15000 });

    return {
      type: 'PM2_ACTION_RESULT',
      requestId,
      action,
      name,
      success: true,
      message: `Process ${name} ${action}ed successfully`,
    };
  } catch (error) {
    return {
      type: 'PM2_ACTION_RESULT',
      requestId,
      action,
      name,
      success: false,
      message: error instanceof Error ? error.message : 'Action failed',
    };
  }
}

export async function handlePM2Logs(
  requestId: string,
  name: string,
  lines: number,
): Promise<AgentEvent> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'pm2',
      ['logs', name, '--lines', String(lines), '--nostream', '--raw'],
      { timeout: 10000 },
    );

    const logs = (stdout || '') + (stderr || '');
    return { type: 'PM2_LOGS_RESULT', requestId, name, logs };
  } catch (error) {
    // PM2 logs command exits with error even on success sometimes
    return {
      type: 'PM2_LOGS_RESULT',
      requestId,
      name,
      logs: error instanceof Error && 'stderr' in error
        ? String((error as { stderr: string }).stderr)
        : 'Failed to get logs',
    };
  }
}

// ─── Log Streaming ────────────────────────────────────────
import { spawn, ChildProcess } from 'node:child_process';
import type { Socket } from 'socket.io-client';

const activeStreams = new Map<string, ChildProcess>();

export function startLogStream(
  name: string,
  socket: Socket,
): void {
  // Kill existing stream for this process
  stopLogStream(name);

  const child = spawn('pm2', ['logs', name, '--raw'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeStreams.set(name, child);

  child.stdout?.on('data', (data: Buffer) => {
    socket.emit('event', {
      type: 'PM2_LOGS_DATA',
      name,
      data: data.toString('utf-8'),
      source: 'stdout',
    } satisfies AgentEvent);
  });

  child.stderr?.on('data', (data: Buffer) => {
    socket.emit('event', {
      type: 'PM2_LOGS_DATA',
      name,
      data: data.toString('utf-8'),
      source: 'stderr',
    } satisfies AgentEvent);
  });

  child.on('close', () => {
    activeStreams.delete(name);
  });

  child.on('error', () => {
    activeStreams.delete(name);
  });
}

export function stopLogStream(name: string): void {
  const existing = activeStreams.get(name);
  if (existing) {
    existing.kill('SIGTERM');
    activeStreams.delete(name);
  }
}

export function stopAllLogStreams(): void {
  for (const [name, child] of activeStreams) {
    child.kill('SIGTERM');
    activeStreams.delete(name);
  }
}

// ─── Helpers ──────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPM2Process(raw: any): PM2Process {
  const env = raw.pm2_env || {};

  return {
    pm_id: raw.pm_id ?? raw.pm2_env?.pm_id ?? 0,
    name: raw.name || 'unknown',
    status: env.status || 'stopped',
    cpu: raw.monit?.cpu ?? 0,
    memory: raw.monit?.memory ?? 0,
    pid: raw.pid ?? 0,
    uptime: env.pm_uptime ? Date.now() - env.pm_uptime : 0,
    restarts: env.restart_time ?? 0,
    unstableRestarts: env.unstable_restarts ?? 0,
    createdAt: env.created_at ?? 0,
    exec_mode: env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
    node_version: env.node_version,
    script: env.pm_exec_path,
    cwd: env.pm_cwd,
    instances: env.instances,
  };
}
