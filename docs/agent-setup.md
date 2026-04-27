# Dev Dashboard Agent — diegimo ir atnaujinimo gidas

Šis dokumentas paaiškina kaip įdiegti, atnaujinti ir trikčių diagnostikuoti `dev-dashboard-agent` ant macOS / Linux device'ų.

---

## Kaip tai veikia (architektūra trumpai)

Dashboard'as yra centrinis serveris (Next.js + SQLite). Kiekvienas „device" — tai Mac/Linux mašina, ant kurios sukasi mažas Node.js procesas (`agent`), prisijungiantis prie dashboard'o per Socket.io (Bearer token autentifikacija).

```
┌─────────────────┐         WebSocket (auth: agent token)          ┌──────────────┐
│  Dashboard      │ ◄────────────────────────────────────────────► │  Agent (Mac) │
│  Next.js + SQL  │                                                 │  ~/.dev-...  │
│  port 3000      │ HTTP GET /api/agent/attachments/...             │              │
│                 │ ◄─────────────────────────────────────────────  │              │
└─────────────────┘                                                 └──────────────┘
```

Agentas:
- Vykdo Claude SDK užklausas ant device'o (`claude` CLI).
- Skenuoja projektus iš `PROJECT_PATHS` (env).
- Aptarnauja PM2/git/file sync komandas.
- Siunčia heartbeat'ą ir system stats.

Visas agento kodas gyvena tame pačiame repo: `agent/` katalogas.

---

## Pirmasis diegimas

1. Dashboarde: **Devices → Add Device** → įvedi pavadinimą ir OS → spaudi „Generate Token".
2. Modalas parodys vienos eilutės `curl` komandą su jau įmestais credentials. Pavyzdys:

   ```bash
   curl -fsSL https://dashboard.example.com/install/mac | bash -s -- \
     https://dashboard.example.com \
     <agent_token>
   ```

3. Įdiek tą komandą savo device'o terminale. Skriptas:
   - patikrins Node.js ≥ 20 ir įdiegs `pnpm` jei nėra,
   - parsisiųs šviežią agento tarball'ą iš `/api/agent/download`,
   - sukurs `~/.dev-dashboard-agent/.env` su tavo token'u,
   - užregistruos servisą (launchd ant Mac / systemd ant Linux),
   - paleis agentą ir parodys, ar jis prisijungė.

Modalas automatiškai aptiks prisijungimą ir parodys discover'intus projektus.

> **Token expires in 10 minutes** — jei netilpai į langą, pradėk iš naujo. Token'as saugojamas tik hash'intas, todėl perregistruok jį iš naujo, jei pamiršai.

---

## Atnaujinimas

**Nauja:** ta pati `curl` komanda veikia ir kaip update'as. Skriptas pats:

1. aptiks esamą `~/.dev-dashboard-agent` įdiegtį,
2. atspausdins `Mode: UPDATE (current vX.Y.Z)`,
3. sustabdys veikiantį servisą,
4. parsisiųs šviežią tarball'ą,
5. nutrins seną kodą **paliekant** `.env`, `node_modules`, `agent.log`,
6. paleis servisą atgal ir parodys naują versiją `vX.Y.Z → vA.B.C`.

### Du būdai update'inti

**A) Per dashboard UI** — atidaryk Add Device modalą tam pačiam device'ui (arba kopijuok istorinę komandą) ir paleisk antrą kartą. Token'as gali būti tas pats (jis hash'e nesikeičia kol nepasibaigia jo TTL).

> **Patarimas:** jei senasis token'as nebegalioja arba pamiršai, sugeneruok naują per **Devices → [device row] → Rotate Token**. Tas pats `curl` su nauju token'u perrašys `.env`.

**B) Tiesiog ant device'o** *(rekomenduojama kasdieniam naudojimui)*:

```bash
bash ~/.dev-dashboard-agent/update.sh
```

`update.sh` perskaito esamą `.env`, paima `DASHBOARD_URL` ir `AGENT_TOKEN` iš jo, ir paleidžia tą patį `curl ... | bash -s -- ...`. Jokių argumentų nereikia.

### Patikrinimas, kad nauja versija paleido

Po install/update skriptas atspausdina:

```
✅ Agent updated: v0.1.0 → v0.2.0
Running:   🔧 Dev Dashboard Agent v0.2.0 (attachments-over-http)
```

Jei „Running:" eilutė neatsiranda — agent dar paleidinasi. Patikrink rankiniu būdu:

```bash
tail -f ~/.dev-dashboard-agent/agent.log | grep "Dev Dashboard Agent"
```

Pirmas dalykas log'e turi būti:

```
🔧 Dev Dashboard Agent v0.2.0 (attachments-over-http)
```

---

## Failų prisegimai (screenshots)

Nuo `v0.2.0` agent'as sugeba parsisiųsti chat'e prisegtus failus, kad Claude SDK galėtų juos atidaryti per Read tool.

**Kaip tai veikia:**
1. Naudotojas paste'ina screenshot'ą `ChatInput`'e → įkeliamas į dashboard'o `data/uploads/chats/{chatId}/`.
2. Dashboard'as siunčia `CLAUDE_QUERY` su `attachments[]` metadata + placeholderiais (`__ATTACHMENT_0__`) prompto viduje.
3. Agent'as prieš `query()`:
   - parsiunčia bytes per `GET /api/agent/attachments/{chatId}/{filename}` (Bearer auth),
   - išsaugo į `os.tmpdir()/dev-dashboard-agent/attachments/{chatId}/`,
   - pakeičia placeholderius į device-lokalius absoliučius kelius.
4. Claude SDK atidaro failą per Read tool — viskas multimodaliai matosi.

**Trikčių diagnostika prisegimams:**

