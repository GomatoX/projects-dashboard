import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ─── Devices ──────────────────────────────────────────────
//
// Auth token storage uses two columns:
//   - tokenHash:  SHA-256 of the raw token. Indexed, used for O(1) lookup
//                 on every Socket.io connection. Safe because raw tokens are
//                 high-entropy nanoid(32), so a fast hash is not vulnerable
//                 to brute force the way a user password would be.
//   - agentToken: legacy bcrypt hash. Kept for devices created before the
//                 tokenHash column existed; the auth middleware lazily
//                 backfills tokenHash on the first successful login.
//
// New devices get both. Once all rows have tokenHash populated, the bcrypt
// fallback path can be removed.
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    os: text('os', { enum: ['linux', 'darwin', 'windows'] }).notNull(),
    agentToken: text('agent_token').notNull(),
    tokenHash: text('token_hash'),
    localIp: text('local_ip').notNull().default(''),
    status: text('status', { enum: ['online', 'offline'] })
      .notNull()
      .default('offline'),
    lastSeen: integer('last_seen', { mode: 'timestamp' }),
    projectPaths: text('project_paths').notNull().default('[]'),
    capabilities: text('capabilities').notNull().default('[]'),
    // JSON-encoded ClaudePermissionConfig; NULL means "use defaults".
    // Per-device because policy depends on physical trust: a Mac on
    // your desk is not the same risk profile as a remote VPS, even
    // though both run the same agent binary.
    claudeConfig: text('claude_config'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('devices_token_hash_idx').on(t.tokenHash),
  }),
);

// ─── Projects ─────────────────────────────────────────────
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    type: text('type').notNull().default('node'),
    pm2Name: text('pm2_name'),
    github: text('github'),
    tags: text('tags').notNull().default('[]'),
    commands: text('commands').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Used by /api/projects leftJoin and by ON DELETE CASCADE from devices.
    deviceIdIdx: index('projects_device_id_idx').on(t.deviceId),
  }),
);

// ─── Project Memory ───────────────────────────────────────
export const projectMemory = sqliteTable('project_memory', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  systemPrompt: text('system_prompt').notNull().default(''),
  pinnedFiles: text('pinned_files').notNull().default('[]'),
  conventions: text('conventions').notNull().default(''),
  notes: text('notes').notNull().default(''),
  architecture: text('architecture').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PM2 Config ───────────────────────────────────────────
export const pm2Configs = sqliteTable(
  'pm2_configs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    processName: text('process_name').notNull(),
    rawEcosystem: text('raw_ecosystem').notNull().default(''),
    envVars: text('env_vars').notNull().default('{}'),
    lastModified: integer('last_modified', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Speeds up ON DELETE CASCADE when a project is deleted.
    projectIdIdx: index('pm2_configs_project_id_idx').on(t.projectId),
  }),
);

// ─── Git Settings ─────────────────────────────────────────
export const gitSettings = sqliteTable('git_settings', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  protectedBranches: text('protected_branches').notNull().default('["main","master"]'),
  autoFetchInterval: integer('auto_fetch_interval').notNull().default(5),
  signCommits: integer('sign_commits', { mode: 'boolean' }).notNull().default(false),
  aiCommitMessages: integer('ai_commit_messages', { mode: 'boolean' }).notNull().default(true),
  aiPreCommitReview: integer('ai_pre_commit_review', { mode: 'boolean' }).notNull().default(false),
  defaultPushBehavior: text('default_push_behavior', { enum: ['ask', 'auto-after-pull'] })
    .notNull()
    .default('ask'),
});

// ─── Chats ────────────────────────────────────────────────
export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New Chat'),
    model: text('model').notNull().default('claude-sonnet-4-20250514'),
    executionMode: text('execution_mode', { enum: ['local', 'remote'] })
      .notNull()
      .default('local'),
    totalTokensIn: integer('total_tokens_in').notNull().default(0),
    totalTokensOut: integer('total_tokens_out').notNull().default(0),
    estimatedCost: real('estimated_cost').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Compound index covers `WHERE project_id=? ORDER BY updated_at DESC`
    // used by GET /api/projects/[id]/chat. Plain ascending index is fine —
    // SQLite scans it in reverse for DESC sorts.
    projectIdUpdatedAtIdx: index('chats_project_id_updated_at_idx').on(t.projectId, t.updatedAt),
  }),
);

// ─── Chat Messages ────────────────────────────────────────
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull().default(''),
    toolUses: text('tool_uses').notNull().default('[]'),
    proposedChanges: text('proposed_changes').notNull().default('[]'),
    attachments: text('attachments').notNull().default('[]'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    executionMode: text('execution_mode', { enum: ['local', 'remote'] }),
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Compound index covers the hot path `WHERE chat_id=? ORDER BY timestamp ASC`
    // used by the message list and SSE stream routes, AND speeds up
    // ON DELETE CASCADE when a chat is deleted.
    chatIdTimestampIdx: index('chat_messages_chat_id_timestamp_idx').on(t.chatId, t.timestamp),
  }),
);

// ─── Pull Requests ────────────────────────────────────────
export const pullRequests = sqliteTable(
  'pull_requests',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    state: text('state').notNull().default('open'),
    aiSummary: text('ai_summary').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Speeds up cascade delete and per-project PR listing.
    projectIdIdx: index('pull_requests_project_id_idx').on(t.projectId),
  }),
);

// ─── Code Reviews ─────────────────────────────────────────
export const codeReviews = sqliteTable(
  'code_reviews',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    commitSha: text('commit_sha').notNull(),
    diff: text('diff').notNull().default(''),
    summary: text('summary').notNull().default(''),
    comments: text('comments').notNull().default('[]'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Speeds up cascade delete; commit_sha lookups are likely future workload.
    projectIdIdx: index('code_reviews_project_id_idx').on(t.projectId),
  }),
);

// ─── Skills ───────────────────────────────────────────────
//
// AI-powered prompt templates attached to a project. Unlike `commands`
// (shell exec via the agent), skills invoke Claude with a system prompt
// plus optional dynamically gathered context (e.g. `git diff`) and return
// the model's text result for the user to act on.
//
// `contextSource` controls what extra context is appended to the prompt
// before sending to Claude:
//   - 'none'             → just the system prompt (and optional user input)
//   - 'git_diff_staged'  → output of `git diff --staged`
//   - 'git_diff_branch'  → output of `git diff <base>...HEAD`
//   - 'git_status'       → output of `git status`
//
// `outputMode` is a UI hint for how the result should be presented:
//   - 'modal'     → show the raw text in a result modal (default)
//   - 'clipboard' → copy result to clipboard + toast
export const skills = sqliteTable(
  'skills',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon'),
    systemPrompt: text('system_prompt').notNull().default(''),
    contextSource: text('context_source', {
      enum: ['none', 'git_diff_staged', 'git_diff_branch', 'git_status'],
    })
      .notNull()
      .default('none'),
    model: text('model').notNull().default('claude-sonnet-4-20250514'),
    outputMode: text('output_mode', { enum: ['modal', 'clipboard'] })
      .notNull()
      .default('modal'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // Speeds up cascade delete and per-project skill listing.
    projectIdIdx: index('skills_project_id_idx').on(t.projectId),
  }),
);

// ─── Sound Settings ───────────────────────────────────────
export const soundSettings = sqliteTable('sound_settings', {
  userId: text('user_id').primaryKey(),
  masterVolume: real('master_volume').notNull().default(0.7),
  quietHoursStart: text('quiet_hours_start').default('22:00'),
  quietHoursEnd: text('quiet_hours_end').default('08:00'),
  events: text('events').notNull().default('{}'),
});
