import type { AgentCommand } from './types';

/**
 * Per-type field whitelists for commands the dashboard sends to an agent.
 *
 * The HTTP routes used to spread `body` directly into the command payload,
 * which let any client smuggle extra fields through (e.g. overriding
 * `projectPath` to escape the project root, or injecting unexpected keys
 * the agent might react to). Here we declare exactly which fields each
 * command type may carry, drop everything else, and reject unknown types.
 *
 * `id` and `type` are added by the route, never accepted from the client.
 * Fields whose value the route always supplies (like `projectPath` from
 * the DB) are listed under `serverFields` so the route knows to inject
 * them and the client can't override them.
 */
type CommandType = AgentCommand['type'];

interface FieldSpec {
  /** Fields the client may provide. Validated for primitive type only — the agent does the deeper semantic checks. */
  clientFields: ReadonlyArray<string>;
  /** Fields the route injects from server-trusted state. Listed here so the type stays in one place. */
  serverFields?: ReadonlyArray<string>;
}

// File-related commands. SEARCH_CODEBASE & friends use a project-rooted path
// the route will inject so the client can't point the agent at /etc.
const FILE_COMMANDS: Partial<Record<CommandType, FieldSpec>> = {
  READ_FILE: { clientFields: ['path'] },
  WRITE_FILE: { clientFields: ['path', 'content'] },
  LIST_FILES: { clientFields: ['path', 'recursive'] },
  SEARCH_CODEBASE: { clientFields: ['query'], serverFields: ['projectPath'] },
};

// Git commands. Every git command is scoped by `projectPath`, which the
// route always derives from the project record — never trusted from the body.
const GIT_COMMANDS: Partial<Record<CommandType, FieldSpec>> = {
  GIT_STATUS: { clientFields: [], serverFields: ['projectPath'] },
  GIT_DIFF: { clientFields: ['staged'], serverFields: ['projectPath'] },
  GIT_BRANCHES: { clientFields: [], serverFields: ['projectPath'] },
  GIT_LOG: { clientFields: ['limit'], serverFields: ['projectPath'] },
  GIT_STAGE: { clientFields: ['files'], serverFields: ['projectPath'] },
  GIT_UNSTAGE: { clientFields: ['files'], serverFields: ['projectPath'] },
  GIT_COMMIT: { clientFields: ['message', 'amend'], serverFields: ['projectPath'] },
  GIT_PUSH: { clientFields: ['force'], serverFields: ['projectPath'] },
  GIT_PULL: { clientFields: [], serverFields: ['projectPath'] },
  GIT_FETCH: { clientFields: [], serverFields: ['projectPath'] },
  GIT_CHECKOUT: { clientFields: ['branch'], serverFields: ['projectPath'] },
  GIT_CREATE_BRANCH: { clientFields: ['name', 'from'], serverFields: ['projectPath'] },
  GIT_DELETE_BRANCH: { clientFields: ['name', 'remote'], serverFields: ['projectPath'] },
  GIT_STASH: { clientFields: ['action', 'message'], serverFields: ['projectPath'] },
  RUN_COMMAND: { clientFields: ['command'], serverFields: ['projectPath'] },
};

export type CommandAllowlist = Partial<Record<CommandType, FieldSpec>>;

export const FILE_COMMAND_ALLOWLIST: CommandAllowlist = FILE_COMMANDS;
export const GIT_COMMAND_ALLOWLIST: CommandAllowlist = GIT_COMMANDS;

export interface BuildCommandResult {
  ok: true;
  command: Record<string, unknown>;
}
export interface BuildCommandError {
  ok: false;
  status: number;
  error: string;
}

/**
 * Validate the request body against an allow-list and produce a sanitized
 * command payload. Unknown command types and unknown fields are rejected.
 */
export function buildAllowedCommand(
  body: unknown,
  allowlist: CommandAllowlist,
  serverContext: Record<string, unknown> = {},
): BuildCommandResult | BuildCommandError {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Body must be an object' };
  }
  const obj = body as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string' || !type) {
    return { ok: false, status: 400, error: 'Command type is required' };
  }

  const spec = allowlist[type as CommandType];
  if (!spec) {
    return { ok: false, status: 400, error: `Unsupported command type: ${type}` };
  }

  const sanitized: Record<string, unknown> = { type };
  for (const field of spec.clientFields) {
    if (field in obj) {
      sanitized[field] = obj[field];
    }
  }
  for (const field of spec.serverFields ?? []) {
    if (!(field in serverContext)) {
      return {
        ok: false,
        status: 500,
        error: `Server context missing required field: ${field}`,
      };
    }
    sanitized[field] = serverContext[field];
  }

  return { ok: true, command: sanitized };
}
