/**
 * mdx-components.tsx — docs ページの MDX コンポーネントマップ。
 * fumadocs の既定（見出しアンカー・コードブロック・Callout 等）をそのまま使う。
 *
 * 画像だけ差し替える理由:
 *   ローカル画像（スクリーンショット）は静的 import されるので、既定どおり
 *   next/image に渡して最適化する。一方 **外部 URL の画像**（社内ドキュメントの
 *   キオスク プロビジョニング QR — リリースごとに再生成されるため常に最新を
 *   参照する必要がある）は next/image に渡すと images.remotePatterns の許可が
 *   必要で、standalone 実行時に許可が効かず 400（"url" parameter is not allowed）
 *   になった。外部 URL は素の <img> で出して最適化を経由しない。
 */

import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ImgHTMLAttributes } from "react";

const DefaultImg = defaultMdxComponents.img;

function DocsImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { src } = props;
  // 外部 URL（文字列かつ絶対 URL）はそのまま <img> で描画する。
  if (typeof src === "string" && /^https?:\/\//.test(src)) {
    // biome-ignore lint/performance/noImgElement: 外部 URL は最適化を経由しない
    // biome-ignore lint/a11y/useAltText: alt は MDX 側から渡る
    return <img {...props} />;
  }
  // biome-ignore lint/performance/noImgElement: fumadocs 既定が無い場合のみの退避
  // biome-ignore lint/a11y/useAltText: alt は MDX 側から渡る
  return DefaultImg ? <DefaultImg {...props} /> : <img {...props} />;
}

export const docsMdxComponents = {
  ...defaultMdxComponents,
  img: DocsImage,
};
