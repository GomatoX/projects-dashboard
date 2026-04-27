# Projects Dashboard

Asmeninis multi-device dev dashboard'as: vienas web UI projektams valdyti per visas mano mašinas (PM2, git, AI chat, terminal, file ops). Pakeičia chaosą, kai dirbi 8–10 projektų skirtinguose host'uose.

> Pilnas projekto vizijos aprašymas — žr. [`plan.md`](./plan.md).

## Architektūra

Dvi atskiros runtime'os tame pačiame repo:

```
┌──────────────────────────────────────────────────────┐
│  Dashboard (Next.js 16 + Socket.io)                  │
│  Sukasi vienoje vietoje (Linux server)               │
│   - UI, DB (libsql/SQLite), Anthropic / GitHub API   │
│   - Socket.io serveris ant /api/ws                   │
└──────────────────────────────────────────────────────┘
                       ▲ WebSocket (LAN only)
                       │ token-auth (sha256 + bcrypt fallback)
       ┌───────────────┴───────────────┐
       │                               │
┌──────────────┐               ┌──────────────┐
│ Linux agent  │               │  Mac agent   │
│ (systemd)    │               │  (launchd)   │
│ ~/projects   │               │  ~/projects  │
└──────────────┘               └──────────────┘
```

- **`/` (dashboard)** — Next.js app + custom `server.mts`, kuris pridada Socket.io ant to paties HTTP serverio.
- **`/agent`** — atskiras Node.js daemon, jungiasi prie dashboard'o `agent token`'u; vykdo PM2/git/file/terminal komandas lokaliai.
- **DB** — libsql (`./data/dashboard.db`) + Drizzle ORM. Migracijos `./drizzle/`.

## Migration plan: Mac → Linux server

Šiuo metu visa veikia ant Mac'o. Tikslas — dashboard'ą perkelti į Linux server'į (LAN), o Mac palikti kaip vieną iš agent'ų.

