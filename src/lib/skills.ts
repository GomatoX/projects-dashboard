/**
 * Project skills — AI-powered prompt templates attached to a project.
 *
 * Skills differ from commands: instead of running a shell command on the
 * device, they invoke Claude with a system prompt plus optional context
 * (e.g. `git diff --staged`) and return the model's text result.
 *
 * Persisted in the `skills` table (one row per skill). See `schema.ts`
 * for column-level docs on the meaning of each enum value.
 */

export type SkillContextSource =
  | 'none'
  | 'git_diff_staged'
  | 'git_diff_branch'
  | 'git_status';

export type SkillOutputMode = 'modal' | 'clipboard';

export interface Skill {
  id: string;
  projectId: string;
  name: string;
  description: string;
  icon?: string | null;
  systemPrompt: string;
  contextSource: SkillContextSource;
  model: string;
  outputMode: SkillOutputMode;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Shape used by the create/update endpoints; ids and timestamps are server-side. */
export interface SkillInput {
  name: string;
  description?: string;
  icon?: string | null;
  systemPrompt: string;
  contextSource?: SkillContextSource;
  model?: string;
  outputMode?: SkillOutputMode;
}

export const CONTEXT_SOURCES: ReadonlyArray<{
  value: SkillContextSource;
  label: string;
  hint: string;
}> = [
  { value: 'none', label: 'None', hint: 'Just the prompt (and any user input)' },
  {
    value: 'git_diff_staged',
    label: 'git diff --staged',
    hint: 'Append the staged diff to the prompt',
  },
  {
    value: 'git_diff_branch',
    label: 'git diff <base>...HEAD',
    hint: 'Append the diff vs. the default branch',
  },
  { value: 'git_status', label: 'git status', hint: 'Append a short status summary' },
];

export const OUTPUT_MODES: ReadonlyArray<{
  value: SkillOutputMode;
  label: string;
  hint: string;
}> = [
  { value: 'modal', label: 'Show in modal', hint: 'Display result text in a dialog' },
  {
    value: 'clipboard',
    label: 'Copy to clipboard',
    hint: 'Copy result and show a toast',
  },
];

export const DEFAULT_SKILL_MODEL = 'claude-sonnet-4-20250514';

const NAME_MAX = 60;
const DESC_MAX = 200;
const PROMPT_MAX = 8000;

/**
 * Validates a payload received from the client for create/update.
 * Returns either the cleaned input or an error message.
 */
export function validateSkillInput(
  input: unknown,
): { ok: true; value: Required<SkillInput> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'body must be an object' };
  }
  const raw = input as Record<string, unknown>;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return { ok: false, error: 'name is required' };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `name too long (max ${NAME_MAX})` };
  }

  const systemPrompt =
    typeof raw.systemPrompt === 'string' ? raw.systemPrompt.trim() : '';
  if (!systemPrompt) return { ok: false, error: 'systemPrompt is required' };
  if (systemPrompt.length > PROMPT_MAX) {
    return { ok: false, error: `systemPrompt too long (max ${PROMPT_MAX})` };
  }

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description.length > DESC_MAX) {
    return { ok: false, error: `description too long (max ${DESC_MAX})` };
  }

  const icon =
    typeof raw.icon === 'string' && raw.icon.trim()
      ? raw.icon.trim().slice(0, 8)
      : null;

  const contextSource = (raw.contextSource ?? 'none') as SkillContextSource;
  if (!CONTEXT_SOURCES.some((c) => c.value === contextSource)) {
    return { ok: false, error: `invalid contextSource: ${String(raw.contextSource)}` };
  }

  const outputMode = (raw.outputMode ?? 'modal') as SkillOutputMode;
  if (!OUTPUT_MODES.some((o) => o.value === outputMode)) {
    return { ok: false, error: `invalid outputMode: ${String(raw.outputMode)}` };
  }

  const model =
    typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim().slice(0, 80)
      : DEFAULT_SKILL_MODEL;

  return {
    ok: true,
    value: { name, description, icon, systemPrompt, contextSource, model, outputMode },
  };
}

// ─── Built-in seeds ───────────────────────────────────────
//
// Two starter skills inserted on first visit to the panel when the project
// has no skills yet. Users can edit or delete them.

export interface BuiltinSkillSeed {
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  contextSource: SkillContextSource;
  outputMode: SkillOutputMode;
}

export const BUILTIN_SKILLS: BuiltinSkillSeed[] = [
  {
    name: 'Generate commit',
    description: 'Write a Conventional Commits message from staged changes',
    icon: '✏️',
    contextSource: 'git_diff_staged',
    outputMode: 'clipboard',
    systemPrompt: `You are a commit-message generator.

Read the supplied \`git diff --staged\` and produce ONE commit message that:
- Uses the Conventional Commits format: \`<type>(<scope>)?: <subject>\`
- type ∈ feat | fix | refactor | docs | test | chore | perf | style | build | ci
- Subject is imperative, lowercase, no trailing period, ≤ 72 chars.
- If the change is non-trivial, add a short body (wrapped at 72 chars) explaining the *why* — not the what.
- No bullet lists, no markdown fences, no preface like "Here is".

Output ONLY the commit message text, nothing else.`,
  },
  {
    name: 'Code review',
    description: 'Review the current branch diff vs. main',
    icon: '🔍',
    contextSource: 'git_diff_branch',
    outputMode: 'modal',
    systemPrompt: `You are a senior engineer doing a focused code review.

Read the supplied diff and respond in this exact markdown structure:

## Summary
2–3 sentences: what this change does and why.

## Issues
For each real concern, a bullet:
- **<severity: blocker | major | minor | nit>** — <file>:<line> — <issue> — <suggested fix>

If there are no issues, write "_None spotted._"

## Risks
Bullet list of regressions, security/perf concerns, missing tests, edge cases. Skip the section if empty.

## Nice-to-haves
Optional polish items (naming, dead code, comments). Skip the section if empty.

Be direct. Don't restate obvious things. If the diff is huge, focus on hot spots.`,
  },
];
