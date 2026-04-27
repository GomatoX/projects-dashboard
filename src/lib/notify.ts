/**
 * Thin wrapper around Mantine's `notifications.show` that also plays the
 * matching UI sound based on the notification's color/intent.
 *
 * The sound is chosen automatically:
 *   - `color: 'red'`              → `error`
 *   - `color: 'teal' | 'green'`   → `success`
 *   - `event: 'taskComplete'`     → `taskComplete` (caller opts in for long
 *                                   ops like build/PR completion)
 *   - everything else             → `notification`
 *
 * The audio engine itself is a no-op when the user has disabled the event,
 * is in quiet hours, or volume is 0 — so sprinkling these calls everywhere
 * is safe.
 */
import { notifications, type NotificationData } from '@mantine/notifications';
import { playSound, type SoundEvent } from '@/lib/audio';

type NotifyOptions = NotificationData & {
  /**
   * Force a specific sound event. If omitted, the event is inferred from
   * `color`. Pass `null` to suppress sound entirely.
   */
  sound?: SoundEvent | null;
};

function inferEvent(color: NotificationData['color']): SoundEvent {
  switch (color) {
    case 'red':
      return 'error';
    case 'teal':
    case 'green':
      return 'success';
    default:
      return 'notification';
  }
}

export function notify(options: NotifyOptions): string {
  const { sound, ...mantineOptions } = options;

  if (sound !== null) {
    const event = sound ?? inferEvent(mantineOptions.color);
    // Fire-and-forget — playSound silently no-ops if disabled/muted.
    try {
      playSound(event);
    } catch {
      // Audio is purely cosmetic; never let it break a notification.
    }
  }

  return notifications.show(mantineOptions);
}
