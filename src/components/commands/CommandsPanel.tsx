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
  Box,
  ActionIcon,
  Tooltip,
  Badge,
  SimpleGrid,
  Code,
  ScrollArea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDisclosure } from '@mantine/hooks';
import dynamic from 'next/dynamic';
import {
  IconBolt,
  IconPlus,
  IconPencil,
  IconTrash,
  IconPlayerPlay,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconX,
  IconAlertTriangle,
  IconBroadcast,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import type { ProjectCommand } from '@/lib/commands';
import { CommandEditorModal } from './CommandEditorModal';

// Lazy-load xterm wrapper (SSR-incompatible)
const TerminalInstance = dynamic(
  () =>
    import('@/components/terminal/TerminalInstance').then((m) => ({
      default: m.TerminalInstance,
    })),
  {
    ssr: false,
    loading: () => (
      <Center h={300}>
        <Loader color="brand" type="dots" />
      </Center>
    ),
  },
);

interface CommandsPanelProps {
  projectId: string;
  deviceId: string | null;
}

type ActiveRun =
  | {
      mode: 'oneshot';
      commandId: string;
      label: string;
      cmd: string;
      output: string;
      exitCode?: number;
      durationMs?: number;
      status: 'running' | 'done' | 'error';
      errorMessage?: string;
    }
  | {
      mode: 'stream';
      commandId: string;
      label: string;
      cmd: string;
      sessionId: string;
      status: 'running' | 'done';
      exitCode?: number;
    };

export function CommandsPanel({ projectId, deviceId }: CommandsPanelProps) {
  const [commands, setCommands] = useState<ProjectCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProjectCommand | null>(null);
  const [editorOpened, editorHandlers] = useDisclosure(false);
  const [running, setRunning] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  // Fetch commands
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

  // Persist the whole list
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
          if (activeRun?.commandId === cmd.id) setActiveRun(null);
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

  // Execute a command
  const runCommand = async (cmd: ProjectCommand) => {
    if (!deviceId) {
      notify({
        title: 'No agent',
        message: 'Connect an agent before running commands',
        color: 'red',
      });
      return;
    }

    setRunning(cmd.id);
    if (cmd.streaming) {
      // For streaming, optimistically clear so the new TerminalInstance remounts
      setActiveRun(null);
    } else {
      setActiveRun({
        mode: 'oneshot',
        commandId: cmd.id,
        label: cmd.label,
        cmd: cmd.cmd,
        output: '',
        status: 'running',
      });
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/commands/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: cmd.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Execution failed');
      }

      if (data.mode === 'stream') {
        setActiveRun({
          mode: 'stream',
          commandId: cmd.id,
          label: data.label,
          cmd: data.cmd,
          sessionId: data.sessionId,
          status: 'running',
        });
      } else {
        setActiveRun({
          mode: 'oneshot',
          commandId: cmd.id,
          label: data.label,
          cmd: data.cmd,
          output: data.output ?? '',
          exitCode: data.exitCode,
          durationMs: data.durationMs,
          status: data.exitCode === 0 ? 'done' : 'error',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run command';
      setActiveRun({
        mode: 'oneshot',
        commandId: cmd.id,
        label: cmd.label,
        cmd: cmd.cmd,
        output: '',
        status: 'error',
        errorMessage: message,
      });
      notify({ title: 'Command failed', message, color: 'red' });
    } finally {
      setRunning(null);
    }
  };

  const stopStream = async () => {
    if (activeRun?.mode !== 'stream') return;
    try {
      await fetch(`/api/projects/${projectId}/terminal`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeRun.sessionId }),
      });
    } catch {
      // Ignore — UI will reflect via TERMINAL_EXIT
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

  if (!deviceId) {
    return (
      <Center h={200}>
        <Stack align="center" gap="sm">
          <IconAlertTriangle size={40} style={{ opacity: 0.3 }} />
          <Text c="dimmed">No device assigned to this project</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="xs">
          <IconBolt size={20} />
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Commands
          </Text>
          <Badge size="sm" variant="light" color="brand">
            {commands.length}
          </Badge>
        </Group>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          variant="light"
          color="brand"
          onClick={() => openEditor(null)}
        >
          New Command
        </Button>
      </Group>

      {/* Empty state */}
      {commands.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="md">
            <IconBolt size={48} style={{ opacity: 0.15 }} />
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              No commands yet. Add shortcuts for the things you run often —{' '}
              <Code>pnpm build</Code>, <Code>pnpm test</Code>, deploy scripts, etc.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              color="brand"
              onClick={() => openEditor(null)}
            >
              Add your first command
            </Button>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
          {commands.map((cmd) => (
            <CommandCard
              key={cmd.id}
              command={cmd}
              isRunning={running === cmd.id}
              isActive={activeRun?.commandId === cmd.id && activeRun.status === 'running'}
              lastRun={
                activeRun?.commandId === cmd.id && activeRun.mode === 'oneshot'
                  ? { exitCode: activeRun.exitCode, status: activeRun.status }
                  : null
              }
              onRun={() => runCommand(cmd)}
              onEdit={() => openEditor(cmd)}
              onDelete={() => handleDeleteCommand(cmd)}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Output area */}
      {activeRun && (
        <Card withBorder padding={0}>
          <Group
            justify="space-between"
            px="md"
            py="xs"
            style={{
              borderBottom: '1px solid var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-8)',
            }}
          >
            <Group gap="sm">
              <RunStatusIcon run={activeRun} />
              <Text size="sm" fw={600}>
                {activeRun.label}
              </Text>
              <Code style={{ fontSize: 11 }}>{activeRun.cmd}</Code>
              {activeRun.mode === 'oneshot' && activeRun.durationMs !== undefined && (
                <Badge size="xs" variant="light" color="gray">
                  {formatDuration(activeRun.durationMs)}
                </Badge>
              )}
              {activeRun.mode === 'oneshot' && activeRun.exitCode !== undefined && (
                <Badge
                  size="xs"
                  variant="light"
                  color={activeRun.exitCode === 0 ? 'teal' : 'red'}
                >
                  exit {activeRun.exitCode}
                </Badge>
              )}
              {activeRun.mode === 'stream' && (
                <Badge
                  size="xs"
                  variant="light"
                  color={activeRun.status === 'running' ? 'teal' : 'gray'}
                  leftSection={<IconBroadcast size={10} />}
                >
                  {activeRun.status === 'running' ? 'streaming' : 'finished'}
                  {activeRun.exitCode !== undefined && ` · exit ${activeRun.exitCode}`}
                </Badge>
              )}
            </Group>
            <Group gap={4}>
              {activeRun.mode === 'stream' && activeRun.status === 'running' && (
                <Tooltip label="Stop">
                  <ActionIcon variant="subtle" color="red" onClick={stopStream}>
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label="Close">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    if (activeRun.mode === 'stream' && activeRun.status === 'running') {
                      stopStream();
                    }
                    setActiveRun(null);
                  }}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {activeRun.mode === 'stream' ? (
            <Box style={{ height: 400, backgroundColor: '#1e1e1e' }}>
              <TerminalInstance
                key={activeRun.sessionId}
                projectId={projectId}
                sessionId={activeRun.sessionId}
                onExit={(code) =>
                  setActiveRun((prev) =>
                    prev && prev.mode === 'stream' && prev.sessionId === activeRun.sessionId
                      ? { ...prev, status: 'done', exitCode: code }
                      : prev,
                  )
                }
              />
            </Box>
          ) : (
            <OneShotOutput run={activeRun} />
          )}
        </Card>
      )}

      <CommandEditorModal
        opened={editorOpened}
        onClose={editorHandlers.close}
        initial={editing}
        onSave={handleSaveCommand}
      />
    </Stack>
  );
}

// ─── Subcomponents ──────────────────────────────────────

function CommandCard({
  command,
  isRunning,
  isActive,
  lastRun,
  onRun,
  onEdit,
  onDelete,
}: {
  command: ProjectCommand;
  isRunning: boolean;
  isActive: boolean;
  lastRun: { exitCode?: number; status: 'running' | 'done' | 'error' } | null;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      padding="sm"
      withBorder
      style={{
        borderColor: isActive
          ? 'var(--mantine-color-brand-6)'
          : undefined,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {command.icon && (
              <Text size="lg" lh={1}>
                {command.icon}
              </Text>
            )}
            <Text fw={600} size="sm" truncate>
              {command.label}
            </Text>
            {command.streaming && (
              <Tooltip label="Streaming output">
                <IconBroadcast
                  size={12}
                  style={{ opacity: 0.5, flexShrink: 0 }}
                />
              </Tooltip>
            )}
            {lastRun && lastRun.status !== 'running' && (
              <Tooltip
                label={`Last exit: ${lastRun.exitCode ?? '?'}`}
              >
                {lastRun.exitCode === 0 ? (
                  <IconCircleCheck size={14} color="var(--mantine-color-teal-6)" />
                ) : (
                  <IconCircleX size={14} color="var(--mantine-color-red-6)" />
                )}
              </Tooltip>
            )}
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

        <Code
          block
          style={{
            fontSize: 11,
            backgroundColor: 'var(--mantine-color-dark-8)',
            padding: '6px 8px',
            maxHeight: 60,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {command.cmd}
        </Code>

        <Button
          size="xs"
          variant={isActive ? 'filled' : 'light'}
          color={isActive ? 'brand' : 'brand'}
          leftSection={
            isRunning ? (
              <IconLoader2
                size={14}
                style={{ animation: 'spin 1s linear infinite' }}
              />
            ) : (
              <IconPlayerPlay size={14} />
            )
          }
          loading={isRunning}
          onClick={onRun}
          fullWidth
        >
          {isActive ? 'Running…' : 'Run'}
        </Button>
      </Stack>
    </Card>
  );
}

function RunStatusIcon({ run }: { run: ActiveRun }) {
  if (run.status === 'running') {
    return <IconLoader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />;
  }
  if (run.mode === 'oneshot' && run.status === 'error') {
    return <IconCircleX size={14} color="var(--mantine-color-red-6)" />;
  }
  if (run.mode === 'stream' && run.exitCode !== undefined && run.exitCode !== 0) {
    return <IconCircleX size={14} color="var(--mantine-color-red-6)" />;
  }
  return <IconCircleCheck size={14} color="var(--mantine-color-teal-6)" />;
}

function OneShotOutput({
  run,
}: {
  run: Extract<ActiveRun, { mode: 'oneshot' }>;
}) {
  const text =
    run.errorMessage ??
    (run.output ||
      (run.status === 'running' ? 'Running…' : '(no output)'));

  return (
    <ScrollArea h={300} type="auto">
      <Box
        component="pre"
        p="md"
        m={0}
        style={{
          fontSize: 12,
          fontFamily: 'JetBrains Mono, Menlo, monospace',
          color: run.status === 'error' ? 'var(--mantine-color-red-4)' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          backgroundColor: '#1e1e1e',
        }}
      >
        {text}
      </Box>
    </ScrollArea>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
