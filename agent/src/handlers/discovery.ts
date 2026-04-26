import { readdir, access, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import type {
  AgentEvent,
  DiscoveredProject,
  ProjectType,
} from '../../../src/lib/socket/types.js';

export async function handleScanProjects(
  requestId: string,
  paths: string[],
): Promise<AgentEvent> {
  const projects: DiscoveredProject[] = [];

  for (const basePath of paths) {
    try {
      const entries = await readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const projectPath = join(basePath, entry.name);
        const project = await analyzeProject(projectPath);

        if (project) {
          projects.push(project);
        }
      }
    } catch (error) {
      console.error(`⚠ Failed to scan ${basePath}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return { type: 'PROJECTS_DISCOVERED', requestId, projects };
}

export async function buildAgentHello(
  projectPaths: string[],
): Promise<AgentEvent> {
  const projects: DiscoveredProject[] = [];

  for (const basePath of projectPaths) {
    try {
      const entries = await readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const projectPath = join(basePath, entry.name);
        const project = await analyzeProject(projectPath);

        if (project) {
          projects.push(project);
        }
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  // Detect capabilities
  const capabilities: string[] = ['files'];

  try {
    await access('/usr/bin/git');
    capabilities.push('git');
  } catch {
    try {
      await access('/usr/local/bin/git');
      capabilities.push('git');
    } catch {
      // No git
    }
  }

  // Check for PM2
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    await exec('pm2', ['--version'], { timeout: 5000 });
    capabilities.push('pm2');
  } catch {
    // No PM2
  }

  // Check for Docker
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    await exec('docker', ['--version'], { timeout: 5000 });
    capabilities.push('docker');
  } catch {
    // No Docker
  }

  capabilities.push('node');

  return {
    type: 'AGENT_HELLO',
    hostname: hostname(),
    os: platform(),
    capabilities,
    projects,
  };
}

// ─── Project Analysis ─────────────────────────────────────

async function analyzeProject(projectPath: string): Promise<DiscoveredProject | null> {
  const hasGit = existsSync(join(projectPath, '.git'));
  const name = basename(projectPath);

  // Try package.json first (most common)
  const packageJsonPath = join(projectPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const raw = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(raw);
      const type = detectNodeProjectType(pkg);

      return {
        name: pkg.name || name,
        path: projectPath,
        type,
        hasGit,
        detectedFramework: getFrameworkLabel(type),
      };
    } catch {
      return { name, path: projectPath, type: 'node', hasGit };
    }
  }

  // Python
  if (
    existsSync(join(projectPath, 'requirements.txt')) ||
    existsSync(join(projectPath, 'pyproject.toml')) ||
    existsSync(join(projectPath, 'setup.py'))
  ) {
    return {
      name,
      path: projectPath,
      type: 'python',
      hasGit,
      detectedFramework: 'Python',
    };
  }

  // Rust
  if (existsSync(join(projectPath, 'Cargo.toml'))) {
    return {
      name,
      path: projectPath,
      type: 'rust',
      hasGit,
      detectedFramework: 'Rust',
    };
  }

  // Go
  if (existsSync(join(projectPath, 'go.mod'))) {
    return {
      name,
      path: projectPath,
      type: 'go',
      hasGit,
      detectedFramework: 'Go',
    };
  }

  // PHP
  if (existsSync(join(projectPath, 'composer.json'))) {
    return {
      name,
      path: projectPath,
      type: 'php',
      hasGit,
      detectedFramework: 'PHP',
    };
  }

  // Has .git but no recognizable project files
  if (hasGit) {
    return {
      name,
      path: projectPath,
      type: 'other',
      hasGit,
    };
  }

  return null;
}

function detectNodeProjectType(pkg: Record<string, unknown>): ProjectType {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  if (deps['next']) return 'nextjs';
  if (deps['@strapi/strapi'] || deps['strapi']) return 'strapi';
  if (deps['react'] || deps['react-dom']) return 'react';
  if (deps['typescript']) return 'typescript';
  return 'node';
}

function getFrameworkLabel(type: ProjectType): string {
  const labels: Record<ProjectType, string> = {
    nextjs: 'Next.js',
    react: 'React',
    node: 'Node.js',
    typescript: 'TypeScript',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    php: 'PHP',
    strapi: 'Strapi',
    other: 'Other',
  };
  return labels[type];
}
