'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card,
  Group,
  Text,
  Button,
  Stack,
  Box,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  ScrollArea,
} from '@mantine/core';
import {
  IconTrash,
  IconDownload,
  IconPlayerPlay,
  IconPlayerStop,
} from '@tabler/icons-react';

interface PM2LogViewerProps {
  projectId: string;
  processName: string;
}

const MAX_LOG_LINES = 500;

export function PM2LogViewer({ projectId, processName }: PM2LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  // Load initial logs
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pm2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PM2_LOGS', name: processName, lines: 100 }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          (data && typeof data.error === 'string' && data.error) ||
            `Request failed (HTTP ${res.status})`,
        );
        return;
      }

      if (data.type === 'PM2_LOGS_RESULT' && data.logs) {
        const lines = data.logs.split('\n').filter((l: string) => l.trim());
        setLogs(lines.slice(-MAX_LOG_LINES));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [projectId, processName]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-viewport]') || scrollRef.current;
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const downloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${processName}-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Color-code log lines
  const colorLine = (line: string) => {
    if (line.includes('error') || line.includes('Error') || line.includes('ERR')) {
      return '#ff6b6b';
    }
    if (line.includes('warn') || line.includes('Warning') || line.includes('WARN')) {
      return '#ffd43b';
    }
    if (line.includes('info') || line.includes('INFO')) {
      return '#69db7c';
    }
    return '#c1c2c5';
  };

  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            Logs — {processName}
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              color="brand"
              leftSection={<IconPlayerPlay size={12} />}
              onClick={loadLogs}
              loading={loading}
            >
              Refresh
            </Button>
            <Tooltip label="Clear">
              <ActionIcon variant="subtle" size="sm" onClick={clearLogs}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Download">
              <ActionIcon variant="subtle" size="sm" onClick={downloadLogs}>
                <IconDownload size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <ScrollArea
          h={350}
          ref={scrollRef}
          style={{
            backgroundColor: 'var(--mantine-color-dark-9)',
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-dark-6)',
          }}
        >
          <Box p="sm" style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
            {error ? (
              <Text size="xs" c="red" ta="center" py="xl">
                Failed to load logs: {error}
              </Text>
            ) : logs.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="xl">
                No logs available. Click Refresh to load.
              </Text>
            ) : (
              logs.map((line, i) => (
                <div key={i} style={{ color: colorLine(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {line}
                </div>
              ))
            )}
          </Box>
        </ScrollArea>
      </Stack>
    </Card>
  );
}
