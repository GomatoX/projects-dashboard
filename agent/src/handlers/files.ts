import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentEvent, FileEntry, SearchResult } from '../../../src/lib/socket/types.js';

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export async function handleReadFile(
  requestId: string,
  path: string,
): Promise<AgentEvent> {
  try {
    const stats = await stat(path);
    if (stats.size > MAX_FILE_SIZE) {
      return {
        type: 'COMMAND_ERROR',
        requestId,
        message: `File too large (${Math.round(stats.size / 1024 / 1024)}MB, max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }

    const content = await readFile(path, 'utf-8');
    return { type: 'FILE_CONTENT', requestId, path, content };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function handleWriteFile(
  requestId: string,
  path: string,
  content: string,
): Promise<AgentEvent> {
  try {
    await writeFile(path, content, 'utf-8');
    return { type: 'FILE_WRITTEN', requestId, path, success: true };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function handleListFiles(
  requestId: string,
  dirPath: string,
  recursive: boolean,
): Promise<AgentEvent> {
  try {
    dirPath = expandHome(dirPath);
    const entries: FileEntry[] = [];

    async function scan(currentPath: string) {
      const items = await readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Skip node_modules, .git, .next, etc.
        if (
          item.name.startsWith('.') ||
          item.name === 'node_modules' ||
          item.name === '__pycache__' ||
          item.name === 'dist' ||
          item.name === 'build' ||
          item.name === '.next'
        ) {
          continue;
        }

        const fullPath = join(currentPath, item.name);

        try {
          const fileStat = await stat(fullPath);
          entries.push({
            name: item.name,
            path: relative(dirPath, fullPath),
            isDirectory: item.isDirectory(),
            size: fileStat.size,
            modified: fileStat.mtime.toISOString(),
          });

          if (recursive && item.isDirectory() && entries.length < 5000) {
            await scan(fullPath);
          }
        } catch {
          // Skip files we can't stat (permission errors, etc.)
        }
      }
    }

    await scan(dirPath);

    return { type: 'FILE_LIST', requestId, path: dirPath, entries };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function handleSearchCodebase(
  requestId: string,
  projectPath: string,
  query: string,
): Promise<AgentEvent> {
  try {
    const results: SearchResult[] = [];

    // Try ripgrep first (much faster), fallback to grep
    try {
      const { stdout } = await execFileAsync('rg', [
        '--json',
        '--max-count', '100',
        '--max-filesize', '1M',
        '--glob', '!node_modules',
        '--glob', '!.git',
        '--glob', '!.next',
        '--glob', '!dist',
        query,
        projectPath,
      ], { timeout: 15000 });

      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match') {
            results.push({
              file: relative(projectPath, parsed.data.path.text),
              line: parsed.data.line_number,
              content: parsed.data.lines.text.trim(),
            });
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    } catch {
      // ripgrep not available or error — try grep fallback
      try {
        const { stdout } = await execFileAsync('grep', [
          '-rn',
          '--include=*.ts',
          '--include=*.tsx',
          '--include=*.js',
          '--include=*.jsx',
          '--include=*.json',
          '--include=*.css',
          '--include=*.py',
          '--include=*.rs',
          '--include=*.go',
          '-m', '100',
          query,
          projectPath,
        ], { timeout: 15000 });

        for (const line of stdout.split('\n')) {
          const match = line.match(/^(.+?):(\d+):(.+)$/);
          if (match) {
            results.push({
              file: relative(projectPath, match[1]),
              line: parseInt(match[2], 10),
              content: match[3].trim(),
            });
          }
        }
      } catch {
        // grep also failed — return empty
      }
    }

    return { type: 'SEARCH_RESULTS', requestId, results };
  } catch (error) {
    return {
      type: 'COMMAND_ERROR',
      requestId,
      message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