| Komponentas | Dabar (Mac) | Po perkėlimo |
|---|---|---|
| Dashboard (Next.js + DB) | Mac | **Linux server** (pvz. `192.168.1.218`) |
| Linux projektų agent | — | **Linux server** (`systemd`) |
| Mac projektų agent | — | **Mac** (`launchd`) |
| `data/dashboard.db` | Mac | Linux server (perkelti rsync'u) |
| Anthropic / GitHub tokenai | `.env.local` ant Mac | `.env.local` ant Linux server |

### Perkėlimo žingsniai

1. **Backup'ink DB** ant Mac: `cp data/dashboard.db data/dashboard.db.backup-$(date +%s)`.
2. **Perkelk repo** į Linux server'į: `rsync -av --exclude node_modules --exclude .next ./ user@server:~/projects/projects-dashboard/`.
3. **Perkelk `.env.local`** ir `data/dashboard.db` (`scp` arba `rsync`).
4. Linux server'yje sekei žemiau esantį „Dashboard (Linux server)" setup'ą.
5. Senasis Mac procesas — sustabdyk, įdiek tik **agent'ą** (žr. „Agent — Mac").
6. Dashboard UI → Settings → Devices → **Add Device** → token'as → paleisk Mac install komandą.
7. Patikrink, kad UI mato abu device'us kaip `online` ir mato projektus iš abiejų host'ų.

> **Svarbu:** dashboard ir agent'ai bendrauja **tik per LAN**. Iš išorės — per Cloudflare Tunnel + Access (žr. `plan.md`). Niekada neeksponuok dashboard porto į public internet be auth proxy.

## Prerequisites

Tas pats abiem host'am:

- **Node.js 22 LTS** (`node --version` → ≥ 22.x)
- **pnpm 10** (`corepack enable && corepack prepare pnpm@10 --activate` arba `npm i -g pnpm`)
- **git**
- **PM2** globaliai (jei nori kad agent matytų ir valdytų procesus): `pnpm add -g pm2`

Linux server papildomai:
- `systemd` (default daugumoje distro)
- atviras LAN portas `3000` (dashboard) tarp host'ų

Mac papildomai:
- `launchctl` (yra default'e)
- `Xcode Command Line Tools` (`xcode-select --install`) — `node-pty` build'ui

## Dashboard (Linux server)

```bash
# 1. Clone + deps
git clone <repo> ~/projects/projects-dashboard
cd ~/projects/projects-dashboard
pnpm install

# 2. Env
cp .env.local.example .env.local   # arba perkelk iš Mac
# Pildyk:
#   DATABASE_URL=file:./data/dashboard.db
#   BETTER_AUTH_SECRET=<openssl rand -hex 32>
#   BETTER_AUTH_URL=http://192.168.1.218:3000
#   PORT=3000
#   GITHUB_TOKEN=<optional>

# 3. DB migracijos
pnpm db:push

# 4. Dev mode
pnpm dev
#   → http://0.0.0.0:3000  (Socket.io ant /api/ws)

# 5. Production (ant server'io)
pnpm build
pm2 start "pnpm start" --name dashboard --cwd ~/projects/projects-dashboard
pm2 save && pm2 startup
```

`server.mts` pagal default'ą bind'ina į `0.0.0.0`, kad būtų pasiekiamas iš LAN. Override: `HOST=127.0.0.1 pnpm start`.

### Naudingi scripts

| Komanda | Ką daro |
|---|---|
| `pnpm dev` | Dev serveris su Turbopack + Socket.io |
| `pnpm build` | Next.js production build |
| `pnpm start` | Production serveris (per `server.mts`) |
| `pnpm lint` | ESLint per `src/` |
| `pnpm format` | Prettier per `src/` |
| `pnpm db:push` | Drizzle schema → SQLite |
| `pnpm db:studio` | Drizzle Studio (DB UI) |

## Agent

Agent'as yra atskiras Node procesas (`/agent`), jungiasi į dashboard'ą per Socket.io (`/api/ws`), autentifikuojasi `AGENT_TOKEN`'u. Token'ą generuoja dashboard UI: **Settings → Devices → Add Device**.

`agent/.env`:
```bash
DASHBOARD_URL=http://192.168.1.218:3000
AGENT_TOKEN=<token from dashboard>
PROJECT_PATHS=/home/user/projects,/home/user/work
AGENT_PORT=3939
```

Pavyzdys yra `agent/.env.example`.

### Agent — Linux (systemd)

```bash
cd ~/projects/projects-dashboard/agent
pnpm install
cp .env.example .env && $EDITOR .env

# Test foreground'e
pnpm dev

# Production: systemd service
sudo tee /etc/systemd/system/dev-dashboard-agent.service > /dev/null <<EOF
[Unit]
Description=Dev Dashboard Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/projects/projects-dashboard/agent
ExecStart=$(which pnpm) start
Restart=always
RestartSec=5
StandardOutput=append:$HOME/projects/projects-dashboard/agent/agent.log
StandardError=append:$HOME/projects/projects-dashboard/agent/agent.error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now dev-dashboard-agent
sudo systemctl status dev-dashboard-agent
```

### Agent — Mac (launchd)

```bash
cd ~/projects/projects-dashboard/agent
pnpm install
cp .env.example .env && $EDITOR .env

# launchd plist
PLIST=~/Library/LaunchAgents/com.devdashboard.agent.plist
mkdir -p ~/Library/LaunchAgents

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.devdashboard.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which pnpm)</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>$HOME/projects/projects-dashboard/agent</string>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/projects/projects-dashboard/agent/agent.log</string>
  <key>StandardErrorPath</key><string>$HOME/projects/projects-dashboard/agent/agent.error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
```

### Agent uninstall

Yra paruoštas `agent/uninstall.sh` — auto-detect'ina OS (`Darwin` / `Linux`) ir nuima service'ą:

```bash
bash ~/projects/projects-dashboard/agent/uninstall.sh
```

## Tech stack

**Dashboard:** Next.js 16.2 (App Router, Turbopack, React 19) · Mantine 9 · Drizzle ORM + libsql · better-auth · Socket.io 4 · Anthropic SDK + Claude Agent SDK · Octokit · Monaco · xterm.js · recharts.

**Agent:** Node.js 22 + TypeScript · socket.io-client · simple-git · pm2 (programmatic) · node-pty · chokidar · systeminformation.

**Tooling:** pnpm 10 · tsx · TypeScript 5 · ESLint 9 · Prettier · drizzle-kit.

> ⚠️ **Next.js 16 turi breaking changes.** Prieš rašant kodą — žiūrėk `node_modules/next/dist/docs/`. Senesnių versijų pavyzdžiai gali neveikti.

## Saugumas

- Agent token'ai DB'je laikomi kaip SHA-256 (greitas lookup) + bcrypt fallback legacy įrašams (žr. `server.mts` auth middleware).
- API keys (`GITHUB_TOKEN`, `BETTER_AUTH_SECRET`, ir t.t.) — tik `.env.local`, **niekada** į git.
- Iš išorės — dashboard'ą atidaryk **tik per Cloudflare Tunnel + Access** arba Tailscale.
- Destructive git ops (`reset --hard`, `push --force`) — turi confirmation lygį, žr. `plan.md` saugumo lentelę.

## Repo layout

```
.
├── server.mts              # Custom Next + Socket.io serveris
├── src/
│   ├── app/                # Next.js App Router (auth + dashboard + api routes)
│   ├── components/         # React komponentai
│   └── lib/
│       ├── db/             # Drizzle schema + libsql client
│       ├── socket/         # Agent manager + WS protokolas (types)
│       ├── ai/             # Anthropic / Claude Agent SDK glue
│       ├── auth/           # better-auth + agent token hashing
│       └── github.ts       # Octokit
├── agent/                  # Atskiras Node daemon (Mac/Linux)
│   └── src/handlers/       # git, pm2, files, terminal, discovery, system
├── drizzle/                # SQL migracijos
├── data/                   # SQLite DB + uploaded chat assets (gitignored)
├── scripts/install/        # Vietoj rankinių install komandų (TODO)
└── plan.md                 # Pilnas projekto roadmap'as
```

## Troubleshooting

- **Agent neprisijungia** → patikrink `AGENT_TOKEN` UI'jaus device list'e + `DASHBOARD_URL` pasiekiamas iš agent host'o (`curl $DASHBOARD_URL`).
- **`Invalid agent token`** → token'ą atšaukei UI'je. Generuok naują → atnaujink `agent/.env` → restart service'ą.
- **Socket.io 404** — patikrink kad ne į `/socket.io`, o į `/api/ws` (path overrid'intas).
- **`node-pty` build failina** ant Mac → `xcode-select --install`, tada `pnpm install` iš naujo.
- **DB užrakinta po perkėlimo** → įsitikink, kad senas dashboard procesas ant Mac sustabdytas prieš kopijuojant `data/dashboard.db`.
