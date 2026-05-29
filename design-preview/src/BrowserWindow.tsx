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
  /** Remove padding and set a fixed height — used for full-layout designs (AppShell-based) */
  noPadding?: boolean;
}

export function BrowserWindow({ url, children, noPadding }: BrowserWindowProps) {
  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        background: 'var(--mantine-color-body)',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {/* Browser chrome */}
      <Box
        style={{
          background: 'var(--mantine-color-default-hover)',
          borderBottom: '1px solid var(--mantine-color-default-border)',
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
              background: 'var(--mantine-color-default)',
              borderRadius: 6,
              padding: '4px 10px',
              border: '1px solid var(--mantine-color-default-border)',
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

      {/* Page content */}
      {noPadding ? (
        // Full-layout designs: Mantine AppShell renders its Header/Footer with
        // position:fixed, which resolves against the *viewport* by default — that
        // makes them escape this preview box and stick to the real window edges.
        // `transform: translateZ(0)` turns this Box into the containing block for
        // its fixed descendants, so the header/footer are scoped to the simulated
        // 600px viewport. overflow:hidden clips anything past it; the AppShell root
        // handles its own internal scroll via overflowY:auto.
        <Box
          style={{
            position: 'relative',
            transform: 'translateZ(0)',
            overflow: 'hidden',
            height: 600,
            background: 'var(--mantine-color-body)',
          }}
        >
          {children}
        </Box>
      ) : (
        // Regular page designs: mirror AppShell.Main padding="md"
        <Box p="md" style={{ background: 'var(--mantine-color-body)' }}>
          {children}
        </Box>
      )}
    </Box>
  );
}
