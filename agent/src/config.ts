import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from agent root
dotenvConfig({ path: resolve(__dirname, '..', '.env') });

export interface AgentConfig {
  dashboardUrl: string;
  agentToken: string;
  projectPaths: string[];
  agentPort: number;
}

export function loadConfig(): AgentConfig {
  const dashboardUrl = process.env.DASHBOARD_URL;
  const agentToken = process.env.AGENT_TOKEN;
  const projectPaths = process.env.PROJECT_PATHS;

  if (!dashboardUrl) {
    console.error('❌ DASHBOARD_URL is required in .env');
    process.exit(1);
  }

  if (!agentToken) {
    console.error('❌ AGENT_TOKEN is required in .env');
    process.exit(1);
  }

  return {
    dashboardUrl,
    agentToken,
    projectPaths: projectPaths
      ? projectPaths.split(',').map((p) => p.trim())
      : [],
    agentPort: parseInt(process.env.AGENT_PORT || '3939', 10),
  };
}
