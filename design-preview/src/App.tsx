import { useState, lazy, Suspense, type ReactNode } from 'react';
import {
  Stack,
  Box,
  Group,
  Title,
  ActionIcon,
  Center,
  Text,
  ScrollArea,
  SegmentedControl,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { IconRefresh, IconSun, IconMoon } from '@tabler/icons-react';
import { ErrorBoundary } from './ErrorBoundary';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { resolveDesignComponent } from './resolve-design';
import { BrowserWindow } from './BrowserWindow';
import { PdfTemplatePreview } from './PdfTemplatePreview';

/** Files whose basename starts with `comp_` render as a bare component, not a browser mock. */
function isComponentFile(modulePath: string): boolean {
  const basename = modulePath.split('/').pop() ?? '';
  return basename.startsWith('comp_');
}

function designPathToUrl(modulePath: string): string {
  const relative = modulePath.replace('../designs/', '').replace(/\.tsx$/, '');
  const kebab = relative
    .split('/')
    .map((seg) =>
      seg.replace(/([A-Z])/g, (_, c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`)),
    )
    .join('/');
  return `https://ckk.local/${kebab}`;
}

// Auto-discover all .tsx files under designs/ (including subfolders).
// Vite watches this glob in dev mode — new files appear after HMR reload.
const designModules = import.meta.glob('../designs/**/*.tsx') as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

const designPaths = Object.keys(designModules).sort((a, b) =>
  formatDesignLabel(a).localeCompare(formatDesignLabel(b)),
);
const fileTree = buildFileTree(designPaths);

// Cache lazy components so they aren't recreated on every render
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
    <Suspense fallback={<Center h={200}><Text c="dimmed">Loading…</Text></Center>}>
      <Component>{children}</Component>
    </Suspense>
  );
}

// Layout components (layout.tsx) take `children` — the preview renders them with
// none, leaving AppShell.Main empty. Inject sample page content so layouts show
// realistic content between the header and footer.
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
            <Text size="sm" c="dimmed">{label}</Text>
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
          <Text size="sm">サンプル行 {i + 1} — スクロール時にヘッダー / フッターが固定されることを確認できます。</Text>
        </Box>
      ))}
    </Stack>
  );
}

type Mode = 'ui' | 'pdf';

export default function App() {
  const [mode, setMode] = useState<Mode>('ui');
  const [selected, setSelected] = useState<string | null>(
    designPaths[0] ?? null,
  );
  // key forces ErrorBoundary + DesignCanvas to remount on manual retry
  const [key, setKey] = useState(0);

  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const isDark = computedColorScheme === 'dark';

  // Layout files use AppShell (position:fixed header/footer) — need noPadding + containment
  const isLayoutFile = selected?.includes('/layout/') ?? false;
  // `comp_`-prefixed files render bare (centered card) instead of inside the browser mock
  const isComponent = selected ? isComponentFile(selected) : false;

  return (
    <Stack gap={0} h="100vh">
      {/* Toolbar */}
      <Box
        p="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-body)',
        }}
      >
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={5} style={{ flexShrink: 0 }}>
              Design Preview
            </Title>
            {mode === 'ui' && selected && (
              <Text size="sm" c="dimmed" ff="monospace">
                {formatDesignLabel(selected)}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            {mode === 'ui' && (
              <ActionIcon
                variant="default"
                title="Re-render"
                onClick={() => setKey((k) => k + 1)}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            )}
            <ActionIcon
              variant="default"
              title={isDark ? 'ライトモード' : 'ダークモード'}
              onClick={() => toggleColorScheme()}
              aria-label="カラーモード切替"
            >
              {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            </ActionIcon>
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              data={[
                { label: 'UI Designs', value: 'ui' },
                { label: 'PDF Templates', value: 'pdf' },
              ]}
            />
          </Group>
        </Group>
      </Box>

      {mode === 'pdf' ? (
        <PdfTemplatePreview />
      ) : (
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* File tree sidebar */}
          <Box
            w={240}
            style={{
              flexShrink: 0,
              borderRight: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-body)',
            }}
          >
            <ScrollArea h="100%" p="xs">
              {fileTree.length === 0 ? (
                <Text size="sm" c="dimmed" p="xs">
                  No .tsx files in designs/ yet.
                </Text>
              ) : (
                <FileTree
                  nodes={fileTree}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
            </ScrollArea>
          </Box>

          {/* Canvas — desktop backdrop */}
          <Box
            style={{
              flex: 1,
              overflow: 'auto',
              background: isDark ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-gray-2)',
              padding: 24,
            }}
          >
            {selected ? (
              isComponent ? (
                <Center style={{ minHeight: '100%' }}>
                  <Box
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--mantine-color-default-border)',
                      boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                      background: 'var(--mantine-color-body)',
                      padding: 24,
                    }}
                  >
                    <ErrorBoundary key={`${selected}-${key}`} onReset={() => setKey((k) => k + 1)}>
                      <DesignCanvas key={`${selected}-${key}`} path={selected} />
                    </ErrorBoundary>
                  </Box>
                </Center>
              ) : (
                <BrowserWindow url={designPathToUrl(selected)} noPadding={isLayoutFile}>
                  <ErrorBoundary key={`${selected}-${key}`} onReset={() => setKey((k) => k + 1)}>
                    <DesignCanvas key={`${selected}-${key}`} path={selected}>
                      {isLayoutFile ? <LayoutDemoContent /> : undefined}
                    </DesignCanvas>
                  </ErrorBoundary>
                </BrowserWindow>
              )
            ) : (
              <Center style={{ minHeight: '100%' }}>
                <Stack align="center" gap="xs">
                  <Text c="dimmed">
                    {designPaths.length === 0
                      ? 'Drop a .tsx file into design-preview/designs/ to get started.'
                      : 'Select a design file from the tree on the left.'}
                  </Text>
                </Stack>
              </Center>
            )}
          </Box>
        </Box>
      )}
    </Stack>
  );
}
