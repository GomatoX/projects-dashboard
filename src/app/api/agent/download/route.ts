import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Stream a fresh tarball of the agent/ directory so install scripts
// (public/install/mac, public/install/linux) can download it.
//
// The tarball contains the agent/ contents at the root (not nested under
// agent/), because the install script extracts straight into
// $HOME/.dev-dashboard-agent and then runs `pnpm install` from there.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const projectRoot = process.cwd();
  const agentDir = path.join(projectRoot, 'agent');

  if (!existsSync(agentDir)) {
    return new Response(`Agent source not found at ${agentDir}`, {
      status: 500,
    });
  }

  const tar = spawn(
    'tar',
    [
      '-czf',
      '-',
      '-C',
      agentDir,
      '--exclude=node_modules',
      '--exclude=.env',
      '--exclude=.env.local',
      '--exclude=dist',
      '--exclude=.DS_Store',
      '--exclude=agent.log',
      '--exclude=agent.error.log',
      '.',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  tar.stderr.on('data', (chunk) => {
    console.error('[agent-download] tar stderr:', chunk.toString());
  });
  tar.on('error', (err) => {
    console.error('[agent-download] tar spawn error:', err);
  });

  const webStream = Readable.toWeb(tar.stdout) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="agent.tar.gz"',
      'Cache-Control': 'no-store',
    },
  });
}
