'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Badge,
  Center,
  Loader,
  Box,
  Card,
  Code,
} from '@mantine/core';
import { IconTerminal, IconPlus, IconX } from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import dynamic from 'next/dynamic';
import { SavedCommandsSidebar } from './SavedCommandsSidebar';
import {
  RunStatusIcon,
  OneShotOutput,
  formatDuration,
  type ActiveRun,
} from './CommandRunOutput';
import type { ProjectCommand } from '@/lib/commands';

// Lazy-load xterm to avoid SSR issues
const TerminalInstance = dynamic(
  () => import('./TerminalInstance').then((m) => ({ default: m.TerminalInstance })),
  {
    ssr: false,
    loading: () => (
      <Center h={400}>
        <Loader color="brand" type="dots" />
      </Center>
    ),
  },
);

interface TerminalPanelProps {
  projectId: string;
  deviceId: string | null;
}

interface TerminalSession {
  id: string;
  label: string;
  active: boolean;
}

const SIDEBAR_WIDTH = 240;

export function TerminalPanel({ projectId, deviceId }: TerminalPanelProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
  const [oneShotRun, setOneShotRun] = useState<Extract<ActiveRun, { mode: 'oneshot' }> | null>(
    null,
  );
  const sessionCounter = useRef(0);

  const spawnTerminal = useCallback(async () => {
    if (!deviceId || spawning) return;
    setSpawning(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: 120, rows: 30 }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sessionCounter.current += 1;
      const session: TerminalSession = {
        id: data.sessionId,
        label: `Terminal ${sessionCounter.current}`,
        active: true,
      };

      setSessions((prev) => [...prev, session]);
      setActiveSession(data.sessionId);
    } catch (error) {
      notify({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to spawn terminal',
        color: 'red',
      });
    } finally {
      setSpawning(false);
    }
  }, [projectId, deviceId, spawning]);

  const killSession = async (sessionId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/terminal`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // Ignore errors on kill
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSession === sessionId) {
      setActiveSession(sessions.find((s) => s.id !== sessionId)?.id ?? null);
    }
  };

  const handleExit = (sessionId: string, exitCode?: number) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, active: false } : s)));
    // If this session was started by a streaming command, suppress the
    // running spinner. (One-shot runs don't have a session id.)
    if (runningCommandId && exitCode !== undefined) {
      setRunningCommandId(null);
    }
  };

  // Run a saved command. Streaming commands spawn a new terminal session
  // (server-side via /commands/execute) and we add it to the strip.
  // One-shot commands render in the inline output card below the terminal.
  const runSavedCommand = useCallback(
    async (cmd: ProjectCommand) => {
      if (!deviceId) {
        notify({
          title: 'No agent',
          message: 'Connect an agent before running commands',
          color: 'red',
        });
        return;
      }

      setRunningCommandId(cmd.id);
      if (!cmd.streaming) {
        setOneShotRun({
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
          // Server already spawned the session — just add it to the strip.
          sessionCounter.current += 1;
          const session: TerminalSession = {
            id: data.sessionId,
            label: cmd.label || `Terminal ${sessionCounter.current}`,
            active: true,
          };
          setSessions((prev) => [...prev, session]);
          setActiveSession(data.sessionId);
          setOneShotRun(null);
          // For streaming the spinner clears when TerminalInstance reports exit.
        } else {
          setOneShotRun({
            mode: 'oneshot',
            commandId: cmd.id,
            label: data.label,
            cmd: data.cmd,
            output: data.output ?? '',
            exitCode: data.exitCode,
            durationMs: data.durationMs,
            status: data.exitCode === 0 ? 'done' : 'error',
          });
          setRunningCommandId(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run command';
        setOneShotRun({
          mode: 'oneshot',
          commandId: cmd.id,
          label: cmd.label,
          cmd: cmd.cmd,
          output: '',
          status: 'error',
          errorMessage: message,
        });
        setRunningCommandId(null);
        notify({ title: 'Command failed', message, color: 'red' });
      }
    },
    [deviceId, projectId],
  );

  // No agent connected — same empty state as before, no sidebar (commands
  // can't run anyway).
  if (!deviceId) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <IconTerminal size={48} style={{ opacity: 0.15 }} />
          <Text size="sm" c="dimmed">
            Connect an agent to use the terminal
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Group gap={0} align="stretch" wrap="nowrap" style={{ height: '100%', minHeight: 400 }}>
      <Box style={{ width: SIDEBAR_WIDTH, flexShrink: 0 }}>
        <SavedCommandsSidebar
          projectId={projectId}
          onRun={runSavedCommand}
          runningCommandId={runningCommandId}
        />
      </Box>

      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        {sessions.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="md">
              <IconTerminal size={48} style={{ opacity: 0.15 }} />
              <Text size="sm" c="dimmed">
                Open a terminal session in this project
              </Text>
              <Button
                color="brand"
                leftSection={<IconPlus size={16} />}
                onClick={spawnTerminal}
                loading={spawning}
              >
                New Terminal
              </Button>
              <Text size="xs" c="dimmed">
                or click Run on a saved command on the left
              </Text>
            </Stack>
          </Center>
        ) : (
          <>
            {/* Terminal tab bar */}
            <Group
              gap={0}
              px="xs"
              py={4}
              style={{
                borderBottom: '1px solid var(--mantine-color-dark-5)',
                backgroundColor: 'var(--mantine-color-dark-8)',
              }}
            >
              {sessions.map((session) => (
                <Group
                  key={session.id}
                  gap={4}
                  px="sm"
                  py={4}
                  onClick={() => setActiveSession(session.id)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor:
                      activeSession === session.id
                        ? 'var(--mantine-color-dark-6)'
                        : 'transparent',
                    transition: 'background-color 0.1s',
                  }}
                >
                  <IconTerminal size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" fw={activeSession === session.id ? 600 : 400}>
                    {session.label}
                  </Text>
                  {!session.active && (
                    <Badge size="xs" color="red" variant="light">
                      exited
                    </Badge>
                  )}
                  <ActionIcon
                    size={14}
                    variant="subtle"
                    color="gray"
                    onClick={(e) => {
                      e.stopPropagation();
                      killSession(session.id);
                    }}
                  >
                    <IconX size={10} />
                  </ActionIcon>
                </Group>
              ))}

              <Tooltip label="New Terminal">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  ml="xs"
                  onClick={spawnTerminal}
                  loading={spawning}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Terminal content */}
            <Box
              style={{
                flex: 1,
                minHeight: 300,
                backgroundColor: '#1e1e1e',
              }}
            >
              {activeSession && (
                <TerminalInstance
                  key={activeSession}
                  projectId={projectId}
                  sessionId={activeSession}
                  onExit={(code) => handleExit(activeSession, code)}
                />
              )}
            </Box>
          </>
        )}

        {/* Inline one-shot output card (rendered below the terminal area) */}
        {oneShotRun && (
          <Card withBorder padding={0} mt="xs">
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
                <RunStatusIcon run={oneShotRun} />
                <Text size="sm" fw={600}>
                  {oneShotRun.label}
                </Text>
                <Code style={{ fontSize: 11 }}>{oneShotRun.cmd}</Code>
                {oneShotRun.durationMs !== undefined && (
                  <Badge size="xs" variant="light" color="gray">
                    {formatDuration(oneShotRun.durationMs)}
                  </Badge>
                )}
                {oneShotRun.exitCode !== undefined && (
                  <Badge
                    size="xs"
                    variant="light"
                    color={oneShotRun.exitCode === 0 ? 'teal' : 'red'}
                  >
                    exit {oneShotRun.exitCode}
                  </Badge>
                )}
              </Group>
              <Tooltip label="Close">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setOneShotRun(null)}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <OneShotOutput run={oneShotRun} />
          </Card>
        )}
      </Stack>
    </Group>
  );
}
