import { useState, useEffect } from 'react';
import {
  Box,
  Text,
  Center,
  Stack,
  Button,
  Group,
  ScrollArea,
  ActionIcon,
  Loader,
} from '@mantine/core';
import { IconPrinter, IconRefresh } from '@tabler/icons-react';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';

const PDF_PREFIX = '../pdf-templates/';

// Discover all .html files under pdf-templates/
const templateModules = import.meta.glob('../pdf-templates/**/*.html', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const templatePaths = Object.keys(templateModules).sort((a, b) =>
  formatDesignLabel(a, PDF_PREFIX, 'html').localeCompare(
    formatDesignLabel(b, PDF_PREFIX, 'html'),
  ),
);

const fileTree = buildFileTree(templatePaths, PDF_PREFIX, 'html');

// A4 at 96 dpi screen equivalent
const A4_W = 794;
const A4_H = 1123;

export function PdfTemplatePreview() {
  const [selected, setSelected] = useState<string | null>(templatePaths[0] ?? null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!selected) {
      setHtmlContent(null);
      return;
    }
    setLoading(true);
    setHtmlContent(null);
    templateModules[selected]().then((raw) => {
      setHtmlContent(raw as string);
      setLoading(false);
    });
  }, [selected, key]);

  function handlePrint() {
    if (!htmlContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(htmlContent);
    win.document.close();
    win.focus();
    // give the browser a moment to render before opening print dialog
    win.setTimeout(() => win.print(), 400);
  }

  const label = selected ? formatDesignLabel(selected, PDF_PREFIX, 'html') : null;

  return (
    <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Sidebar */}
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
              No .html files in pdf-templates/ yet.
            </Text>
          ) : (
            <FileTree nodes={fileTree} selected={selected} onSelect={setSelected} />
          )}
        </ScrollArea>
      </Box>

      {/* Preview area */}
      <Box
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--mantine-color-gray-2)',
        }}
      >
        {/* Sub-toolbar */}
        {selected && (
          <Box
            px="md"
            py="xs"
            style={{
              borderBottom: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-body)',
              flexShrink: 0,
            }}
          >
            <Group justify="space-between">
              <Text size="sm" c="dimmed" ff="monospace">
                {label}
              </Text>
              <Group gap="xs">
                <ActionIcon
                  variant="default"
                  title="Reload template"
                  onClick={() => setKey((k) => k + 1)}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
                <Button
                  size="xs"
                  leftSection={<IconPrinter size={14} />}
                  onClick={handlePrint}
                  disabled={!htmlContent}
                >
                  Print / Save PDF
                </Button>
              </Group>
            </Group>
          </Box>
        )}

        {/* Canvas */}
        <Box style={{ flex: 1, overflow: 'auto', padding: 32 }}>
          {!selected ? (
            <Center style={{ minHeight: '100%' }}>
              <Text c="dimmed">
                {templatePaths.length === 0
                  ? 'Drop an .html file into design-preview/pdf-templates/ to get started.'
                  : 'Select a template from the tree on the left.'}
              </Text>
            </Center>
          ) : loading ? (
            <Center style={{ minHeight: '100%' }}>
              <Stack align="center" gap="xs">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Loading…</Text>
              </Stack>
            </Center>
          ) : htmlContent ? (
            /* A4 paper sheet */
            <Box
              style={{
                width: A4_W,
                minHeight: A4_H,
                background: 'white',
                boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
                margin: '0 auto',
                overflow: 'hidden',
              }}
            >
              <iframe
                key={`${selected}-${key}`}
                srcDoc={htmlContent}
                title={label ?? 'PDF Template'}
                style={{
                  width: A4_W,
                  height: A4_H,
                  border: 'none',
                  display: 'block',
                }}
              />
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
