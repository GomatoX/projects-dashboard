// agent/src/handlers/self-update.ts
//
// Triggered by RUN_SELF_UPDATE from the dashboard. Runs the agent's
// "fetch latest tarball, swap files, restart" loop without requiring
// sudo on the device — the original install scripts (`public/install/{linux,mac}`)
// use `sudo systemctl …` and `launchctl unload`, neither of which we can
// run from a socket-triggered context (no tty for a sudo prompt). This
// handler bypasses both by trusting the OS service manager:
//
//   - systemd (`Restart=always` from the install script) restarts the
//     agent after we exit cleanly.
//   - launchd (`KeepAlive=true` on macOS) does the same.
//
// Flow:
//   1. Resolve INSTALL_DIR (== process.cwd; sanity-check for the agent's
//      package.json).
//   2. Write a small helper bash script to a temp path. The script does
//      the actual file swap from outside the running agent process, so
//      the swap can finish even after the agent exits.
//   3. Spawn the helper script detached (`spawn(... { detached: true,
//      stdio: 'ignore' })`) so it survives our exit.
//   4. Emit SELF_UPDATE_STATUS phases as we go, then `process.exit(0)`.
//      The service manager respawns on the OLD code (~RestartSec=5);
//      the helper script overrides files in those seconds and pkills
//      the freshly-respawned agent, forcing a SECOND respawn on NEW
//      code. Belt-and-braces.
//
// Limitations:
//   - Doesn't update the systemd unit / launchd plist itself. If a future
//     release changes those, the user has to re-run the curl install
//     command. Mention this in the release notes.
//   - Requires `pnpm`, `curl`, `tar` on PATH (already present from install).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import type { AgentEvent } from '../../../src/lib/socket/types.js';

interface SelfUpdateOptions {
  socket: Socket;
  requestId: string;
  dashboardUrl: string;
}

/**
 * The bash helper that does the actual download + swap + restart. We
 * embed it as a string (rather than ship a separate `update.sh`) so a
 * fresh install always carries the latest version of this script —
 * a bugfix to the swap logic ships in the same agent release.
 *
 * Substitution placeholders are expanded before write:
 *   __DASHBOARD_URL__, __INSTALL_DIR__, __AGENT_PID__
 *
 * `/api/agent/download` is currently unauthenticated (same endpoint the
 * public install script hits), so no token plumbing is needed here. If
 * that ever changes, plumb the token via argv $1 — DO NOT bake it into
 * the script body, which lives in /tmp at mode 0600.
 */
const HELPER_SCRIPT = `#!/bin/bash
# Auto-generated self-update helper for Dev Dashboard Agent.
# Spawned by the agent itself in response to RUN_SELF_UPDATE.
set -e

DASHBOARD="__DASHBOARD_URL__"
INSTALL_DIR="__INSTALL_DIR__"
AGENT_PID="__AGENT_PID__"

LOG="$INSTALL_DIR/self-update.log"
exec > "$LOG" 2>&1

echo "[$(date)] self-update start (pid=$$, agent_pid=$AGENT_PID)"

# Wait for the agent process to actually exit so file overwrites don't
# race against in-flight requires (rare on Linux but cheap insurance).
for i in 1 2 3 4 5; do
  if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "agent exited after \${i}s"
    break
  fi
  sleep 1
done

STAGING=$(mktemp -d -t dev-dashboard-agent-staging.XXXXXX)
TAR=$(mktemp -t dev-dashboard-agent-tar.XXXXXX)

cleanup() {
  rm -rf "$STAGING" "$TAR"
}
trap cleanup EXIT

echo "[downloading] $DASHBOARD/api/agent/download"
curl -fsSL "$DASHBOARD/api/agent/download" -o "$TAR" || {
  echo "FAILED: download"
  exit 1
}

echo "[extracting] $TAR -> $STAGING"
tar -xzf "$TAR" -C "$STAGING" || { echo "FAILED: extract"; exit 1; }

cd "$STAGING"
echo "[installing] pnpm install in staging"
# Try frozen first (CI semantics), fall back if lockfile drifted.
if ! pnpm install --frozen-lockfile 2>&1; then
  echo "frozen install failed, trying loose install"
  pnpm install 2>&1 || { echo "FAILED: pnpm install"; exit 1; }
fi

echo "[swapping] $STAGING -> $INSTALL_DIR"
# Copy each top-level entry from staging into install dir, preserving
# user-owned files (.env, logs). We replace node_modules wholesale so
# stale deps don't survive an upgrade.
PRESERVE=".env .env.local agent.log agent.error.log self-update.log"
for item in "$STAGING"/* "$STAGING"/.[!.]*; do
  [ -e "$item" ] || continue
  name=$(basename "$item")
  case " $PRESERVE " in
    *" $name "*) echo "  preserving $name"; continue ;;
  esac
  rm -rf "\${INSTALL_DIR:?}/\$name"
  cp -R "$item" "\$INSTALL_DIR/\$name"
done

echo "[restarting] kill any running agent so service manager spawns on new code"
# At this point the service manager may already have restarted the OLD
# agent (it will be on stale in-memory code). Kill it; the next restart
# uses the new files we just copied.
pkill -f "tsx.*src/index.ts" 2>/dev/null || true
pkill -f "node.*dev-dashboard-agent" 2>/dev/null || true

echo "[$(date)] self-update done"
`;

