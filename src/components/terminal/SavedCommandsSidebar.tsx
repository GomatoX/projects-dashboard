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
  Code,
  ScrollArea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBolt,
  IconPlus,
  IconPencil,
  IconTrash,
  IconPlayerPlay,
  IconLoader2,
  IconBroadcast,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import type { ProjectCommand } from '@/lib/commands';
import { CommandEditorModal } from '@/components/commands/CommandEditorModal';

interface SavedCommandsSidebarProps {
  projectId: string;
  /**
   * Called when the user clicks Run on a command. The parent owns the
   * actual execution (it talks to /commands/execute and updates the
   * terminal session list / one-shot output card).
   */
  onRun: (cmd: ProjectCommand) => void;
  /**
   * The command currently executing (if any) — used to render a spinner
   * on its row. The parent tracks this; the sidebar just reflects it.
   */
  runningCommandId: string | null;
}

export function SavedCommandsSidebar({
  projectId,
  onRun,
  runningCommandId,
}: SavedCommandsSidebarProps) {
  const [commands, setCommands] = useState<ProjectCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProjectCommand | null>(null);
  const [editorOpened, editorHandlers] = useDisclosure(false);

  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/commands`);
      if (!res.ok) throw new Error('Failed to load commands');
      const data = await res.json();
      setCommands(data.commands ?? []);
    } catch {
      // Surface silently — not critical
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCommands();
  }, [fetchCommands]);

  const saveCommands = useCallback(
    async (next: ProjectCommand[]) => {
      const res = await fetch(`/api/projects/${projectId}/commands`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setCommands(data.commands ?? next);
    },
    [projectId],
  );

  const handleSaveCommand = async (cmd: ProjectCommand) => {
    const exists = commands.some((c) => c.id === cmd.id);
    const next = exists
      ? commands.map((c) => (c.id === cmd.id ? cmd : c))
      : [...commands, cmd];
    try {
      await saveCommands(next);
      notify({
        title: exists ? 'Command updated' : 'Command added',
        message: cmd.label,
        color: 'teal',
      });
    } catch (error) {
      notify({
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  };

  const handleDeleteCommand = (cmd: ProjectCommand) => {
    modals.openConfirmModal({
      title: 'Delete Command',
      children: (
        <Text size="sm">
          Delete <b>{cmd.label}</b>? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await saveCommands(commands.filter((c) => c.id !== cmd.id));
          notify({ title: 'Command deleted', message: cmd.label, color: 'gray' });
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

  const openEditor = (cmd: ProjectCommand | null) => {
    setEditing(cmd);
    editorHandlers.open();
  };

  return (
    <Stack
      gap={0}
      h="100%"
      style={{
        borderRight: '1px solid var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      <Group
        justify="space-between"
        px="sm"
        py={6}
        style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}
      >
        <Group gap={6}>
          <IconBolt size={14} style={{ opacity: 0.7 }} />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Saved Commands
          </Text>
        </Group>
        <Tooltip label="New command">
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEditor(null)}>
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="auto">
        {loading ? (
          <Center py="md">
            <Loader color="brand" type="dots" size="sm" />
          </Center>
        ) : commands.length === 0 ? (
          <Center py="lg" px="sm">
            <Stack align="center" gap={6}>
              <Text size="xs" c="dimmed" ta="center">
                No saved commands yet.
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={() => openEditor(null)}
              >
                Add one
              </Button>
            </Stack>
          </Center>
        ) : (
          <Stack gap={4} p={6}>
            {commands.map((cmd) => (
              <SavedCommandRow
                key={cmd.id}
                command={cmd}
                isRunning={runningCommandId === cmd.id}
                onRun={() => onRun(cmd)}
                onEdit={() => openEditor(cmd)}
                onDelete={() => handleDeleteCommand(cmd)}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>

      <CommandEditorModal
        opened={editorOpened}
        onClose={editorHandlers.close}
        initial={editing}
        onSave={handleSaveCommand}
      />
    </Stack>
  );
}

function SavedCommandRow({
  command,
  isRunning,
  onRun,
  onEdit,
  onDelete,
}: {
  command: ProjectCommand;
  isRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card padding={6} withBorder>
      <Stack gap={4}>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          {command.icon && (
            <Text size="sm" lh={1}>
              {command.icon}
            </Text>
          )}
          <Text fw={600} size="xs" truncate style={{ flex: 1 }}>
            {command.label}
          </Text>
          {command.streaming && (
            <Tooltip label="Streaming output">
              <IconBroadcast size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
            </Tooltip>
          )}
        </Group>

        <Code
          style={{
            fontSize: 10,
            backgroundColor: 'var(--mantine-color-dark-9)',
            padding: '3px 6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {command.cmd}
        </Code>

        <Group gap={2} wrap="nowrap">
          <Button
            size="compact-xs"
            variant="light"
            color="brand"
            leftSection={
              isRunning ? (
                <IconLoader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <IconPlayerPlay size={11} />
              )
            }
            loading={isRunning}
            onClick={onRun}
            style={{ flex: 1 }}
          >
            Run
          </Button>
          <Tooltip label="Edit">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onEdit}>
              <IconPencil size={11} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon size="sm" variant="subtle" color="red" onClick={onDelete}>
              <IconTrash size={11} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </Card>
  );
}
