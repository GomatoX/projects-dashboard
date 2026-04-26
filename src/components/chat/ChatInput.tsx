'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Group,
  Textarea,
  ActionIcon,
  Tooltip,
  Kbd,
  Text,
} from '@mantine/core';
import { IconSend, IconPaperclip } from '@tabler/icons-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      px="md"
      py="sm"
      style={{
        borderTop: '1px solid var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-9)',
      }}
    >
      <Group gap="sm" align="flex-end">
        <Textarea
          ref={textareaRef}
          placeholder="Ask anything about this project..."
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={1}
          maxRows={6}
          disabled={disabled}
          style={{ flex: 1 }}
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              border: '1px solid var(--mantine-color-dark-5)',
              fontSize: 13.5,
              fontFamily: 'Inter, sans-serif',
              transition: 'border-color 0.15s',
              '&:focus': {
                borderColor: 'var(--mantine-color-brand-6)',
              },
            },
          }}
        />
        <Tooltip label="Send (Enter)">
          <ActionIcon
            size="lg"
            color="brand"
            variant="filled"
            disabled={!value.trim() || disabled}
            onClick={handleSend}
            style={{
              transition: 'transform 0.1s',
            }}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group gap="xs" mt={4}>
        <Text size="xs" c="dimmed">
          <Kbd size="xs">Enter</Kbd> to send · <Kbd size="xs">Shift + Enter</Kbd> for new line
        </Text>
      </Group>
    </Box>
  );
}
