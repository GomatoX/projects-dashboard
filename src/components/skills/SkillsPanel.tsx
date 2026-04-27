'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  Card,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Badge,
  SimpleGrid,
  Code,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSparkles,
  IconPlus,
  IconPencil,
  IconTrash,
  IconPlayerPlay,
  IconLoader2,
  IconAlertTriangle,
  IconClipboard,
  IconWindow,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import {
  CONTEXT_SOURCES,
  type Skill,
  type SkillInput,
} from '@/lib/skills';
import { SkillEditorModal } from './SkillEditorModal';
import { SkillResultModal, type SkillResult } from './SkillResultModal';

interface SkillsPanelProps {
  projectId: string;
  deviceId: string | null;
}

/**
 * Project skills tab. Mirrors the layout of `CommandsPanel` but each card
 * runs an AI prompt instead of a shell command. The first GET to the API
 * lazily seeds two built-in skills, so the panel is never empty on a fresh
 * project.
 */
export function SkillsPanel({ projectId, deviceId }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [editorOpened, editorHandlers] = useDisclosure(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);
  const [resultOpened, resultHandlers] = useDisclosure(false);

  // Fetch skills (lazy-seeds built-ins on first call)
  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/skills`);
      if (!res.ok) throw new Error('Failed to load skills');
      const data = await res.json();
      setSkills(data.skills ?? []);
    } catch {
      // Silent — panel will simply show empty
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleSaveSkill = async (input: SkillInput) => {
    const isEdit = editing !== null;
    const url = isEdit
      ? `/api/projects/${projectId}/skills/${editing.id}`
      : `/api/projects/${projectId}/skills`;
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    const saved = data.skill as Skill;
    setSkills((prev) =>
      isEdit ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved],
    );

    notify({
      title: isEdit ? 'Skill updated' : 'Skill added',
      message: saved.name,
      color: 'teal',
    });
  };

  const handleDeleteSkill = (skill: Skill) => {
    modals.openConfirmModal({
      title: 'Delete Skill',
      children: (
        <Text size="sm">
          Delete <b>{skill.name}</b>? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/projects/${projectId}/skills/${skill.id}`,
            { method: 'DELETE' },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to delete');
          }
          setSkills((prev) => prev.filter((s) => s.id !== skill.id));
          notify({ title: 'Skill deleted', message: skill.name, color: 'gray' });
        } catch (error) {
          notify({
            title: 'Delete failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  const openEditor = (skill: Skill | null) => {
    setEditing(skill);
    editorHandlers.open();
  };

  const runSkill = async (skill: Skill) => {
    if (skill.contextSource !== 'none' && !deviceId) {
      notify({
        title: 'No agent',
        message: 'This skill needs a connected agent to gather context',
        color: 'red',
      });
      return;
    }

    setRunning(skill.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/skills/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skill.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');

      const payload: SkillResult = {
        skillId: data.skillId,
        name: data.name,
        result: data.result,
        contextChars: data.contextChars ?? 0,
        contextTruncated: data.contextTruncated ?? false,
      };

      if (data.outputMode === 'clipboard') {
        try {
          await navigator.clipboard.writeText(payload.result);
          notify({
            title: 'Copied to clipboard',
            message: skill.name,
            color: 'teal',
          });
        } catch {
          // Clipboard blocked — fall back to modal so the user can copy manually
          setResult(payload);
          resultHandlers.open();
          notify({
            title: 'Clipboard blocked',
            message: 'Result shown in modal — copy manually',
            color: 'yellow',
          });
        }
      } else {
        setResult(payload);
        resultHandlers.open();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Skill execution failed';
      notify({ title: 'Skill failed', message, color: 'red' });
    } finally {
      setRunning(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <Center h={300}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="xs">
          <IconSparkles size={20} />
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Skills
          </Text>
          <Badge size="sm" variant="light" color="brand">
            {skills.length}
          </Badge>
        </Group>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          variant="light"
          color="brand"
          onClick={() => openEditor(null)}
        >
          New Skill
        </Button>
      </Group>

      {!deviceId && (
        <Card withBorder padding="sm" bg="var(--mantine-color-yellow-9)" c="yellow.1">
          <Group gap="xs">
            <IconAlertTriangle size={16} />
            <Text size="xs">
              No agent connected — skills that need git context (diff, status) won&apos;t run.
            </Text>
          </Group>
        </Card>
      )}

      {skills.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="md">
            <IconSparkles size={48} style={{ opacity: 0.15 }} />
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              No skills yet. Skills are AI prompts you can fire on your project — like{' '}
              <Code>generate commit message</Code> or <Code>code review</Code>.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              color="brand"
              onClick={() => openEditor(null)}
            >
              Add your first skill
            </Button>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isRunning={running === skill.id}
              onRun={() => runSkill(skill)}
              onEdit={() => openEditor(skill)}
              onDelete={() => handleDeleteSkill(skill)}
            />
          ))}
        </SimpleGrid>
      )}

      <SkillEditorModal
        opened={editorOpened}
        onClose={editorHandlers.close}
        initial={editing}
        onSave={handleSaveSkill}
      />

      <SkillResultModal
        opened={resultOpened}
        onClose={resultHandlers.close}
        result={result}
      />
    </Stack>
  );
}

// ─── SkillCard ──────────────────────────────────────────

function SkillCard({
  skill,
  isRunning,
  onRun,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  isRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const contextLabel = CONTEXT_SOURCES.find((c) => c.value === skill.contextSource)?.label;

  return (
    <Card padding="sm" withBorder>
      <Stack gap="xs" h="100%">
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {skill.icon && (
              <Text size="lg" lh={1}>
                {skill.icon}
              </Text>
            )}
            <Text fw={600} size="sm" truncate>
              {skill.name}
            </Text>
            <Tooltip label={skill.outputMode === 'clipboard' ? 'Copies result' : 'Shows result in modal'}>
              {skill.outputMode === 'clipboard' ? (
                <IconClipboard size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
              ) : (
                <IconWindow size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
              )}
            </Tooltip>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Edit">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={onEdit}>
                <IconPencil size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon size="sm" variant="subtle" color="red" onClick={onDelete}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {skill.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {skill.description}
          </Text>
        )}

        {skill.contextSource !== 'none' && contextLabel && (
          <Badge size="xs" variant="light" color="grape" style={{ alignSelf: 'flex-start' }}>
            {contextLabel}
          </Badge>
        )}

        <div style={{ flex: 1 }} />

        <Button
          size="xs"
          variant="light"
          color="brand"
          leftSection={
            isRunning ? (
              <IconLoader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <IconPlayerPlay size={14} />
            )
          }
          loading={isRunning}
          onClick={onRun}
          fullWidth
        >
          {isRunning ? 'Running…' : 'Run'}
        </Button>
      </Stack>
    </Card>
  );
}
