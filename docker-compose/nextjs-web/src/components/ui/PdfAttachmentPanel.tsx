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
 * A4-aspect iframe (see VIEWER_HASH — ビューア既定の「ページ全体」表示だと
 * 余白が大きく見えるため、幅にフィットさせる)。
 *
 * ダウンロードは `downloadHref` を渡すと `lib/download.ts` 経由になり、
 * モバイルでは OS の共有シート（保存先を選択）が開く。
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
import { downloadFile } from "@/lib/download";
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

/**
 * 内蔵 PDF ビューアへのヒント。既定の「ページ全体」ズームだとフレーム内で
 * ページが縮小され、周囲に大きな灰色余白が出るので幅フィットに固定する
 * （`view=FitH` = Chrome/Edge/Safari、`zoom=page-width` = Firefox の pdf.js。
 * 未対応のパラメータは無視される）。
 */
const VIEWER_HASH =
  "#toolbar=0&navpanes=0&statusbar=0&view=FitH&zoom=page-width";

/** プレビュー URL にビューア用ハッシュを付ける（既に付いていれば据え置き）。 */
function withViewerHash(src: string): string {
  return src.includes("#") ? src : `${src}${VIEWER_HASH}`;
}

export function PdfAttachmentPanel({
  file,
  previewSrc,
  downloadHref,
  emptyMessage,
  emptyAction,
  onDownload,
  onRegenerate,
}: {
  /** Saved file meta — null while the document is still a draft (no PDF yet). */
  file: PdfFileMeta | null;
  /** Inline preview URL (streams the stored PDF). */
  previewSrc?: string;
  /** ダウンロード URL（渡すとモバイルで共有シート経由になる）。 */
  downloadHref?: string;
  emptyMessage: string;
  emptyAction?: ReactNode;
  /** `downloadHref` を渡さない場合の独自ダウンロード処理。 */
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
              onClick={
                downloadHref
                  ? () => void downloadFile(downloadHref, file.filename)
                  : onDownload
              }
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

      {/* Inline A4 preview — ページを幅いっぱいに表示（余白は枠の分だけ） */}
      <Paper p={0} radius="sm" style={{ overflow: "hidden" }} withBorder>
        <Box
          style={{
            background: "var(--mantine-color-gray-2)",
            padding: isMobile ? 4 : 8,
          }}
        >
          {previewSrc ? (
            <iframe
              src={withViewerHash(previewSrc)}
              style={{
                display: "block",
                width: "100%",
                maxWidth: A4_W,
                // A4 縦（210:297）— ページ 1 枚がちょうど収まる高さになる。
                aspectRatio: "210 / 297",
                margin: "0 auto",
                border: "none",
                background: "white",
                boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
              }}
              title={file.filename}
            />
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
