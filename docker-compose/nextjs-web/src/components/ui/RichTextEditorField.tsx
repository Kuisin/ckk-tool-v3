"use client";

/**
 * RichTextEditorField — Mantine RichTextEditor（tiptap）の共通ラッパ。
 *
 * 値は **ProseMirror ドキュメント JSON**（`RichTextDoc`）でやり取りする。
 * HTML 文字列は扱わない — 保存 XSS を構造的に排除するため（lib/rich-text-core.ts
 * の冒頭コメント参照）。
 *
 * ツールバーに出すコントロールは `lib/rich-text-core.ts` の許可リストと
 * **1:1 で対応させること**。ここに増やしたコントロールをスキーマに足し忘れると、
 * 利用者が入力できるのに保存だけ弾かれる状態になる。
 *
 * 重量級（prosemirror 一式）なので、呼び出し側は next/dynamic + ssr:false で
 * 遅延ロードすること（MemoPanel がそうしている）。
 */

import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { emptyDoc, type RichTextDoc } from "@/lib/rich-text-core";

/** ツールバーの aria-label（Mantine の既定は英語）。 */
const LABELS = {
  boldControlLabel: "太字",
  italicControlLabel: "斜体",
  underlineControlLabel: "下線",
  strikeControlLabel: "打ち消し線",
  codeControlLabel: "インラインコード",
  codeBlockControlLabel: "コードブロック",
  h3ControlLabel: "見出し",
  h4ControlLabel: "小見出し",
  bulletListControlLabel: "箇条書き",
  orderedListControlLabel: "番号付きリスト",
  blockquoteControlLabel: "引用",
  hrControlLabel: "区切り線",
  linkControlLabel: "リンク",
  unlinkControlLabel: "リンク解除",
  undoControlLabel: "元に戻す",
  redoControlLabel: "やり直す",
  linkEditorInputLabel: "リンク先 URL",
  linkEditorInputPlaceholder: "https://example.com",
  linkEditorSave: "保存",
  linkEditorExternalLink: "新しいタブで開く",
  linkEditorInternalLink: "同じタブで開く",
};

export function RichTextEditorField({
  value,
  onChange,
  placeholder,
  minHeight = 160,
}: {
  value: RichTextDoc | null;
  onChange: (doc: RichTextDoc) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  // React Compiler（next.config.ts の reactCompiler: true）は useEditor が返す
  // 可変のエディタインスタンスをメモ化して壊す。tiptap 公式の回避策どおり
  // このコンポーネントだけコンパイラの対象から外す。
  "use no memo";

  const editor = useEditor({
    // App Router の SSR ではハイドレーション不一致を避けるため必須。
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 は underline / link を内包する（別途 extensions に足すと
      // 拡張名が重複するので足さないこと）。
      StarterKit.configure({
        // H1/H2 はページ見出しと衝突するので出さない（スキーマ側も 3・4 のみ）。
        heading: { levels: [3, 4] },
        link: { openOnClick: false },
      }),
    ],
    content: value ?? emptyDoc(),
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichTextDoc),
  });

  return (
    <RichTextEditor editor={editor} labels={LABELS}>
      <RichTextEditor.Toolbar sticky stickyOffset={60}>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.Underline />
          <RichTextEditor.Strikethrough />
          <RichTextEditor.Code />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.H3 />
          <RichTextEditor.H4 />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.BulletList />
          <RichTextEditor.OrderedList />
          <RichTextEditor.Blockquote />
          <RichTextEditor.CodeBlock />
          <RichTextEditor.Hr />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Link />
          <RichTextEditor.Unlink />
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Undo />
          <RichTextEditor.Redo />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>

      <RichTextEditor.Content aria-label={placeholder} style={{ minHeight }} />
    </RichTextEditor>
  );
}

export default RichTextEditorField;
