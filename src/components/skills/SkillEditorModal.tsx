'use client';

import { useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Group,
  Button,
  Text,
  Select,
  Code,
} from '@mantine/core';
import {
  CONTEXT_SOURCES,
  OUTPUT_MODES,
  type Skill,
  type SkillContextSource,
  type SkillInput,
  type SkillOutputMode,
} from '@/lib/skills';

interface SkillEditorModalProps {
  opened: boolean;
  onClose: () => void;
  initial: Skill | null;
  onSave: (input: SkillInput) => Promise<void> | void;
}

/**
 * Create / edit a skill. Mirrors `CommandEditorModal` in shape so the two
 * panels feel like siblings. The form always submits a complete `SkillInput`
 * — backend doesn't support partial updates.
 */
export function SkillEditorModal({
  opened,
  onClose,
  initial,
  onSave,
}: SkillEditorModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [contextSource, setContextSource] = useState<SkillContextSource>('none');
  const [outputMode, setOutputMode] = useState<SkillOutputMode>('modal');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) {
      setName(initial?.name ?? '');
      setIcon(initial?.icon ?? '');
      setDescription(initial?.description ?? '');
      setSystemPrompt(initial?.systemPrompt ?? '');
      setContextSource(initial?.contextSource ?? 'none');
      setOutputMode(initial?.outputMode ?? 'modal');
      setError(null);
      setSaving(false);
    }
  }, [opened, initial]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!trimmedPrompt) {
      setError('System prompt is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        description: description.trim(),
        icon: icon.trim() ? icon.trim().slice(0, 8) : null,
        systemPrompt: trimmedPrompt,
        contextSource,
        outputMode,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? 'Edit Skill' : 'New Skill'}
      size="xl"
      centered
    >
      <Stack gap="md">
        <Group grow align="flex-start">
          <TextInput
            label="Name"
            placeholder="Generate commit"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={60}
            data-autofocus
          />
          <TextInput
            label="Icon (emoji)"
            placeholder="✏️"
            value={icon}
            onChange={(e) => setIcon(e.currentTarget.value)}
            maxLength={8}
          />
        </Group>

        <TextInput
          label="Description"
          placeholder="Short summary shown on the card"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          maxLength={200}
        />

        <Textarea
          label="System prompt"
          description="The instructions Claude receives. The selected context is appended automatically."
          placeholder="You are a commit-message generator..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.currentTarget.value)}
          autosize
          minRows={6}
          maxRows={20}
          maxLength={8000}
          styles={{ input: { fontFamily: 'JetBrains Mono, Menlo, monospace', fontSize: 12 } }}
        />

        <Group grow align="flex-start">
          <Select
            label="Context source"
            description={
              <Text size="xs" c="dimmed">
                Output of <Code>{contextSource}</Code> is appended to the prompt.
              </Text>
            }
            value={contextSource}
            onChange={(value) => {
              if (value) setContextSource(value as SkillContextSource);
            }}
            data={CONTEXT_SOURCES.map((c) => ({ value: c.value, label: c.label }))}
            allowDeselect={false}
          />
          <Select
            label="Output mode"
            description={
              <Text size="xs" c="dimmed">
                {OUTPUT_MODES.find((o) => o.value === outputMode)?.hint}
              </Text>
            }
            value={outputMode}
            onChange={(value) => {
              if (value) setOutputMode(value as SkillOutputMode);
            }}
            data={OUTPUT_MODES.map((o) => ({ value: o.value, label: o.label }))}
            allowDeselect={false}
          />
        </Group>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button color="brand" onClick={handleSave} loading={saving}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
