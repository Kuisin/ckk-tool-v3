/**
 * source.config.ts — fumadocs-mdx のコレクション定義。
 *
 * 2 ツリー構成:
 *   - manual   → content/manual   （公開ユーザーマニュアル /manual）
 *   - internal → content/internal （管理マニュアル /admin-manual・要ログイン）
 *
 * ロケールはファイル名サフィックス（`x.md` = ja / `x.en.md` / `x.zh.md`、
 * lib/docs-i18n.ts の parser: "dot" と対応）。manual は llms.txt / 生 Markdown
 * 配信のため processed Markdown を含める。
 */

import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const manual = defineDocs({
  dir: "content/manual",
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});

export const internal = defineDocs({
  dir: "content/internal",
});

export default defineConfig({
  mdxOptions: {
    /**
     * **外部 URL の画像サイズをビルド時に取りに行かない。**
     *
     * 既定の remark-image は `![](https://…)` を見つけると、そのサイズを測るため
     * にビルド中に HTTP で取得する。取れなければビルドが落ちる。
     *
     * これで実際にデプロイが 3 回失敗した: マニュアルがキオスクの配布ページの
     * QR 画像（`https://ckk-kiosk-dev.kai-lab.net/apk/…`）を指しており、Coolify が
     * nextjs-web と nextjs-kiosk を**同時に**デプロイするため、ちょうどキオスクが
     * 入れ替わっている最中で 502 が返る。本番（nextjs-web-main）でも落ちた。
     *
     * アプリのビルドが**別のサービスが起きていること**に依存しているのが問題なので、
     * 画像を 1 枚ローカルに置いて回避するのではなく、外部取得そのものを止める。
     * 外部画像は素の <img> として出る（サイズは読み手のブラウザが決める）。
     * ローカル画像（public/ 配下）は従来どおり測られる。
     */
    remarkImageOptions: { external: false },
  },
});