let updateInProgress = false;

export async function handleSelfUpdate(opts: SelfUpdateOptions): Promise<void> {
  const { socket, requestId, dashboardUrl } = opts;

  const emit = (
    phase: 'starting' | 'downloading' | 'installing' | 'restarting' | 'failed',
    message?: string,
    fromVersion?: string,
  ): void => {
    const event: AgentEvent = {
      type: 'SELF_UPDATE_STATUS',
      requestId,
      phase,
      ...(message ? { message } : {}),
      ...(fromVersion ? { fromVersion } : {}),
    };
    socket.emit('event', event);
  };

  // Single-flight: the dashboard's UI button should already debounce, but
  // a misbehaving client triggering twice would have two helpers racing
  // over the install dir.
  if (updateInProgress) {
    emit('failed', 'Another self-update is already in progress');
    return;
  }
  updateInProgress = true;

  try {
    const installDir = process.cwd();
    const pkgPath = join(installDir, 'package.json');

    // Sanity-check we're really inside the agent install. Refuse to run
    // from arbitrary directories (e.g. someone runs the agent CLI from
    // their projects folder during development) to avoid stomping on
    // unrelated files.
    if (!existsSync(pkgPath)) {
      emit('failed', `No package.json at ${pkgPath} — refusing to update`);
      return;
    }
    let fromVersion = 'unknown';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg?.name !== 'dev-dashboard-agent') {
        emit(
          'failed',
          `package.json at ${pkgPath} has name=${pkg?.name}, not dev-dashboard-agent — refusing to update`,
        );
        return;
      }
      fromVersion = String(pkg?.version || 'unknown');
    } catch (err) {
      emit('failed', `Failed to read ${pkgPath}: ${err instanceof Error ? err.message : err}`);
      return;
    }

    emit('starting', `Updating agent at ${installDir}`, fromVersion);

    // Materialize the helper script with substitutions baked in. The
    // token stays in argv only — never written to disk — so the temp
    // file is safe(r) at rest.
    const scriptBody = HELPER_SCRIPT.replaceAll('__DASHBOARD_URL__', dashboardUrl)
      .replaceAll('__INSTALL_DIR__', installDir)
      .replaceAll('__AGENT_PID__', String(process.pid));

    const scriptPath = join(tmpdir(), `dev-dashboard-agent-self-update-${Date.now()}.sh`);
    writeFileSync(scriptPath, scriptBody, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    emit('downloading', `Spawning ${scriptPath}`);

    // Detached so it survives our exit. stdio:'ignore' so we don't tie
    // its lifetime to our pipes (the script logs to its own file).
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: installDir,
      env: process.env,
    });
    child.unref();

    if (child.pid) {
      emit('installing', `Helper running as pid ${child.pid}; agent will restart shortly`);
    } else {
      emit('failed', 'Failed to spawn updater script (no pid)');
      return;
    }

    // Give the socket a beat to flush the events, then exit. The service
    // manager will respawn us; the helper script will then overwrite the
    // install dir and pkill the respawn so we come up on new code.
    emit('restarting', 'Agent exiting; service manager will restart');
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (err) {
    updateInProgress = false;
    emit('failed', err instanceof Error ? err.message : String(err));
  }
}
