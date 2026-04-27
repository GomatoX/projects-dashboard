'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Card,
  TextInput,
  PasswordInput,
  Button,
  Text,
  Stack,
  Group,
  Divider,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notify } from '@/lib/notify';
import { IconLock, IconMail, IconUserPlus, IconLogin } from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';
import classes from './login.module.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/projects';

  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      password: '',
    },
    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
      password: (val) => (val.length >= 8 ? null : 'Password must be at least 8 characters'),
      name: (val) => (isSignUp && val.length < 2 ? 'Name is required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email: values.email,
          password: values.password,
          name: values.name,
        });
        if (error) {
          notify({
            title: 'Sign up failed',
            message: error.message || 'Something went wrong',
            color: 'red',
          });
          return;
        }
      } else {
        const { error } = await authClient.signIn.email({
          email: values.email,
          password: values.password,
        });
        if (error) {
          notify({
            title: 'Sign in failed',
            message: error.message || 'Invalid credentials',
            color: 'red',
          });
          return;
        }
      }
      router.push(callbackUrl);
    } catch {
      notify({
        title: 'Error',
        message: 'An unexpected error occurred',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className={classes.wrapper}>
      <div className="animated-grid-bg" />

      <Center h="100vh">
        <Card className={classes.card} w={420} padding="xl" radius="lg">
          {/* Logo */}
          <Stack align="center" gap="xs" mb="xl">
            <Text
              size="40px"
              fw={800}
              variant="gradient"
              gradient={{ from: 'brand.4', to: 'brand.6', deg: 135 }}
            >
              ⚡
            </Text>
            <Text size="xl" fw={700}>
              Dev Dashboard
            </Text>
            <Text size="sm" c="dimmed">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
          </Stack>

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              {isSignUp && (
                <TextInput
                  label="Name"
                  placeholder="Your name"
                  leftSection={<IconUserPlus size={16} />}
                  {...form.getInputProps('name')}
                />
              )}

              <TextInput
                label="Email"
                placeholder="you@example.com"
                leftSection={<IconMail size={16} />}
                {...form.getInputProps('email')}
              />

              <PasswordInput
                label="Password"
                placeholder="••••••••"
                leftSection={<IconLock size={16} />}
                {...form.getInputProps('password')}
              />

              <Button
                type="submit"
                fullWidth
                loading={loading}
                leftSection={isSignUp ? <IconUserPlus size={16} /> : <IconLogin size={16} />}
                variant="gradient"
                gradient={{ from: 'brand.5', to: 'brand.7', deg: 135 }}
                size="md"
                mt="xs"
              >
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </Stack>
          </form>

          <Divider my="lg" label="or" labelPosition="center" color="dark.4" />

          <Button
            variant="subtle"
            fullWidth
            color="gray"
            onClick={() => {
              setIsSignUp(!isSignUp);
              form.reset();
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </Button>
        </Card>
      </Center>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