| Log'e matai | Priežastis | Sprendimas |
|---|---|---|
| `__ATTACHMENT_0__` literal'as Claude atsakyme | Sena agento versija (be `v0.2.0`) | Update'ink agentą |
| `[fetchAttachments] 401 Unauthorized` | `AGENT_TOKEN` `.env`'e nesutampa su DB | Rotate token, perinstall |
| `[fetchAttachments] 404 Not Found` | Failas neegzistuoja dashboard'o `data/uploads/chats/` | Patikrink dashboard'o disko vietą / upload'o log'us |
| `ECONNREFUSED` | Device nepasiekia `DASHBOARD_URL` per HTTP | Pataisyk `DASHBOARD_URL` `.env`'e (naudok LAN IP/DNS, ne `localhost`) |

---

## Dažniausios komandos (cheat sheet)

### macOS

```bash
# Status / logs
tail -f ~/.dev-dashboard-agent/agent.log
launchctl list | grep com.devdashboard.agent

# Restart
launchctl unload ~/Library/LaunchAgents/com.devdashboard.agent.plist
launchctl load   ~/Library/LaunchAgents/com.devdashboard.agent.plist

# Update
bash ~/.dev-dashboard-agent/update.sh

# Uninstall
bash ~/.dev-dashboard-agent/uninstall.sh
```

### Linux

```bash
# Status / logs
sudo systemctl status dev-dashboard-agent
tail -f ~/.dev-dashboard-agent/agent.log

# Restart
sudo systemctl restart dev-dashboard-agent

# Update
bash ~/.dev-dashboard-agent/update.sh

# Uninstall
bash ~/.dev-dashboard-agent/uninstall.sh
```

---

## `.env` nustatymai

Agent'o konfigas — `~/.dev-dashboard-agent/.env`:

| Kintamasis | Pavyzdys | Aprašymas |
|---|---|---|
| `DASHBOARD_URL` | `https://dashboard.example.com` | Dashboard'o public URL (turi būti pasiekiamas iš device'o) |
| `AGENT_TOKEN` | `dev_abc123...` | Bearer token (sugeneruotas dashboard'e) |
| `AGENT_NAME` | `mindaugas-mbp` | Rodomas Devices sąraše |
| `AGENT_PORT` | `3939` | Lokalus HTTP portas (tik diagnostikai) |
| `PROJECT_PATHS` | `~/projects,~/Desktop/Projects` | Comma-separated katalogai, kuriuose ieškoti projektų |
| `CLAUDE_PATH` | `/usr/local/bin/claude` | (auto) Pilnas kelias iki `claude` CLI |

> **Update'as `.env`'o NEPERRAŠO** — tavo customai (pvz. `PROJECT_PATHS`) išgyvena update'us. Jei norisi reset'inti — ištrink failą ir paleisk install komandą iš naujo.

---

## Trikčių diagnostika

### „Agent not connected" Devices sąraše

1. Patikrink, ar servisas paleistas:
   - Mac: `launchctl list | grep com.devdashboard.agent` (turi rodyti PID)
   - Linux: `sudo systemctl status dev-dashboard-agent` (turi būti `active (running)`)
2. Patikrink log'ą:
   ```bash
   tail -n 50 ~/.dev-dashboard-agent/agent.log
   tail -n 50 ~/.dev-dashboard-agent/agent.error.log
   ```
3. Jei matai `Authentication failed` — token'as netinka, rotate'ink dashboard'e ir perinstall.
4. Jei matai `ECONNREFUSED` arba `getaddrinfo ENOTFOUND` — `DASHBOARD_URL` netinkamas. Patikrink iš device'o:
   ```bash
   curl -v $DASHBOARD_URL/api/health
   ```

### Sena versija nepasimato (banner rodo `v0.1.0`)

Vadinasi, nors `update.sh` praėjo, servisas vis tiek gyvuoja iš seno cache'o. Reset:

**Mac:**
```bash
launchctl unload ~/Library/LaunchAgents/com.devdashboard.agent.plist
launchctl load   ~/Library/LaunchAgents/com.devdashboard.agent.plist
tail -f ~/.dev-dashboard-agent/agent.log
```

**Linux:**
```bash
sudo systemctl restart dev-dashboard-agent
tail -f ~/.dev-dashboard-agent/agent.log
```

### „File does not exist" kai paste'ini screenshot'ą

Tipiškas simptomas: Claude rašo „File does not exist. Note: your current working directory is …" su `__ATTACHMENT_0__` literal'u. Reiškia agento update'as nepasiekė device'o (tu vis dar veiki ant `v0.1.0`).

```bash
bash ~/.dev-dashboard-agent/update.sh
```

Po update'o paste'ink screenshot'ą iš naujo. Log'e turi pasirodyti:

```
[claude] CLAUDE_QUERY has 1 attachment(s): screenshot.png
[fetchAttachments] GET https://.../api/agent/attachments/<chatId>/<file>
[claude] downloaded 1 attachment(s) → __ATTACHMENT_0__=/var/folders/.../attachments/<chatId>/<file>
```

---

## Vidinė architektūros pastaba

Installer'is yra `public/install/{mac,linux}` — Next.js juos serv'ina kaip static assets. Build'as **kopijuoja juos iš `public/`** į `.next/`, todėl po jų pakeitimo dashboard'as turi būti rebuild'intas (`pnpm build && pnpm start`) production mode'e. Dev mode'e (`pnpm dev`) keitimai matosi iš karto.

Agent'o tarball'as generuojamas on-the-fly iš `agent/` katalogo per `src/app/api/agent/download/route.ts` — jokio CI/CD nereikia. Pakeisi `agent/src/...`, paleisi `update.sh` ant device'o, ir nauja versija jau ant Mac'o.
