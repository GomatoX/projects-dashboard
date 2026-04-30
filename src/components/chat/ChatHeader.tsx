// src/components/chat/ChatHeader.tsx
'use client';

import {
  Group,
  Box,
  Text,
  Loader,
  Tooltip,
  ActionIcon,
  Select,
  SegmentedControl,
  Badge,
} from '@mantine/core';
import {
  IconSparkles,
  IconPlayerStopFilled,
  IconServer,
  IconCloud,
  IconCoins,
} from '@tabler/icons-react';

export const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

interface ChatHeaderProps {
  title: string;
  estimatedCost: number;
  executionMode: 'local' | 'remote';
  selectedModel: string;
  isStreaming: boolean;
  isCancelling: boolean;
  deviceId: string | null;
  deviceConnected?: boolean;
  onStop: () => void;
  onModelChange: (model: string) => void;
  onModeChange: (mode: 'local' | 'remote') => void;
}

export function ChatHeader({
  title,
  estimatedCost,
  executionMode,
  selectedModel,
  isStreaming,
  isCancelling,
  deviceId,
  deviceConnected,
  onStop,
  onModelChange,
  onModeChange,
}: ChatHeaderProps) {
  return (
    <Group
      px="md"
      h={45}
      align="center"
      justify="space-between"
      wrap="nowrap"
      style={{
        borderBottom: '1px solid var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-9)',
      }}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        {isStreaming ? (
          <Tooltip label="Chat is processing…" withArrow>
            <Box style={{ display: 'flex', alignItems: 'center' }}>
              <Loader size={14} color="brand" type="oval" />
            </Box>
          </Tooltip>
        ) : (
          <IconSparkles
            size={16}
            style={{ color: 'var(--mantine-color-brand-5)', display: 'block' }}
          />
        )}
        <Text size="sm" fw={500}>
          {title}
        </Text>
        {isStreaming && (
          <Tooltip label={isCancelling ? 'Stopping…' : 'Stop generating'} withArrow>
            <ActionIcon
              size="sm"
              color="red"
              variant="light"
              loading={isCancelling}
              disabled={isCancelling}
              onClick={onStop}
              aria-label="Stop generating"
            >
              <IconPlayerStopFilled size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Group gap="xs" align="center" wrap="nowrap">
        <Select
          size="xs"
          value={selectedModel}
          onChange={(val) => val && onModelChange(val)}
          data={MODEL_OPTIONS}
          allowDeselect={false}
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-5)',
              fontSize: '11px',
              minHeight: '33px',
              height: '33px',
              width: '140px',
            },
          }}
        />
        {deviceId && (
          <SegmentedControl
            size="xs"
            value={executionMode}
            onChange={(v) => onModeChange(v as 'local' | 'remote')}
            data={[
              {
                value: 'local',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconServer size={12} />
                    <span>Local</span>
                  </Group>
                ),
              },
              {
                value: 'remote',
                label: (
                  <Group gap={4} wrap="nowrap">
                    <IconCloud size={12} />
                    <span>On device</span>
                    {deviceConnected !== undefined && (
                      <Box
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: deviceConnected
                            ? 'var(--mantine-color-green-5)'
                            : 'var(--mantine-color-red-5)',
                        }}
                      />
                    )}
                  </Group>
                ),
              },
            ]}
            styles={{
              root: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                border: '1px solid var(--mantine-color-dark-5)',
              },
            }}
          />
        )}
        {estimatedCost > 0 && (
          <Badge size="xs" variant="light" color="yellow" leftSection={<IconCoins size={8} />}>
            ${estimatedCost.toFixed(4)}
          </Badge>
        )}
      </Group>
    </Group>
  );
}
