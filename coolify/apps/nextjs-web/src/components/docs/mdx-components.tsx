/**
 * mdx-components.tsx — docs ページの MDX コンポーネントマップ。
 * fumadocs の既定（見出しアンカー・コードブロック・Callout 等）をそのまま使う。
 *
 * 画像だけ差し替える理由:
 *   1. **タップで全画面 + 実際に拡大** — スクリーンショットやフロー図は縮小
 *      表示では細部（赤枠・図の文字）が読めないため、`ZoomableImage`
 *      （components/docs/ZoomableImage.tsx）で包む。fumadocs-ui 同梱の
 *      ImageZoom（react-medium-image-zoom）は「縮小⇄原寸」の単発トランジ
 *      ションのみでホイール/ピンチはズームではなく閉じる操作に割り当てられて
 *      いたため、react-zoom-pan-pinch を使った自前のビューアに差し替えた
 *      （経緯は ZoomableImage.tsx 冒頭のコメント）。
 *   2. ローカル画像（スクリーンショット・図）は静的 import されるので、既定
 *      どおり next/image に渡して最適化する。一方 **外部 URL の画像**（社内
 *      ドキュメントのキオスク プロビジョニング QR — リリースごとに再生成される
 *      ため常に最新を参照する必要がある）は next/image に渡すと
 *      images.remotePatterns の許可が必要で、standalone 実行時に許可が効かず
 *      400（"url" parameter is not allowed）になった。外部 URL は素の <img>
 *      を渡し、最適化を経由しない（ZoomableImage の isExternal）。
 */

import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ImgHTMLAttributes } from "react";
import { ZoomableImage } from "./ZoomableImage";

function DocsImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { src } = props;
  const isExternal = typeof src === "string" && /^https?:\/\//.test(src);
  return <ZoomableImage {...props} isExternal={isExternal} />;
}

export const docsMdxComponents = {
  ...defaultMdxComponents,
  img: DocsImage,
};
