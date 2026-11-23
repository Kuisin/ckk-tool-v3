/**
 * api-docs-sync.test.ts — API / Webhook リファレンスをコードに同期させる。
 *
 * `content/manual/integration/reference/` は **生成物**（fumadocs-openapi）。
 * 元は `api-resources.ts`（口の一覧）と `webhook-core.ts`（イベント登録簿）で、
 * 両者から `api-openapi.ts` が OpenAPI 3.1 文書を組み立て、ここで MDX にする。
 *
 * 口やイベントを足す・直すと、このテストが落ちて「生成し直して」と言う:
 *
 *     UPDATE_API_DOCS=1 pnpm test -- src/lib/api-docs-sync.test.ts
 *
 * ■ 英語で出す理由
 * 生成物は機械向けの契約（`_specs/i18n-glossary.md` §1 — 外部 API の本文は
 * 翻訳の対象外）なので ja / en / zh に分けない。他言語の画面では、案内の
 * ページ（手書き）から英語のリファレンスへリンクする。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { generateFilesOnly } from "fumadocs-openapi";
import { describe, expect, it } from "vitest";
import { openapi } from "./openapi";

const OUT = join(process.cwd(), "content/manual/integration/reference");

/** 手書きで置いてよいファイル（生成物の掃除から除く）。 */
const HAND_WRITTEN = new Set(["meta.json", "meta.en.json", "meta.zh.json"]);

function existingGenerated(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return existingGenerated(full, base);
    const rel = full.slice(base.length + 1);
    return HAND_WRITTEN.has(rel) ? [] : [rel];
  });
}

async function generate() {
  const files = await generateFilesOnly({
    input: openapi,
    per: "tag",
  });
  // **拡張子は .mdx のまま**（ロケールの接尾辞だけ足す）。生成物の中身は
  // `export default function Layout` と `<Comp …/>` = JSX で、fumadocs-mdx は
  // `.md` を素の Markdown として読むので、`.md` に直すと**ソースがそのまま本文に
  // 出る**（実際に出ていた — ページは 200 で開き、テストも通るので気づけなかった）。
  // **中身は同じ英語を 3 つのロケールに置く** — そうしないと en / zh のページから
  // `reference/…` へ張ったリンクが（実在しないので）切れ、言語切替でも行き先が消える。
  return files.flatMap((f) =>
    ["", ".en", ".zh"].map((suffix) => ({
      path: f.path.replace(/\.mdx$/, `${suffix}.mdx`),
      content: f.content,
    })),
  );
}

describe("API リファレンス（生成物）", () => {
  it("生成物がコードと一致している", async () => {
    const files = await generate();
    expect(files.length).toBeGreaterThan(0);
    // JSX を含むので .mdx でなければ描けない（generate() のコメント参照）。
    expect(files.filter((f) => !f.path.endsWith(".mdx"))).toEqual([]);

    if (process.env.UPDATE_API_DOCS === "1") {
      for (const rel of existingGenerated(OUT)) rmSync(join(OUT, rel));
      for (const f of files) {
        const to = join(OUT, f.path);
        mkdirSync(dirname(to), { recursive: true });
        writeFileSync(to, f.content);
      }
      return;
    }

    const stale: string[] = [];
    for (const f of files) {
      const to = join(OUT, f.path);
      if (!existsSync(to) || readFileSync(to, "utf8") !== f.content) {
        stale.push(f.path);
      }
    }
    const extra = existingGenerated(OUT).filter(
      (rel) => !files.some((f) => f.path === rel),
    );
    expect(
      { stale, extra },
      "生成物が古い / 余っている。UPDATE_API_DOCS=1 で書き出し直す",
    ).toEqual({ stale: [], extra: [] });
  });
});
