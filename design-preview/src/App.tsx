import { useState, lazy, Suspense, ComponentType } from 'react';
import {
  Stack,
  Box,
  Group,
  Title,
  Select,
  ActionIcon,
  Center,
  Text,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { ErrorBoundary } from './ErrorBoundary';

// Auto-discover all .tsx files dropped into designs/
// Vite watches this glob in dev mode — new files appear after HMR reload.
const designModules = import.meta.glob('../designs/*.tsx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>;

const designOptions = Object.keys(designModules).map((path) => ({
  value: path,
  label: path.replace('../designs/', '').replace('.tsx', ''),
}));

// Cache lazy components so they aren't recreated on every render
const lazyCache = new Map<string, ReturnType<typeof lazy>>();
function getLazy(path: string) {
  if (!lazyCache.has(path)) {
    lazyCache.set(path, lazy(designModules[path]));
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
    designOptions[0]?.value ?? null,
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
        <Group>
          <Title order={5} style={{ flexShrink: 0 }}>
            Design Preview
          </Title>
          <Select
            placeholder={
              designOptions.length === 0
                ? 'No files in designs/ yet…'
                : 'Select a design file…'
            }
            data={designOptions}
            value={selected}
            onChange={setSelected}
            searchable
            style={{ flex: 1, maxWidth: 520 }}
          />
          <ActionIcon
            variant="default"
            title="Re-render"
            onClick={() => setKey((k) => k + 1)}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
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
                {designOptions.length === 0
                  ? 'Drop a .tsx file into design-preview/designs/ to get started.'
                  : 'Select a design file from the dropdown above.'}
              </Text>
            </Stack>
          </Center>
        )}
      </Box>
    </Stack>
  );
}
