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

const MANUAL_DIR = join(__dirname, "../../content/manual");
const WALK_DIR = join(
  __dirname,
  "../../../../../tools/docs-screenshots/walkthroughs",
);

/**
 * 動画の登録簿。**import せずに文字として読む** — あちらは Playwright の型に
 * 依っていて、このアプリの依存には Playwright が無い（import すると、道具の
 * 依存を入れていない環境で型検査ごと落ちる。CI の web ジョブがそうだった）。
 * 各ウォークスルーは 1 ファイルに `id:` と `docPage:` を 1 つずつ持つ。
 */
function readWalkthroughs(): { id: string; docPage: string }[] {
  const out: { id: string; docPage: string }[] = [];
  for (const name of readdirSync(WALK_DIR)) {
    if (!name.endsWith(".ts")) continue;
    const src = readFileSync(join(WALK_DIR, name), "utf8");
    const id = /^\s*id:\s*"([^"]+)"/m.exec(src)?.[1];
    const docPage = /^\s*docPage:\s*"([^"]+)"/m.exec(src)?.[1];
    if (id && docPage) out.push({ id, docPage });
  }
  return out;
}

const walkthroughs = readWalkthroughs();

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

  it("登録簿を読めている（5 本）", () => {
    expect(walkthroughs.map((w) => w.id).sort()).toEqual([
      "process-billing",
      "process-production",
      "process-purchasing",
      "process-sales",
      "process-shipping",
    ]);
  });

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
