// ─── Claude Agent SDK Tool Permission Mapping ─────────────────
// Maps SDK built-in tool names to their approval levels for our UI

export type ToolApprovalLevel = 'auto' | 'ask';

export interface ToolMeta {
  displayName: string;
  approvalLevel: ToolApprovalLevel;
  category: 'file' | 'search' | 'shell' | 'agent';
  icon: string; // Tabler icon name hint
}

/**
 * Permission mapping for Claude Agent SDK built-in tools.
 * 'auto' = executed without asking the user
 * 'ask'  = requires user approval via the permission callback
 */
export const TOOL_PERMISSIONS: Record<string, ToolMeta> = {
  // File — read-only (always auto)
  Read: { displayName: 'Read File', approvalLevel: 'auto', category: 'file', icon: 'file-text' },
  LS: { displayName: 'List Directory', approvalLevel: 'auto', category: 'file', icon: 'folder' },

  // File — write (auto for project editing)
  Write: { displayName: 'Write File', approvalLevel: 'auto', category: 'file', icon: 'pencil' },
  Edit: { displayName: 'Edit File', approvalLevel: 'auto', category: 'file', icon: 'file-diff' },
  MultiEdit: { displayName: 'Multi-Edit', approvalLevel: 'auto', category: 'file', icon: 'files' },
  NotebookEdit: { displayName: 'Edit Notebook', approvalLevel: 'auto', category: 'file', icon: 'file-diff' },

  // Search / read-only (always auto)
  Glob: { displayName: 'Find Files', approvalLevel: 'auto', category: 'search', icon: 'search' },
  Grep: { displayName: 'Search Content', approvalLevel: 'auto', category: 'search', icon: 'file-search' },
  WebSearch: { displayName: 'Web Search', approvalLevel: 'auto', category: 'search', icon: 'search' },

  // Shell — still needs approval (can run destructive commands)
  Bash: { displayName: 'Run Command', approvalLevel: 'ask', category: 'shell', icon: 'terminal' },

  // Agent / skill
  Task: { displayName: 'Sub-Agent', approvalLevel: 'ask', category: 'agent', icon: 'robot' },
  Skill: { displayName: 'Skill', approvalLevel: 'auto', category: 'agent', icon: 'robot' },

  // Todo
  TodoRead: { displayName: 'Read Todo', approvalLevel: 'auto', category: 'file', icon: 'file-text' },
  TodoWrite: { displayName: 'Update Todo', approvalLevel: 'auto', category: 'file', icon: 'pencil' },
};

/**
 * Check if a tool should auto-allow or needs user approval.
 */
export function shouldAutoAllow(toolName: string): boolean {
  const meta = TOOL_PERMISSIONS[toolName];
  return meta?.approvalLevel === 'auto';
}

/**
 * Get display info for a tool.
 */
export function getToolMeta(toolName: string): ToolMeta {
  return (
    TOOL_PERMISSIONS[toolName] ?? {
      displayName: toolName,
      approvalLevel: 'ask',
      category: 'shell',
      icon: 'tool',
    }
  );
}
