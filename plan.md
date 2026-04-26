# Dev Dashboard

## Tikslas

Vienas web-based dashboard'as projektams valdyti per visus device'us, su pilnu git/PM2/file valdymu, AI chat ir mobile prieiga. Pakeičia chaos'ą, kai dirbi 8-10 projektų skirtingose vietose.

## Tinklo architektūra

```
Cloudflare Tunnel (https://dashboard.household.lt)
                ↓
        Tu (laptop, telefonas)
                ↓
                ↓ HTTPS + Cloudflare Access (auth)
                ↓
┌───────────────────────────────────────────────┐
│  Local network (192.168.1.x)                  │
│                                                │
│  ┌─────────────────────────────────────────┐ │
│  │  Dashboard (192.168.1.218)              │ │
│  │  - Next.js app                           │ │
│  │  - Built-in agent (server projects)     │ │
│  │  - SQLite DB                             │ │
│  └─────────────────────────────────────────┘ │
│              ↓ WebSocket (LAN only)           │
│  ┌─────────────────────────────────────────┐ │
│  │  Mac agent (192.168.1.x)                │ │
│  │  - Node.js daemon                        │ │
│  │  - launchd autostart                     │ │
│  └─────────────────────────────────────────┘ │
│                                                │
│  + External APIs (per dashboard server):      │
│  - Anthropic API                              │
│  - GitHub API                                 │
│  - ElevenLabs API                             │
└───────────────────────────────────────────────┘
```

**Saugumas:**

- Dashboard ir agent'ai bendrauja TIK lokaliai (LAN)
- Cloudflare Tunnel - vienintelis kelias iš išorės į dashboard'ą
- Cloudflare Access policy - tik tu prieini (Google login arba email whitelist)
- Agent'ai naudoja unique token'us, hashed SQLite'e

## Tech Stack (2026 balandis)

**Frontend:**

