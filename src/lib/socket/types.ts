// ─── Dashboard → Agent Commands ───────────────────────────
export type AgentCommand =
  // System
  | { type: 'GET_SYSTEM_STATS'; id: string }

  // File operations
  | { type: 'READ_FILE'; id: string; path: string }
  | { type: 'WRITE_FILE'; id: string; path: string; content: string }
  | { type: 'LIST_FILES'; id: string; path: string; recursive: boolean }
  | { type: 'SEARCH_CODEBASE'; id: string; projectPath: string; query: string }

  // Project discovery
  | { type: 'SCAN_PROJECTS'; id: string; paths: string[] }

  // PM2 operations
  | { type: 'PM2_LIST'; id: string }
  | { type: 'PM2_START'; id: string; name: string }
  | { type: 'PM2_STOP'; id: string; name: string }
  | { type: 'PM2_RESTART'; id: string; name: string }
  | { type: 'PM2_DELETE'; id: string; name: string }
  | { type: 'PM2_LOGS'; id: string; name: string; lines: number }
  | { type: 'PM2_LOGS_STREAM_START'; id: string; name: string }
  | { type: 'PM2_LOGS_STREAM_STOP'; id: string; name: string }

  // Git operations
  | { type: 'GIT_STATUS'; id: string; projectPath: string }
  | { type: 'GIT_DIFF'; id: string; projectPath: string; staged: boolean }
  | { type: 'GIT_BRANCHES'; id: string; projectPath: string }
  | { type: 'GIT_LOG'; id: string; projectPath: string; limit: number }
  | { type: 'GIT_STAGE'; id: string; projectPath: string; files: string[] }
  | { type: 'GIT_UNSTAGE'; id: string; projectPath: string; files: string[] }
  | {
      type: 'GIT_COMMIT';
      id: string;
      projectPath: string;
      message: string;
      amend: boolean;
    }
  | { type: 'GIT_PUSH'; id: string; projectPath: string; force: boolean }
  | { type: 'GIT_PULL'; id: string; projectPath: string }
  | { type: 'GIT_FETCH'; id: string; projectPath: string }
  | { type: 'GIT_CHECKOUT'; id: string; projectPath: string; branch: string }
  | {
      type: 'GIT_CREATE_BRANCH';
      id: string;
      projectPath: string;
      name: string;
      from: string;
    }
  | {
      type: 'GIT_DELETE_BRANCH';
      id: string;
      projectPath: string;
      name: string;
      remote: boolean;
    }
  | {
      type: 'GIT_STASH';
      id: string;
      projectPath: string;
      action: 'save' | 'pop' | 'apply' | 'drop';
      message?: string;
    }
  | {
      type: 'RUN_COMMAND';
      id: string;
      projectPath: string;
      command: string;
    }

  // Terminal operations
  | {
      type: 'TERMINAL_SPAWN';
      id: string;
      sessionId: string;
      cwd: string;
      cols: number;
      rows: number;
    }
  | { type: 'TERMINAL_INPUT'; id: string; sessionId: string; data: string }
  | {
      type: 'TERMINAL_RESIZE';
      id: string;
      sessionId: string;
      cols: number;
      rows: number;
    }
  | { type: 'TERMINAL_KILL'; id: string; sessionId: string };

// ─── Agent → Dashboard Events ─────────────────────────────
export type AgentEvent =
  | {
      type: 'AGENT_HELLO';
      hostname: string;
      os: string;
      capabilities: string[];
      projects: DiscoveredProject[];
    }
  | { type: 'SYSTEM_STATS'; data: SystemStats }
  | { type: 'FILE_CONTENT'; requestId: string; path: string; content: string }
  | { type: 'FILE_WRITTEN'; requestId: string; path: string; success: boolean }
  | { type: 'FILE_LIST'; requestId: string; path: string; entries: FileEntry[] }
  | { type: 'SEARCH_RESULTS'; requestId: string; results: SearchResult[] }
  | {
      type: 'PROJECTS_DISCOVERED';
      requestId: string;
      projects: DiscoveredProject[];
    }
  | { type: 'HEARTBEAT'; timestamp: number; uptime: number }
  | { type: 'COMMAND_ERROR'; requestId: string; message: string }

  // PM2 events
  | { type: 'PM2_LIST_RESULT'; requestId: string; processes: PM2Process[] }
  | {
      type: 'PM2_ACTION_RESULT';
      requestId: string;
      action: string;
      name: string;
      success: boolean;
      message?: string;
    }
  | { type: 'PM2_LOGS_RESULT'; requestId: string; name: string; logs: string }
  | { type: 'PM2_LOGS_DATA'; name: string; data: string; source: 'stdout' | 'stderr' }

  // Git events
  | { type: 'GIT_STATUS_RESULT'; requestId: string; data: GitStatus }
  | { type: 'GIT_DIFF_RESULT'; requestId: string; diff: string }
  | { type: 'GIT_BRANCHES_RESULT'; requestId: string; branches: GitBranch[] }
  | { type: 'GIT_LOG_RESULT'; requestId: string; entries: GitLogEntry[] }
  | {
      type: 'GIT_ACTION_RESULT';
      requestId: string;
      action: string;
      success: boolean;
      message?: string;
    }
  | { type: 'COMMAND_RESULT'; requestId: string; output: string }

  // Terminal events
  | { type: 'TERMINAL_SPAWNED'; requestId: string; sessionId: string }
  | { type: 'TERMINAL_OUTPUT'; sessionId: string; data: string }
  | { type: 'TERMINAL_EXIT'; sessionId: string; exitCode: number };

// ─── Response wrapper (for command → response flow) ───────
export interface CommandResponse<T = unknown> {
  requestId: string;
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Data Types ───────────────────────────────────────────
export interface SystemStats {
  cpu: {
    usage: number; // 0-100
    cores: number;
    model: string;
  };
  memory: {
    total: number; // bytes
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number; // seconds
  hostname: string;
  platform: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string; // ISO date
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
}

export interface DiscoveredProject {
  name: string;
  path: string;
  type: ProjectType;
  hasGit: boolean;
  pm2Name?: string;
  detectedFramework?: string;
}

export type ProjectType =
  | 'nextjs'
  | 'react'
  | 'node'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'php'
  | 'strapi'
  | 'other';

// ─── PM2 Process ──────────────────────────────────────────
export interface PM2Process {
  pm_id: number;
  name: string;
  status: 'online' | 'stopping' | 'stopped' | 'errored' | 'launching' | 'one-launch-status';
  cpu: number; // percentage
  memory: number; // bytes
  pid: number;
  uptime: number; // ms since start
  restarts: number;
  unstableRestarts: number;
  createdAt: number; // timestamp
  exec_mode: 'fork' | 'cluster';
  node_version?: string;
  script?: string;
  cwd?: string;
  instances?: number;
}

// ─── Socket.io Auth Handshake ─────────────────────────────
export interface AgentAuth {
  token: string;
  hostname: string;
  os: string;
}

// ─── Connected Agent Info ─────────────────────────────────
export interface ConnectedAgent {
  deviceId: string;
  socketId: string;
  hostname: string;
  os: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  systemStats?: SystemStats;
}

// ─── Git Types ────────────────────────────────────────────
export interface GitFileChange {
  path: string;
  index: string; // status character (M, A, D, ?, etc.)
  working_dir: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
  isClean: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  remote?: string;
}

export interface GitLogEntry {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  date: string; // ISO
  refs: string;
}
