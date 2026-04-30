// agent/src/mcp/browser/index.ts
import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { buildBrowserTools } from './tools.js';

export interface BrowserMcpDeps {
  chatId: string;
  sessionId: string;
}

export function createBrowserMcpServer(
  deps: BrowserMcpDeps,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'browser',
    version: '0.1.0',
    tools: buildBrowserTools(deps),
  });
}

// Re-export pool helpers so callers don't need to know the file layout.
export {
  setAgentSocket,
  closeContext,
  closeAll,
  captureSnapshot,
} from './context-pool.js';
