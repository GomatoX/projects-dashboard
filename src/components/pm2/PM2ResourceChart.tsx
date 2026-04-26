'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Text, Group, Stack, Box, SegmentedControl, Badge } from '@mantine/core';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface PM2ResourceChartProps {
  projectId: string;
  processName: string;
}

interface DataPoint {
  time: string;
  cpu: number;
  memory: number; // MB
}

const MAX_POINTS = 60;

export function PM2ResourceChart({ projectId, processName }: PM2ResourceChartProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [view, setView] = useState<'cpu' | 'memory' | 'both'>('both');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pm2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PM2_LIST' }),
      });
      if (!res.ok) return;
      const result = await res.json();

      if (result.type === 'PM2_LIST_RESULT') {
        const proc = result.processes.find(
          (p: { name: string }) => p.name === processName,
        );
        if (proc) {
          const now = new Date();
          const timeStr = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

          setData((prev) => {
            const next = [
              ...prev,
              {
                time: timeStr,
                cpu: Math.round(proc.cpu * 100) / 100,
                memory: Math.round((proc.memory / (1024 * 1024)) * 10) / 10,
              },
            ];
            return next.slice(-MAX_POINTS);
          });
        }
      }
    } catch {
      // Ignore
    }
  }, [projectId, processName]);

  useEffect(() => {
    fetchStats();
    pollRef.current = setInterval(fetchStats, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStats]);

  const latestCpu = data.length > 0 ? data[data.length - 1].cpu : 0;
  const latestMem = data.length > 0 ? data[data.length - 1].memory : 0;

  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between">
        <Text size="sm" fw={600} c="dimmed" tt="uppercase">
          Resource Usage
        </Text>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as 'cpu' | 'memory' | 'both')}
          data={[
            { label: 'Both', value: 'both' },
            { label: 'CPU', value: 'cpu' },
            { label: 'Memory', value: 'memory' },
          ]}
        />
      </Group>

      <Group gap="lg">
        <Group gap={4}>
          <Box w={8} h={8} style={{ borderRadius: '50%', background: '#00b5ad' }} />
          <Text size="xs" c="dimmed">
            CPU: {latestCpu.toFixed(1)}%
          </Text>
        </Group>
        <Group gap={4}>
          <Box w={8} h={8} style={{ borderRadius: '50%', background: '#7c3aed' }} />
          <Text size="xs" c="dimmed">
            Mem: {latestMem.toFixed(0)} MB
          </Text>
        </Group>
      </Group>

      <Box style={{ flex: 1, minHeight: 200 }}>
        {data.length < 2 ? (
          <Stack align="center" justify="center" h="100%" gap="xs">
            <Badge size="sm" variant="outline" color="dark.3">
              Collecting data...
            </Badge>
            <Text size="xs" c="dimmed">
              {data.length}/2 points (updates every 5s)
            </Text>
          </Stack>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b5ad" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00b5ad" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#666' }}
                interval="preserveStartEnd"
                stroke="rgba(255,255,255,0.1)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#666' }}
                stroke="rgba(255,255,255,0.1)"
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  border: '1px solid var(--mantine-color-dark-4)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#999' }}
              />
              {(view === 'cpu' || view === 'both') && (
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#00b5ad"
                  fill="url(#cpuGrad)"
                  strokeWidth={2}
                  name="CPU %"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {(view === 'memory' || view === 'both') && (
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#7c3aed"
                  fill="url(#memGrad)"
                  strokeWidth={2}
                  name="Memory MB"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Stack>
  );
}
