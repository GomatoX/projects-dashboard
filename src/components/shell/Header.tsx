'use client';

import {
  Group,
  Burger,
  Text,
  ActionIcon,
  Menu,
  Avatar,
  Badge,
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import {
  IconSearch,
  IconCommand,
  IconLogout,
  IconSettings,
} from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { ThemeToggleMenuItems } from './ThemeToggle';
import classes from './Header.module.css';

interface HeaderProps {
  opened: boolean;
  toggle: () => void;
}

export function Header({ opened, toggle }: HeaderProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group gap="sm">
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        <Group gap={8}>
          <div className={classes.logo}>
            <Text
              size="xl"
              fw={800}
              variant="gradient"
              gradient={{ from: 'brand.4', to: 'brand.6', deg: 135 }}
            >
              ⚡
            </Text>
          </div>
          <Text size="lg" fw={700} visibleFrom="xs">
            Dev Dashboard
          </Text>
        </Group>
      </Group>

      <Group gap="sm">
        <UnstyledButton
          className={classes.searchTrigger}
          onClick={() => spotlight.open()}
        >
          <Group gap="xs" wrap="nowrap">
            <IconSearch size={16} style={{ opacity: 0.5 }} />
            <Text size="sm" c="dimmed" visibleFrom="sm">
              Search...
            </Text>
            <Badge
              variant="outline"
              color="gray"
              size="sm"
              radius="sm"
              visibleFrom="sm"
            >
              <Group gap={2}>
                <IconCommand size={10} />
                <span>K</span>
              </Group>
            </Badge>
          </Group>
        </UnstyledButton>

        <Menu shadow="lg" width={200} position="bottom-end" withArrow>
          <Menu.Target>
            <ActionIcon variant="subtle" size="lg" radius="xl">
              <Avatar
                size="sm"
                radius="xl"
                color="brand"
                src={null}
              >
                {session?.user?.name?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {session?.user?.email || 'User'}
            </Menu.Label>
            <Menu.Item
              leftSection={<IconSettings size={14} />}
              onClick={() => router.push('/settings')}
            >
              Settings
            </Menu.Item>
            <Menu.Divider />
            <ThemeToggleMenuItems />
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconLogout size={14} />}
              onClick={handleSignOut}
            >
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
