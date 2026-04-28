'use client';

import { Box, ScrollArea } from '@mantine/core';
import { IconCircleCheck, IconCircleX, IconLoader2 } from '@tabler/icons-react';

export type OneShotRun = {
  mode: 'oneshot';
  commandId: string;
  label: string;
  cmd: string;
  output: string;
  exitCode?: number;
  durationMs?: number;
  status: 'running' | 'done' | 'error';
  errorMessage?: string;
};

export type StreamRun = {
  mode: 'stream';
  commandId: string;
  label: string;
  cmd: string;
  sessionId: string;
  status: 'running' | 'done';
  exitCode?: number;
};

export type ActiveRun = OneShotRun | StreamRun;

export function RunStatusIcon({ run }: { run: ActiveRun }) {
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

export function OneShotOutput({ run }: { run: OneShotRun }) {
  const text =
    run.errorMessage ?? (run.output || (run.status === 'running' ? 'Running…' : '(no output)'));

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

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
