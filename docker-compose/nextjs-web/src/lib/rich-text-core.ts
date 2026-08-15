/**
 * rich-text-core.ts — 社内メモ / コメントのリッチテキスト（ProseMirror JSON）
 * の検証・射影。純粋関数のみ（server / client 双方から使える）。
 *
 * **なぜ HTML 文字列ではなく JSON なのか**
 * このアプリには HTML サニタイザが無く（frozen lockfile）、`lib/pdf.ts` の
 * テンプレート差し込みは値を無エスケープで埋め込む。HTML を保存すると
 * 保存 XSS の受け皿になるため、エディタの出力は ProseMirror ドキュメント
 * JSON のまま保存し、
 *   - 保存時    … `parseRichText()` が許可リストで検証（未知ノードは拒否）
 *   - 画面表示  … RichTextView が React 要素を組み立てる（innerHTML を使わない）
 *   - PDF/メール… `toHtml()` が自前エスケープで HTML を生成
 * の 3 経路すべてで「信頼できない HTML」が存在しない状態を保つ。
 *
 * 許可ノード・マークは RichTextEditorField のツールバーと 1:1 で対応させること。
 */

import { z } from "zod";
import { escapeHtml } from "./format";

/** 平文射影の上限（これを超える入力は保存しない）。 */
export const MAX_PLAIN_TEXT_LENGTH = 20_000;

/** ノードのネスト上限（再帰の暴走・巨大ドキュメントの防止）。 */
export const MAX_NODE_DEPTH = 20;

/** リンクに許可するスキーム（`javascript:` / `data:` は当然ここに無い）。 */
const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

// ── マーク ───────────────────────────────────────────────────────────────
// StarterKit のうちツールバーで露出するものだけ。

const simpleMarkSchema = z.object({
  type: z.enum(["bold", "italic", "underline", "strike", "code"]),
});

const linkMarkSchema = z.object({
  type: z.literal("link"),
  attrs: z.object({
    href: z
      .string()
      .refine(isSafeHref, "リンク先の形式が不正です")
      .describe("http(s) / mailto のみ"),
    // tiptap が付与する余剰属性は捨てる（target 等はレンダラ側で固定する）。
  }),
});

const markSchema = z.union([simpleMarkSchema, linkMarkSchema]);

/** href が許可スキームの絶対 URL か。相対 URL は許可しない（曖昧さを避ける）。 */
export function isSafeHref(href: string): boolean {
  try {
    return ALLOWED_LINK_SCHEMES.includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

// ── ノード ───────────────────────────────────────────────────────────────

export interface RichTextNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
}

export interface RichTextDoc {
  type: "doc";
  content?: RichTextNode[];
}

/**
 * ノードの再帰スキーマ。
 *
 * **必ず discriminatedUnion を使うこと（通常の z.union は不可）。** 通常の
 * union は候補ごとに全キーを検証するため、`type` が一致しない候補でも
 * `content` の部分木まで丸ごと再帰してしまい、入れ子の深さに対して指数時間に
 * なる（深い箇条書きを 1 つ投げるだけでプロセスが固まる）。discriminator で
 * `type` からただ 1 つの候補を選べば、常に部分木 1 回の走査で済む。
 */
const containerNodeSchema: z.ZodType<RichTextNode> = z.lazy(() => {
  const children = z.array(containerNodeSchema).optional();
  return z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      text: z.string(),
      marks: z.array(markSchema).optional(),
    }),
    z.object({ type: z.literal("hardBreak") }),
    z.object({ type: z.literal("horizontalRule") }),
    z.object({
      type: z.literal("heading"),
      // H1/H2 はページ見出しと衝突するので H3・H4 のみ許可する。
      attrs: z.object({ level: z.union([z.literal(3), z.literal(4)]) }),
      content: children,
    }),
    z.object({ type: z.literal("paragraph"), content: children }),
    z.object({ type: z.literal("bulletList"), content: children }),
    z.object({ type: z.literal("orderedList"), content: children }),
    z.object({ type: z.literal("listItem"), content: children }),
    z.object({ type: z.literal("blockquote"), content: children }),
    z.object({ type: z.literal("codeBlock"), content: children }),
  ]);
}) as z.ZodType<RichTextNode>;

const docSchema = z.object({
  type: z.literal("doc"),
  content: z.array(containerNodeSchema).optional(),
});

