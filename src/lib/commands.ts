/**
 * Project commands — user-defined shell commands attached to a project.
 *
 * Stored as JSON in `projects.commands`. Two run modes:
 *   - Non-streaming (default): one-shot exec via RUN_COMMAND, 30s timeout, returns full output.
 *   - Streaming: spawns a PTY session via TERMINAL_SPAWN with a `command` arg, output flows
 *     through the existing terminal SSE stream until process exits.
 */

export interface ProjectCommand {
  id: string;
  label: string;
  cmd: string;
  icon?: string;        // emoji or single character
  streaming?: boolean;  // run as PTY (long-running, real-time output)
}

export function parseCommands(raw: string | null | undefined): ProjectCommand[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is ProjectCommand => {
        return (
          c &&
          typeof c === 'object' &&
          typeof c.id === 'string' &&
          typeof c.label === 'string' &&
          typeof c.cmd === 'string'
        );
      })
      .map((c) => ({
        id: c.id,
        label: c.label,
        cmd: c.cmd,
        icon: typeof c.icon === 'string' ? c.icon : undefined,
        streaming: Boolean(c.streaming),
      }));
  } catch {
    return [];
  }
}

export function serializeCommands(commands: ProjectCommand[]): string {
  return JSON.stringify(commands);
}

/**
 * Validates a command list payload received from the client.
 * Returns either the cleaned list or an error message.
 */
export function validateCommands(
  input: unknown,
): { ok: true; commands: ProjectCommand[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'commands must be an array' };
  }
  if (input.length > 50) {
    return { ok: false, error: 'too many commands (max 50)' };
  }

  const out: ProjectCommand[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < input.length; i++) {
    const item = input[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `commands[${i}] is not an object` };
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const cmd = typeof item.cmd === 'string' ? item.cmd.trim() : '';

    if (!id) return { ok: false, error: `commands[${i}].id is required` };
    if (seenIds.has(id)) return { ok: false, error: `duplicate id: ${id}` };
    if (!label) return { ok: false, error: `commands[${i}].label is required` };
    if (!cmd) return { ok: false, error: `commands[${i}].cmd is required` };
    if (label.length > 60) return { ok: false, error: `commands[${i}].label too long (max 60)` };
    if (cmd.length > 2000) return { ok: false, error: `commands[${i}].cmd too long (max 2000)` };

    seenIds.add(id);
    out.push({
      id,
      label,
      cmd,
      icon:
        typeof item.icon === 'string' && item.icon.trim()
          ? item.icon.trim().slice(0, 8)
          : undefined,
      streaming: Boolean(item.streaming),
    });
  }

  return { ok: true, commands: out };
}
