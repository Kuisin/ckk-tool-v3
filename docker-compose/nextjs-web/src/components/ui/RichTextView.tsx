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

import { Text, Typography } from "@mantine/core";
import type { JSX } from "react";
import type { RichTextDoc } from "@/lib/rich-text-core";
import {
  isEmptyDoc,
  isSafeHref,
  type RichTextNode,
} from "@/lib/rich-text-core";

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

/** テキストノードを、付与されたマークで内側から包んでいく。 */
function renderText(node: RichTextNode, key: string): React.ReactNode {
  let el: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "");
      // 検証済みのはずだが、表示側でも危険な href はリンクにしない。
      if (!isSafeHref(href)) continue;
      el = (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {el}
        </a>
      );
      continue;
    }
    const Tag = MARK_ELEMENTS[mark.type];
    if (Tag) el = <Tag>{el}</Tag>;
  }
  return <span key={key}>{el}</span>;
}

function renderNode(node: RichTextNode, key: string): React.ReactNode {
  if (node.type === "text") return renderText(node, key);
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;

  const children = (node.content ?? []).map((child, i) =>
    renderNode(child, `${key}.${i}`),
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
}: {
  doc: RichTextDoc | null | undefined;
  emptyLabel?: string;
}) {
  if (isEmptyDoc(doc)) {
    return (
      <Text c="dimmed" size="sm">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <Typography p={0}>
      {(doc?.content ?? []).map((node, i) => renderNode(node, String(i)))}
    </Typography>
  );
}
