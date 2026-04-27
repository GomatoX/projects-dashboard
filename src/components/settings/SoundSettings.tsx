'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Slider,
  Switch,
  Box,
  Button,
  TextInput,
  Divider,
  ActionIcon,
  Tooltip,
  Loader,
  Center,
} from '@mantine/core';
import { notify } from '@/lib/notify';
import {
  IconVolume,
  IconDeviceFloppy,
  IconPlayerPlay,
} from '@tabler/icons-react';
import {
  loadSoundSettings,
  previewSound,
  setSoundSettings,
  type SoundEvent,
  type SoundSettings as SoundSettingsModel,
} from '@/lib/audio';

const EVENT_LABELS: Record<SoundEvent, string> = {
  notification: 'Notifications',
  taskComplete: 'Task complete',
  success: 'Success',
  error: 'Errors',
};

const EVENT_ORDER: SoundEvent[] = [
  'notification',
  'taskComplete',
  'success',
  'error',
];

export function SoundSettings() {
  const [settings, setSettings] = useState<SoundSettingsModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await loadSoundSettings(true);
      setSettings(loaded);
      setLoading(false);
    })();
  }, []);

  const update = useCallback(
    (patch: Partial<SoundSettingsModel>) => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      setDirty(true);
    },
    [],
  );

  const updateEvent = (event: SoundEvent, enabled: boolean) => {
    setSettings((prev) =>
      prev ? { ...prev, events: { ...prev.events, [event]: enabled } } : prev,
    );
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/sound', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('save failed');
      const fresh = (await res.json()) as SoundSettingsModel;
      setSettings(fresh);
      setSoundSettings(fresh);
      setDirty(false);
      notify({
        title: 'Saved',
        message: 'Sound settings updated',
        color: 'teal',
        autoClose: 1500,
      });
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to save sound settings',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <Card>
        <Stack gap="md">
          <Group gap="sm">
            <IconVolume size={20} style={{ opacity: 0.6 }} />
            <Text size="sm" fw={600} tt="uppercase" c="dimmed">
              Sound
            </Text>
          </Group>
          <Center py="lg">
            <Loader size="sm" />
          </Center>
        </Stack>
      </Card>
    );
  }

  const volumePct = Math.round(settings.masterVolume * 100);

  return (
    <Card>
      <Stack gap="md">
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconVolume size={20} style={{ opacity: 0.6 }} />
            <Text size="sm" fw={600} tt="uppercase" c="dimmed">
              Sound
            </Text>
          </Group>
          <Tooltip label="Preview">
            <ActionIcon
              variant="light"
              color="brand"
              onClick={() => previewSound('notification', settings.masterVolume)}
              aria-label="Preview notification sound"
            >
              <IconPlayerPlay size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Box>
          <Group justify="space-between" mb="xs">
            <Text size="sm">Master Volume</Text>
            <Text size="xs" c="dimmed">
              {volumePct}%
            </Text>
          </Group>
          <Slider
            value={volumePct}
            onChange={(v) => update({ masterVolume: v / 100 })}
            marks={[
              { value: 0, label: '0%' },
              { value: 50, label: '50%' },
              { value: 100, label: '100%' },
            ]}
          />
        </Box>

        <Divider my={4} />

        <Switch
          label="Quiet hours"
          description="Mute all sounds during the window below."
          checked={settings.quietHoursEnabled}
          onChange={(e) =>
            update({ quietHoursEnabled: e.currentTarget.checked })
          }
        />

        <Group grow>
          <TextInput
            label="From"
            type="time"
            value={settings.quietHoursStart}
            onChange={(e) => update({ quietHoursStart: e.currentTarget.value })}
            disabled={!settings.quietHoursEnabled}
          />
          <TextInput
            label="To"
            type="time"
            value={settings.quietHoursEnd}
            onChange={(e) => update({ quietHoursEnd: e.currentTarget.value })}
            disabled={!settings.quietHoursEnabled}
          />
        </Group>

        <Divider my={4} />

        <Stack gap="xs">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed">
            Events
          </Text>
          {EVENT_ORDER.map((event) => (
            <Group key={event} justify="space-between" wrap="nowrap">
              <Switch
                label={EVENT_LABELS[event]}
                checked={settings.events[event]}
                onChange={(e) => updateEvent(event, e.currentTarget.checked)}
              />
              <Tooltip label={`Preview ${EVENT_LABELS[event].toLowerCase()}`}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => previewSound(event, settings.masterVolume)}
                  aria-label={`Preview ${event}`}
                >
                  <IconPlayerPlay size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
        </Stack>

        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          variant="light"
          color="brand"
          onClick={save}
          loading={saving}
          disabled={!dirty}
        >
          Save
        </Button>
      </Stack>
    </Card>
  );
}
