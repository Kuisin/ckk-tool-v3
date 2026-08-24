/**
 * mdx-components.tsx — docs ページの MDX コンポーネントマップ。
 * fumadocs の既定（見出しアンカー・コードブロック・Callout 等）をそのまま使う。
 *
 * 画像だけ差し替える理由:
 *   1. **タップで全画面ズーム** — スクリーンショットやフロー図は縮小表示では
 *      細部（赤枠・図の文字）が読めないため、全画像を fumadocs-ui の
 *      ImageZoom（react-medium-image-zoom を fumadocs-ui が同梱 =
 *      追加依存なし）で包む。クリック/タップで全画面表示、再クリック・
 *      Esc・スクロールで閉じる。
 *   2. ローカル画像（スクリーンショット・図）は静的 import されるので、既定
 *      どおり next/image に渡して最適化する。一方 **外部 URL の画像**（社内
 *      ドキュメントのキオスク プロビジョニング QR — リリースごとに再生成される
 *      ため常に最新を参照する必要がある）は next/image に渡すと
 *      images.remotePatterns の許可が必要で、standalone 実行時に許可が効かず
 *      400（"url" parameter is not allowed）になった。外部 URL は素の <img> を
 *      ImageZoom の children に渡して最適化を経由しない。
 */

import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ImgHTMLAttributes } from "react";

function DocsImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { src } = props;
  // 外部 URL（文字列かつ絶対 URL）はそのまま <img> で描画する（ズームは有効）。
  if (typeof src === "string" && /^https?:\/\//.test(src)) {
    return (
      <ImageZoom src={src}>
        {/* biome-ignore lint/performance/noImgElement: 外部 URL は最適化を経由しない */}
        {/* biome-ignore lint/a11y/useAltText: alt は MDX 側から渡る */}
        <img {...props} />
      </ImageZoom>
    );
  }
  // ローカル画像 — ImageZoom の既定 child（fumadocs の Image = next/image）に任せる。
  // 全画面表示側（zoomImg）は元解像度のファイルをそのまま読む。
  return <ImageZoom {...(props as Parameters<typeof ImageZoom>[0])} />;
}

export const docsMdxComponents = {
  ...defaultMdxComponents,
  img: DocsImage,
};
