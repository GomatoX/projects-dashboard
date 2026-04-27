'use client';

import { useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Switch,
  Group,
  Button,
  Text,
  Code,
} from '@mantine/core';
import { nanoid } from 'nanoid';
import type { ProjectCommand } from '@/lib/commands';

interface CommandEditorModalProps {
  opened: boolean;
  onClose: () => void;
  initial: ProjectCommand | null;
  onSave: (command: ProjectCommand) => void;
}

export function CommandEditorModal({
  opened,
  onClose,
  initial,
  onSave,
}: CommandEditorModalProps) {
  const [label, setLabel] = useState('');
  const [cmd, setCmd] = useState('');
  const [icon, setIcon] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setLabel(initial?.label ?? '');
      setCmd(initial?.cmd ?? '');
      setIcon(initial?.icon ?? '');
      setStreaming(initial?.streaming ?? false);
      setError(null);
    }
  }, [opened, initial]);

  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedCmd = cmd.trim();
    if (!trimmedLabel) {
      setError('Label is required');
      return;
    }
    if (!trimmedCmd) {
      setError('Command is required');
      return;
    }

    onSave({
      id: initial?.id ?? `cmd-${nanoid(8)}`,
      label: trimmedLabel,
      cmd: trimmedCmd,
      icon: icon.trim() ? icon.trim().slice(0, 8) : undefined,
      streaming,
    });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? 'Edit Command' : 'New Command'}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group grow align="flex-start">
          <TextInput
            label="Label"
            placeholder="Build"
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            maxLength={60}
            data-autofocus
          />
          <TextInput
            label="Icon (emoji)"
            placeholder="🔨"
            value={icon}
            onChange={(e) => setIcon(e.currentTarget.value)}
            maxLength={8}
          />
        </Group>

        <Textarea
          label="Command"
          placeholder="pnpm build"
          description="Runs in the project directory. Use full paths for binaries not in PATH."
          value={cmd}
          onChange={(e) => setCmd(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={6}
          maxLength={2000}
          styles={{ input: { fontFamily: 'JetBrains Mono, Menlo, monospace' } }}
        />

        <Switch
          label="Streaming output (long-running)"
          description={
            <Text size="xs" c="dimmed">
              Spawn through a PTY so output streams in real-time. Required for{' '}
              <Code>pnpm dev</Code>, watchers, etc. One-shot mode has a 30s timeout.
            </Text>
          }
          checked={streaming}
          onChange={(e) => setStreaming(e.currentTarget.checked)}
        />

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button color="brand" onClick={handleSave}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
