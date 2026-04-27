/**
 * Tiny Web-Audio-API based sound engine.
 *
 * - No binary assets: every sound is a short synthesized tone, so it works
 *   offline and adds 0 KB to the bundle.
 * - Lazily creates an AudioContext on first play (browsers block autoplay
 *   until a user gesture).
 * - Respects the user's masterVolume, quiet-hours window, and per-event
 *   toggles loaded from /api/settings/sound.
 */

export type SoundEvent =
  | 'notification'
  | 'taskComplete'
  | 'error'
  | 'success';

export interface SoundSettings {
  masterVolume: number; // 0..1
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:MM"
  quietHoursEnd: string; // "HH:MM"
  events: Record<SoundEvent, boolean>;
}

const DEFAULT_SETTINGS: SoundSettings = {
  masterVolume: 0.7,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  events: {
    notification: true,
    taskComplete: true,
    error: true,
    success: true,
  },
};

let cachedSettings: SoundSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  try {
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function timeToMinutes(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isQuietHours(now: Date, settings: SoundSettings): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = timeToMinutes(settings.quietHoursStart);
  const end = timeToMinutes(settings.quietHoursEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  // Window may wrap past midnight (e.g. 22:00–08:00).
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

interface ToneSpec {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
}

const TONES: Record<SoundEvent, ToneSpec[]> = {
  notification: [{ freq: 880, duration: 0.12, type: 'sine' }],
  success: [
    { freq: 660, duration: 0.09, type: 'sine' },
    { freq: 990, duration: 0.14, type: 'sine' },
  ],
  taskComplete: [
    { freq: 523.25, duration: 0.1, type: 'triangle' }, // C5
    { freq: 659.25, duration: 0.1, type: 'triangle' }, // E5
    { freq: 783.99, duration: 0.18, type: 'triangle' }, // G5
  ],
  error: [
    { freq: 220, duration: 0.18, type: 'square' },
    { freq: 165, duration: 0.22, type: 'square' },
  ],
};

function playTones(ctx: AudioContext, tones: ToneSpec[], gain: number) {
  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  let t = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;

    // Short attack/release envelope to avoid clicks.
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.005);
    env.gain.linearRampToValueAtTime(0, t + tone.duration);

    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + tone.duration + 0.02);
    t += tone.duration;
  }
}

/** Override the in-memory settings (call this after saving in the UI). */
export function setSoundSettings(settings: SoundSettings) {
  cachedSettings = settings;
  settingsLoaded = true;
}

export function getSoundSettings(): SoundSettings {
  return cachedSettings;
}

/** Fetch the user's settings from the API at most once per page load. */
export async function loadSoundSettings(force = false): Promise<SoundSettings> {
  if (settingsLoaded && !force) return cachedSettings;
  if (typeof window === 'undefined') return cachedSettings;
  try {
    const res = await fetch('/api/settings/sound');
    if (res.ok) {
      const data = (await res.json()) as Partial<SoundSettings>;
      cachedSettings = { ...DEFAULT_SETTINGS, ...data, events: { ...DEFAULT_SETTINGS.events, ...(data.events ?? {}) } };
    }
  } catch {
    // Keep defaults on failure — sound is non-critical.
  }
  settingsLoaded = true;
  return cachedSettings;
}

/**
 * Play a sound for the given event. Safe to call from anywhere — it silently
 * no-ops if the user muted it, quiet hours are active, or audio is unavailable.
 */
export function playSound(event: SoundEvent, override?: { volume?: number }) {
  const settings = cachedSettings;
  if (!settings.events[event]) return;
  if (isQuietHours(new Date(), settings)) return;

  const volume = override?.volume ?? settings.masterVolume;
  if (volume <= 0) return;

  const ctx = getCtx();
  if (!ctx) return;

  // Some browsers start the context suspended until a gesture.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  playTones(ctx, TONES[event], volume);
}

/** Used by the settings page to preview a sound regardless of the toggle. */
export function previewSound(event: SoundEvent, volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  playTones(ctx, TONES[event], Math.max(0, Math.min(1, volume)));
}
