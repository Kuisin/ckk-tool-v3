/**
 * manual-links.test.ts — マニュアル本文の内部リンク（/manual/<lang>/…）が、
 * **リダイレクトに頼らず**実在するページを指していることを見張る。
 *
 * 在庫カテゴリの移設（#891）で旧パス `/operations/production/{product,material}-
 * inventory` には 308 リダイレクトを張ったが、本文 36 ファイルのリンクは旧パスの
 * まま残っていた。開けはする（リダイレクトされる）ので誰も気づかず、
 * 在庫の 2 ページが互いを旧パスで参照していたために Next の Link 先読みが
 * 旧 → 新 → 旧 … と**止まらないリクエストの輪**になっていた（実機検証で
 * `networkidle` が永久に来ない）。リンクは常に今の場所を指すこと。
 *
 * 見るもの: content/manual 配下の全 .md の `](/manual/<lang>/<slug>)` が、
 * その言語のファイル（ja は `<slug>.md`、他は `<slug>.<lang>.md`、または
 * `<slug>/index(.lang).md`）に対応すること。アンカー・クエリは無視する。
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./i18n";

const CONTENT = resolve(__dirname, "../../content");

/**
 * URL の先頭 → その木の置き場。管理マニュアル（/admin-manual）も同じ規則で
 * 見る — 以前は公開側だけを見ていて、管理側の存在しないページへのリンク
 * （ユーザー管理 → 特権アクセス）が誰にも気づかれずに残っていた。
 */
const TREES: Record<string, string> = {
  manual: join(CONTENT, "manual"),
  "admin-manual": join(CONTENT, "internal"),
};

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (ent.endsWith(".md")) out.push(p);
  }
  return out;
}

function pageFile(root: string, slug: string, lang: string): string[] {
  const locale = lang === "ja" ? "" : `.${lang}`;
  const base = slug === "" ? "index" : slug;
  // .mdx は生成物の API リファレンス（integration/reference）。
  return [".md", ".mdx"].flatMap((ext) => [
    join(root, `${base}${locale}${ext}`),
    join(root, base, `index${locale}${ext}`),
  ]);
}

describe("マニュアルの内部リンク", () => {
  it("/manual・/admin-manual の全リンクが実在するページを指す（リダイレクト頼みでない）", () => {
    const langs = LOCALES.join("|");
    const re = new RegExp(
      `\\]\\((/(${Object.keys(TREES).join("|")})/(${langs})(?:/([^)#?\\s]*))?)[^)]*\\)`,
      "g",
    );
    const broken: string[] = [];
    for (const file of walk(CONTENT)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(re)) {
        const root = TREES[m[2]];
        const lang = m[3];
        const slug = (m[4] ?? "").replace(/\/$/, "").replace(/\.md$/, "");
        // `…/index` は URL としては存在しない（index.md の URL は親フォルダ）。
        // ファイルは在るので下の照合は通ってしまい、開くと 404 になる —
        // 連携（API・Webhook）の 6 リンクが実際にそうなっていた。
        if (slug === "index" || slug.endsWith("/index")) {
          broken.push(
            `${file.slice(CONTENT.length + 1)} → ${m[1]}（/index は付けない）`,
          );
          continue;
        }
        if (!pageFile(root, slug, lang).some((p) => existsSync(p))) {
          broken.push(`${file.slice(CONTENT.length + 1)} → ${m[1]}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
