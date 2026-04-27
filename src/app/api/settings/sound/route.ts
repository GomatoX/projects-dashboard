import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { soundSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Single-user dashboard: use a fixed key for the local user.
// Mirrors the no-auth pattern used by /api/projects/[id]/memory.
const LOCAL_USER_ID = 'default';

const DEFAULT_EVENTS = {
  notification: true,
  taskComplete: true,
  error: true,
  success: true,
};

function defaultSettings() {
  return {
    userId: LOCAL_USER_ID,
    masterVolume: 0.7,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    events: DEFAULT_EVENTS,
  };
}

function parseEvents(raw: string | null): Record<string, boolean> {
  if (!raw) return { ...DEFAULT_EVENTS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_EVENTS, ...parsed };
  } catch {
    return { ...DEFAULT_EVENTS };
  }
}

// GET /api/settings/sound — fetch the local sound settings.
export async function GET() {
  const [row] = await db
    .select()
    .from(soundSettings)
    .where(eq(soundSettings.userId, LOCAL_USER_ID));

  if (!row) {
    return NextResponse.json(defaultSettings());
  }

  const events = parseEvents(row.events);

  return NextResponse.json({
    userId: row.userId,
    masterVolume: row.masterVolume,
    // We piggy-back the toggle on the events JSON so we don't need a migration.
    quietHoursEnabled: Boolean(events.__quietHoursEnabled),
    quietHoursStart: row.quietHoursStart ?? '22:00',
    quietHoursEnd: row.quietHoursEnd ?? '08:00',
    events: stripInternal(events),
  });
}

// PUT /api/settings/sound — upsert the local sound settings.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const masterVolume = clamp01(
    typeof body.masterVolume === 'number' ? body.masterVolume : 0.7,
  );
  const quietHoursStart = isTimeString(body.quietHoursStart)
    ? body.quietHoursStart
    : '22:00';
  const quietHoursEnd = isTimeString(body.quietHoursEnd)
    ? body.quietHoursEnd
    : '08:00';
  const quietHoursEnabled = Boolean(body.quietHoursEnabled);

  const incomingEvents =
    body.events && typeof body.events === 'object' ? body.events : {};
  const events: Record<string, boolean> = { ...DEFAULT_EVENTS };
  for (const key of Object.keys(DEFAULT_EVENTS)) {
    if (key in incomingEvents) events[key] = Boolean(incomingEvents[key]);
  }

  const eventsForDb = { ...events, __quietHoursEnabled: quietHoursEnabled };

  const values = {
    userId: LOCAL_USER_ID,
    masterVolume,
    quietHoursStart,
    quietHoursEnd,
    events: JSON.stringify(eventsForDb),
  };

  const [existing] = await db
    .select()
    .from(soundSettings)
    .where(eq(soundSettings.userId, LOCAL_USER_ID));

  if (existing) {
    await db
      .update(soundSettings)
      .set(values)
      .where(eq(soundSettings.userId, LOCAL_USER_ID));
  } else {
    await db.insert(soundSettings).values(values);
  }

  return NextResponse.json({
    userId: LOCAL_USER_ID,
    masterVolume,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    events,
  });
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function stripInternal(events: Record<string, boolean>) {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(events)) {
    if (!k.startsWith('__')) out[k] = v;
  }
  return out;
}