/** ノード木の最大深さ（doc 自身を 1 とする）。 */
function depthOf(node: RichTextNode | RichTextDoc): number {
  const children = (node as RichTextNode).content;
  if (!children || children.length === 0) return 1;
  let deepest = 0;
  for (const child of children) {
    const d = depthOf(child);
    if (d > deepest) deepest = d;
  }
  return deepest + 1;
}

export type ParseResult =
  | { ok: true; doc: RichTextDoc; plainText: string }
  | { ok: false; error: string };

/**
 * 未検証の値を RichTextDoc として受け入れる。許可リスト外のノード・マーク、
 * 危険なリンク、深すぎるネスト、長すぎる本文はすべてここで弾く。
 * 保存経路（lib/document-memos.ts）は必ずこれを通すこと。
 */
export function parseRichText(value: unknown): ParseResult {
  const parsed = docSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "メモの形式が不正です" };
  }
  const doc = parsed.data as RichTextDoc;
  if (depthOf(doc) > MAX_NODE_DEPTH) {
    return { ok: false, error: "メモの入れ子が深すぎます" };
  }
  const plainText = toPlainText(doc);
  if (plainText.length > MAX_PLAIN_TEXT_LENGTH) {
    return {
      ok: false,
      error: `メモは ${MAX_PLAIN_TEXT_LENGTH.toLocaleString("ja-JP")} 文字以内にしてください`,
    };
  }
  return { ok: true, doc, plainText };
}

/** 空の doc（未入力状態の既定値）。 */
export function emptyDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** 実質的に未入力か（空段落だけ / 空白のみ の doc は true）。 */
export function isEmptyDoc(doc: RichTextDoc | null | undefined): boolean {
  if (!doc) return true;
  return toPlainText(doc).trim().length === 0;
}

/** ブロック要素の境界で改行を入れるノード型。 */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);

/**
 * 一覧プレビュー・監査ログ・全文検索のための平文射影。
 * ブロック境界は改行 1 つ、`hardBreak` も改行にする。
 */
export function toPlainText(doc: RichTextDoc | null | undefined): string {
  if (!doc) return "";
  const out: string[] = [];
  const walk = (node: RichTextNode): void => {
    if (node.type === "text") {
      out.push(node.text ?? "");
      return;
    }
    if (node.type === "hardBreak") {
      out.push("\n");
      return;
    }
    for (const child of node.content ?? []) walk(child);
    if (BLOCK_TYPES.has(node.type)) out.push("\n");
  };
  for (const child of doc.content ?? []) walk(child);
  // 連続改行を 1 つに畳んで前後を落とす（見た目の空行はプレビューに不要）。
  return out
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ── HTML シリアライズ（PDF / メール用） ──────────────────────────────────

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  code: "code",
};

const BLOCK_TAGS: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
  codeBlock: "pre",
};

/** テキストノード 1 つを、付与されたマークで包んだ HTML にする。 */
function textToHtml(node: RichTextNode): string {
  let html = escapeHtml(node.text ?? "");
  // 内側から外側へ。link は href をエスケープして属性に入れる。
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "");
      if (!isSafeHref(href)) continue; // 検証済みのはずだが二重に守る
      html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${html}</a>`;
      continue;
    }
    const tag = MARK_TAGS[mark.type];
    if (tag) html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

/**
 * PDF テンプレート / メール本文へ差し込むための HTML を生成する。
 * テキストと href は必ず `escapeHtml` を通るので、出力は常に安全。
 *
 * 注: 現状 PDF へは接続していない（メモは社内限定）。将来
 * `.notes` 相当の枠へ差し込む場合は base.css に strong/em/ul/ol/h3/h4 の
 * スタイルを足すこと。
 */
export function toHtml(doc: RichTextDoc | null | undefined): string {
  if (!doc) return "";
  const render = (node: RichTextNode): string => {
    if (node.type === "text") return textToHtml(node);
    if (node.type === "hardBreak") return "<br>";
    if (node.type === "horizontalRule") return "<hr>";

    const inner = (node.content ?? []).map(render).join("");
    if (node.type === "heading") {
      const level = node.attrs?.level === 4 ? 4 : 3;
      return `<h${level}>${inner}</h${level}>`;
    }
    const tag = BLOCK_TAGS[node.type];
    return tag ? `<${tag}>${inner}</${tag}>` : inner;
  };
  return (doc.content ?? []).map(render).join("");
}
