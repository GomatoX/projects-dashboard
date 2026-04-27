'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Group,
  Text,
  Badge,
  Card,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Box,
  Code,
  ScrollArea,
  UnstyledButton,
  Collapse,
  ThemeIcon,
} from '@mantine/core';
import {
  IconHistory,
  IconRefresh,
  IconChevronDown,
  IconChevronRight,
  IconUser,
  IconRobot,
  IconTool,
  IconSparkles,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';

interface SessionMeta {
  id: string;
  filename: string;
  title: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}

interface ConversationTurn {
  role: string;
  content: string;
  model?: string;
  timestamp?: string;
  toolUses?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: string;
  }>;
}

interface SessionDetail {
  sessionId: string;
  summary: string;
  model: string;
  turns: ConversationTurn[];
  totalEntries: number;
}

interface ClaudeSessionsPanelProps {
  projectId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClaudeSessionsPanel({ projectId }: ClaudeSessionsPanelProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/claude-sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to load Claude sessions',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const toggleSession = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      setSessionDetail(null);
      return;
    }

    setExpandedSession(sessionId);
    setLoadingDetail(true);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/claude-sessions/${sessionId}`,
      );
      const data = await res.json();
      setSessionDetail(data);
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to load session',
        color: 'red',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" />
      </Center>
    );
  }

  if (sessions.length === 0) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <IconHistory size={48} style={{ opacity: 0.15 }} />
          <Text size="sm" c="dimmed">
            No Claude Code sessions found for this project
          </Text>
          <Text size="xs" c="dimmed">
            Sessions are stored in <code>~/.claude/projects/</code>
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <IconHistory size={20} style={{ opacity: 0.6 }} />
          <Text size="sm" fw={600}>
            Claude Code Sessions
          </Text>
          <Badge size="sm" variant="light" color="brand">
            {sessions.length}
          </Badge>
        </Group>
        <Tooltip label="Refresh">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={fetchSessions}
            loading={loading}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea style={{ flex: 1 }} offsetScrollbars>
        <Stack gap={6}>
          {sessions.map((session) => (
            <Box key={session.id}>
              <UnstyledButton
                w="100%"
                onClick={() => toggleSession(session.id)}
              >
                <Card
                  py="sm"
                  px="md"
                  style={{
                    border: '1px solid var(--mantine-color-dark-5)',
                    backgroundColor:
                      expandedSession === session.id
                        ? 'var(--mantine-color-dark-6)'
                        : 'var(--mantine-color-dark-7)',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      {expandedSession === session.id ? (
                        <IconChevronDown size={14} style={{ opacity: 0.4 }} />
                      ) : (
                        <IconChevronRight size={14} style={{ opacity: 0.4 }} />
                      )}
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {session.title}
                        </Text>
                        <Group gap="xs" mt={2}>
                          <Badge size="xs" variant="light" color="violet">
                            {session.model}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {formatBytes(session.sizeBytes)}
                          </Text>
                        </Group>
                      </Box>
                    </Group>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {timeAgo(session.updatedAt)}
                    </Text>
                  </Group>
                </Card>
              </UnstyledButton>

              {/* Expanded session content */}
              <Collapse expanded={expandedSession === session.id}>
                <Card
                  py="md"
                  px="md"
                  style={{
                    borderLeft: '1px solid var(--mantine-color-dark-5)',
                    borderRight: '1px solid var(--mantine-color-dark-5)',
                    borderBottom: '1px solid var(--mantine-color-dark-5)',
                    backgroundColor: 'var(--mantine-color-dark-8)',
                    borderRadius: '0 0 var(--mantine-radius-md) var(--mantine-radius-md)',
                    maxHeight: 500,
                    overflowY: 'auto',
                  }}
                >
                  {loadingDetail ? (
                    <Center h={100}>
                      <Loader color="brand" type="dots" size="sm" />
                    </Center>
                  ) : sessionDetail ? (
                    <Stack gap="md">
                      {sessionDetail.turns.map((turn, i) => (
                        <ConversationTurnCard key={i} turn={turn} />
                      ))}
                      {sessionDetail.turns.length === 0 && (
                        <Text size="sm" c="dimmed" ta="center">
                          No conversation data found
                        </Text>
                      )}
                    </Stack>
                  ) : null}
                </Card>
              </Collapse>
            </Box>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

// ─── Conversation Turn Card ──────────────────────────────

function ConversationTurnCard({ turn }: { turn: ConversationTurn }) {
  const isUser = turn.role === 'user';

  return (
    <Box>
      <Group gap="xs" mb={4}>
        <ThemeIcon
          size={18}
          variant="light"
          color={isUser ? 'blue' : 'brand'}
          radius="xl"
        >
          {isUser ? <IconUser size={10} /> : <IconRobot size={10} />}
        </ThemeIcon>
        <Text size="xs" fw={600} c={isUser ? 'blue.4' : 'brand'}>
          {isUser ? 'You' : 'Claude'}
        </Text>
        {turn.model && !isUser && (
          <Badge size="xs" variant="outline" color="dark.3">
            {turn.model}
          </Badge>
        )}
      </Group>

      <Box
        pl={26}
        style={{
          borderLeft: `2px solid var(--mantine-color-${isUser ? 'blue' : 'brand'}-9)`,
        }}
      >
        <Text
          size="sm"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          lineClamp={isUser ? undefined : 20}
        >
          {turn.content}
        </Text>

        {/* Tool uses */}
        {turn.toolUses && turn.toolUses.length > 0 && (
          <Stack gap={4} mt="xs">
            {turn.toolUses.map((tool, j) => (
              <Card
                key={j}
                py={4}
                px="sm"
                style={{
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-5)',
                }}
              >
                <Group gap={4}>
                  <IconTool size={12} style={{ opacity: 0.5 }} />
                  <Text size="xs" fw={600}>
                    {tool.name}
                  </Text>
                </Group>
                {tool.result && (
                  <Code
                    block
                    mt={4}
                    style={{
                      fontSize: 10,
                      maxHeight: 100,
                      overflow: 'auto',
                    }}
                  >
                    {tool.result.slice(0, 500)}
                  </Code>
                )}
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
