import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { db } from '@/lib/db';
import { gitSettings, projects, skills } from '@/lib/db/schema';
import type { AgentCommand, AgentEvent, GitStatus } from '@/lib/socket/types';
import type { SkillContextSource } from '@/lib/skills';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// Mirrors the cap used by github/summary so prompts stay under model limits.
const MAX_CONTEXT_CHARS = 30_000;

/**
 * POST /api/projects/[id]/skills/execute
 *
 * Body: { skillId: string; userInput?: string }
 *
 * Looks up the skill, gathers any configured context (git diff, status…)
 * via the connected agent, then runs Claude with `systemPrompt + context`
 * via the Claude Agent SDK (`query()`). Returns the full text result —
 * no streaming yet. The client decides how to surface it (modal /
 * clipboard) based on `outputMode`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const skillId =
    body && typeof body === 'object' ? (body as { skillId?: unknown }).skillId : undefined;
  const userInputRaw =
    body && typeof body === 'object' ? (body as { userInput?: unknown }).userInput : undefined;

  if (typeof skillId !== 'string' || !skillId) {
    return NextResponse.json({ error: 'skillId required' }, { status: 400 });
  }
  const userInput =
    typeof userInputRaw === 'string' ? userInputRaw.trim().slice(0, 4000) : '';

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const [skill] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, skillId), eq(skills.projectId, id)));
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  // ─── Gather context (if any) ────────────────────────────
  let context = '';
  let contextLabel = '';
  if (skill.contextSource !== 'none') {
    if (!project.deviceId) {
      return NextResponse.json(
        { error: 'This skill needs a connected agent to gather context' },
        { status: 400 },
      );
    }
    const agentManager = getAgentManager();
    if (!agentManager) {
      console.warn('[skills/execute] agentManager missing on globalThis');
      return NextResponse.json(
        { error: 'Agent manager not initialized — restart the server' },
        { status: 503 },
      );
    }
    if (!agentManager.isDeviceConnected(project.deviceId)) {
      const connected = agentManager.getConnectedDevices().map((d) => d.deviceId);
      console.warn(
        `[skills/execute] device ${project.deviceId} not in connectedAgents`,
        { connected },
      );
      return NextResponse.json(
        {
          error: `Agent not connected (project device: ${project.deviceId.slice(0, 8)}…, connected: ${connected.length === 0 ? 'none' : connected.map((d) => d.slice(0, 8)).join(', ')})`,
        },
        { status: 503 },
      );
    }

    try {
      const gathered = await gatherContext(
        skill.contextSource,
        project.deviceId,
        project.path,
        id,
        agentManager,
      );
      context = gathered.text;
      contextLabel = gathered.label;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to gather context';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!context.trim()) {
      return NextResponse.json(
        { error: `No content from ${contextLabel} — nothing to send to Claude` },
        { status: 400 },
      );
    }
  }

  // Truncate so the prompt stays bounded. The notice tells the model the
  // tail was cut so it doesn't fabricate "and then".
  const truncated = context.length > MAX_CONTEXT_CHARS;
  const contextForPrompt = truncated
    ? context.slice(0, MAX_CONTEXT_CHARS) + '\n\n... [context truncated]'
    : context;

  const promptParts: string[] = [skill.systemPrompt.trim()];
  if (userInput) {
    promptParts.push(`\n--- USER NOTE ---\n${userInput}`);
  }
  if (contextForPrompt) {
    promptParts.push(`\n--- ${contextLabel.toUpperCase()} ---\n${contextForPrompt}`);
  }
  const prompt = promptParts.join('\n');

  // ─── Run Claude ─────────────────────────────────────────
  try {
    let resultText = '';
    const agentQuery = query({
      prompt,
      options: {
        cwd: project.path,
        model: skill.model,
        maxTurns: 1,
        // Empty array = disable all built-in tools. This is a one-shot
        // prompt → text generation. Mirrors github/[prNumber]/summary.
        tools: [],
        persistSession: false,
      },
    });

    for await (const message of agentQuery) {
      const msg = message as SDKMessage;
      if (msg.type === 'result') {
        const r = msg as SDKResultMessage;
        if (r.subtype === 'success') {
          resultText = r.result;
        } else {
          return NextResponse.json(
            { error: `Claude returned: ${r.subtype}` },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json({
      skillId: skill.id,
      name: skill.name,
      outputMode: skill.outputMode,
      result: resultText,
      contextChars: context.length,
      contextTruncated: truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Skill execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Context gathering ────────────────────────────────────

async function gatherContext(
  source: SkillContextSource,
  deviceId: string,
  projectPath: string,
  projectId: string,
  agentManager: AgentManagerModule,
): Promise<{ text: string; label: string }> {
  switch (source) {
    case 'git_diff_staged': {
      const cmd: AgentCommand = {
        type: 'GIT_DIFF',
        id: nanoid(),
        projectPath,
        staged: true,
      };
      const resp = await agentManager.sendCommand(deviceId, cmd, 15_000);
      assertEvent(resp, 'GIT_DIFF_RESULT');
      return { text: resp.diff, label: 'git diff --staged' };
    }

    case 'git_diff_branch': {
      // The base branch comes from the project's git_settings (default: main).
      // We use RUN_COMMAND because GIT_DIFF only supports staged/unstaged.
      const base = await resolveBaseBranch(projectId);
      const runCmd: AgentCommand = {
        type: 'RUN_COMMAND',
        id: nanoid(),
        projectPath,
        command: `git diff ${base}...HEAD`,
      };
      const resp = await agentManager.sendCommand(deviceId, runCmd, 30_000);
      assertEvent(resp, 'COMMAND_RESULT');
      if (resp.exitCode !== 0) {
        // Common cause: base branch doesn't exist locally. Fall back to
        // origin/<base> so a fresh clone still works.
        const fallback: AgentCommand = {
          type: 'RUN_COMMAND',
          id: nanoid(),
          projectPath,
          command: `git diff origin/${base}...HEAD`,
        };
        const respFallback = await agentManager.sendCommand(deviceId, fallback, 30_000);
        assertEvent(respFallback, 'COMMAND_RESULT');
        if (respFallback.exitCode !== 0) {
          throw new Error(
            `git diff vs ${base} failed (exit ${respFallback.exitCode}): ${respFallback.output.slice(0, 500)}`,
          );
        }
        return { text: respFallback.output, label: `git diff origin/${base}...HEAD` };
      }
      return { text: resp.output, label: `git diff ${base}...HEAD` };
    }

    case 'git_status': {
      const cmd: AgentCommand = {
        type: 'GIT_STATUS',
        id: nanoid(),
        projectPath,
      };
      const resp = await agentManager.sendCommand(deviceId, cmd, 10_000);
      assertEvent(resp, 'GIT_STATUS_RESULT');
      return { text: formatGitStatus(resp.data), label: 'git status' };
    }

    case 'none':
      return { text: '', label: '' };
  }
}

/** Narrows the agent response to a specific event type; throws otherwise. */
function assertEvent<T extends AgentEvent['type']>(
  evt: AgentEvent,
  expected: T,
): asserts evt is Extract<AgentEvent, { type: T }> {
  if (evt.type !== expected) {
    if (evt.type === 'COMMAND_ERROR') {
      throw new Error(evt.message);
    }
    throw new Error(`Expected ${expected}, got ${evt.type}`);
  }
}

