import * as pty from 'node-pty';
import type { Socket } from 'socket.io-client';

// Active PTY sessions
const sessions = new Map<string, pty.IPty>();

/**
 * Spawn a new PTY session.
 *
 * If `command` is provided, the shell is spawned with `-c <command>` so it
 * runs that command and exits. This is used by the Commands panel to stream
 * output of long-running tasks (e.g. `pnpm dev`) through the same
 * TERMINAL_OUTPUT / TERMINAL_EXIT pipeline used for interactive sessions.
 */
export function handleTerminalSpawn(
  socket: Socket,
  requestId: string,
  sessionId: string,
  cwd: string,
  cols: number,
  rows: number,
  command?: string,
) {
  // Kill existing session with same ID
  if (sessions.has(sessionId)) {
    sessions.get(sessionId)!.kill();
    sessions.delete(sessionId);
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const args = command ? ['-l', '-c', command] : [];

  try {
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });

    sessions.set(sessionId, ptyProcess);

    // Stream output back to dashboard
    ptyProcess.onData((data: string) => {
      socket.emit('event', {
        type: 'TERMINAL_OUTPUT',
        sessionId,
        data,
      });
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      sessions.delete(sessionId);
      socket.emit('event', {
        type: 'TERMINAL_EXIT',
        sessionId,
        exitCode,
      });
    });

    // Confirm spawn
    socket.emit('event', {
      type: 'TERMINAL_SPAWNED',
      requestId,
      sessionId,
    });

    if (command) {
      console.log(`🖥️  Terminal spawned (cmd): ${sessionId} → ${command} in ${cwd}`);
    } else {
      console.log(`🖥️  Terminal spawned: ${sessionId} (${shell} in ${cwd})`);
    }
  } catch (error) {
    socket.emit('event', {
      type: 'COMMAND_ERROR',
      requestId,
      message: error instanceof Error ? error.message : 'Failed to spawn terminal',
    });
  }
}

/**
 * Send input to a PTY session.
 */
export function handleTerminalInput(sessionId: string, data: string) {
  const ptyProcess = sessions.get(sessionId);
  if (ptyProcess) {
    ptyProcess.write(data);
  }
}

/**
 * Resize a PTY session.
 */
export function handleTerminalResize(
  sessionId: string,
  cols: number,
  rows: number,
) {
  const ptyProcess = sessions.get(sessionId);
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch {
      // Ignore resize errors for dead processes
    }
  }
}

/**
 * Kill a PTY session.
 */
export function handleTerminalKill(sessionId: string) {
  const ptyProcess = sessions.get(sessionId);
  if (ptyProcess) {
    ptyProcess.kill();
    sessions.delete(sessionId);
    console.log(`🖥️  Terminal killed: ${sessionId}`);
  }
}

/**
 * Kill all active PTY sessions (on disconnect).
 */
export function killAllTerminals() {
  for (const [id, ptyProcess] of sessions) {
    ptyProcess.kill();
    console.log(`🖥️  Terminal cleaned up: ${id}`);
  }
  sessions.clear();
}

/**
 * Get count of active terminal sessions.
 */
export function getActiveTerminalCount(): number {
  return sessions.size;
}
