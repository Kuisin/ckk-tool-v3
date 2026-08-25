"use client";

/**
 * MarkdownView — 社内文書の本文を描く。
 *
 * ⚠️ **`rehype-raw`（や生 HTML を通すプラグイン）を足さないこと。**
 * このリポジトリには HTML サニタイザが無い（`lib/rich-text-core.ts` の
 * 冒頭に経緯がある）。react-markdown は既定で生 HTML を**描画しない**ので、
 * その 1 点だけで保存 XSS の受け皿にならずに済んでいる。プラグインを 1 行
 * 足すとその保証が消える。
 *
 * リンクと画像も同じ理由で自前で絞る:
 *   - 外部 URL は必ず外部リンク確認ページ（/l/<code>）を経由させる。
 *     link_blacklist による事後ブロックが既存文書にも遡って効く。
 *   - 画像は社内ストレージ（/api/attachments/…）だけ。外部画像は読み込むだけで
 *     閲覧者の IP が相手に渡るので許可しない。
 */

import { Anchor, Table, Text, Typography } from "@mantine/core";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isExternalHref, isInternalPath } from "@/lib/rich-text-core";

/** 外部 URL → 短縮コード（保存時に link_index へ登録済みのもの）。 */
export type LinkTargets = Record<string, string>;

function buildComponents(links: LinkTargets): Components {
  return {
    a({ href, children }) {
      const raw = typeof href === "string" ? href : "";
      if (isInternalPath(raw)) {
        return (
          <Anchor component={Link} href={raw}>
            {children}
          </Anchor>
        );
      }
      if (isExternalHref(raw)) {
        const code = links[raw];
        // 短縮コードが無い外部リンク（保存前のプレビューなど）は、遷移させずに
        // テキストとして出す。素の外部 URL をそのまま踏ませない。
        if (!code) return <Text component="span">{children}</Text>;
        return (
          <Anchor component={Link} href={`/l/${code}`}>
            {children}
          </Anchor>
        );
      }
      return <Text component="span">{children}</Text>;
    },
    img({ src, alt }) {
      const raw = typeof src === "string" ? src : "";
      // 社内ストレージ以外は出さない（外部画像は閲覧者の IP を相手に渡す）。
      if (!raw.startsWith("/api/attachments/")) {
        return (
          <Text c="dimmed" size="sm">
            [画像: {alt || raw}]
          </Text>
        );
      }
      // biome-ignore lint/performance/noImgElement: 社内ストレージの任意サイズ画像で、next/image の最適化対象にしない
      return <img alt={alt ?? ""} src={raw} style={{ maxWidth: "100%" }} />;
    },
    table({ children }) {
      return <Table withTableBorder>{children}</Table>;
    },
  };
}

export function MarkdownView({
  body,
  links = {},
}: {
  body: string;
  links?: LinkTargets;
}) {
  if (!body.trim()) {
    return (
      <Text c="dimmed" size="sm">
        本文がありません。
      </Text>
    );
  }
  return (
    <Typography>
      <ReactMarkdown
        components={buildComponents(links)}
        remarkPlugins={[remarkGfm]}
      >
        {body}
      </ReactMarkdown>
    </Typography>
  );
}
