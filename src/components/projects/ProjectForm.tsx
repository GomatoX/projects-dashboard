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
import { FolderPicker } from './FolderPicker';

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

  // Auto-detect project name from path
  const handlePathChange = (path: string) => {
    form.setFieldValue('path', path);
    // If name is empty, extract from path
    if (!form.values.name && path) {
      const basename = path.split('/').filter(Boolean).pop();
      if (basename) {
        form.setFieldValue('name', basename);
      }
    }
  };

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack gap="md">
        <Group grow>
          <Select
            label="Device"
            placeholder="Select device"
            data={devices}
            clearable
            {...form.getInputProps('deviceId')}
          />

          <Select
            label="Type"
            data={PROJECT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            {...form.getInputProps('type')}
          />
        </Group>

        <FolderPicker
          value={form.values.path}
          onChange={handlePathChange}
          deviceId={form.values.deviceId}
          label="Project Path"
          placeholder="/home/user/projects/my-project"
        />

        <TextInput
          label="Project Name"
          placeholder="my-awesome-project"
          withAsterisk
          {...form.getInputProps('name')}
        />

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
