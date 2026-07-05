/**
 * pdf-panel.tsx — Saved-PDF attachment panel（詳細ページ「PDF」タブ用）.
 *
 * Shows the stored PDF (`files` table row, referenced via `pdf_file_id`) of a
 * document: file meta bar + inline A4 preview + download / regenerate actions.
 *
 * In production the iframe points at the stored SeaweedFS object
 * (`/api/files/[id]` streaming route). In this design preview it embeds the
 * matching `pdf-templates/*.html` served by the Vite dev server, which renders
 * the same layout Gotenberg turns into the saved PDF.
 */

import { type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconDownload,
  IconFileTypePdf,
  IconRefresh,
} from '@tabler/icons-react';
import { EmptyState, formatDateTime } from './ui';
import { useIsMobile } from './viewport-context';

/** `files` table row subset shown in the meta bar. */
export interface PdfFileMeta {
  filename: string;
  sizeBytes: number;
  generatedAt: string;
  generatedBy: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A4 at 96dpi — matches pdf-templates preview (210mm × 297mm).
const A4_W = 794;
const A4_H = 1123;

export function PdfAttachmentPanel({
  file,
  previewSrc,
  emptyMessage,
  emptyAction,
  onDownload,
  onRegenerate,
}: {
  /** Saved file meta — null while the document is still a draft (no PDF yet). */
  file: PdfFileMeta | null;
  /** Preview URL (production: /api/files/[id]; preview: /pdf-templates/*.html). */
  previewSrc?: string;
  emptyMessage: string;
  emptyAction?: ReactNode;
  onDownload?: () => void;
  onRegenerate?: () => void;
}) {
  const isMobile = useIsMobile();

  if (!file) {
    return (
      <EmptyState
        icon={<IconFileTypePdf size={24} />}
        message={emptyMessage}
        action={emptyAction}
      />
    );
  }

  return (
    <Stack gap="sm">
      {/* File meta bar */}
      <Paper withBorder p="sm" radius="sm">
        <Group justify="space-between" wrap={isMobile ? 'wrap' : 'nowrap'} gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon variant="light" color="red" size="lg" radius="sm">
              <IconFileTypePdf size={20} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600} ff="mono" truncate>{file.filename}</Text>
                <Badge variant="light" color="gray" size="xs" style={{ flexShrink: 0 }}>
                  {formatBytes(file.sizeBytes)}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                生成: {formatDateTime(file.generatedAt)}（{file.generatedBy}）
              </Text>
            </Stack>
          </Group>
          <Group gap="xs" style={{ flexShrink: 0 }}>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconDownload size={14} />}
              onClick={onDownload}
            >
              ダウンロード
            </Button>
            {onRegenerate && (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconRefresh size={14} />}
                onClick={onRegenerate}
              >
                再生成
              </Button>
            )}
          </Group>
        </Group>
      </Paper>

      {/* Inline A4 preview */}
      <Paper withBorder radius="sm" p={0} style={{ overflow: 'hidden' }}>
        <Box
          style={{
            overflow: 'auto',
            maxHeight: isMobile ? 480 : 720,
            background: 'var(--mantine-color-gray-2)',
            padding: isMobile ? 12 : 24,
          }}
        >
          {previewSrc ? (
            <Box
              style={{
                width: A4_W,
                height: A4_H,
                background: 'white',
                boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                margin: '0 auto',
                flexShrink: 0,
              }}
            >
              <iframe
                src={previewSrc}
                title={file.filename}
                style={{ width: A4_W, height: A4_H, border: 'none', display: 'block' }}
              />
            </Box>
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              プレビューを表示できません。ダウンロードして確認してください。
            </Text>
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
