/**
 * docs-mermaid.ts — マニュアルの Mermaid 図に共通で効かせる見た目（純ロジック）。
 *
 * 図の本体は各ページの ```mermaid フェンスに書く。ここが持つのは
 * 「どの図にも同じように効くもの」だけ:
 *
 *   1. **状態の色** — 図の中の状態は、画面の状態バッジ（StatusBadge）と同じ色で
 *      塗る。図では `下書き:::gray` のように色名のクラスを付けるだけでよく、
 *      classDef はここが全図に足す。図ごとに classDef を書かせると、3 言語 ×
 *      図の数だけ同じ 9 行が複製され、バッジの色を変えたときに揃わなくなる。
 *   2. **全体の配色** — docs はライト固定（DocsShell）なので 1 組だけ。
 *
 * 色は Mantine の既定パレット（light バッジ相当 = 地 .1 / 枠 .4 / 文字 .9）。
 * Mermaid のテーマは実色（hex）しか受け取らない — CSS 変数は渡せない。
 */

/** `:::<名前>` で使える色。名前は StatusBadge の color と同じ語。 */
export const MERMAID_STATUS_COLORS = {
  gray: { fill: "#f1f3f5", stroke: "#ced4da", text: "#343a40" },
  blue: { fill: "#d0ebff", stroke: "#4dabf7", text: "#1864ab" },
  yellow: { fill: "#fff3bf", stroke: "#ffd43b", text: "#7a4f01" },
  orange: { fill: "#ffe8cc", stroke: "#ffa94d", text: "#a8400a" },
  green: { fill: "#d3f9d8", stroke: "#69db7c", text: "#2b8a3e" },
  teal: { fill: "#c3fae8", stroke: "#38d9a9", text: "#087f5b" },
  violet: { fill: "#e5dbff", stroke: "#9775fa", text: "#5f3dc4" },
  red: { fill: "#ffe3e3", stroke: "#ff8787", text: "#c92a2a" },
  dark: { fill: "#dee2e6", stroke: "#868e96", text: "#212529" },
} as const;

/** classDef を足せる図（これ以外の図種に classDef を足すと構文エラーになる）。 */
const CLASSDEF_DIAGRAMS = /^\s*(flowchart|graph|stateDiagram(-v2)?)\b/;

/**
 * 図のソースに状態色の classDef を足す。flowchart / stateDiagram 以外は
 * そのまま返す。すでに同名の classDef を自分で書いている図は、その定義を
 * 上書きしない（後から書いたものが勝つので、先頭ではなく**足さない**）。
 */
export function withStatusClasses(chart: string): string {
  // 先頭のコメント行（%% …）と init ディレクティブは図種の判定から外す。
  const body = chart.replace(/^(\s*%%[^\n]*\n)+/, "");
  if (!CLASSDEF_DIAGRAMS.test(body)) return chart;
  const defs = Object.entries(MERMAID_STATUS_COLORS)
    .filter(
      ([name]) => !new RegExp(`^\\s*classDef\\s+${name}\\b`, "m").test(chart),
    )
    .map(
      ([name, c]) =>
        `classDef ${name} fill:${c.fill},stroke:${c.stroke},color:${c.text}`,
    );
  return `${chart.trimEnd()}\n${defs.join("\n")}\n`;
}

/** docs（ライト固定）に合わせた Mermaid の配色。 */
export const MERMAID_THEME_VARIABLES = {
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  fontSize: "14px",
  background: "#ffffff",
  primaryColor: "#f8f9fa",
  primaryBorderColor: "#ced4da",
  primaryTextColor: "#212529",
  secondaryColor: "#e7f5ff",
  tertiaryColor: "#f1f3f5",
  lineColor: "#868e96",
  textColor: "#343a40",
  // 矢印に付く文言（「承認」「差し戻し」）の地。線の上に乗るので本文の地と揃える。
  edgeLabelBackground: "#ffffff",
  // subgraph（担当ごとの囲み）
  clusterBkg: "#f8f9fa",
  clusterBorder: "#dee2e6",
  // sequenceDiagram
  actorBkg: "#e7f5ff",
  actorBorder: "#74c0fc",
  actorTextColor: "#1864ab",
  signalColor: "#495057",
  signalTextColor: "#343a40",
  noteBkgColor: "#fff9db",
  noteBorderColor: "#ffe066",
  noteTextColor: "#5c3c00",
  activationBkgColor: "#f1f3f5",
  activationBorderColor: "#adb5bd",
} as const;

/**
 * ページ内の図に振る DOM id。React の useId は `:r1:` のようにコロンを含み、
 * Mermaid はそれを CSS セレクタにそのまま使うので落ちる。
 */
export function mermaidDomId(reactId: string): string {
  return `mmd-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * 生 Markdown 配信（/manual/<lang>/<slug>.md・LLM 向け）で、図を元のフェンスへ戻す。
 *
 * fumadocs の processed Markdown は remark を通った**後**の姿なので、
 * ```mermaid は `<Mermaid chart="…&#x22;…" />`（属性値は実体参照つき）に
 * なっている。読む側（人でも LLM でも）に要るのは JSX ではなく図のソース。
 */
export function restoreMermaidFences(markdown: string): string {
  return markdown.replace(
    /^<Mermaid\s+chart="([^"]*)"\s*\/>$/gm,
    (_, chart: string) => {
      const source = chart
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
          String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      return `\`\`\`mermaid\n${source}\n\`\`\``;
    },
  );
}
