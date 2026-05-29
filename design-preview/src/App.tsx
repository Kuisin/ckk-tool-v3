import { useState, lazy, Suspense } from 'react';
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
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { ErrorBoundary } from './ErrorBoundary';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { resolveDesignComponent } from './resolve-design';
import { BrowserWindow } from './BrowserWindow';
import { PdfTemplatePreview } from './PdfTemplatePreview';

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

function DesignCanvas({ path }: { path: string }) {
  const Component = getLazy(path);
  return (
    <Suspense fallback={<Center h={200}><Text c="dimmed">Loading…</Text></Center>}>
      <Component />
    </Suspense>
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
          <Group gap="sm">
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              data={[
                { label: 'UI Designs', value: 'ui' },
                { label: 'PDF Templates', value: 'pdf' },
              ]}
            />
            {mode === 'ui' && (
              <ActionIcon
                variant="default"
                title="Re-render"
                onClick={() => setKey((k) => k + 1)}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            )}
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
              background: 'var(--mantine-color-gray-2)',
              padding: 24,
            }}
          >
            {selected ? (
              <BrowserWindow url={designPathToUrl(selected)}>
                <ErrorBoundary key={`${selected}-${key}`} onReset={() => setKey((k) => k + 1)}>
                  <DesignCanvas key={`${selected}-${key}`} path={selected} />
                </ErrorBoundary>
              </BrowserWindow>
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
