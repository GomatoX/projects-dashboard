'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  Tabs,
} from '@mantine/core';
import {
  IconTerminal,
  IconPlus,
  IconX,
  IconMaximize,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import dynamic from 'next/dynamic';

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

export function TerminalPanel({ projectId, deviceId }: TerminalPanelProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
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
        message:
          error instanceof Error ? error.message : 'Failed to spawn terminal',
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

  const handleExit = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, active: false } : s,
      ),
    );
  };

  // No agent connected
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

  // No sessions — show spawn button
  if (sessions.length === 0) {
    return (
      <Center h={400}>
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
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap={0}>
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
          height: '100%',
          minHeight: 300,
          backgroundColor: '#1e1e1e',
        }}
      >
        {activeSession && (
          <TerminalInstance
            key={activeSession}
            projectId={projectId}
            sessionId={activeSession}
            onExit={() => handleExit(activeSession)}
          />
        )}
      </Box>
    </Stack>
  );
}
