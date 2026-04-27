'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  ScrollArea,
  Box,
  Badge,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import { notify } from '@/lib/notify';

export interface SkillResult {
  skillId: string;
  name: string;
  result: string;
  contextChars: number;
  contextTruncated: boolean;
}

interface SkillResultModalProps {
  opened: boolean;
  onClose: () => void;
  result: SkillResult | null;
}

/**
 * Read-only viewer for a skill execution result. Shows the raw text the
 * model returned plus a copy-to-clipboard control. We render text as plain
 * monospace — built-in skills already produce well-formatted output, and
 * we don't want to surprise users with markdown rendering they didn't ask
 * for.
 */
export function SkillResultModal({ opened, onClose, result }: SkillResultModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify({
        title: 'Copy failed',
        message: 'Browser blocked clipboard access',
        color: 'red',
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        result ? (
          <Group gap="sm">
            <Text fw={600}>{result.name}</Text>
            {result.contextChars > 0 && (
              <Badge size="sm" variant="light" color="gray">
                {result.contextChars.toLocaleString()} chars context
                {result.contextTruncated && ' (truncated)'}
              </Badge>
            )}
          </Group>
        ) : (
          'Skill result'
        )
      }
      size="xl"
      centered
    >
      {result && (
        <Stack gap="md">
          <Group justify="flex-end" gap="xs">
            <Tooltip label={copied ? 'Copied' : 'Copy to clipboard'}>
              <ActionIcon
                variant="light"
                color={copied ? 'teal' : 'brand'}
                onClick={handleCopy}
                size="lg"
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>

          <ScrollArea.Autosize mah={500} type="auto">
            <Box
              component="pre"
              p="md"
              m={0}
              style={{
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: 'var(--mantine-color-dark-8)',
                borderRadius: 6,
                border: '1px solid var(--mantine-color-dark-5)',
              }}
            >
              {result.result || '(empty result)'}
            </Box>
          </ScrollArea.Autosize>

          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
