import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';
import { buildFrameUrl, type FrameMode, type Viewport } from './build-frame-url';

export type { Viewport };

interface BrowserWindowProps {
  url: string;
  design: string;
  viewport?: Viewport;
  scheme: 'light' | 'dark';
  mode: FrameMode;
  remountKey?: number;
  onViewportChange?: (v: Viewport) => void;
}

export function BrowserWindow({
  url,
  design,
  viewport = 'desktop',
  scheme,
  mode,
  remountKey = 0,
  onViewportChange,
}: BrowserWindowProps) {
  const isMobile = viewport === 'mobile';
  const frameSrc = buildFrameUrl({ design, viewport, scheme, mode, remountKey });

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
        maxWidth: isMobile ? 390 : 1280,
        margin: '0 auto',
      }}
    >
      <Box
        style={{
          background: 'var(--mantine-color-default-hover)',
          borderBottom: '1px solid var(--mantine-color-default-border)',
          padding: '10px 14px 10px',
          flexShrink: 0,
        }}
      >
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

      <iframe
        key={frameSrc}
        title="Design preview"
        src={frameSrc}
        style={{
          width: '100%',
          height: isMobile ? 700 : 600,
          border: 0,
          display: 'block',
          background: 'var(--mantine-color-body)',
        }}
      />
    </Box>
  );
}
