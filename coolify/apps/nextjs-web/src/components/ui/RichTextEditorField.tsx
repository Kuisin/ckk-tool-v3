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

import { Tooltip } from "@mantine/core";
import { RichTextEditor } from "@mantine/tiptap";
import { IconFileSymlink } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { useTr } from "@/hooks/useTr";
import { emptyDoc, type RichTextDoc } from "@/lib/rich-text-core";
import { DocumentLinkModal } from "./DocumentLinkModal";
import type { DocumentHit } from "./document-link-types";

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
  const tr = useTr();
  // React Compiler（next.config.ts の reactCompiler: true）は useEditor が返す
  // 可変のエディタインスタンスをメモ化して壊す。tiptap 公式の回避策どおり
  // このコンポーネントだけコンパイラの対象から外す。
  ("use no memo");

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
    // JSON へ一度落としてから渡す。Server Action の引数はシリアライズされる
    // ので、関数など JSON にならない値が混ざると壊れた形でサーバーに届く
    // （実際に link の attrs が function として届き保存が落ちた）。
    // ここで正規化しておけば、状態にもサーバーにも素の JSON しか流れない。
    onUpdate: ({ editor: e }) =>
      onChange(JSON.parse(JSON.stringify(e.getJSON())) as RichTextDoc),
  });

  const [docPickerOpen, setDocPickerOpen] = useState(false);

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
          {/* 文書リンク — 他の業務文書の詳細ページへのアプリ内リンクを挿す。 */}
          <Tooltip label={tr("文書リンク")} withArrow>
            <RichTextEditor.Control
              aria-label={tr("文書リンク")}
              onClick={() => setDocPickerOpen(true)}
            >
              <IconFileSymlink size={16} stroke={1.5} />
            </RichTextEditor.Control>
          </Tooltip>
        </RichTextEditor.ControlsGroup>

        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Undo />
          <RichTextEditor.Redo />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>

      <RichTextEditor.Content
        aria-label={placeholder}
        className="memo-rich-text"
        style={{ minHeight }}
      />

      <DocumentLinkModal
        onClose={() => setDocPickerOpen(false)}
        onSelect={(hit) => insertDocumentLink(editor, hit)}
        opened={docPickerOpen}
      />
    </RichTextEditor>
  );
}

/**
 * 文書リンクを挿入する。
 *
 * **`insertContent` に marks の生 JSON を渡してはいけない。** そのやり方だと
 * Link 拡張の属性生成を通らず、`attrs` が壊れた（サーバーには function として
 * 届き、保存が「メモの形式が不正です」で必ず失敗した）。Link 拡張が提供する
 * `setLink` を使い、拡張自身に属性を作らせるのが正しい経路。
 *
 * 選択範囲があればその文字にリンクを張り、無ければ文書番号を挿入して
 * その範囲だけにリンクを張る（マークが後続の入力へ引き継がれないよう、
 * 最後にカーソルを末尾へ戻して link を解除する）。
 */
function insertDocumentLink(editor: Editor | null, hit: DocumentHit): void {
  if (!editor) return;

  if (!editor.state.selection.empty) {
    editor.chain().focus().setLink({ href: hit.href }).run();
    return;
  }

  const from = editor.state.selection.from;
  const to = from + hit.number.length;
  editor
    .chain()
    .focus()
    .insertContent(hit.number)
    .setTextSelection({ from, to })
    .setLink({ href: hit.href })
    .setTextSelection(to)
    .unsetMark("link")
    .run();
}

export default RichTextEditorField;
