import { loadConfig } from './config.js';
import { createConnection, startHeartbeat } from './connection.js';
import { handleGetSystemStats } from './handlers/system.js';
import {
  handleReadFile,
  handleWriteFile,
  handleListFiles,
  handleSearchCodebase,
} from './handlers/files.js';
import { handleScanProjects, buildAgentHello } from './handlers/discovery.js';
import {
  handlePM2List,
  handlePM2Action,
  handlePM2Logs,
  startLogStream,
  stopLogStream,
  stopAllLogStreams,
} from './handlers/pm2.js';
import {
  handleGitStatus,
  handleGitDiff,
  handleGitBranches,
  handleGitLog,
  handleGitStage,
  handleGitUnstage,
  handleGitCommit,
  handleGitPush,
  handleGitPull,
  handleGitFetch,
  handleGitCheckout,
  handleGitCreateBranch,
  handleGitDeleteBranch,
  handleGitStash,
} from './handlers/git.js';
import {
  handleTerminalSpawn,
  handleTerminalInput,
  handleTerminalResize,
  handleTerminalKill,
  killAllTerminals,
} from './handlers/terminal.js';
import type { AgentCommand, AgentEvent } from '../../src/lib/socket/types.js';

console.log('🔧 Dev Dashboard Agent v0.1.0');
console.log('─'.repeat(40));

const config = loadConfig();
console.log(`📡 Dashboard: ${config.dashboardUrl}`);
console.log(`📂 Scan paths: ${config.projectPaths.join(', ') || '(none)'}`);
console.log('─'.repeat(40));

let heartbeatTimer: NodeJS.Timeout | undefined;

const { socket } = createConnection(config, {
  onConnected: async (sock) => {
    // Send AGENT_HELLO with discovered projects
    const hello = await buildAgentHello(config.projectPaths);
    sock.emit('event', hello);

    console.log(`📦 Discovered ${hello.type === 'AGENT_HELLO' ? hello.projects.length : 0} projects`);

    // Start heartbeat
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = startHeartbeat(sock, 30_000);
  },

  onDisconnected: (reason) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    console.log(`🔄 Will attempt to reconnect... (${reason})`);
  },

  onCommand: async (command: AgentCommand, respond: (event: AgentEvent) => void) => {
    console.log(`← Command: ${command.type}`);
    const startTime = Date.now();

    let response: AgentEvent;

    switch (command.type) {
      case 'GET_SYSTEM_STATS':
        response = await handleGetSystemStats(command.id);
        break;

      case 'READ_FILE':
        response = await handleReadFile(command.id, command.path);
        break;

      case 'WRITE_FILE':
        response = await handleWriteFile(command.id, command.path, command.content);
        break;

      case 'LIST_FILES':
        response = await handleListFiles(command.id, command.path, command.recursive);
        break;

      case 'SEARCH_CODEBASE':
        response = await handleSearchCodebase(command.id, command.projectPath, command.query);
        break;

      case 'SCAN_PROJECTS':
        response = await handleScanProjects(command.id, command.paths);
        break;

      case 'PM2_LIST':
        response = await handlePM2List(command.id);
        break;

      case 'PM2_START':
        response = await handlePM2Action(command.id, 'start', command.name);
        break;

      case 'PM2_STOP':
        response = await handlePM2Action(command.id, 'stop', command.name);
        break;

      case 'PM2_RESTART':
        response = await handlePM2Action(command.id, 'restart', command.name);
        break;

      case 'PM2_DELETE':
        response = await handlePM2Action(command.id, 'delete', command.name);
        break;

      case 'PM2_LOGS':
        response = await handlePM2Logs(command.id, command.name, command.lines);
        break;

      case 'PM2_LOGS_STREAM_START':
        startLogStream(command.name, socket);
        response = {
          type: 'PM2_ACTION_RESULT',
          requestId: command.id,
          action: 'logs_stream_start',
          name: command.name,
          success: true,
        };
        break;

      case 'PM2_LOGS_STREAM_STOP':
        stopLogStream(command.name);
        response = {
          type: 'PM2_ACTION_RESULT',
          requestId: command.id,
          action: 'logs_stream_stop',
          name: command.name,
          success: true,
        };
        break;

      case 'GIT_STATUS':
        response = await handleGitStatus(command.id, command.projectPath);
        break;

      case 'GIT_DIFF':
        response = await handleGitDiff(command.id, command.projectPath, command.staged);
        break;

      case 'GIT_BRANCHES':
        response = await handleGitBranches(command.id, command.projectPath);
        break;

      case 'GIT_LOG':
        response = await handleGitLog(command.id, command.projectPath, command.limit);
        break;

      case 'GIT_STAGE':
        response = await handleGitStage(command.id, command.projectPath, command.files);
        break;

      case 'GIT_UNSTAGE':
        response = await handleGitUnstage(command.id, command.projectPath, command.files);
        break;

      case 'GIT_COMMIT':
        response = await handleGitCommit(command.id, command.projectPath, command.message, command.amend);
        break;

      case 'GIT_PUSH':
        response = await handleGitPush(command.id, command.projectPath, command.force);
        break;

      case 'GIT_PULL':
        response = await handleGitPull(command.id, command.projectPath);
        break;

      case 'GIT_FETCH':
        response = await handleGitFetch(command.id, command.projectPath);
        break;

      case 'GIT_CHECKOUT':
        response = await handleGitCheckout(command.id, command.projectPath, command.branch);
        break;

      case 'GIT_CREATE_BRANCH':
        response = await handleGitCreateBranch(command.id, command.projectPath, command.name, command.from);
        break;

      case 'GIT_DELETE_BRANCH':
        response = await handleGitDeleteBranch(command.id, command.projectPath, command.name, command.remote);
        break;

      case 'GIT_STASH':
        response = await handleGitStash(command.id, command.projectPath, command.action, command.message);
        break;

      case 'RUN_COMMAND': {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        try {
          const { stdout, stderr } = await execAsync(command.command, {
            cwd: command.projectPath,
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
          });
          response = {
            type: 'COMMAND_RESULT' as AgentEvent['type'],
            requestId: command.id,
            output: (stdout || '') + (stderr ? `\n${stderr}` : ''),
          } as AgentEvent;
        } catch (err: unknown) {
          const error = err as { stdout?: string; stderr?: string; message?: string };
          response = {
            type: 'COMMAND_RESULT' as AgentEvent['type'],
            requestId: command.id,
            output: (error.stdout || '') + (error.stderr || error.message || 'Command failed'),
          } as AgentEvent;
        }
        break;
      }

      // Terminal commands — these respond via socket events, not the respond callback
      case 'TERMINAL_SPAWN':
        handleTerminalSpawn(
          socket,
          command.id,
          command.sessionId,
          command.cwd,
          command.cols,
          command.rows,
        );
        return; // Don't call respond — handler emits events directly

      case 'TERMINAL_INPUT':
        handleTerminalInput(command.sessionId, command.data);
        return;

      case 'TERMINAL_RESIZE':
        handleTerminalResize(command.sessionId, command.cols, command.rows);
        return;

      case 'TERMINAL_KILL':
        handleTerminalKill(command.sessionId);
        return;

      default:
        response = {
          type: 'COMMAND_ERROR',
          requestId: (command as AgentCommand & { id: string }).id,
          message: `Unknown command type: ${(command as { type: string }).type}`,
        };
    }

    const elapsed = Date.now() - startTime;
    console.log(`→ Response: ${response.type} (${elapsed}ms)`);
    respond(response);
  },
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Shutting down agent...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  stopAllLogStreams();
  killAllTerminals();
  socket.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
