import type { ReactNode } from 'react';
import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';

export type Viewport = 'desktop' | 'mobile';

interface BrowserWindowProps {
  url: string;
  children: ReactNode;
  /** Remove padding and set a fixed height — used for full-layout designs (AppShell-based) */
  noPadding?: boolean;
  viewport?: Viewport;
  onViewportChange?: (v: Viewport) => void;
}

export function BrowserWindow({ url, children, noPadding, viewport = 'desktop', onViewportChange }: BrowserWindowProps) {
  const isMobile = viewport === 'mobile';

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
        maxWidth: isMobile ? 390 : undefined,
        margin: isMobile ? '0 auto' : undefined,
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
        {/* Traffic lights + viewport toggle */}
        <Group gap={8} mb={10} justify="space-between">
          <Group gap={8}>
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
          <Tooltip label={isMobile ? 'Switch to desktop' : 'Switch to mobile'} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={isMobile ? 'Switch to desktop' : 'Switch to mobile'}
              onClick={() => onViewportChange?.(isMobile ? 'desktop' : 'mobile')}
            >
              {isMobile ? <IconDeviceDesktop size={14} /> : <IconDeviceMobile size={14} />}
            </ActionIcon>
          </Tooltip>
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
        // viewport. overflow:hidden clips anything past it; the AppShell root
        // handles its own internal scroll via overflowY:auto.
        <Box
          style={{
            position: 'relative',
            transform: 'translateZ(0)',
            overflow: 'hidden',
            height: isMobile ? 700 : 600,
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
