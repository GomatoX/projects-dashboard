'use client';

import {
  TextInput,
  Select,
  TagsInput,
  Button,
  Stack,
  Group,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { PROJECT_TYPES } from '@/lib/constants';

interface ProjectFormProps {
  initialValues?: {
    name: string;
    path: string;
    type: string;
    deviceId: string;
    tags: string[];
    pm2Name: string;
  };
  devices: { value: string; label: string }[];
  onSubmit: (values: {
    name: string;
    path: string;
    type: string;
    deviceId: string;
    tags: string[];
    pm2Name: string;
  }) => void;
  loading?: boolean;
  isEditing?: boolean;
}

export function ProjectForm({
  initialValues,
  devices,
  onSubmit,
  loading,
  isEditing,
}: ProjectFormProps) {
  const form = useForm({
    initialValues: initialValues || {
      name: '',
      path: '',
      type: 'node',
      deviceId: '',
      tags: [] as string[],
      pm2Name: '',
    },
    validate: {
      name: (val) => (val.length < 1 ? 'Name is required' : null),
      path: (val) => (val.length < 1 ? 'Path is required' : null),
    },
  });

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack gap="md">
        <TextInput
          label="Project Name"
          placeholder="my-awesome-project"
          withAsterisk
          {...form.getInputProps('name')}
        />

        <TextInput
          label="Path"
          placeholder="/home/user/projects/my-project"
          withAsterisk
          {...form.getInputProps('path')}
        />

        <Group grow>
          <Select
            label="Type"
            data={PROJECT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            {...form.getInputProps('type')}
          />

          <Select
            label="Device"
            placeholder="Select device"
            data={devices}
            clearable
            {...form.getInputProps('deviceId')}
          />
        </Group>

        <TextInput
          label="PM2 Process Name"
          placeholder="Optional"
          {...form.getInputProps('pm2Name')}
        />

        <TagsInput
          label="Tags"
          placeholder="Type and press Enter to add"
          {...form.getInputProps('tags')}
        />

        <Button
          type="submit"
          loading={loading}
          leftSection={isEditing ? <IconDeviceFloppy size={16} /> : <IconPlus size={16} />}
          variant="gradient"
          gradient={{ from: 'brand.5', to: 'brand.7', deg: 135 }}
        >
          {isEditing ? 'Save Changes' : 'Create Project'}
        </Button>
      </Stack>
    </form>
  );
}
