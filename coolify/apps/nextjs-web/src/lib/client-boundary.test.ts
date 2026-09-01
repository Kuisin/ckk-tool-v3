/**
 * **サーバ側から `"use client"` モジュールの「値」を呼ぶ**のを止める。
 *
 * `"use client"` を付けたモジュールは、**そのファイルの export すべて**が
 * サーバから見るとクライアント参照（proxy）になる。コンポーネントとして
 * *描画*する分には正しく動くが、関数や定数として*呼ぶ / 読む*と
 *
 *   Attempted to call statusLabel() from the server but statusLabel is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * を投げる。厄介なのは **dev では通ってしまう**こと — 本番ビルドで初めて
 * 500 になるので、気付くのは利用者になる。
 *
 * 実際に起きた: `STATUS_MAPS` / `statusLabel()` / `statusOptions()` が
 * `components/ui/StatusBadge.tsx`（`"use client"`）に同居していたため、
 * フォーム回答の **PDF**（`lib/form-response-pdf.ts`）と **Excel 書き出し**
 * （`api/forms/[code]/responses/export`）が本番で落ちていた。表を
 * `lib/status-map.ts`（素の TS）へ出して直した。
 *
 * 直し方は常に同じ: **値をクライアント境界の外へ出し**、コンポーネントだけを
 * `"use client"` に残す。「サーバ側を `"use client"` にする」ではない。
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "src";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 先頭のコメントを飛ばして `"use client"` を見る。 */
function hasUseClient(src: string): boolean {
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use client["'];/.test(
    src,
  );
}

/** `Foo` / `FooBar` = コンポーネント（描画は許される）。`FOO_BAR` は定数。 */
function looksLikeComponent(name: string): boolean {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name);
}

const FILES = sourceFiles(ROOT);
const IS_CLIENT = new Map(
  FILES.map((f) => [f, hasUseClient(readFileSync(f, "utf8"))]),
);

/** `@/x` と相対指定だけ解決する（node_modules は対象外）。 */
function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? path.join(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (IS_CLIENT.has(candidate)) return candidate;
  }
  return null;
}

describe("クライアント境界", () => {
  it("サーバ側のモジュールが 'use client' の値を import していない", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      if (IS_CLIENT.get(file)) continue; // client → client は普通の import
      if (/\.test\.tsx?$/.test(file)) continue; // vitest は node 実行で境界が無い

      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(
        /import\s*\{([^{}]*?)\}\s*from\s*["']([^"']+)["'];/g,
      )) {
        const target = resolveLocal(m[2], file);
        if (!target || !IS_CLIENT.get(target)) continue;

        for (const spec of m[1].split(",").map((s) => s.trim())) {
          if (!spec) continue;
          if (/^type\s/.test(spec)) continue; // 型はビルドで消える
          const name = spec.split(/\s+as\s+/)[0].trim();
          if (looksLikeComponent(name)) continue; // 描画される分には正しい
          offenders.push(`${file}: ${name} ← ${target}`);
        }
      }
    }

    expect(
      offenders,
      `'use client' の値をサーバから呼んでいます（本番だけ 500 になります）。` +
        `値をクライアント境界の外（素の .ts）へ出してください:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
