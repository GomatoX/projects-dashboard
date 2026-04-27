import { createServer } from 'node:http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcrypt';

const dev = process.env.NODE_ENV !== 'production';
// Bind to 0.0.0.0 by default — this dashboard is intended to run on a LAN
// server and be reachable from other devices on the local network.
// Override with HOST=127.0.0.1 if you want loopback-only access.
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(async () => {
  // Dynamic imports for modules that use the DB
  const { db } = await import('./src/lib/db/index.js');
  const { devices } = await import('./src/lib/db/schema.js');
  const { eq, isNull } = await import('drizzle-orm');
  const agentManager = await import('./src/lib/socket/agent-manager.js');
  const { hashAgentToken, timingSafeEqualHex } = await import('./src/lib/auth/agent-token.js');

  const httpServer = createServer(handler);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: dev ? '*' : undefined,
    },
    path: '/api/ws',
  });

  // ─── Socket.io Authentication Middleware ───────────────
  // Fast path: look the device up by an indexed SHA-256 of the token.
  // Slow path: legacy devices created before the tokenHash column existed
  // still have only a bcrypt hash; scan only those rows and lazily backfill
  // tokenHash on the first successful match so subsequent connects are fast.
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string; hostname?: string; os?: string };

      if (!auth.token) {
        return next(new Error('Authentication token required'));
      }

      const candidateHash = hashAgentToken(auth.token);

      let matchedDevice: typeof devices.$inferSelect | null = null;

      const fastHits = await db
        .select()
        .from(devices)
        .where(eq(devices.tokenHash, candidateHash))
        .limit(1);

      if (fastHits.length > 0 && fastHits[0].tokenHash) {
        // timingSafeEqualHex is defensive — the WHERE clause already proves
        // equality, but keeping the explicit constant-time compare protects
        // against any future change to the lookup strategy.
        if (timingSafeEqualHex(fastHits[0].tokenHash, candidateHash)) {
          matchedDevice = fastHits[0];
        }
      }

      if (!matchedDevice) {
        const legacyDevices = await db
          .select()
          .from(devices)
          .where(isNull(devices.tokenHash));

        for (const device of legacyDevices) {
          const isMatch = await bcrypt.compare(auth.token, device.agentToken);
          if (isMatch) {
            matchedDevice = device;
            // Backfill the indexed hash so the next connect uses the fast path.
            try {
              await db
                .update(devices)
                .set({ tokenHash: candidateHash })
                .where(eq(devices.id, device.id));
            } catch (err) {
              console.error('[Auth] Failed to backfill tokenHash:', err);
            }
            break;
          }
        }
      }

      if (!matchedDevice) {
        return next(new Error('Invalid agent token'));
      }

      // Attach device info to the socket
      (socket as unknown as Record<string, unknown>).deviceId = matchedDevice.id;
      (socket as unknown as Record<string, unknown>).deviceName = matchedDevice.name;
      (socket as unknown as Record<string, unknown>).agentAuth = auth;

      next();
    } catch (error) {
      console.error('[Auth] Error during authentication:', error);
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection Handler ────────────────────────────────
  io.on('connection', async (socket) => {
    const deviceId = (socket as unknown as Record<string, unknown>).deviceId as string;
    const deviceName = (socket as unknown as Record<string, unknown>).deviceName as string;
    const auth = (socket as unknown as Record<string, unknown>).agentAuth as {
      token: string;
      hostname: string;
      os: string;
    };

    console.warn(`[Socket.io] Agent connected: ${deviceName} (${deviceId})`);

    // Register in agent manager
    agentManager.registerAgent(deviceId, socket, auth);

    // Update device status in DB
    try {
      await db
        .update(devices)
        .set({
          status: 'online',
          lastSeen: new Date(),
          localIp: socket.handshake.address || '',
        })
        .where(eq(devices.id, deviceId));
    } catch (error) {
      console.error(`[Socket.io] Failed to update device status:`, error);
    }

    // Listen for events from agent
    socket.on('event', (event) => {
      const result = agentManager.handleAgentEvent(deviceId, event);

      if (result.discoveredProjects && result.discoveredProjects.length > 0) {
        console.warn(
          `[Socket.io] ${deviceName} discovered ${result.discoveredProjects.length} projects`,
        );
        // Store discovered projects in a temp cache for the UI to pick up
        (globalThis as Record<string, unknown>)[`__discoveredProjects_${deviceId}`] =
          result.discoveredProjects;
      }
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      console.warn(`[Socket.io] Agent disconnected: ${deviceName} (${reason})`);
      agentManager.unregisterAgent(deviceId);

      try {
        await db
          .update(devices)
          .set({
            status: 'offline',
            lastSeen: new Date(),
          })
          .where(eq(devices.id, deviceId));
      } catch (error) {
        console.error(`[Socket.io] Failed to update device status:`, error);
      }
    });

    // Send auth error if token was rejected at middleware level
    socket.on('error', (err) => {
      console.error(`[Socket.io] Socket error for ${deviceName}:`, err.message);
    });
  });

  // Make io + agentManager accessible to API routes
  (globalThis as Record<string, unknown>).__socketIO = io;
  (globalThis as Record<string, unknown>).__agentManager = agentManager;

  httpServer
    .once('error', (err) => {
      console.error('[Server] Fatal error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.warn(`> Ready on http://${hostname}:${port}`);
      console.warn(`> Socket.io listening on /api/ws`);
    });

  // Graceful shutdown
  const shutdown = () => {
    console.warn('[Server] Shutting down...');
    io.close();
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
