/**
 * マニュアル本文の ```video フェンスが、実在する動画を指していること。
 *
 * 動画は git に無く、ページは「無ければ何も描かない」ので、id を書き間違えても
 * ビルドは通り、画面には何も出ず、誰も気づかない。ここで実際の Markdown と
 * 動画の登録簿（tools/docs-screenshots/walkthroughs — 録画するスクリプト）を
 * 突き合わせる。`docs:lint` も同じことを見るが、あちらは CI で回らない。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { walkthroughs } from "../../../../../tools/docs-screenshots/walkthroughs";

const MANUAL_DIR = join(__dirname, "../../content/manual");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".md")) yield p;
  }
}

/** ページ（接尾辞なし）→ そこに置かれた動画の id。 */
function embeds(): { page: string; lang: string; id: string }[] {
  const out: { page: string; lang: string; id: string }[] = [];
  for (const file of walk(MANUAL_DIR)) {
    const rel = relative(MANUAL_DIR, file);
    const m = /^(.*?)(?:\.(en|zh))?\.md$/.exec(rel);
    if (!m) continue;
    const md = readFileSync(file, "utf8");
    for (const f of md.matchAll(/^```video\n([^\n]*)\n```/gm)) {
      out.push({
        page: m[1] ?? "",
        lang: m[2] ?? "ja",
        id: (f[1] ?? "").trim(),
      });
    }
  }
  return out;
}

describe("マニュアルの動画の埋め込み", () => {
  const found = embeds();
  const pages = new Map(walkthroughs.map((w) => [w.id, w.docPage]));

  it("フェンスの id は登録簿にあり、その動画の載せ先のページに置かれている", () => {
    for (const e of found) {
      expect(pages.get(e.id), `${e.page} (${e.lang}): ${e.id}`).toBe(e.page);
    }
  });

  it("登録した動画は ja / en / zh の 3 ページすべてに置かれている", () => {
    for (const w of walkthroughs) {
      const langs = found
        .filter((e) => e.id === w.id)
        .map((e) => e.lang)
        .sort();
      expect(langs, w.id).toEqual(["en", "ja", "zh"]);
    }
  });

  it("id はファイル名にできる形（英小文字・数字・ハイフン）", () => {
    for (const w of walkthroughs) {
      expect(w.id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    }
  });
});
