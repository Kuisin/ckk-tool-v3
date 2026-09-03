"use client";

/**
 * IntakeDocumentPane — 取込元書類のインライン表示（確認用の左ペイン）。
 *
 * 注文請書の確認は「書類を見ながら項目を直す」作業なので、書類は別タブでは
 * なく**画面の中で並べて**出す。PDF は iframe（PdfAttachmentPanel と同じ
 * ビューア指定）、画像は img。どちらでもないものはリンクだけ出す。
 *
 * デスクトップではヘッダー下に貼り付く（sticky）ので、右の明細を下へ
 * スクロールしても書類は見えたまま。
 *
 * **畳める（デスクトップ）** — 書類を読み終えて明細を直す段では、左の
 * 40% が邪魔になる（明細エディタは 1 行に 5 欄あり、幅が足りないと単価が
 * 次の行へ折り返す）。畳むと左は細い帯だけになり、**右がその分広がる**
 * （列幅は親の Grid が持つので、開閉の状態も親が持つ — 下の `collapsed`）。
 * モバイルは従来どおり縦積みの折りたたみ（既定で閉じる）。
 */

import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconFile,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";

/** ビューア既定の「ページ全体」だと余白が大きいので幅に合わせる。 */
const VIEWER_HASH = "#view=FitH&toolbar=1&navpanes=0";

/** 畳んだときの帯の幅（px）。Grid.Col は span="content" でこれに合わせる。 */
const RAIL_WIDTH = 44;

export function IntakeDocumentPane({
  fileUrl,
  filename,
  mimeType,
  /** 右ペインの高さに合わせる（デスクトップ）。 */
  height = 640,
  collapsed = false,
  onToggleCollapse,
}: {
  fileUrl: string | null;
  filename: string | null;
  /** 取込元の MIME。null のときは拡張子から推測する。 */
  mimeType?: string | null;
  height?: number;
  /**
   * デスクトップで畳んでいるか。**列幅を決めるのは親**（Grid）なので、
   * 状態はここでは持たない。
   */
  collapsed?: boolean;
  /** 省略すると畳むボタンを出さない（畳めない画面のため）。 */
  onToggleCollapse?: () => void;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const label = filename ?? tr("sales.orderAcceptances.sourceDocument");
  const stickyStyle = isMobile
    ? undefined
    : ({ position: "sticky", top: 76, zIndex: 1 } as const);

  // 畳んだ帯（デスクトップのみ）。書類が無い手入力でも畳めるようにしてある
  // — 空の枠が右の幅を食っている方が困る。
  if (!isMobile && collapsed) {
    return (
      <Paper p={6} radius="md" style={stickyStyle} w={RAIL_WIDTH} withBorder>
        <Stack align="center" gap="xs">
          <Tooltip label={tr("sales.orderAcceptances.showTheDocumentPane")}>
            <ActionIcon
              aria-label={tr("sales.orderAcceptances.showTheDocumentPane")}
              color="gray"
              onClick={onToggleCollapse}
              variant="subtle"
            >
              <IconLayoutSidebarLeftExpand size={18} />
            </ActionIcon>
          </Tooltip>
          <IconFile size={14} />
          {/* 縦書きで名前を残す — 何を畳んだのかが分かるように。 */}
          <Text
            c="dimmed"
            size="xs"
            style={{
              maxHeight: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              writingMode: "vertical-rl",
            }}
          >
            {fileUrl
              ? label
              : tr("sales.orderAcceptances.thereIsNoSourceDocumentEntered")}
          </Text>
        </Stack>
      </Paper>
    );
  }

  const collapseButton = onToggleCollapse && !isMobile && (
    <Tooltip label={tr("sales.orderAcceptances.hideTheDocumentPane")}>
      <ActionIcon
        aria-label={tr("sales.orderAcceptances.hideTheDocumentPane")}
        color="gray"
        onClick={onToggleCollapse}
        variant="subtle"
      >
        <IconLayoutSidebarLeftCollapse size={18} />
      </ActionIcon>
    </Tooltip>
  );

  if (!fileUrl) {
    return (
      <Paper p="xs" radius="md" style={stickyStyle} withBorder>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text c="dimmed" px={6} size="sm">
            {tr("sales.orderAcceptances.thereIsNoSourceDocumentEntered")}
          </Text>
          {collapseButton}
        </Group>
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
      title={label}
    />
  ) : isImage ? (
    <Box
      style={{ height, overflow: "auto", width: "100%" }}
      // 画像は原寸だと大きいので幅に合わせ、縦は収まらなければスクロール。
    >
      <Box
        alt={label}
        component="img"
        src={fileUrl}
        style={{ display: "block", width: "100%" }}
      />
    </Box>
  ) : (
    <Text c="dimmed" p="md" size="sm">
      {tr("sales.orderAcceptances.thisFormatCannotBeShownInline")}
    </Text>
  );

  const header = (
    <Group gap="xs" justify="space-between" wrap="nowrap">
      <Group className="min-w-0" gap={6} wrap="nowrap">
        <IconFile size={14} />
        <Text size="sm" truncate>
          {label}
        </Text>
      </Group>
      <Group gap="xs" wrap="nowrap">
        <GhostButton external href={fileUrl} size="xs">
          {tr("sales.orderAcceptances.newTab")}
        </GhostButton>
        {isMobile && (
          <GhostButton
            leftSection={
              open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
            }
            onClick={() => setOpen((v) => !v)}
            size="xs"
          >
            {open
              ? tr("sales.orderAcceptances.hideTheDocument")
              : tr("sales.orderAcceptances.viewTheDocument")}
          </GhostButton>
        )}
        {collapseButton}
      </Group>
    </Group>
  );

  return (
    <Paper p="xs" radius="md" style={stickyStyle} withBorder>
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
