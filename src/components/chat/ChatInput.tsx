'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Group,
  Textarea,
  ActionIcon,
  Tooltip,
  Kbd,
  Text,
  Stack,
} from '@mantine/core';
import {
  IconSend,
  IconPaperclip,
  IconX,
  IconFile,
  IconFileTypePdf,
} from '@tabler/icons-react';

// Files the chat input is willing to accept. Anything matching the first
// pattern shows up as an inline thumbnail; PDFs and text files render as a
// generic file chip. The actual MIME-type validation lives on the server —
// this is just the picker hint.
const ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,.txt,.md';

export interface PendingAttachment {
  // Local-only id used for keying and removal before the file is uploaded.
  id: string;
  file: File;
  // ObjectURL for image previews. Null for non-image types so we don't pay
  // the `URL.createObjectURL` cost for files we won't render visually.
  previewUrl: string | null;
}

interface ChatInputProps {
  onSend: (content: string, attachments: PendingAttachment[]) => void;
  disabled?: boolean;
}

let nextId = 0;
const makeId = () => `att-${Date.now()}-${nextId++}`;

const isImage = (f: File) => f.type.startsWith('image/');

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Drag events fire on every child, so the simple `dragenter`/`dragleave`
  // pair flickers as the cursor moves between the textarea and surrounding
  // padding. Tracking depth makes the highlight stable for the whole drop
  // zone regardless of which child element triggers the event.
  const dragDepthRef = useRef(0);

  const addFiles = useCallback((files: FileList | File[]) => {
    const additions: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      additions.push({
        id: makeId(),
        file,
        previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
      });
    }
    if (additions.length > 0) {
      setAttachments((prev) => [...prev, ...additions]);
    }
  }, []);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleSend = () => {
    const trimmed = value.trim();
    // Allow sending with attachments only — a screenshot with no caption is
    // still a valid message.
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, attachments);
    // Don't revoke object URLs here — the parent (ChatPanel) keeps using
    // them for the optimistic message render. They'll be GC'd with the
    // ChatMessage when the real server-saved message replaces it.
    setAttachments([]);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cmd+V / Ctrl+V on the textarea: pull image blobs straight from the
  // clipboard. This is by far the fastest path for screenshots — most users
  // expect it to "just work" the same way it does in Slack / GitHub / etc.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
    }
    if (pasted.length > 0) {
      // Only swallow the paste event if we actually consumed files —
      // otherwise plain-text paste still works as expected.
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    // Required to allow drop — the browser cancels the drop unless the
    // dragover handler calls preventDefault.
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <Box
      px="md"
      py="sm"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        borderTop: '1px solid var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-9)',
        position: 'relative',
        outline: dragActive
          ? '2px dashed var(--mantine-color-brand-5)'
          : 'none',
        outlineOffset: -4,
      }}
    >
      {/* Attachment thumbnails / chips — rendered above the textarea so the
          user always sees what's queued before pressing Send. */}
      {attachments.length > 0 && (
        <Group gap={6} mb={8} wrap="wrap">
          {attachments.map((att) => (
            <AttachmentChip
              key={att.id}
              attachment={att}
              onRemove={() => removeAttachment(att.id)}
            />
          ))}
        </Group>
      )}

      <Group gap="sm" align="flex-end">
        <Tooltip label="Attach file">
          <ActionIcon
            size="lg"
            variant="subtle"
            color="gray"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <IconPaperclip size={16} />
          </ActionIcon>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            // Reset so picking the same file twice in a row still fires
            // onChange.
            e.target.value = '';
          }}
        />
        <Textarea
          ref={textareaRef}
          placeholder="Ask anything about this project..."
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
            disabled={(!value.trim() && attachments.length === 0) || disabled}
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
          <Kbd size="xs">Enter</Kbd> to send · <Kbd size="xs">Shift + Enter</Kbd> for new line · paste or drag images
        </Text>
      </Group>
    </Box>
  );
}

interface AttachmentChipProps {
  attachment: PendingAttachment;
  onRemove: () => void;
}

function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const { file, previewUrl } = attachment;
  const isPdf = file.type === 'application/pdf';

  return (
    <Box
      style={{
        position: 'relative',
        borderRadius: 'var(--mantine-radius-sm)',
        border: '1px solid var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        padding: previewUrl ? 0 : '6px 10px',
        overflow: 'hidden',
      }}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={file.name}
          style={{
            display: 'block',
            width: 64,
            height: 64,
            objectFit: 'cover',
          }}
        />
      ) : (
        <Stack gap={2} align="flex-start" style={{ maxWidth: 180 }}>
          <Group gap={6} wrap="nowrap">
            {isPdf ? (
              <IconFileTypePdf size={14} color="var(--mantine-color-red-5)" />
            ) : (
              <IconFile size={14} />
            )}
            <Text size="xs" lineClamp={1} style={{ maxWidth: 140 }}>
              {file.name}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
            {(file.size / 1024).toFixed(1)} KB
          </Text>
        </Stack>
      )}
      <ActionIcon
        size={14}
        radius="xl"
        variant="filled"
        color="dark"
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          border: '1px solid var(--mantine-color-dark-4)',
        }}
      >
        <IconX size={9} />
      </ActionIcon>
    </Box>
  );
}
