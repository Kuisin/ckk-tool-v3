import { lazy, Suspense, type ReactNode } from 'react';
import { Box, Center, Stack, Group, Title, Text } from '@mantine/core';
import { ViewportProvider } from '../designs/lib/viewport-context';
import { ErrorBoundary } from './ErrorBoundary';
import { resolveDesignComponent } from './resolve-design';
import {
  designModules,
  designPaths,
  isLayoutFile,
  isAppLauncherFile,
} from './design-modules';
import type { FrameMode, Viewport } from './build-frame-url';

const lazyCache = new Map<string, ReturnType<typeof lazy>>();
function getLazy(path: string) {
  if (!lazyCache.has(path)) {
    lazyCache.set(
      path,
      lazy(() =>
        designModules[path]().then((mod) => ({
          default: resolveDesignComponent(path, mod),
        })),
      ),
    );
  }
  return lazyCache.get(path)!;
}

function DesignCanvas({ path, children }: { path: string; children?: ReactNode }) {
  const Component = getLazy(path);
  return (
    <Suspense
      fallback={
        <Center h={200}>
          <Text c="dimmed">Loading…</Text>
        </Center>
      }
    >
      <Component>{children}</Component>
    </Suspense>
  );
}

function LayoutDemoContent() {
  return (
    <Stack gap="md">
      <Title order={3}>ダッシュボード</Title>
      <Text c="dimmed" size="sm">
        レイアウトプレビュー用のサンプルコンテンツです。ヘッダーとフッターの間に
        ページ本文が表示されます。
      </Text>
      <Group gap="md" wrap="wrap">
        {['受注', '指示書', '出荷', '請求'].map((label) => (
          <Box
            key={label}
            p="md"
            style={{
              flex: '1 1 160px',
              borderRadius: 8,
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-body)',
            }}
          >
            <Text size="sm" c="dimmed">
              {label}
            </Text>
            <Title order={4}>{Math.floor(Math.random() * 900 + 100)}</Title>
          </Box>
        ))}
      </Group>
      {Array.from({ length: 12 }).map((_, i) => (
        <Box
          key={i}
          p="md"
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
          }}
        >
          <Text size="sm">
            サンプル行 {i + 1} — スクロール時にヘッダー / フッターが固定されることを確認できます。
          </Text>
        </Box>
      ))}
    </Stack>
  );
}

function AppLauncherPopoverWrapper({ children }: { children: ReactNode }) {
  return (
    <Center style={{ minHeight: '100%', padding: 24 }}>
      <Box
        p="sm"
        w={544}
        maw="100%"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          border: '1px solid var(--mantine-color-default-border)',
          boxShadow: 'var(--mantine-shadow-md)',
          background: 'var(--mantine-color-body)',
        }}
      >
        {children}
      </Box>
    </Center>
  );
}

function ComponentCardWrapper({ children }: { children: ReactNode }) {
  return (
    <Center style={{ minHeight: '100%', padding: 24 }}>
      <Box
        p="lg"
        maw="100%"
        style={{
          borderRadius: 10,
          border: '1px solid var(--mantine-color-default-border)',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
          background: 'var(--mantine-color-body)',
        }}
      >
        {children}
      </Box>
    </Center>
  );
}

interface FrameAppProps {
  design: string;
  viewport: Viewport;
  mode: FrameMode;
  remountKey: number;
}

export function FrameApp({ design, viewport, mode, remountKey }: FrameAppProps) {
  const isMobile = viewport === 'mobile';
  const layoutFile = isLayoutFile(design);
  const appLauncher = isAppLauncherFile(design);

  if (!designPaths.includes(design) || !designModules[design]) {
    return (
      <Center h="100%">
        <Text c="dimmed">Unknown design: {design}</Text>
      </Center>
    );
  }

  const canvas = (
    <ErrorBoundary
      key={`${design}-${remountKey}`}
      onReset={() => window.location.reload()}
    >
      <DesignCanvas key={`${design}-${remountKey}`} path={design}>
        {layoutFile ? <LayoutDemoContent /> : undefined}
      </DesignCanvas>
    </ErrorBoundary>
  );

  let content: ReactNode;

  if (mode === 'component') {
    if (appLauncher) {
      content = <AppLauncherPopoverWrapper>{canvas}</AppLauncherPopoverWrapper>;
    } else {
      content = <ComponentCardWrapper>{canvas}</ComponentCardWrapper>;
    }
  } else if (layoutFile) {
    content = (
      <Box
        style={{
          height: isMobile ? 700 : 600,
          overflow: 'hidden',
          background: 'var(--mantine-color-body)',
        }}
      >
        {canvas}
      </Box>
    );
  } else {
    content = (
      <Box p="md" style={{ minHeight: isMobile ? 700 : 600, background: 'var(--mantine-color-body)' }}>
        {canvas}
      </Box>
    );
  }

  return (
    <ViewportProvider value={viewport}>
      <Box style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>{content}</Box>
    </ViewportProvider>
  );
}

export function parseFrameSearchParams(search: string): {
  design: string;
  viewport: Viewport;
  scheme: 'light' | 'dark';
  mode: FrameMode;
  remountKey: number;
} {
  const params = new URLSearchParams(search);
  const design = params.get('design') ?? designPaths[0] ?? '';
  const viewport = params.get('viewport') === 'mobile' ? 'mobile' : 'desktop';
  const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
  const mode = params.get('mode') === 'component' ? 'component' : 'page';
  const remountKey = Number(params.get('t') ?? '0');
  return { design, viewport, scheme, mode, remountKey };
}
