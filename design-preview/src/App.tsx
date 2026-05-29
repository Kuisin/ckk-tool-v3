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
  Button,
  Paper,
} from '@mantine/core';
import { IconRefresh, IconPrinter, IconLayout2 } from '@tabler/icons-react';
import { ErrorBoundary } from './ErrorBoundary';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { resolveDesignComponent } from './resolve-design';
import { BrowserWindow } from './BrowserWindow';

type PreviewMode = 'screen' | 'print';

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

export default function App() {
  const [selected, setSelected] = useState<string | null>(
    designPaths[0] ?? null,
  );
  const [mode, setMode] = useState<PreviewMode>('screen');
  // key forces ErrorBoundary + DesignCanvas to remount on manual retry
  const [key, setKey] = useState(0);

  return (
    <Stack gap={0} h="100vh">
      {/* Toolbar — hidden when printing */}
      <Box
        className="no-print"
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
            {selected && (
              <Text size="sm" c="dimmed" ff="monospace">
                {formatDesignLabel(selected)}
              </Text>
            )}
          </Group>
          <Group gap="sm">
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={(v) => setMode(v as PreviewMode)}
              data={[
                {
                  value: 'screen',
                  label: (
                    <Group gap={4}>
                      <IconLayout2 size={14} />
                      <span>Screen</span>
                    </Group>
                  ),
                },
                {
                  value: 'print',
                  label: (
                    <Group gap={4}>
                      <IconPrinter size={14} />
                      <span>Print Preview</span>
                    </Group>
                  ),
                },
              ]}
            />
            {mode === 'print' && selected && (
              <Button
                size="xs"
                leftSection={<IconPrinter size={14} />}
                onClick={() => window.print()}
              >
                Print / Save PDF
              </Button>
            )}
            <ActionIcon
              variant="default"
              title="Re-render"
              onClick={() => setKey((k) => k + 1)}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </Box>

      <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* File tree sidebar — hidden when printing */}
        <Box
          className="no-print"
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

        {/* Canvas */}
        {mode === 'screen' ? (
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
        ) : (
          /* Print Preview mode */
          <Box
            className="print-canvas"
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--mantine-color-gray-3)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {selected ? (
              <>
                {/* Page size indicator */}
                <Text size="xs" c="dimmed" mb="sm" className="no-print">
                  A4 · 210 × 297 mm
                </Text>
                {/* A4 paper */}
                <Paper
                  className="print-page"
                  shadow="md"
                  style={{
                    width: 794,       /* A4 at 96 dpi */
                    minHeight: 1123,  /* A4 at 96 dpi */
                    padding: '20mm 15mm',
                    background: 'white',
                    flexShrink: 0,
                  }}
                >
                  <ErrorBoundary key={`${selected}-${key}-print`} onReset={() => setKey((k) => k + 1)}>
                    <DesignCanvas key={`${selected}-${key}-print`} path={selected} />
                  </ErrorBoundary>
                </Paper>
              </>
            ) : (
              <Center style={{ minHeight: '100%' }}>
                <Text c="dimmed">Select a design file to preview it in print format.</Text>
              </Center>
            )}
          </Box>
        )}
      </Box>
    </Stack>
  );
}
