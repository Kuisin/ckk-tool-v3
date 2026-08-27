"use client";

/**
 * DesignFileViewer — 設計ファイルの「サムネイル + クリックで拡大」。
 *
 * 製品マスタ (MS24) と指示書 (PD22) の詳細、設計依頼 (SA26) の版一覧から使う。
 * どう見せるかは `lib/design-file-kind.ts` が決め、ここは器だけ:
 *   pdf     … iframe（ブラウザ内蔵ビューア）
 *   image   … img
 *   model3d … Model3dViewer（online-3d-viewer / ssr:false）
 *   それ以外 … 理由を出してダウンロードだけ
 *
 * 詳細ページに大きなビューアを常設しない（サムネイル + モーダル）のは、
 * 指示書詳細を工程や在庫を見に来た人にまで毎回モデルを読み込ませないため。
 */

import {
  AspectRatio,
  Box,
  Center,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconCube, IconFile, IconPhoto } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { designFileKind, notViewableReason } from "@/lib/design-file-kind";

// O3DV は document / WebGL を直接触るのでサーバーでは描けない。
const Model3dCanvas = dynamic(
  () => import("./Model3dCanvas").then((m) => m.Model3dCanvas),
  { ssr: false },
);

export interface DesignFileViewerTarget {
  /** 中身を取りに行く URL（/api/design-files/<id>）。 */
  src: string;
  filename: string;
  mimeType?: string | null;
  /** 「v2（最新）」などの見出し。 */
  caption?: string;
}

/** 拡大表示（モーダル）。 */
export function DesignFileViewerModal({
  opened,
  onClose,
  target,
}: {
  opened: boolean;
  onClose: () => void;
  target: DesignFileViewerTarget | null;
}) {
  if (!target) return null;
  const kind = designFileKind(target.filename, target.mimeType);
  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={opened}
      size="xl"
      title={
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} size="sm" truncate>
            {target.filename}
          </Text>
          {target.caption && (
            <Text c="dimmed" size="xs">
              {target.caption}
            </Text>
          )}
        </Group>
      }
    >
      <Stack gap="sm">
        {kind === "pdf" && (
          <iframe
            src={target.src}
            style={{ border: 0, height: "70vh", width: "100%" }}
            title={target.filename}
          />
        )}
        {kind === "image" && (
          // biome-ignore lint/performance/noImgElement: 認証付き API 経由の任意サイズ画像で、next/image の最適化対象にできない
          <img
            alt={target.filename}
            src={target.src}
            style={{
              height: "auto",
              maxHeight: "70vh",
              objectFit: "contain",
              width: "100%",
            }}
          />
        )}
        {kind === "model3d" && <Model3dCanvas height="70vh" src={target.src} />}
        {kind === "download" && (
          <Center py="xl">
            <Text c="dimmed" size="sm">
              {notViewableReason(target.filename)}
            </Text>
          </Center>
        )}
        <Group justify="flex-end">
          <SecondaryButton external href={target.src}>
            ダウンロード
          </SecondaryButton>
        </Group>
      </Stack>
    </ModalShell>
  );
}

/**
 * サムネイル 1 枚。押すと拡大する。
 *
 * 3D はサムネイルでも WebGL を起こすことになるので、**一覧に何枚も置かない**
 * こと（製品・指示書では最新の主図面 1 枚だけに使う）。
 */
export function DesignFileThumb({
  target,
  height = 160,
}: {
  target: DesignFileViewerTarget;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const kind = designFileKind(target.filename, target.mimeType);

  return (
    <>
      {/* 素の button にして、Enter / Space とフォーカスリングを
          ブラウザ任せにする（role="button" の手当てを自前で持たない）。 */}
      <UnstyledButton
        onClick={() => setOpen(true)}
        title={`${target.filename} を拡大`}
        w="100%"
      >
        <Paper radius="md" style={{ overflow: "hidden" }} withBorder>
          <AspectRatio ratio={4 / 3} style={{ height }}>
            {kind === "image" ? (
              // biome-ignore lint/performance/noImgElement: 認証付き API 経由の任意サイズ画像
              <img
                alt={target.filename}
                src={target.src}
                style={{ height: "100%", objectFit: "contain", width: "100%" }}
              />
            ) : kind === "pdf" ? (
              // 1 ページ目をそのまま縮小して出す（ラスタライズは pdf.js が要るので
              // 入れていない）。ポインタは受けず、クリックは外側の Box が拾う。
              <Box style={{ pointerEvents: "none" }}>
                <iframe
                  src={`${target.src}#toolbar=0&navpanes=0&view=FitH`}
                  style={{ border: 0, height: "100%", width: "100%" }}
                  title={target.filename}
                />
              </Box>
            ) : (
              <Center bg="var(--mantine-color-gray-0)">
                <Stack align="center" gap={4}>
                  {kind === "model3d" ? (
                    <IconCube size={28} />
                  ) : (
                    <IconFile size={28} />
                  )}
                  <Text c="dimmed" size="xs">
                    {kind === "model3d" ? "3D モデル" : "プレビューなし"}
                  </Text>
                </Stack>
              </Center>
            )}
          </AspectRatio>
        </Paper>
      </UnstyledButton>
      <DesignFileViewerModal
        onClose={() => setOpen(false)}
        opened={open}
        target={target}
      />
    </>
  );
}

/** アイコンだけの小さな起動口（表の行など、場所が無いとき）。 */
export function DesignFileViewButton({
  target,
  label = "表示",
}: {
  target: DesignFileViewerTarget;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SecondaryButton
        leftSection={<IconPhoto size={14} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </SecondaryButton>
      <DesignFileViewerModal
        onClose={() => setOpen(false)}
        opened={open}
        target={target}
      />
    </>
  );
}
