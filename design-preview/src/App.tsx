import { useState } from 'react';
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
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { BrowserWindow, type Viewport } from './BrowserWindow';
import { PdfTemplatePreview } from './PdfTemplatePreview';
import { useSearchParam } from './use-search-param';
import { designPaths, isComponentFile } from './design-modules';
import type { FrameMode } from './build-frame-url';

const fileTree = buildFileTree(designPaths);

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

type Mode = 'ui' | 'pdf';

export default function App() {
  const [modeParam, setMode] = useSearchParam('mode', 'ui');
  const mode = (modeParam === 'pdf' ? 'pdf' : 'ui') as Mode;

  const [designParam, setDesignParam] = useSearchParam('design', designPaths[0] ?? '');
  const selected = designPaths.includes(designParam) ? designParam : (designPaths[0] ?? null);
  const setSelected = (path: string | null) => setDesignParam(path ?? '');

  const [viewportParam, setViewport] = useSearchParam('viewport', 'desktop');
  const viewport = (viewportParam === 'mobile' ? 'mobile' : 'desktop') as Viewport;

  const [key, setKey] = useState(0);

  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const scheme = computedColorScheme === 'dark' ? 'dark' : 'light';
  const isDark = scheme === 'dark';

  const frameMode: FrameMode = selected && isComponentFile(selected) ? 'component' : 'page';

  return (
    <Stack gap={0} h="100vh">
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
                <FileTree nodes={fileTree} selected={selected} onSelect={setSelected} />
              )}
            </ScrollArea>
          </Box>

          <Box
            style={{
              flex: 1,
              overflow: 'auto',
              background: isDark ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-gray-2)',
              padding: 24,
            }}
          >
            {selected ? (
              <BrowserWindow
                url={designPathToUrl(selected)}
                design={selected}
                viewport={viewport}
                scheme={scheme}
                mode={frameMode}
                remountKey={key}
                onViewportChange={setViewport}
              />
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
