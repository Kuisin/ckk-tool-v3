import type { ReactNode } from 'react';
import { ActionIcon, Box, Group, Text } from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';

interface BrowserWindowProps {
  url: string;
  children: ReactNode;
}

export function BrowserWindow({ url, children }: BrowserWindowProps) {
  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* Browser chrome */}
      <Box
        style={{
          background: 'var(--mantine-color-gray-1)',
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          padding: '10px 14px 10px',
          flexShrink: 0,
        }}
      >
        {/* Traffic lights */}
        <Group gap={8} mb={10}>
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#ff5f57',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          />
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#febc2e',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          />
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#28c840',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          />
        </Group>

        {/* Navigation + URL bar */}
        <Group gap={6} align="center">
          <ActionIcon variant="subtle" color="gray" size="sm" disabled aria-label="Back">
            <IconArrowLeft size={14} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" size="sm" disabled aria-label="Forward">
            <IconArrowRight size={14} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" size="sm" disabled aria-label="Reload">
            <IconRefresh size={14} />
          </ActionIcon>

          {/* Address bar */}
          <Box
            style={{
              flex: 1,
              background: 'white',
              borderRadius: 6,
              padding: '4px 10px',
              border: '1px solid var(--mantine-color-gray-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <IconLock
              size={11}
              color="var(--mantine-color-green-6)"
              style={{ flexShrink: 0 }}
            />
            <Text size="xs" c="dimmed" ff="mono" truncate>
              {url}
            </Text>
          </Box>
        </Group>
      </Box>

      {/* Page content — p="md" mirrors AppShell.Main padding="md" */}
      <Box p="md" style={{ background: 'white' }}>
        {children}
      </Box>
    </Box>
  );
}
