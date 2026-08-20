"use client";

/**
 * PdfAttachmentPanel — 生成 PDF パネル（詳細ページ「PDF」タブ用）.
 *
 * ファイルメタバー + インライン A4 プレビュー + ダウンロード / 再生成。
 *
 * `previewSrc` は保管済み PDF を配信するルート（`/api/pdf/quote?id=…` 等）。
 * **未発行（下書き）の文書では呼び出し側が `previewSrc` を渡さない** — その場合は
 * 空状態（「発行後に閲覧できます」等）を表示する。発行済みで PDF が未生成でも
 * ルートが初回アクセスで生成するため、プレビューは表示してよい（`file` は
 * 保管済みメタが判っているときだけ渡す）。
 *
 * プレビューは A4 アスペクトの iframe（VIEWER_HASH — ビューア既定の
 * 「ページ全体」表示だと余白が大きく見えるため幅にフィットさせる）。
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
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/useViewport";
import { downloadFile } from "@/lib/download";

/** 保管済み PDF のメタ（SeaweedFS の stat 由来 — メタバーに表示）。 */
export interface PdfFileMeta {
  sizeBytes: number;
  /** ISO タイムスタンプ。filer が返さなければ null。 */
  generatedAt: string | null;
  /** 生成者が判るときだけ（現状は未取得）。 */
  generatedBy?: string | null;
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
  filename,
  file,
  previewSrc,
  downloadHref,
  emptyMessage,
  emptyAction,
  onDownload,
  onRegenerate,
}: {
  /** 表示・保存名（例 `QOT-202608-00001.pdf`）。 */
  filename: string;
  /** 保管済みメタ — null なら未生成（初回プレビュー時に生成される）。 */
  file: PdfFileMeta | null;
  /** プレビュー URL。未指定 = 閲覧不可（未発行）→ 空状態。 */
  previewSrc?: string;
  /** ダウンロード URL（渡すとモバイルで共有シート経由になる）。 */
  downloadHref?: string;
  emptyMessage: string;
  emptyAction?: ReactNode;
  /** `downloadHref` を渡さない場合の独自ダウンロード処理。 */
  onDownload?: () => void;
  onRegenerate?: () => void;
}) {
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (!previewSrc) {
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
                  {filename}
                </Text>
                {file && file.sizeBytes > 0 && (
                  <Badge
                    className="shrink-0"
                    color="gray"
                    size="xs"
                    variant="light"
                  >
                    {formatBytes(file.sizeBytes)}
                  </Badge>
                )}
              </Group>
              <Text c="dimmed" size="xs">
                {file?.generatedAt
                  ? `生成: ${fmt.dateTime(file.generatedAt)}${
                      file.generatedBy ? `（${file.generatedBy}）` : ""
                    }`
                  : "生成: 表示時に生成されます"}
              </Text>
            </Stack>
          </Group>
          <Group className="shrink-0" gap="xs">
            <SecondaryButton
              leftSection={<IconDownload size={14} />}
              onClick={
                downloadHref
                  ? () => void downloadFile(downloadHref, filename)
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
            title={filename}
          />
        </Box>
      </Paper>
    </Stack>
  );
}