async function resolveBaseBranch(projectId: string): Promise<string> {
  const [settings] = await db
    .select()
    .from(gitSettings)
    .where(eq(gitSettings.projectId, projectId));
  if (!settings) return 'main';
  try {
    const branches = JSON.parse(settings.protectedBranches) as unknown;
    if (Array.isArray(branches) && typeof branches[0] === 'string' && branches[0]) {
      return branches[0];
    }
  } catch {
    // fall through
  }
  return 'main';
}

function formatGitStatus(s: GitStatus): string {
  const lines: string[] = [
    `Branch: ${s.branch} (ahead ${s.ahead}, behind ${s.behind})`,
    `Clean: ${s.isClean}`,
  ];
  if (s.staged.length) {
    lines.push('', 'Staged:');
    for (const f of s.staged) lines.push(`  ${f.index} ${f.path}`);
  }
  if (s.unstaged.length) {
    lines.push('', 'Unstaged:');
    for (const f of s.unstaged) lines.push(`  ${f.working_dir} ${f.path}`);
  }
  if (s.untracked.length) {
    lines.push('', 'Untracked:');
    for (const p of s.untracked) lines.push(`  ?? ${p}`);
  }
  if (s.conflicted.length) {
    lines.push('', 'Conflicted:');
    for (const p of s.conflicted) lines.push(`  UU ${p}`);
  }
  return lines.join('\n');
}
