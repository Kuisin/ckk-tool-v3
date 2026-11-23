/**
 * remark-manual-video.ts — 本文の ```video フェンスを `<ManualVideo id="…" />` に置き換える。
 *
 *     ```video
 *     process-sales
 *     ```
 *
 * ```mermaid → `<Mermaid>`（fumadocs-core の remarkMdxMermaid）と同じ形にしてある:
 * マニュアルは `.md` で、JSX を直接書かない。書く側はフェンスを 1 つ置くだけ。
 * 中身は動画の id 1 行（tools/docs-screenshots/walkthroughs の `id`）。id が
 * 登録簿にあるかは `pnpm docs:lint` が見る — ここでは形だけを見て、id らしくない
 * 中身はコードブロックのまま残す（黙って消さない）。
 *
 * source.config.ts（ビルド時・Node）から読むので、アプリの他のモジュールを
 * import しない。依存も足さない（木は自分で辿る）。
 */

interface Node {
  type: string;
  lang?: string | null;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
}

const VIDEO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function toJsx(id: string): Node {
  return {
    type: "mdxJsxFlowElement",
    name: "ManualVideo",
    attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
    children: [],
  };
}

function walk(node: Node): void {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === "code" && child.lang === "video") {
      const id = (child.value ?? "").trim();
      return VIDEO_ID.test(id) ? toJsx(id) : child;
    }
    walk(child);
    return child;
  });
}

export function remarkManualVideo() {
  return (tree: Node): void => walk(tree);
}
