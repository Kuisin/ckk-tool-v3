/**
 * js-highlight.ts — 依存なしの軽量 JS 式ハイライタ + 整形（試算計算の式エディタ用）。
 *
 * frozen lockfile のため CodeMirror/Monaco は使えない。トークナイザで文字列・数値・
 * コメント・キーワード・既知変数を色分けした HTML を返す（オーバーレイ表示用）。
 * 整形はブラケット深さに基づく再インデントのみ（文字列内は不可侵）。
 */

const KEYWORDS = new Set([
  "return",
  "if",
  "else",
  "null",
  "undefined",
  "true",
  "false",
  "new",
  "typeof",
  "in",
  "of",
  "const",
  "let",
  "var",
  "function",
]);

const COLORS = {
  str: "#2f9e44",
  num: "#1971c2",
  kw: "#7048e8",
  comment: "#868e96",
  variable: "#0c8599",
} as const;

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const span = (cls: keyof typeof COLORS, text: string): string =>
  `<span style="color:${COLORS[cls]}">${escapeHtml(text)}</span>`;

/**
 * 式を色分けした HTML にする。`knownVars` に含まれる識別子は変数色にする。
 * 末尾に改行を足して、textarea オーバーレイの高さと揃える。
 */
export function highlightExpression(
  src: string,
  knownVars: ReadonlySet<string> = new Set(),
): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    // line comment
    if (ch === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      out += span("comment", src.slice(i, j));
      i = j;
      continue;
    }
    // string
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      out += span("str", src.slice(i, j));
      i = j;
      continue;
    }
    // number
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9._eE+-]/.test(src[j])) {
        // stop +/- unless part of exponent
        if (
          (src[j] === "+" || src[j] === "-") &&
          !/[eE]/.test(src[j - 1] ?? "")
        )
          break;
        j++;
      }
      out += span("num", src.slice(i, j));
      i = j;
      continue;
    }
    // identifier
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (KEYWORDS.has(word)) out += span("kw", word);
      else if (knownVars.has(word)) out += span("variable", word);
      else out += escapeHtml(word);
      i = j;
      continue;
    }
    // other char
    out += escapeHtml(ch);
    i++;
  }
  return `${out}\n`;
}

/** 1 行のブラケット増減（文字列・行コメントは無視）。 */
function bracketDelta(line: string): number {
  let d = 0;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "/") break; // line comment
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < n) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") d--;
    i++;
  }
  return d;
}

/** 始めが閉じ括弧かどうか（その行はデデントする）。 */
const startsWithClose = (s: string) => /^[)\]}]/.test(s);

/** ブラケット深さで再インデント（2スペース）。行末空白を除去。文字列は不可侵。 */
export function formatExpression(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let depth = 0;
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      out.push("");
      continue;
    }
    const indent = Math.max(0, startsWithClose(trimmed) ? depth - 1 : depth);
    out.push("  ".repeat(indent) + trimmed);
    depth += bracketDelta(trimmed);
    if (depth < 0) depth = 0;
  }
  return out.join("\n");
}
