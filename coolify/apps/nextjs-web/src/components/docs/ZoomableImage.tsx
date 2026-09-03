"use client";

/**
 * ZoomableImage — docs（/manual・/admin-manual）の画像を「クリックで全画面 +
 * 実際に拡大できる」ようにする。
 *
 * 従来（mdx-components.tsx）は fumadocs-ui の ImageZoom（react-medium-
 * image-zoom を同梱・追加依存なし）を使っていたが、あちらは「縮小⇄原寸」の
 * 単発トランジションだけで、開いた後のホイール/ピンチはズームではなく
 * **モーダルを閉じる**操作に割り当てられている（ライブラリの仕様）。マニュアルの
 * スクリーンショットは細部の文字を読むために拡大したいことが多く、原寸表示
 * だけでは不十分——ここでは開いた後にホイール/ピンチ/ダブルクリックで実際に
 * 拡大・ドラッグで移動できる必要があった。
 *
 * react-zoom-pan-pinch（transform 計算だけを持つ小さなライブラリ）を追加し、
 * 開閉・背景・Esc・フォーカストラップは既存の ModalShell（Mantine Modal）に
 * 任せる——2 つのライブラリでホイール/タッチのイベントを取り合わせない構成。
 */

import { ActionIcon } from "@mantine/core";
import { Image as FumadocsImage } from "fumadocs-core/framework";
import { useTranslations } from "next-intl";
import { type ImgHTMLAttributes, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { ModalShell } from "@/components/ui/modals";

/** fumadocs-ui の ImageZoom と同じ解決規則（文字列 / 静的 import の両対応）。 */
function getImageSrc(src: unknown): string {
  if (typeof src === "string") return src;
  if (src && typeof src === "object") {
    if ("default" in src) {
      return (src as { default: { src: string } }).default.src;
    }
    if ("src" in src) return (src as { src: string }).src;
  }
  return "";
}

export function ZoomableImage(
  props: ImgHTMLAttributes<HTMLImageElement> & { isExternal?: boolean },
) {
  const { isExternal, ...imgProps } = props;
  const tr = useTranslations();
  const [open, setOpen] = useState(false);
  const src = getImageSrc(props.src);
  const alt = typeof props.alt === "string" ? props.alt : "";

  return (
    <>
      <button
        aria-label={alt}
        onClick={() => setOpen(true)}
        style={{
          all: "unset",
          cursor: "zoom-in",
          display: "block",
          width: "100%",
        }}
        type="button"
      >
        {isExternal ? (
          // biome-ignore lint/performance/noImgElement: 外部 URL は最適化を経由しない（mdx-components.tsx 参照）
          // biome-ignore lint/a11y/useAltText: alt は MDX 側から imgProps 経由で渡る
          <img {...imgProps} />
        ) : (
          <FumadocsImage
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 900px"
            {...(imgProps as Parameters<typeof FumadocsImage>[0])}
          />
        )}
      </button>
      <ModalShell
        fullScreen
        hideFooter
        onClose={() => setOpen(false)}
        opened={open}
        title={alt || undefined}
      >
        <div style={{ height: "calc(100dvh - 120px)", position: "relative" }}>
          <TransformWrapper
            centerOnInit
            doubleClick={{ mode: "toggle", step: 1 }}
            initialScale={1}
            maxScale={5}
            minScale={1}
            pinch={{ step: 5 }}
            wheel={{ step: 0.2 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--mantine-spacing-xs)",
                    position: "absolute",
                    right: 0,
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <ActionIcon
                    aria-label={tr("docs.zoomableImage.zoomOut")}
                    onClick={() => zoomOut()}
                    variant="default"
                  >
                    −
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("docs.zoomableImage.zoomIn")}
                    onClick={() => zoomIn()}
                    variant="default"
                  >
                    +
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("docs.zoomableImage.resetZoom")}
                    onClick={() => resetTransform()}
                    variant="default"
                  >
                    ⟲
                  </ActionIcon>
                </div>
                <TransformComponent
                  contentStyle={{
                    alignItems: "center",
                    display: "flex",
                    height: "100%",
                    justifyContent: "center",
                    width: "100%",
                  }}
                  wrapperStyle={{ height: "100%", width: "100%" }}
                >
                  {/** biome-ignore lint/performance/noImgElement: 拡大表示の対象は原寸のまま渡す（next/image を経由しない） */}
                  <img
                    alt={alt}
                    src={src}
                    style={{
                      maxHeight: "calc(100dvh - 120px)",
                      maxWidth: "100%",
                      objectFit: "contain",
                    }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </ModalShell>
    </>
  );
}
