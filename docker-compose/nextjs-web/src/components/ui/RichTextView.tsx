/**
 * RichTextView — 保存済みリッチテキスト（ProseMirror JSON）の読み取り専用表示。
 *
 * **`dangerouslySetInnerHTML` は使わない。** 許可したノード型だけを React 要素へ
 * 組み立てるので、未知のノードや細工されたマークが DOM に届く経路が存在しない
 * （保存側の検証 lib/rich-text-core.parseRichText と二重に守る）。
 *
 * 見た目は Mantine の `Typography`（v8 までの TypographyStylesProvider）に
 * 任せる — エディタ側（@mantine/tiptap）と同じ組版になる。
 */

import { Stack, Text, Tooltip, Typography } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { JSX } from "react";
// type-only import — lib/link-index は server-only（型はバンドルされない）。
import type { ShortLinkTarget } from "@/lib/link-index";
import type { RichTextDoc } from "@/lib/rich-text-core";
import {
  isEmptyDoc,
  isInternalPath,
  isSafeHref,
  isShortLink,
  type RichTextNode,
  SHORT_LINK_PREFIX,
} from "@/lib/rich-text-core";

/** 短縮コード → 遷移先。 */
export type LinkTargets = Record<string, ShortLinkTarget>;

/** マーク種別 → 包むコンポーネント（link は href を検証するので別扱い）。 */
const MARK_ELEMENTS: Record<string, keyof JSX.IntrinsicElements> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  code: "code",
};

/** ブロック種別 → 要素名。 */
const BLOCK_ELEMENTS: Record<string, keyof JSX.IntrinsicElements> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
  codeBlock: "pre",
};

/**
 * リンクのホバー表示。
 *
 * 短縮リンク（`/l/<code>`）はそのままでは行き先が分からないので、解決済みの
 * 実 URL を出す。ブロック中ならその旨も添える。文書リンク・素の URL は
 * href をそのまま見せる。
 */
function linkTooltip(
  href: string,
  targets: LinkTargets,
): { label: React.ReactNode; blocked: boolean } {
  if (isShortLink(href)) {
    const target = targets[href.slice(SHORT_LINK_PREFIX.length)];
    if (!target) {
      return { label: "リンク先を解決できませんでした", blocked: false };
    }
    return {
      label: (
        <Stack gap={2}>
          <Text fw={600} size="xs">
            {target.blocked ? "⚠ ブロック中: " : "外部サイト: "}
            {target.hostname}
          </Text>
          <Text size="xs" style={{ overflowWrap: "anywhere" }}>
            {target.url}
          </Text>
        </Stack>
      ),
      blocked: target.blocked,
    };
  }
  return { label: href, blocked: false };
}

/** テキストノードを、付与されたマークで内側から包んでいく。 */
function renderText(
  node: RichTextNode,
  key: string,
  targets: LinkTargets,
): React.ReactNode {
  let el: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "");
      // 検証済みのはずだが、表示側でも危険な href はリンクにしない。
      if (!isSafeHref(href)) continue;
      // 短縮リンク（/l/…）は外部への出口なので別タブ + 外部アイコン。
      // 文書リンク（その他のアプリ内パス）は同じタブで遷移する。
      const short = isShortLink(href);
      const internal = isInternalPath(href) && !short;
      const { label, blocked } = linkTooltip(href, targets);
      const anchor = internal ? (
        <a href={href}>{el}</a>
      ) : (
        <a
          href={href}
          rel="noopener noreferrer"
          style={blocked ? { textDecorationLine: "line-through" } : undefined}
          target="_blank"
        >
          {el}
          {short && (
            <IconExternalLink
              aria-hidden
              size={12}
              style={{ verticalAlign: "-1px", marginInlineStart: 2 }}
            />
          )}
        </a>
      );
      el = (
        <Tooltip
          color={blocked ? "red" : undefined}
          label={label}
          multiline
          w={320}
          withArrow
        >
          {anchor}
        </Tooltip>
      );
      continue;
    }
    const Tag = MARK_ELEMENTS[mark.type];
    if (Tag) el = <Tag>{el}</Tag>;
  }
  return <span key={key}>{el}</span>;
}

function renderNode(
  node: RichTextNode,
  key: string,
  targets: LinkTargets,
): React.ReactNode {
  if (node.type === "text") return renderText(node, key, targets);
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;

  const children = (node.content ?? []).map((child, i) =>
    renderNode(child, `${key}.${i}`, targets),
  );

  if (node.type === "heading") {
    const Tag = node.attrs?.level === 4 ? "h4" : "h3";
    return <Tag key={key}>{children}</Tag>;
  }
  const Tag = BLOCK_ELEMENTS[node.type];
  // 未知のノードは（検証を通っていれば起こらないが）中身だけ描画する。
  return Tag ? (
    <Tag key={key}>{children}</Tag>
  ) : (
    <span key={key}>{children}</span>
  );
}

export function RichTextView({
  doc,
  emptyLabel = "—",
  linkTargets = {},
}: {
  doc: RichTextDoc | null | undefined;
  emptyLabel?: string;
  /**
   * 短縮リンク（コード → 遷移先）。ホバーで実 URL を見せるために使う。
   * 省略すると短縮リンクは「解決できませんでした」と表示する。
   */
  linkTargets?: LinkTargets;
}) {
  if (isEmptyDoc(doc)) {
    return (
      <Text c="dimmed" size="sm">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <Typography className="memo-rich-text" p={0}>
      {(doc?.content ?? []).map((node, i) =>
        renderNode(node, String(i), linkTargets),
      )}
    </Typography>
  );
}
