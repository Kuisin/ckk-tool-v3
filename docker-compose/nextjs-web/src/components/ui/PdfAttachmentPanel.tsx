"use client";

/**
 * PdfAttachmentPanel — saved-PDF attachment panel（詳細ページ「PDF」タブ用）.
 *
 * Shows the stored PDF (`files` table row, referenced via e.g. `quotes.pdf_file_id`)
 * of a document: file meta bar + inline A4 preview + download / regenerate actions.
 * `file == null` (draft — no PDF yet) renders the empty state instead.
 *
 * `previewSrc` points at the streaming route that serves the stored object
 * (e.g. `/api/pdf/quote?id=…`, later `/api/files/[id]`), rendered inline in an
 * A4-sized iframe.
 */

import {
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconDownload,
  IconFileTypePdf,
  IconRefresh,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDateTime } from "@/lib/format";

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

// A4 at 96dpi — matches pdf-templates (210mm × 297mm).
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
  /** Inline preview URL (streams the stored PDF). */
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
        action={emptyAction}
        icon={<IconFileTypePdf size={24} />}
        message={emptyMessage}
      />
    );
  }

  return (
    <Stack gap="sm">
      {/* File meta bar */}
      <Paper p="sm" radius="sm" withBorder>
        <Group
          gap="sm"
          justify="space-between"
          wrap={isMobile ? "wrap" : "nowrap"}
        >
          <Group className="min-w-0" gap="sm" wrap="nowrap">
            <ThemeIcon color="red" radius="sm" size="lg" variant="light">
              <IconFileTypePdf size={20} />
            </ThemeIcon>
            <Stack className="min-w-0" gap={2}>
              <Group gap="xs" wrap="nowrap">
                <Text ff="mono" fw={600} size="sm" truncate>
                  {file.filename}
                </Text>
                <Badge
                  className="shrink-0"
                  color="gray"
                  size="xs"
                  variant="light"
                >
                  {formatBytes(file.sizeBytes)}
                </Badge>
              </Group>
              <Text c="dimmed" size="xs">
                生成: {formatDateTime(file.generatedAt)}（{file.generatedBy}）
              </Text>
            </Stack>
          </Group>
          <Group className="shrink-0" gap="xs">
            <SecondaryButton
              leftSection={<IconDownload size={14} />}
              onClick={onDownload}
            >
              ダウンロード
            </SecondaryButton>
            {onRegenerate && (
              <GhostButton
                leftSection={<IconRefresh size={14} />}
                onClick={onRegenerate}
              >
                再生成
              </GhostButton>
            )}
          </Group>
        </Group>
      </Paper>

      {/* Inline A4 preview */}
      <Paper p={0} radius="sm" style={{ overflow: "hidden" }} withBorder>
        <Box
          style={{
            overflow: "auto",
            maxHeight: isMobile ? 480 : 720,
            background: "var(--mantine-color-gray-2)",
            padding: isMobile ? 12 : 24,
          }}
        >
          {previewSrc ? (
            <Box
              style={{
                width: A4_W,
                height: A4_H,
                background: "white",
                boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
                margin: "0 auto",
                flexShrink: 0,
              }}
            >
              <iframe
                src={previewSrc}
                style={{
                  width: A4_W,
                  height: A4_H,
                  border: "none",
                  display: "block",
                }}
                title={file.filename}
              />
            </Box>
          ) : (
            <Text c="dimmed" py="xl" size="sm" ta="center">
              プレビューを表示できません。ダウンロードして確認してください。
            </Text>
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
