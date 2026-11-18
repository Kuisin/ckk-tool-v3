/**
 * docs-mermaid.test.ts — マニュアルの Mermaid 図（```mermaid フェンス）を見張る。
 *
 * 図はブラウザで描くので、**書き間違えてもビルドは通る**。開いた人の画面で
 * 図の代わりにソースが出るだけで、誰も気づかないまま残る。ここで止めるもの:
 *
 *   1. 構文 — content 配下の全フェンスを mermaid 自身のパーサに通す。
 *   2. 色 — `:::名前` は docs-mermaid.ts の状態色だけ（打ち間違いは無色の箱になる）。
 *   3. 3 言語の揃い — ja / en / zh で図の数と**形**（ノードと矢印）が同じこと。
 *      文言だけが違ってよい。片方の言語だけ矢印を直した、を防ぐ。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MERMAID_STATUS_COLORS,
  mermaidDomId,
  restoreMermaidFences,
  withStatusClasses,
} from "./docs-mermaid";

/**
 * mermaid はラベルを DOMPurify に通すが、node には DOM が無く、その場合の
 * DOMPurify は `addHook` すら持たない抜け殻になる。mermaid が import するのと
 * **同じモジュール実体**を先に読み、素通しの関数を生やしておく（ここで見るのは
 * 構文で、サニタイズは実ブラウザ側の仕事）。vi.mock は使えない — dompurify は
 * このアプリの直接の依存ではなく、外部化された mermaid の中からは届かない。
 */
async function loadMermaidForNode() {
  const require = createRequire(import.meta.url);
  const fromMermaid = createRequire(require.resolve("mermaid"));
  const esm = join(dirname(fromMermaid.resolve("dompurify")), "purify.es.mjs");
  const { default: purify } = await import(pathToFileURL(esm).href);
  Object.assign(purify, {
    sanitize: (s: string) => s,
    addHook: () => {},
    removeHook: () => {},
    removeAllHooks: () => {},
  });
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false });
  return mermaid;
}

const CONTENT = resolve(__dirname, "../../content");

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (ent.endsWith(".md")) out.push(p);
  }
  return out;
}

function mermaidBlocks(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
}

/** 文言を落として形だけ残す（引用符の中・シーケンス図の本文と別名）。 */
function shape(chart: string): string {
  return chart
    .replace(/"[^"]*"/g, '""')
    .replace(/^(\s*participant \w+) as .*$/gm, "$1")
    .replace(/^(\s*(?:Note [^:]+|\w+-[-)>x]+\w+)):.*$/gm, "$1:")
    .trim();
}

const files = walk(CONTENT);
const withDiagrams = files
  .map((file) => ({ file, blocks: mermaidBlocks(file) }))
  .filter((f) => f.blocks.length > 0);

describe("withStatusClasses", () => {
  it("flowchart に状態色の classDef を足す", () => {
    const out = withStatusClasses('flowchart TD\n  a("下書き"):::gray');
    for (const name of Object.keys(MERMAID_STATUS_COLORS)) {
      expect(out).toMatch(new RegExp(`^classDef ${name} fill:#`, "m"));
    }
  });

  it("classDef を持てない図種には足さない", () => {
    const chart = "sequenceDiagram\n  A->>B: 申請";
    expect(withStatusClasses(chart)).toBe(chart);
  });

  it("図が自分で書いた同名の classDef は上書きしない", () => {
    const out = withStatusClasses(
      "flowchart TD\n  a:::gray\n  classDef gray fill:#000",
    );
    expect(out.match(/classDef gray/g)).toHaveLength(1);
  });

  it("先頭がコメント行でも図種を見分ける", () => {
    expect(withStatusClasses("%% 状態\nflowchart TD\n  a")).toContain(
      "classDef blue",
    );
  });
});

describe("mermaidDomId", () => {
  it("useId のコロンを落とす（CSS セレクタに使えない）", () => {
    expect(mermaidDomId(":r1a:")).toBe("mmd-r1a");
  });
});

describe("restoreMermaidFences", () => {
  it("processed Markdown の <Mermaid /> を元のフェンスへ戻す", () => {
    const processed = [
      "前の文。",
      "",
      "<Mermaid",
      '  chart="flowchart TD',
      "  a(&#x22;下書き<br/>Draft&#x22;):::gray -->|&#x22;発行&#x22;| b",
      '  b -.-> c"',
      "/>",
      "",
      "後の文。",
    ].join("\n");
    expect(restoreMermaidFences(processed)).toBe(
      [
        "前の文。",
        "",
        "```mermaid",
        "flowchart TD",
        '  a("下書き<br/>Draft"):::gray -->|"発行"| b',
        "  b -.-> c",
        "```",
        "",
        "後の文。",
      ].join("\n"),
    );
  });

  it("図の無い本文は変えない", () => {
    const md = "# 見出し\n\n本文 <b>そのまま</b>";
    expect(restoreMermaidFences(md)).toBe(md);
  });
});

describe("マニュアルの Mermaid 図", () => {
  it("図が 1 つ以上ある（走査が空振りしていない）", () => {
    expect(withDiagrams.length).toBeGreaterThan(0);
  });

  it("すべての図が構文として正しい", async () => {
    const mermaid = await loadMermaidForNode();
    const broken: string[] = [];
    for (const { file, blocks } of withDiagrams) {
      for (const [i, chart] of blocks.entries()) {
        try {
          await mermaid.parse(withStatusClasses(chart));
        } catch (e) {
          const where = `${file.slice(CONTENT.length + 1)} #${i + 1}`;
          broken.push(`${where}: ${String(e).split("\n")[0]}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("`:::名前` は状態色として定義された名前だけ", () => {
    const known = new Set(Object.keys(MERMAID_STATUS_COLORS));
    const unknown: string[] = [];
    for (const { file, blocks } of withDiagrams) {
      for (const chart of blocks) {
        const own = new Set(
          [...chart.matchAll(/^\s*classDef\s+(\w+)/gm)].map((m) => m[1]),
        );
        for (const m of chart.matchAll(/:::(\w+)/g)) {
          if (!known.has(m[1]) && !own.has(m[1])) {
            unknown.push(`${file.slice(CONTENT.length + 1)}: :::${m[1]}`);
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("ja / en / zh で図の数と形が揃っている（違ってよいのは文言だけ）", () => {
    const mismatched: string[] = [];
    for (const { file, blocks } of withDiagrams) {
      if (/\.(en|zh)\.md$/.test(file)) continue;
      for (const lang of ["en", "zh"]) {
        const other = file.replace(/\.md$/, `.${lang}.md`);
        const name = other.slice(CONTENT.length + 1);
        let theirs: string[];
        try {
          theirs = mermaidBlocks(other);
        } catch {
          mismatched.push(`${name}: ファイルが無い`);
          continue;
        }
        if (theirs.length !== blocks.length) {
          mismatched.push(
            `${name}: 図の数 ${theirs.length} ≠ ${blocks.length}`,
          );
          continue;
        }
        for (const [i, chart] of blocks.entries()) {
          if (shape(theirs[i]) !== shape(chart)) {
            mismatched.push(`${name} #${i + 1}: 形が ja と違う`);
          }
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});
