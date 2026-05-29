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
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { ErrorBoundary } from './ErrorBoundary';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { resolveDesignComponent } from './resolve-design';

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
            {selected && (
              <Text size="sm" c="dimmed" ff="monospace">
                {formatDesignLabel(selected)}
              </Text>
            )}
          </Group>
          <ActionIcon
            variant="default"
            title="Re-render"
            onClick={() => setKey((k) => k + 1)}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </Box>

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

        {/* Canvas */}
        <Box style={{ flex: 1, overflow: 'auto' }} p="md">
          {selected ? (
            <ErrorBoundary key={`${selected}-${key}`} onReset={() => setKey((k) => k + 1)}>
              <DesignCanvas key={`${selected}-${key}`} path={selected} />
            </ErrorBoundary>
          ) : (
            <Center h="100%">
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
    </Stack>
  );
}