- Next.js 16.2 (App Router, Turbopack, React 19)
- Mantine 9.1 (core, hooks, form, notifications, modals, spotlight, code-highlight, tiptap)
- @monaco-editor/react 4.7+ (kodui ir diff'ams)
- @xterm/xterm + addon-fit (terminal)
- react-arborist (file tree)
- react-markdown + rehype-highlight (chat)
- recharts (memory/CPU graphs)

**Backend:**

- Next.js API routes + Server Actions
- Socket.io v4 (real-time)
- drizzle-orm + @libsql/client
- @anthropic-ai/sdk (su vision support)
- octokit (GitHub)
- node-pty (terminal)
- simple-git (git operations)
- pm2 (programmatic API)

**Agent (atskiras package):**

- Node.js 22 LTS + TypeScript
- ws (WebSocket client)
- chokidar v4 (file watching)
- pm2 (programmatic)
- systeminformation (CPU/RAM/disk)
- simple-git (git operations)

**External services:**

- Anthropic API (chat, vision, code review)
- ElevenLabs Sound Effects API (sound generation - phase 2)
- GitHub API (PRs, webhooks)

**Infrastructure:**

- Tailscale (alternatyvus access, jei Cloudflare nepatiks)
- Cloudflare Tunnel (default access from outside)
- PM2 (dashboard deployment)
- Caddy (reverse proxy on dashboard server)

## FEATURES

### 1. Projektų sąrašas

- Visi projektai vienoje vietoje
- Real-time PM2 status, git status, PR count
- Filtravimas, search, tags
- Per-device grupavimas

### 2. AI Chat su projektu

**Pagrindinis darbo įrankis.**

- Per Anthropic API su streaming
- Tool use su approval framework
- Image paste support (vision API)
- Per-project chats su istorija
- Cost tracking
- Markdown rendering su code blocks

**Image paste:**

- User cmd+v chat input'e → preview
- Image saugoma: `/data/uploads/chats/{chatId}/{imageId}.png`
- DB saugo: `{ messageId, imagePath, mimeType }`
- Send → Anthropic API gauna base64 + tekstą
- Limit: 10MB per image, types: png/jpg/jpeg/webp/gif

### 3. Project Memory (AI context)

**Atskiras "Memory" tab'as projekto detail view'e.**

Per projektą:

- **System prompt** - bazinis kontekstas Claude'ui
- **Pinned files** - visada include'inami (pvz. README, schema.sql)
- **Conventions** - coding style, patterns (Tiptap rich text)
- **Notes** - tavo paties pastabos
- **Architecture overview** - high-level dokumentacija

Auto-include į kiekvieną naują chat'ą + token counter rodo, kiek konteksto sunaudota.

### 4. PM2 Built-in valdymas

**Du režimai:**

**Basic UI:**

- Status, uptime, restarts
- CPU/Memory live charts (recharts, paskutinė 1h)
- Configuration form'a: script, cwd, instances, max_memory_restart, watch, autorestart
- Environment variables management su encrypted storage
- Actions: Restart, Reload, Stop, Delete
- Live logs streaming per WebSocket
- Crash detection → notification + sound

**Advanced raw mode:**

- Pilnas `ecosystem.config.js` redagavimas Monaco Editor'iuje
- Save & Reload veiksmas
- Multi-process per projektą support

**System memory monitoring (device-level):**

- Per device overview: CPU, RAM, Disk
- 24h history charts
- Alerts kai per daug

### 5. PILNAS Git valdymas ⭐ NAUJAS

**Branch valdymas:**

- List local + remote branches
- Create branch (iš current arba any other)
- Switch branch (su uncommitted changes warning)
- Delete branch (local + remote, su confirmation)
- Rename branch
- Merge į current
- Rebase
- Cherry-pick commit'us
- Reset branch to commit (su confirmation)

**Commit valdymas:**

- Stage/unstage files
- Stage/unstage hunks (kaip GitHub Desktop)
- Discard changes
- Commit message UI:
  - Multi-line input
  - Conventional commits validation (optional)
  - **AI-generated message** mygtukas
  - Sign commit (GPG) toggle
  - Amend last commit toggle
- Commit & Push vienu paspaudimu
- Per-file diff peržiūra Monaco DiffEditor'iuje

**Push/Pull/Fetch:**

- Push su force-push protection
- Pull su conflict detection
- Auto-fetch background per X minutes
- Status: ahead/behind tracking

**Commit history:**

- Visual graph view
- Per commit: View diff, Cherry-pick, Revert, Reset to here
- Filter pagal author, date, message
- Search per commit messages

**Stash management:**

- List stashes
- Create stash su pavadinimu
- Apply / Pop / Drop
- Show stash diff

**AI integracijos:**

- **Commit message generation** iš diff'o
- **Branch name suggestions** iš task aprašymo
- **PR description generation** iš commits + diff
- **Conflict resolution helper** - AI siūlo strategy
- **Pre-commit review** - AI peržiūri staged changes prieš commit

**Saugumo lygiai:**

| Veiksmas                                         | Lygis           |
| ------------------------------------------------ | --------------- |
| `git status`, `git log`, `git diff`, `git fetch` | Auto            |
| Stage/unstage                                    | Auto            |
| Switch branch (clean)                            | Auto            |
| Commit                                           | Ask             |
| Push (normal)                                    | Ask             |
| Pull (potential conflicts)                       | Ask             |
| Switch branch (uncommitted)                      | Ask             |
| Discard changes                                  | Ask             |
| Delete local branch                              | Ask             |
| `git push --force`                               | Ask + confirm   |
| `git reset --hard`                               | Ask + confirm   |
| Delete remote branch                             | Ask + confirm   |
| Force push į protected branches                  | Never (blocked) |
| Reset --hard su uncommitted                      | Never (blocked) |

**Per-project git settings:**

```typescript
interface GitSettings {
  projectId: string;
  protectedBranches: string[]; // ["main", "master", "develop"]
  autoFetchInterval: number; // minutes, 0 = disabled
  signCommits: boolean;
  aiCommitMessages: boolean;
  aiPreCommitReview: boolean;
  defaultPushBehavior: "ask" | "auto-after-pull";
}
```

### 6. GitHub PR review

- AI summary kiekvienam PR'ui
- Auto code review po push'o (per webhook arba polling)
- PR list su statusais
- Approve/comment per dashboard (arba "Open in GitHub")

### 7. Code editor (Monaco)

- File tree (react-arborist)
- Multi-tab editing
- Save through agent
- Syntax highlighting visoms kalboms
- "Ask AI about this" su selection

### 8. Web terminal

- xterm.js + node-pty
- Per projektą sesija
- Mobile keyboard helpers

### 9. Sound feedback

**Phase 1:** Default sound pack (8 garsų iš Pixabay)
**Phase 2:** ElevenLabs AI generation

**Events:**

- `ai.response.complete`
- `ai.tool.requires_approval`
- `ai.tool.approved`
- `pm2.crash`
- `pm2.restart`
- `git.commit.created`
- `git.push.success`
- `build.failure`
- `pr.new`

Settings: master volume, quiet hours, per-event toggle, AI regeneration.

### 10. Multi-device + Mobile/PWA

## AGENT INSTALL SCRIPTS ⭐ NAUJAS

### Architektūra

```
Dashboard generuoja unique token per device
         ↓
Tu paleidi install script'ą Mac/Linux mašinoje
         ↓
Script'as: clone agent repo, install deps, setup autostart
         ↓
Agent prisijungia per WebSocket į dashboard
         ↓
Auto-discovery projektų iš nurodytų paths
         ↓
Dashboard rodo "Connected" + naujus projektus
```

### Server agent install (`install-agent-linux.sh`)

```bash
#!/bin/bash
set -e

INSTALL_DIR="$HOME/.dev-dashboard-agent"
DASHBOARD_URL="${1:-http://192.168.1.218:3000}"
AGENT_TOKEN="${2}"

if [ -z "$AGENT_TOKEN" ]; then
  echo "Usage: ./install-agent-linux.sh <dashboard_url> <agent_token>"
  echo "Get token: Dashboard → Settings → Devices → Add Device"
  exit 1
fi

# Dependencies check
command -v node >/dev/null || { echo "Install Node.js 22+ first"; exit 1; }
command -v pnpm >/dev/null || npm install -g pnpm

# Clone & install
git clone https://github.com/yourname/dev-dashboard-agent "$INSTALL_DIR"
cd "$INSTALL_DIR"
pnpm install
pnpm build

# Config
cat > .env <<EOF
DASHBOARD_URL=$DASHBOARD_URL
AGENT_TOKEN=$AGENT_TOKEN
AGENT_NAME=$(hostname)
AGENT_PORT=3939
PROJECT_PATHS=$HOME/projects
EOF

# Systemd service
sudo tee /etc/systemd/system/dev-dashboard-agent.service > /dev/null <<EOF
[Unit]
Description=Dev Dashboard Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:$INSTALL_DIR/agent.log
StandardError=append:$INSTALL_DIR/agent.error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dev-dashboard-agent
sudo systemctl start dev-dashboard-agent

echo "✓ Agent installed and running"
echo "Status: sudo systemctl status dev-dashboard-agent"
echo "Logs: $INSTALL_DIR/agent.log"
```

### Mac agent install (`install-agent-mac.sh`)

```bash
#!/bin/bash
set -e

INSTALL_DIR="$HOME/.dev-dashboard-agent"
DASHBOARD_URL="${1}"
AGENT_TOKEN="${2}"

if [ -z "$AGENT_TOKEN" ] || [ -z "$DASHBOARD_URL" ]; then
  echo "Usage: ./install-agent-mac.sh <dashboard_url> <agent_token>"
  exit 1
fi

# Dependencies
command -v node >/dev/null || { echo "Install Node.js 22+ (brew install node)"; exit 1; }
command -v pnpm >/dev/null || npm install -g pnpm

# Clone & install
git clone https://github.com/yourname/dev-dashboard-agent "$INSTALL_DIR"
cd "$INSTALL_DIR"
pnpm install && pnpm build

# Config
cat > .env <<EOF
DASHBOARD_URL=$DASHBOARD_URL
AGENT_TOKEN=$AGENT_TOKEN
AGENT_NAME=$(scutil --get ComputerName)
AGENT_PORT=3939
PROJECT_PATHS=$HOME/projects
EOF

# launchd plist
PLIST="$HOME/Library/LaunchAgents/com.devdashboard.agent.plist"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.devdashboard.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>$INSTALL_DIR/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/agent.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/agent.error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Agent installed and running"
echo "Logs: tail -f $INSTALL_DIR/agent.log"
echo "Stop: launchctl unload $PLIST"
echo "Uninstall: ~/.dev-dashboard-agent/uninstall.sh"
```

### Dashboard "Add Device" UI

```
┌──────────────────────────────────────────┐
│ Add Device                                │
├──────────────────────────────────────────┤
│ OS: ( ) Linux  (●) macOS  ( ) Windows    │
│                                           │
│ Run this on your Mac:                    │
│ ┌──────────────────────────────────────┐ │
│ │ curl -fsSL                           │ │
│ │   http://192.168.1.218:3000/install  │ │
│ │   /mac | bash -s -- \                 │ │
│ │   http://192.168.1.218:3000 \        │ │
│ │   abc123-token-xyz-789               │ │
│ └──────────────────────────────────────┘ │
│ [📋 Copy command]                         │
│                                           │
│ ⏳ Waiting for agent to connect...        │
│                                           │
│ Token expires in 10 minutes              │
└──────────────────────────────────────────┘
```

Po sėkmingo prisijungimo:

```
✓ Connected: macbook-pro.local
  Found 7 projects in ~/projects

  [Review and add projects]
```

### Auto-discovery flow

Agent po starto:

```typescript
1. Skaito PROJECT_PATHS iš .env
2. Per kiekvieną path - skenuoja subdirectories
3. Per kiekvieną dir - tikrina:
   - .git folder existence
   - package.json (Node/Next/React)
   - requirements.txt (Python)
   - Cargo.toml (Rust)
   - composer.json (PHP)
   - PM2 ecosystem name
4. Siunčia "AGENT_HELLO" su projektų sąrašu
5. Dashboard rodo "Found 7 projects" - tu patvirtini kuriuos pridėti
```

### Uninstall scripts

`uninstall-agent-linux.sh`:

```bash
sudo systemctl stop dev-dashboard-agent
sudo systemctl disable dev-dashboard-agent
sudo rm /etc/systemd/system/dev-dashboard-agent.service
rm -rf $HOME/.dev-dashboard-agent
echo "✓ Agent uninstalled"
```

`uninstall-agent-mac.sh`:

```bash
launchctl unload ~/Library/LaunchAgents/com.devdashboard.agent.plist
rm ~/Library/LaunchAgents/com.devdashboard.agent.plist
rm -rf ~/.dev-dashboard-agent
echo "✓ Agent uninstalled"
```

## DB Schema (atnaujinta)

```typescript
interface Device {
  id: string;
  name: string; // hostname
  os: "linux" | "darwin" | "windows";
  agentToken: string; // hashed
  localIp: string; // LAN IP
  status: "online" | "offline";
  lastSeen: Date;
  projectPaths: string; // JSON: ["/home/user/projects"]
  capabilities: string; // JSON: ["pm2", "docker", "node"]
  createdAt: Date;
}

interface Project {
  id: string;
  name: string;
  deviceId: string;
  path: string;
  type: string; // nextjs, strapi, node, python
  pm2Name?: string;
  github?: string; // JSON: {owner, repo, defaultBranch}
  tags: string; // JSON
  createdAt: Date;
}

interface ProjectMemory {
  projectId: string;
  systemPrompt: string;
  pinnedFiles: string; // JSON
  conventions: string;
  notes: string;
  architecture: string;
  updatedAt: Date;
}

interface PM2Config {
  projectId: string;
  processName: string;
  rawEcosystem: string;
  envVars: string; // JSON, encrypted
  lastModified: Date;
}

interface GitSettings {
  projectId: string;
  protectedBranches: string; // JSON
  autoFetchInterval: number;
  signCommits: boolean;
  aiCommitMessages: boolean;
  aiPreCommitReview: boolean;
  defaultPushBehavior: string;
}

interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
  totalTokensIn: number;
  totalTokensOut: number;
  estimatedCost: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  toolUses: string; // JSON
  proposedChanges: string; // JSON
  attachments: string; // JSON: [{type: 'image', path: '...'}]
  tokensIn?: number;
  tokensOut?: number;
  timestamp: Date;
}

interface PullRequest {
  id: number;
  projectId: string;
  number: number;
  title: string;
  state: string;
  aiSummary: string; // JSON
  createdAt: Date;
}

interface CodeReview {
  id: string;
  projectId: string;
  commitSha: string;
  diff: string;
  summary: string;
  comments: string; // JSON
  reviewedAt: Date;
}

interface SoundSettings {
  userId: string;
  masterVolume: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  events: string; // JSON
}
```

## Agent WebSocket protokolas

```typescript
// Dashboard → Agent
type Command =
  // System
  | { type: "GET_SYSTEM_STATS" }

  // File ops
  | { type: "READ_FILE"; path: string }
  | { type: "WRITE_FILE"; path: string; content: string }
  | { type: "LIST_FILES"; path: string; recursive: boolean }
  | { type: "SEARCH_CODEBASE"; projectPath: string; query: string }

  // Git ops
  | { type: "GIT_STATUS"; projectPath: string }
  | { type: "GIT_DIFF"; projectPath: string; staged: boolean }
  | { type: "GIT_BRANCHES"; projectPath: string }
  | { type: "GIT_LOG"; projectPath: string; limit: number }
  | { type: "GIT_STAGE"; projectPath: string; files: string[] }
  | { type: "GIT_UNSTAGE"; projectPath: string; files: string[] }
  | { type: "GIT_COMMIT"; projectPath: string; message: string; amend: boolean }
  | { type: "GIT_PUSH"; projectPath: string; force: boolean }
  | { type: "GIT_PULL"; projectPath: string }
  | { type: "GIT_FETCH"; projectPath: string }
  | { type: "GIT_CHECKOUT"; projectPath: string; branch: string }
  | {
      type: "GIT_CREATE_BRANCH";
      projectPath: string;
      name: string;
      from: string;
    }
  | {
      type: "GIT_DELETE_BRANCH";
      projectPath: string;
      name: string;
      remote: boolean;
    }
  | { type: "GIT_MERGE"; projectPath: string; branch: string }
  | {
      type: "GIT_STASH";
      projectPath: string;
      action: "save" | "pop" | "apply" | "drop";
    }

  // PM2 ops
  | { type: "PM2_LIST" }
  | { type: "PM2_RESTART"; name: string }
  | { type: "PM2_STOP"; name: string }
  | { type: "PM2_START"; name: string }
  | { type: "PM2_DELETE"; name: string }
  | { type: "PM2_LOGS"; name: string; lines: number }
  | { type: "PM2_LOGS_STREAM_START"; name: string }
  | { type: "PM2_LOGS_STREAM_STOP"; name: string }

  // Terminal
  | { type: "TERMINAL_OPEN"; cwd: string; sessionId: string }
  | { type: "TERMINAL_INPUT"; sessionId: string; data: string }
  | { type: "TERMINAL_CLOSE"; sessionId: string }

  // Project discovery
  | { type: "SCAN_PROJECTS"; paths: string[] };

// Agent → Dashboard
type Event =
  | {
      type: "AGENT_HELLO";
      hostname: string;
      os: string;
      capabilities: string[];
      projects: ProjectScan[];
    }
  | { type: "SYSTEM_STATS"; cpu: any; memory: any; disk: any }
  | { type: "FILE_CONTENT"; path: string; content: string }
  | { type: "GIT_STATUS_RESULT"; data: GitStatus }
  | { type: "GIT_DIFF_RESULT"; diff: string }
  | { type: "PM2_LIST_RESULT"; processes: PM2Process[] }
  | { type: "PM2_LOGS_DATA"; name: string; data: string }
  | { type: "TERMINAL_OUTPUT"; sessionId: string; data: string }
  | { type: "HEARTBEAT"; timestamp: number }
  | { type: "ERROR"; commandId: string; message: string };
```

## Roadmap (galutinis, su agent install ir git)

**Sprint 1: Foundation** (~15-20h)

- Next.js 16.2 + Mantine 9 + libsql + Drizzle
- Layout: AppShell (sidebar + main + aside)
- Projects/Devices CRUD
- better-auth (single user)

**Sprint 2: Local agent core** (~20-25h)

- Agent package (atskiras repo)
- WebSocket protokolas
- File ops (read/write/list/search)
- System stats (systeminformation)
- Heartbeat ir reconnect logic

**Sprint 2.5: Agent install scripts** ⭐ (~5-8h)

- `install-agent-linux.sh`
- `install-agent-mac.sh`
- Uninstall scripts
- Dashboard "Add Device" UI
- Token generation + validation
- Auto project discovery
- "Found projects" review UI

**Sprint 3: PM2 valdymas** (~15-20h)

- Basic PM2 UI (start/stop/restart/logs)
- Memory/CPU charts (recharts)
- Env vars management su encryption
- Advanced raw editor (Monaco)
- Live logs streaming

**Sprint 4: Code editor + File ops** (~15h)

- Monaco + react-arborist
- Multi-tab editing
- Save through agent

**Sprint 4.5: Git valdymas** ⭐ (~20-25h)

- Branch list/create/switch/delete
- Stage/unstage/commit UI
- Diff peržiūra Monaco DiffEditor
- Push/pull/fetch
- History view su graph
- Stash management
- Saugumo limit'ai
- AI commit message generation
- Pre-commit AI review (optional per project)

**Sprint 5: AI Chat (core)** (~20h)

- Anthropic SDK + streaming
- Chat persistence
- Per-project chats
- Markdown rendering
- Image paste + vision
- Default sound pack + settings

**Sprint 6: Project Memory** (~10h)

- Memory tab UI
- Tiptap rich text editor
- Pinned files management
- Auto-include in chats
- Token counting

**Sprint 7: Tool use + approvals** (~15h)

- Tool use protocol
- Approval modals
- Proposed changes su Monaco DiffEditor
- Apply/reject + audit log
- Sound triggers

**Sprint 8: GitHub integration + AI sounds** (~15h)

- Octokit
- PR list + AI summaries
- Auto code review (webhook arba polling)
- ElevenLabs sound generation
- AI sound regeneration UI

**Sprint 9: Terminal + Claude sessions sync** (~10h)

- xterm.js + node-pty
- Sessions read iš `~/.claude/projects/`
- Resume in terminal

**Sprint 10: Mobile/PWA + polish** (~15h)

- PWA manifest + service worker
- Mobile layout adjustments
- Touch optimizations
- Cloudflare Tunnel setup docs
- Final testing su Mac agent

## Saugumo aspektai

**Encryption at rest:**

- Env vars - encrypted prieš saugant
- API keys (Anthropic, GitHub, ElevenLabs) - encrypted
- Agent tokens - hashed (bcrypt)
- Encryption key - device's keyring

**Cloudflare Tunnel + Access:**

- Tunnel be public IP exposure
- Access policy: tik tavo email
- Multi-factor auth rekomenduojama

**Agent saugumas:**

- Klausosi tik LAN IP, ne 0.0.0.0
- Token validation kiekvienam connection'ui
- Rate limiting per command type
- Audit log visiems destructive actions

**Approval framework (visiems):**

- Read ops: auto
- Write ops: ask
- Destructive ops: ask + confirm
- Force ops: never auto
- Protected branches: never force push

## Kaštai (atnaujinta)

**Mėnesiniai:**

- Anthropic API: $50-150 (vision didina)
- ElevenLabs: $5 (Sound Effects starter)
- Cloudflare Tunnel: $0 (free tier)
- Tailscale: $0 (jei naudosi backup'ui)
- Hosting: $0

**Total: ~$55-155/mėn**

## Pirmas žingsnis

```bash
# Ant tavo serverio (192.168.1.218)
ssh user@192.168.1.218
cd ~/projects
mkdir dev-dashboard && cd dev-dashboard

# Next.js 16.2
pnpm create next-app@latest . --typescript --app --turbopack --no-eslint

# Mantine 9 ekosistema
pnpm add @mantine/core@^9 @mantine/hooks@^9 @mantine/form@^9 \
  @mantine/notifications@^9 @mantine/modals@^9 \
  @mantine/spotlight@^9 @mantine/code-highlight@^9 \
  @mantine/tiptap@^9

# DB
pnpm add drizzle-orm @libsql/client
pnpm add -D drizzle-kit

# Editor + terminal + visualization
pnpm add @monaco-editor/react@^4.7
pnpm add @xterm/xterm @xterm/addon-fit
pnpm add react-arborist recharts

# Backend services
pnpm add better-auth @anthropic-ai/sdk octokit simple-git pm2
pnpm add socket.io socket.io-client systeminformation
pnpm add bcrypt  # token hashing

# Markdown + Tiptap
pnpm add react-markdown rehype-highlight

# Setup directories
mkdir -p data/uploads/chats data/uploads/memory
mkdir -p public/sounds
mkdir -p scripts/install  # bash scripts agent'ams

# Atskirai - Agent repo
cd ~/projects
mkdir dev-dashboard-agent && cd dev-dashboard-agent
pnpm init
pnpm add ws chokidar pm2 simple-git systeminformation
pnpm add -D typescript @types/node tsx
```

## Versijų santrauka

| Tool                 | Versija       | Status         |
| -------------------- | ------------- | -------------- |
| Next.js              | 16.2          | stable         |
| React                | 19.x          | stable         |
| Mantine              | 9.1           | stable         |
| Drizzle ORM          | latest stable | v1.0 RC artėja |
| @libsql/client       | latest        | stable         |
| @monaco-editor/react | 4.7+          | React 19 ready |
| Node.js              | 22 LTS        | stable         |
| TypeScript           | 5.8+          | stable         |
| better-auth          | latest        | stable         |

## Vertinimo kriterijai

**Verta statyti, jei:**

- Per 5-6 mėn turiu darbinę v1 (Sprint 1-7)
- Naudoju kasdien
- Sutaupo daugiau laiko nei užtruko statyti

**Investicija:** ~290-310 val (~5-7 mėn savaitgaliais)
**Sutaupymas:** ~50-60 min/diena
**Per metus:** ~250-300 val sutaupyta
**ROI:** pirmais metais teigiamas, jei dabar tikrai chaos'as

**Stop conditions:**

- Po Sprint 3 (PM2 + foundation) - jei nesinaudoji daugiau nei savaitę → stop
- Po Sprint 5 (AI chat) - jei naudoji rečiau nei kasdien → reconsider
- Bet kuriuo metu - jei pajunti, kad statybos chaos'as didesnis nei pradinis problem'as → stop

## MVP'as (jei mažiau laiko)

**Mažiausia naudinga versija** (~80h, 2 mėn):

Sprint 1 + 2 + 2.5 + 3 + 4.5 + 5 (be tool use)

Tai duoda:

- Multi-device projektų sąrašą
- Pilną PM2 valdymą
- Pilną Git valdymą
- Basic AI chat (be tool use)
- Mobile prieiga

Visa kita - vėliau, kai pamatysi, kad realiai naudoji.
