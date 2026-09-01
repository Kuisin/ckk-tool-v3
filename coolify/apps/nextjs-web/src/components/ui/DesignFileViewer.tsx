"use client";

/**
 * DesignFileViewer — 設計ファイルの「サムネイル + クリックで拡大」。
 *
 * 製品マスタ (MS24) と指示書 (PD22) の詳細、設計依頼 (SA26) の版一覧から使う。
 * どう見せるかは `lib/design-file-kind.ts` が決め、ここは器だけ:
 *   pdf     … iframe（ブラウザ内蔵ビューア）
 *   image   … img
 *   model3d … Model3dCanvas（online-3d-viewer / ssr:false）
 *   それ以外 … 理由を出してダウンロードだけ
 *
 * 詳細ページに大きなビューアを常設しない（サムネイル + モーダル）のは、
 * 指示書詳細を工程や在庫を見に来た人にまで毎回モデルを読み込ませないため。
 *
 * **サムネイルは中身をそのまま出す**（3D も静止画として描く）。ただし
 * `useInView` で**実際に見えるまで読み込まない** — Mantine の Tabs は既定で
 * keepMounted なので、門を置かないと開いてもいないタブのモデルを読みに行き、
 * ページを開いた瞬間から WebGL を起こしてしまう。
 *
 * **モバイルは全画面で開く。** 図面は「画面の広さがそのまま読めるかどうか」に
 * なる中身で、375px の中に枠・題・フッターを重ねると本文が数十 px しか残らない。
 */

import {
  AspectRatio,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconFile, IconFileTypePdf, IconPhoto } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useInView } from "@/hooks/useInView";
import { useIsMobile } from "@/hooks/useViewport";
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
  const tr = useTranslations();
  const isMobile = useIsMobile();
  if (!target) return null;
  const kind = designFileKind(target.filename, target.mimeType);
  // 全画面のときは題とフッターを引いた残り全部。dvh なのは、モバイルの
  // アドレスバーが引っ込むと vh が実際の表示領域とずれるため。
  const viewerHeight = isMobile ? "calc(100dvh - 190px)" : "70vh";

  return (
    <ModalShell
      fullScreen={isMobile}
      hideFooter
      onClose={onClose}
      opened={opened}
      size="xl"
      title={
        // モバイルは 2 行に積む。1 行に押し込むと題が閉じるボタンに当たって
        // ファイル名がほとんど見えなくなる。
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {target.filename}
          </Text>
          {target.caption && (
            <Text c="dimmed" size="xs">
              {target.caption}
            </Text>
          )}
        </Stack>
      }
    >
      <Stack gap="sm">
        {kind === "pdf" && (
          <iframe
            src={target.src}
            style={{ border: 0, height: viewerHeight, width: "100%" }}
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
              maxHeight: viewerHeight,
              objectFit: "contain",
              width: "100%",
            }}
          />
        )}
        {kind === "model3d" && (
          <Model3dCanvas
            filename={target.filename}
            height={viewerHeight}
            src={target.src}
          />
        )}
        {kind === "download" && (
          <Center py="xl">
            <Text c="dimmed" size="sm" ta="center">
              {notViewableReason(target.filename)}
            </Text>
          </Center>
        )}
        <Group justify="flex-end">
          <SecondaryButton external fullWidth={isMobile} href={target.src}>
            {tr("common.download")}
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
  const tr = useTranslations();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const holder = useRef<HTMLButtonElement>(null);
  // 見えてから読む。タブが開くのを待たせない。
  const inView = useInView(holder);
  const kind = designFileKind(target.filename, target.mimeType);
  // モバイルのブラウザは iframe の PDF をまず描かない（iOS Safari は空白、
  // Android Chrome はダウンロード誘導）。白い枠を出すより、何のファイルかを
  // アイコンで言い切って拡大に誘導する。
  const inlineThumb = kind === "pdf" && !isMobile;

  return (
    <>
      {/* 素の button にして、Enter / Space とフォーカスリングを
          ブラウザ任せにする（role="button" の手当てを自前で持たない）。 */}
      <UnstyledButton
        onClick={() => setOpen(true)}
        ref={holder}
        title={tr("ui.designFileViewer.enlarge", { filename: target.filename })}
        w="100%"
      >
        <Paper radius="md" style={{ overflow: "hidden" }} withBorder>
          <AspectRatio ratio={4 / 3} style={{ height }}>
            {!inView ? (
              // まだ見えていない（別タブ・画面外）。枠だけ確保して待つ。
              <Center bg="var(--mantine-color-gray-0)">
                <Loader size="sm" />
              </Center>
            ) : kind === "image" ? (
              // biome-ignore lint/performance/noImgElement: 認証付き API 経由の任意サイズ画像
              <img
                alt={target.filename}
                src={target.src}
                style={{ height: "100%", objectFit: "contain", width: "100%" }}
              />
            ) : kind === "model3d" ? (
              // 中身をそのまま描く。押したら回るのではなく拡大が開いてほしいので
              // 操作は渡さない（interactive={false}）。
              <Model3dCanvas
                compact
                filename={target.filename}
                height="100%"
                interactive={false}
                src={target.src}
              />
            ) : inlineThumb ? (
              // 1 ページ目をそのまま縮小して出す（ラスタライズは pdf.js が要るので
              // 入れていない）。ポインタは受けず、クリックは外側のボタンが拾う。
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
                  {kind === "pdf" ? (
                    <IconFileTypePdf size={28} />
                  ) : (
                    <IconFile size={28} />
                  )}
                  <Text c="dimmed" size="xs">
                    {kind === "pdf"
                      ? "PDF"
                      : tr("ui.designFileViewer.noPreview")}
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

/** 小さな起動口（表の行・カードなど、場所が無いとき）。 */
export function DesignFileViewButton({
  target,
  label: labelProp,
  fullWidth,
}: {
  target: DesignFileViewerTarget;
  label?: string;
  /** モバイルのカード内で使うときに全幅（44px の当たり判定）にする。 */
  fullWidth?: boolean;
}) {
  const tr = useTranslations();
  const label = labelProp ?? tr("common.display");
  const [open, setOpen] = useState(false);
  return (
    <>
      <SecondaryButton
        fullWidth={fullWidth}
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
