'use client';

import { createTheme, MantineColorsTuple } from '@mantine/core';

// Custom cyan/teal accent color
const brand: MantineColorsTuple = [
  '#e6fcff',
  '#c4f1f9',
  '#93e6f0',
  '#5fd9e8',
  '#38cfe1',
  '#22c8db',
  '#0dc5d9',
  '#00adc0',
  '#009aab',
  '#008594',
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: {
    brand,
    dark: [
      '#C9C9C9',
      '#b8b8b8',
      '#828282',
      '#696969',
      '#424242',
      '#3b3b3b',
      '#2e2e2e',
      '#1a1a2e',
      '#16162a',
      '#0f0f23',
    ],
  },
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '700',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Button: {
      defaultProps: {
        variant: 'filled',
      },
    },
    Card: {
      defaultProps: {
        padding: 'lg',
        radius: 'md',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.55,
          blur: 3,
        },
      },
    },
    Notification: {
      defaultProps: {
        radius: 'md',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
    },
    Badge: {
      defaultProps: {
        variant: 'light',
        radius: 'sm',
      },
    },
  },
});
