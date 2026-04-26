'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Title,
  Group,
  Button,
  TextInput,
  SimpleGrid,
  Text,
  Stack,
  Center,
  Loader,
  Modal,
  Box,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconSearch, IconFolder } from '@tabler/icons-react';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ProjectForm } from '@/components/projects/ProjectForm';

interface Project {
  id: string;
  name: string;
  type: string;
  path: string;
  tags: string;
  deviceName: string | null;
  deviceStatus: string | null;
  deviceOs: string | null;
}

interface Device {
  id: string;
  name: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch projects',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setDevices(data);
    } catch {
      // Silently fail — devices are optional
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchDevices();
  }, [fetchProjects, fetchDevices]);

  const handleCreate = async (values: {
    name: string;
    path: string;
    type: string;
    deviceId: string;
    tags: string[];
    pm2Name: string;
  }) => {
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to create project');

      notifications.show({
        title: 'Project created',
        message: `${values.name} has been added`,
        color: 'teal',
      });
      closeCreate();
      fetchProjects();
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to create project',
        color: 'red',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    const project = projects.find((p) => p.id === id);
    modals.openConfirmModal({
      title: 'Delete project',
      children: (
        <Text size="sm">
          Are you sure you want to delete <b>{project?.name}</b>? This action cannot be
          undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await fetch(`/api/projects/${id}`, { method: 'DELETE' });
          notifications.show({
            title: 'Deleted',
            message: `${project?.name} has been removed`,
            color: 'orange',
          });
          fetchProjects();
        } catch {
          notifications.show({
            title: 'Error',
            message: 'Failed to delete project',
            color: 'red',
          });
        }
      },
    });
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase()) ||
      p.path.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  return (
    <>
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={2} fw={700}>
            Projects
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} across all devices
          </Text>
        </Box>
        <Button
          leftSection={<IconPlus size={16} />}
          variant="gradient"
          gradient={{ from: 'brand.5', to: 'brand.7', deg: 135 }}
          onClick={openCreate}
        >
          Add Project
        </Button>
      </Group>

      {/* Search */}
      <TextInput
        placeholder="Search projects..."
        leftSection={<IconSearch size={16} />}
        mb="lg"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        styles={{
          input: {
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-5)',
          },
        }}
      />

      {/* Grid */}
      {filteredProjects.length > 0 ? (
        <SimpleGrid
          cols={{ base: 1, sm: 2, lg: 3 }}
          spacing="lg"
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              {...project}
              onDelete={handleDelete}
            />
          ))}
        </SimpleGrid>
      ) : (
        <Center h={300}>
          <Stack align="center" gap="md">
            <IconFolder size={64} style={{ opacity: 0.2 }} />
            <Text size="lg" c="dimmed" ta="center">
              {search ? 'No projects match your search' : 'No projects yet'}
            </Text>
            {!search && (
              <Button
                variant="light"
                color="brand"
                onClick={openCreate}
                leftSection={<IconPlus size={16} />}
              >
                Add your first project
              </Button>
            )}
          </Stack>
        </Center>
      )}

      {/* Create Modal */}
      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title="Add Project"
        size="lg"
      >
        <ProjectForm
          devices={devices.map((d) => ({ value: d.id, label: d.name }))}
          onSubmit={handleCreate}
          loading={creating}
        />
      </Modal>
    </>
  );
}
