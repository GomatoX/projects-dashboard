// agent/src/mcp/pm2.ts
import { z } from 'zod';
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';
import { handlePM2List, handlePM2Logs } from '../handlers/pm2.js';

/**
 * Build a read-only PM2 MCP server scoped to a single pm2 process.
 *
 * The chat's project has a `pm2Name` set — the dashboard pins it on every
 * CLAUDE_QUERY, and we register a fresh MCP server per query with that
 * name closed over. The model can only ever observe this one process.
 *
 * Two tools:
 *   - pm2_status: current state (status, cpu, mem, uptime, restarts) for the pinned process
 *   - pm2_logs:   bounded tail of the pinned process's combined stdout/stderr
 *
 * No start/stop/restart — those would be unsafe for an autonomous agent.
 */
export function createPm2McpServer(pm2Name: string): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'pm2',
    version: '0.1.0',
    tools: [
      tool(
        'pm2_status',
        `Get the current PM2 status of the project's process "${pm2Name}". ` +
          `Returns status (online/stopped/errored), cpu %, memory bytes, uptime ms, ` +
          `restart count, and PID. Read-only; cannot start/stop the process.`,
        // No params — the pm2Name is pinned per-chat by the agent.
        {},
        async () => {
          const evt = await handlePM2List(`mcp-${Date.now()}`);
          if (evt.type === 'COMMAND_ERROR') {
            return {
              content: [
                { type: 'text' as const, text: `PM2 error: ${evt.message}` },
              ],
              isError: true,
            };
          }
          if (evt.type !== 'PM2_LIST_RESULT') {
            return {
              content: [
                { type: 'text' as const, text: 'Unexpected PM2 response' },
              ],
              isError: true,
            };
          }
          const proc = evt.processes.find((p) => p.name === pm2Name);
          if (!proc) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Process "${pm2Name}" is not registered with PM2 on this device.`,
                },
              ],
              isError: false,
            };
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    name: proc.name,
                    status: proc.status,
                    pid: proc.pid,
                    cpuPercent: proc.cpu,
                    memoryBytes: proc.memory,
                    uptimeMs: proc.uptime,
                    restarts: proc.restarts,
                    unstableRestarts: proc.unstableRestarts,
                    execMode: proc.exec_mode,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: false,
          };
        },
      ),

      tool(
        'pm2_logs',
        `Tail the last N lines of the PM2 logs for the project's process ` +
          `"${pm2Name}" (combined stdout + stderr). Bounded — for live ` +
          `streaming, the user has a separate PM2 panel.`,
        {
          lines: z
            .number()
            .int()
            .min(1)
            .max(500)
            .default(100)
            .describe('Number of recent lines to return (1-500, default 100).'),
        },
        async ({ lines }) => {
          // Pre-flight: confirm the process exists. handlePM2Logs swallows
          // exec failures into a synthetic PM2_LOGS_RESULT (`logs: 'Failed
          // to get logs'` etc.) — without this check, the model would see
          // those error sentinels as if they were real log content.
          // handlePM2List, in contrast, does return COMMAND_ERROR cleanly.
          const listEvt = await handlePM2List(`mcp-${Date.now()}`);
          if (listEvt.type === 'COMMAND_ERROR') {
            return {
              content: [
                { type: 'text' as const, text: `PM2 error: ${listEvt.message}` },
              ],
              isError: true,
            };
          }
          if (listEvt.type !== 'PM2_LIST_RESULT') {
            return {
              content: [
                { type: 'text' as const, text: 'Unexpected PM2 response' },
              ],
              isError: true,
            };
          }
          if (!listEvt.processes.some((p) => p.name === pm2Name)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Process "${pm2Name}" is not registered with PM2 on this device — no logs to read.`,
                },
              ],
              isError: false,
            };
          }

          const evt = await handlePM2Logs(`mcp-${Date.now()}`, pm2Name, lines);
          // Defensive: handlePM2Logs currently never returns COMMAND_ERROR
          // (it folds failures into PM2_LOGS_RESULT with stderr content).
          // Kept here in case that contract tightens later.
          if (evt.type === 'COMMAND_ERROR') {
            return {
              content: [
                { type: 'text' as const, text: `PM2 error: ${evt.message}` },
              ],
              isError: true,
            };
          }
          if (evt.type !== 'PM2_LOGS_RESULT') {
            return {
              content: [
                { type: 'text' as const, text: 'Unexpected PM2 response' },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: 'text' as const,
                // PM2 logs already include process name + timestamp prefixes
                // via `pm2 logs --raw`, so we don't need to annotate further.
                text: evt.logs || '(no log output)',
              },
            ],
            isError: false,
          };
        },
      ),
    ],
  });
}
