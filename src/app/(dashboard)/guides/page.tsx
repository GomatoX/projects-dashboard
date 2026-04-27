'use client';

import Link from 'next/link';
import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  Box,
  ThemeIcon,
  SimpleGrid,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBook,
  IconServer,
  IconArrowRight,
} from '@tabler/icons-react';

interface GuideEntry {
  href: string;
  title: string;
  description: string;
  icon: typeof IconServer;
}

const GUIDES: GuideEntry[] = [
  {
    href: '/guides/device-setup',
    title: 'Device Setup',
    description:
      'Connect a new machine to your dashboard — install the agent, generate a token, and verify the connection.',
    icon: IconServer,
  },
];

export default function GuidesPage() {
  return (
    <>
      <Group mb="xl" gap="md">
        <ThemeIcon variant="light" color="brand" size="xl" radius="md">
          <IconBook size={22} />
        </ThemeIcon>
        <Box>
          <Title order={2} fw={700}>
            Guides
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Walkthroughs and references for working with the dashboard
          </Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" maw={900}>
        {GUIDES.map((guide) => (
          <UnstyledButton
            key={guide.href}
            component={Link}
            href={guide.href}
            style={{ display: 'block' }}
          >
            <Card
              withBorder
              padding="lg"
              radius="md"
              style={{ height: '100%', transition: 'border-color 150ms ease' }}
            >
              <Stack gap="md" h="100%">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <ThemeIcon variant="light" color="brand" size="lg" radius="md">
                    <guide.icon size={20} />
                  </ThemeIcon>
                  <ThemeIcon variant="subtle" color="gray" size="sm">
                    <IconArrowRight size={14} />
                  </ThemeIcon>
                </Group>
                <Box>
                  <Text fw={600} size="md" mb={6}>
                    {guide.title}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {guide.description}
                  </Text>
                </Box>
              </Stack>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </>
  );
}
