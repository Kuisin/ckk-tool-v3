"use client";

/**
 * IntakeDocumentPane — 取込元書類のインライン表示（確認用の左ペイン）。
 *
 * 受注請書の確認は「書類を見ながら項目を直す」作業なので、書類は別タブでは
 * なく**画面の中で並べて**出す。PDF は iframe（PdfAttachmentPanel と同じ
 * ビューア指定）、画像は img。どちらでもないものはリンクだけ出す。
 *
 * デスクトップではヘッダー下に貼り付く（sticky）ので、右の明細を下へ
 * スクロールしても書類は見えたまま。モバイルは折りたたみ（既定で閉じる）。
 */

import { Box, Collapse, Group, Paper, Text } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconFile } from "@tabler/icons-react";
import { useState } from "react";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";

/** ビューア既定の「ページ全体」だと余白が大きいので幅に合わせる。 */
const VIEWER_HASH = "#view=FitH&toolbar=1&navpanes=0";

export function IntakeDocumentPane({
  fileUrl,
  filename,
  mimeType,
  /** 右ペインの高さに合わせる（デスクトップ）。 */
  height = 640,
}: {
  fileUrl: string | null;
  filename: string | null;
  /** 取込元の MIME。null のときは拡張子から推測する。 */
  mimeType?: string | null;
  height?: number;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!fileUrl) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Text c="dimmed" size="sm">
          取込元の書類がありません（手入力）
        </Text>
      </Paper>
    );
  }

  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const isPdf = (mimeType ?? "").includes("pdf") || ext === "pdf";
  const isImage =
    (mimeType ?? "").startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp"].includes(ext);

  const viewer = isPdf ? (
    <Box
      component="iframe"
      h={height}
      src={`${fileUrl}${VIEWER_HASH}`}
      style={{ border: 0, display: "block", width: "100%" }}
      title={filename ?? "取込元書類"}
    />
  ) : isImage ? (
    <Box
      style={{ height, overflow: "auto", width: "100%" }}
      // 画像は原寸だと大きいので幅に合わせ、縦は収まらなければスクロール。
    >
      <Box
        alt={filename ?? "取込元書類"}
        component="img"
        src={fileUrl}
        style={{ display: "block", width: "100%" }}
      />
    </Box>
  ) : (
    <Text c="dimmed" p="md" size="sm">
      この形式はインライン表示できません。下のリンクから開いてください。
    </Text>
  );

  const header = (
    <Group gap="xs" justify="space-between" wrap="nowrap">
      <Group className="min-w-0" gap={6} wrap="nowrap">
        <IconFile size={14} />
        <Text size="sm" truncate>
          {filename ?? "取込元書類"}
        </Text>
      </Group>
      <Group gap="xs" wrap="nowrap">
        <GhostButton external href={fileUrl} size="xs">
          別タブ
        </GhostButton>
        {isMobile && (
          <GhostButton
            leftSection={
              open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
            }
            onClick={() => setOpen((v) => !v)}
            size="xs"
          >
            {open ? "隠す" : "書類を見る"}
          </GhostButton>
        )}
      </Group>
    </Group>
  );

  return (
    <Paper
      p="xs"
      radius="md"
      style={isMobile ? undefined : { position: "sticky", top: 76, zIndex: 1 }}
      withBorder
    >
      {header}
      {isMobile ? (
        <Collapse expanded={open}>
          <Box mt="xs">{viewer}</Box>
        </Collapse>
      ) : (
        <Box mt="xs">{viewer}</Box>
      )}
    </Paper>
  );
}
