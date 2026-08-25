/**
 * markdown-safety.test.ts — 社内文書 (CM03) の描画から生 HTML への口が
 * 開いていないことを固定する。
 *
 * react-markdown は既定で生 HTML を描画しない。このリポジトリには HTML
 * サニタイザが無いので、その既定だけが保存 XSS を防いでいる。`rehype-raw` を
 * 1 行足せば保証は消えるが、型でもビルドでも検出できない — だからテストで守る。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const FORBIDDEN = [
  "rehype-raw",
  "rehype-katex", // raw HTML を通す構成になりやすい
  "dangerouslySetInnerHTML",
  "skipHtml={false}",
];

/**
 * コメントを落としてから探す。**警告コメント自体を検知して落ちてはいけない** —
 * 「rehype-raw を足すな」と書いてあるファイルこそが守る対象なので。
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const WATCHED = [
  "components/documents/MarkdownView.tsx",
  "components/documents/MarkdownEditor.tsx",
];

describe("markdown rendering safety", () => {
  for (const rel of WATCHED) {
    it(`${rel} は生 HTML を通す仕掛けを持たない`, () => {
      let source: string;
      try {
        source = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        // まだ無いファイルは対象外（将来ここに増える想定）。
        return;
      }
      const code = stripComments(source);
      for (const needle of FORBIDDEN) {
        expect(
          code.includes(needle),
          `${rel} に "${needle}" があります。react-markdown の既定（生 HTML を描画しない）が、` +
            "サニタイザを持たないこのアプリの唯一の防御です。",
        ).toBe(false);
      }
    });
  }

  it("package.json に生 HTML 系の rehype プラグインが入っていない", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "..", "package.json"), "utf8"),
    );
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    } as Record<string, string>;
    expect(Object.keys(deps)).not.toContain("rehype-raw");
  });
});
