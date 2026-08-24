/**
 * source.config.ts — fumadocs-mdx のコレクション定義。
 *
 * 2 ツリー構成:
 *   - manual   → content/manual   （公開ユーザーマニュアル /manual）
 *   - internal → content/internal （社内ドキュメント /internal-docs・要ログイン）
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

export default defineConfig();
