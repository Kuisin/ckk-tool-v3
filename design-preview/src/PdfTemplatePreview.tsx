import { useState, useEffect, useMemo } from 'react';
import { useSearchParam } from './use-search-param';
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
  Badge,
  Tooltip,
} from '@mantine/core';
import { IconDownload, IconRefresh, IconCode, IconCodeOff } from '@tabler/icons-react';
import { FileTree } from './FileTree';
import { buildFileTree, formatDesignLabel } from './file-tree';
import { renderTemplate } from './template-engine';
import baseCss from '../pdf-templates/base.css?raw';

const PDF_PREFIX = '../pdf-templates/';

const templateModules = import.meta.glob('../pdf-templates/**/*.html', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const dataModules = import.meta.glob('../pdf-templates/data/*.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const templatePaths = Object.keys(templateModules).sort((a, b) =>
  formatDesignLabel(a, PDF_PREFIX, 'html').localeCompare(
    formatDesignLabel(b, PDF_PREFIX, 'html'),
  ),
);

const fileTree = buildFileTree(templatePaths, { prefix: PDF_PREFIX, ext: 'html' });

/** Map template path → data path, e.g. ../pdf-templates/quote.html → ../pdf-templates/data/quote.json */
function templateDataPath(templatePath: string): string | null {
  const name = templatePath.replace(PDF_PREFIX, '').replace(/\.html$/, '');
  const dataPath = `${PDF_PREFIX}data/${name}.json`;
  return dataPath in dataModules ? dataPath : null;
}

const A4_W = 794;
const A4_H = 1123;

// Noto Sans JP loaded from _assets served by designAssetsPlugin at /design-assets/
// Using the variable font so a single file covers all weights (100–900).
// The font URL must be absolute because the iframe uses srcDoc (about:blank origin).
const FONT_FACE_CSS = `@font-face {
  font-family: 'Noto Sans JP';
  src: url('${window.location.origin}${import.meta.env.BASE_URL}design-assets/fonts/NotoSansJP-VariableFont_wght.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}`;

function injectPreviewStyles(html: string): string {
  const fontStyle = `<style>\n${FONT_FACE_CSS}\n</style>`;
  const baseStyle = `<style>\n${baseCss}\n</style>`;
  const padStyle = '<style>body { padding: 10mm !important; }</style>';

  const linkRe = /<link[^>]*href=["']base\.css["'][^>]*\/?>/i;
  const withBase = linkRe.test(html)
    ? html.replace(linkRe, baseStyle)
    : html.includes('<head>')
      ? html.replace('<head>', `<head>\n${baseStyle}`)
      : baseStyle + html;

  // Inject font-face + padding override before </head>
  const combined = `${fontStyle}\n${padStyle}`;
  return withBase.includes('</head>')
    ? withBase.replace('</head>', `${combined}\n</head>`)
    : combined + withBase;
}

export function PdfTemplatePreview() {
  const [templateParam, setTemplateParam] = useSearchParam('template', templatePaths[0] ?? '');
  const selected = templatePaths.includes(templateParam)
    ? templateParam
    : (templatePaths[0] ?? null);
  const setSelected = (path: string | null) => setTemplateParam(path ?? '');
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [defaultJson, setDefaultJson] = useState<string>('{}');
  const [jsonText, setJsonText] = useState<string>('{}');
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!selected) {
      setRawHtml(null);
      setJsonText('{}');
      setDefaultJson('{}');
      return;
    }
    setLoading(true);
    setRawHtml(null);

    const dataPath = templateDataPath(selected);
    Promise.all([
      templateModules[selected](),
      dataPath ? dataModules[dataPath]() : Promise.resolve(null),
    ]).then(([html, rawJson]) => {
      setRawHtml(html as string);
      const json = rawJson ? (rawJson as string) : '{}';
      setDefaultJson(json);
      setJsonText(json);
      setLoading(false);
    });
  }, [selected, key]);

  const { processedHtml, jsonError } = useMemo(() => {
    if (!rawHtml) return { processedHtml: null, jsonError: null };
    try {
      const data = JSON.parse(jsonText) as Record<string, unknown>;
      return { processedHtml: renderTemplate(rawHtml, data), jsonError: null };
    } catch (err) {
      return { processedHtml: rawHtml, jsonError: String(err) };
    }
  }, [rawHtml, jsonText]);

  async function handleDownloadPdf() {
    if (!selected || pdfLoading) return;
    setPdfLoading(true);
    try {
      const template = selected.slice(PDF_PREFIX.length);
      const res = await fetch(`/api/pdf?template=${encodeURIComponent(template)}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`PDF generation returned ${res.status}`);

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      const filename =
        disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `${label ?? 'template'}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }

  const label = selected ? formatDesignLabel(selected, PDF_PREFIX, 'html') : null;
  const hasData = templateDataPath(selected ?? '') !== null;

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

      {/* Main content */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                {hasData && (
                  <Tooltip label={showDataEditor ? 'Hide data editor' : 'Edit JSON data'}>
                    <ActionIcon
                      variant={showDataEditor ? 'filled' : 'default'}
                      onClick={() => setShowDataEditor((v) => !v)}
                    >
                      {showDataEditor ? <IconCodeOff size={16} /> : <IconCode size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
                <Button
                  size="xs"
                  leftSection={<IconDownload size={14} />}
                  onClick={handleDownloadPdf}
                  disabled={!processedHtml}
                  loading={pdfLoading}
                >
                  Save PDF
                </Button>
              </Group>
            </Group>
          </Box>
        )}

        {/* Canvas + optional data editor */}
        <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Preview canvas */}
          <Box
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--mantine-color-gray-2)',
              padding: 32,
            }}
          >
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
            ) : processedHtml ? (
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
                  key={`${selected}-${key}-${jsonText}`}
                  srcDoc={injectPreviewStyles(processedHtml)}
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

          {/* Data editor panel */}
          {showDataEditor && (
            <Box
              w={380}
              style={{
                flexShrink: 0,
                borderLeft: '1px solid var(--mantine-color-default-border)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--mantine-color-body)',
              }}
            >
              <Box
                px="sm"
                py="xs"
                style={{
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                  flexShrink: 0,
                }}
              >
                <Group justify="space-between">
                  <Group gap="xs">
                    <Text size="xs" fw={600}>JSON Data</Text>
                    {jsonError && (
                      <Tooltip label={jsonError} multiline w={260} withArrow>
                        <Badge color="red" size="xs" style={{ cursor: 'help' }}>
                          Parse error
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                  <Tooltip label="Reset to default">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      onClick={() => setJsonText(defaultJson)}
                      disabled={jsonText === defaultJson}
                    >
                      <IconRefresh size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Box>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 12px',
                  fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
                  fontSize: '11px',
                  lineHeight: 1.6,
                  background: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)',
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
