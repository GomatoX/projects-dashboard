export type AgentCommand = {
    type: 'GET_SYSTEM_STATS';
    id: string;
} | {
    type: 'READ_FILE';
    id: string;
    path: string;
} | {
    type: 'WRITE_FILE';
    id: string;
    path: string;
    content: string;
} | {
    type: 'LIST_FILES';
    id: string;
    path: string;
    recursive: boolean;
} | {
    type: 'SEARCH_CODEBASE';
    id: string;
    projectPath: string;
    query: string;
} | {
    type: 'SCAN_PROJECTS';
    id: string;
    paths: string[];
} | {
    type: 'PM2_LIST';
    id: string;
} | {
    type: 'PM2_START';
    id: string;
    name: string;
} | {
    type: 'PM2_STOP';
    id: string;
    name: string;
} | {
    type: 'PM2_RESTART';
    id: string;
    name: string;
} | {
    type: 'PM2_DELETE';
    id: string;
    name: string;
} | {
    type: 'PM2_LOGS';
    id: string;
    name: string;
    lines: number;
} | {
    type: 'PM2_LOGS_STREAM_START';
    id: string;
    name: string;
} | {
    type: 'PM2_LOGS_STREAM_STOP';
    id: string;
    name: string;
} | {
    type: 'GIT_STATUS';
    id: string;
    projectPath: string;
} | {
    type: 'GIT_DIFF';
    id: string;
    projectPath: string;
    staged: boolean;
} | {
    type: 'GIT_DIFF_FILE';
    id: string;
    projectPath: string;
    path: string;
    mode: 'unstaged' | 'staged' | 'untracked';
} | {
    type: 'GIT_BRANCHES';
    id: string;
    projectPath: string;
} | {
    type: 'GIT_LOG';
    id: string;
    projectPath: string;
    limit: number;
} | {
    type: 'GIT_STAGE';
    id: string;
    projectPath: string;
    files: string[];
} | {
    type: 'GIT_UNSTAGE';
    id: string;
    projectPath: string;
    files: string[];
} | {
    type: 'GIT_COMMIT';
    id: string;
    projectPath: string;
    message: string;
    amend: boolean;
} | {
    type: 'GIT_PUSH';
    id: string;
    projectPath: string;
    force: boolean;
} | {
    type: 'GIT_PULL';
    id: string;
    projectPath: string;
} | {
    type: 'GIT_FETCH';
    id: string;
    projectPath: string;
} | {
    type: 'GIT_CHECKOUT';
    id: string;
    projectPath: string;
    branch: string;
} | {
    type: 'GIT_CREATE_BRANCH';
    id: string;
    projectPath: string;
    name: string;
    from: string;
} | {
    type: 'GIT_DELETE_BRANCH';
    id: string;
    projectPath: string;
    name: string;
    remote: boolean;
} | {
    type: 'GIT_STASH';
    id: string;
    projectPath: string;
    action: 'save' | 'pop' | 'apply' | 'drop';
    message?: string;
} | {
    type: 'RUN_COMMAND';
    id: string;
    projectPath: string;
    command: string;
} | {
    type: 'TERMINAL_SPAWN';
    id: string;
    sessionId: string;
    cwd: string;
    cols: number;
    rows: number;
    /**
     * Optional one-shot command. When set, the agent spawns the shell with
     * `-c <command>` so it runs the command and exits, instead of an
     * interactive shell. Output still flows through TERMINAL_OUTPUT/EXIT.
     */
    command?: string;
} | {
    type: 'TERMINAL_INPUT';
    id: string;
    sessionId: string;
    data: string;
} | {
    type: 'TERMINAL_RESIZE';
    id: string;
    sessionId: string;
    cols: number;
    rows: number;
} | {
    type: 'TERMINAL_KILL';
    id: string;
    sessionId: string;
} | {
    type: 'CLAUDE_QUERY';
    id: string;
    sessionId: string;
    projectPath: string;
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTurns?: number;
    claudePath?: string;
    permissions: ClaudePermissionConfig;
    /** When set, agent mounts the PM2 MCP scoped to this pm2Name. */
    pm2Name?: string;
    /**
     * When true (and the agent has Playwright installed), agent mounts
     * the Browser MCP. Default is `false` so older dashboards keep the
     * pre-MCP behavior. Tighter than always-on so a stale dashboard
     * never gets surprise tools.
     */
    enableBrowserMcp?: boolean;
    attachments?: ClaudeAttachment[];
    chatId?: string;
    projectId?: string;
} | {
    type: 'CLAUDE_CANCEL';
    id: string;
    sessionId: string;
} | {
    type: 'CLAUDE_PERMISSION_RESPONSE';
    id: string;
    sessionId: string;
    requestId: string;
    decision: 'allow' | 'deny';
} | {
    type: 'BROWSER_SNAPSHOT_REQUEST';
    id: string;
    chatId: string;
};
export type AgentEvent = {
    type: 'AGENT_HELLO';
    hostname: string;
    os: string;
    capabilities: string[];
    projects: DiscoveredProject[];
} | {
    type: 'SYSTEM_STATS';
    data: SystemStats;
} | {
    type: 'FILE_CONTENT';
    requestId: string;
    path: string;
    content: string;
} | {
    type: 'FILE_WRITTEN';
    requestId: string;
    path: string;
    success: boolean;
} | {
    type: 'FILE_LIST';
    requestId: string;
    path: string;
    entries: FileEntry[];
} | {
    type: 'SEARCH_RESULTS';
    requestId: string;
    results: SearchResult[];
} | {
    type: 'PROJECTS_DISCOVERED';
    requestId: string;
    projects: DiscoveredProject[];
} | {
    type: 'HEARTBEAT';
    timestamp: number;
    uptime: number;
} | {
    type: 'COMMAND_ERROR';
    requestId: string;
    message: string;
} | {
    type: 'PM2_LIST_RESULT';
    requestId: string;
    processes: PM2Process[];
} | {
    type: 'PM2_ACTION_RESULT';
    requestId: string;
    action: string;
    name: string;
    success: boolean;
    message?: string;
} | {
    type: 'PM2_LOGS_RESULT';
    requestId: string;
    name: string;
    logs: string;
} | {
    type: 'PM2_LOGS_DATA';
    name: string;
    data: string;
    source: 'stdout' | 'stderr';
} | {
    type: 'GIT_STATUS_RESULT';
    requestId: string;
    data: GitStatus;
} | {
    type: 'GIT_DIFF_RESULT';
    requestId: string;
    diff: string;
} | {
    type: 'GIT_DIFF_FILE_RESULT';
    requestId: string;
    path: string;
    original: string;
    modified: string;
    isNew: boolean;
    isDeleted: boolean;
} | {
    type: 'GIT_BRANCHES_RESULT';
    requestId: string;
    branches: GitBranch[];
} | {
    type: 'GIT_LOG_RESULT';
    requestId: string;
    entries: GitLogEntry[];
} | {
    type: 'GIT_ACTION_RESULT';
    requestId: string;
    action: string;
    success: boolean;
    message?: string;
} | {
    type: 'COMMAND_RESULT';
    requestId: string;
    output: string;
    exitCode?: number;
    durationMs?: number;
} | {
    type: 'TERMINAL_SPAWNED';
    requestId: string;
    sessionId: string;
} | {
    type: 'TERMINAL_OUTPUT';
    sessionId: string;
    data: string;
} | {
    type: 'TERMINAL_EXIT';
    sessionId: string;
    exitCode: number;
} | {
    type: 'CLAUDE_STARTED';
    sessionId: string;
    requestId: string;
    cwd: string;
    hostname: string;
} | {
    type: 'CLAUDE_TEXT';
    sessionId: string;
    text: string;
} | {
    type: 'CLAUDE_TOOL_USE';
    sessionId: string;
    toolUseId: string;
    toolName: string;
    input: Record<string, unknown>;
    status: 'auto' | 'started' | 'completed' | 'denied';
    result?: string;
} | {
    type: 'CLAUDE_PERMISSION_REQUEST';
    sessionId: string;
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    reason: string;
} | {
    type: 'CLAUDE_DONE';
    sessionId: string;
    requestId: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    durationMs: number;
} | {
    type: 'CLAUDE_ERROR';
    sessionId: string;
    requestId: string;
    message: string;
} | {
    type: 'BROWSER_CONTEXT_OPENED';
    chatId: string;
    sessionId: string;
    /** Initial URL the context was created at, or `'about:blank'`. */
    url: string;
} | {
    type: 'BROWSER_CONTEXT_CLOSED';
    chatId: string;
    /** 'idle' | 'evicted' | 'shutdown' | 'explicit' — for diagnostics only. */
    reason: 'idle' | 'evicted' | 'shutdown' | 'explicit';
} | {
    type: 'BROWSER_FRAME';
    chatId: string;
    sessionId: string;
    /** Base64-encoded JPEG bytes (no data: prefix). */
    frameB64: string;
    /** Wall-clock ms when the agent received the frame from CDP. */
    timestamp: number;
    /** Width/height of the JPEG in pixels (the agent caps these). */
    width: number;
    height: number;
    /** Current page URL — useful for the panel header. */
    url: string;
} | {
    type: 'BROWSER_SNAPSHOT_RESULT';
    requestId: string;
    /** Present iff a BrowserContext exists for the requested chat AND
     *  the page.screenshot call succeeded. */
    frame?: {
        /** Base64-encoded JPEG bytes (no data: prefix). */
        frameB64: string;
        width: number;
        height: number;
        url: string;
        /** Wall-clock ms when the snapshot was captured. */
        timestamp: number;
    };
    /** Set when no context exists for this chat, or the screenshot
     *  raised. Either way the dashboard should leave the panel in
     *  its "waiting for first frame" state. */
    error?: string;
};
export interface CommandResponse<T = unknown> {
    requestId: string;
    success: boolean;
    data?: T;
    error?: string;
}
export interface SystemStats {
    cpu: {
        usage: number;
        cores: number;
        model: string;
    };
    memory: {
        total: number;
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
    uptime: number;
    hostname: string;
    platform: string;
}
export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modified: string;
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
export type ProjectType = 'nextjs' | 'react' | 'node' | 'typescript' | 'python' | 'rust' | 'go' | 'php' | 'strapi' | 'other';
export interface PM2Process {
    pm_id: number;
    name: string;
    status: 'online' | 'stopping' | 'stopped' | 'errored' | 'launching' | 'one-launch-status';
    cpu: number;
    memory: number;
    pid: number;
    uptime: number;
    restarts: number;
    unstableRestarts: number;
    createdAt: number;
    exec_mode: 'fork' | 'cluster';
    node_version?: string;
    script?: string;
    cwd?: string;
    instances?: number;
}
export interface AgentAuth {
    token: string;
    hostname: string;
    os: string;
}
export interface ConnectedAgent {
    deviceId: string;
    socketId: string;
    hostname: string;
    os: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    systemStats?: SystemStats;
}
export interface GitFileChange {
    path: string;
    index: string;
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
    date: string;
    refs: string;
}
export type ClaudePermissionMode = 'bypass' | 'readOnly' | 'interactive';
/**
 * Attachment metadata sent with CLAUDE_QUERY to the device. The bytes
 * themselves stay on the dashboard's disk — the agent downloads them on
 * demand from `/api/projects/{projectId}/chat/{chatId}/attachments/{filename}`.
 *
 * `filename` is the on-disk name (nanoid-prefixed, safe for path joins);
 * `name` is the original user-facing name we surface in the prompt. The
 * `placeholder` is the literal token (`__ATTACHMENT_0__`, etc.) that the
 * agent must replace with the device-local absolute path before invoking
 * the SDK. Keeping the placeholder explicit here means the dashboard owns
 * the index/name pairing and the agent doesn't have to guess.
 */
export interface ClaudeAttachment {
    filename: string;
    name: string;
    type: string;
    placeholder: string;
}
export interface ClaudePermissionConfig {
    mode: ClaudePermissionMode;
    /** Tool names that auto-allow even in interactive mode. */
    autoAllowTools: string[];
    /** Substrings that, if present in a Bash command, force a deny. */
    denyPatterns: string[];
}
/**
 * Safe defaults for a freshly registered device. Interactive so the user
 * sees what Claude wants to do, with Read-family tools auto-allowed because
 * they're inert and prompting for every Read would make any non-trivial
 * task painful. Deny patterns block the obvious foot-guns.
 */
export declare const DEFAULT_CLAUDE_PERMISSIONS: ClaudePermissionConfig;
