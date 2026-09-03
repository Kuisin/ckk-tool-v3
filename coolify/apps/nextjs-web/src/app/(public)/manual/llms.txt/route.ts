/**
 * /manual/llms.txt — 公開マニュアルの LLM 向けインデックス。
 * ja ページを一覧（1 行 = タイトル + URL + 説明）。生 Markdown は
 * /manual/ja/<slug>.md（rewrites → /llms-manual）で取得できる。
 * 管理マニュアル（internal）版は存在させない。
 */

import { manualSource } from "@/lib/manual-source";

export const revalidate = false;

export function GET(): Response {
  // ja ページだけを載せる静的インデックス（ファイル自身の doc comment の
  // とおり）。クローラー向けの発見用ファイルで閲覧者の locale という概念が
  // 無く、常に ja 版を指す。
  const lines = [
    "# CKK マニュアル", // i18n-ignore
    "",
    "> CKK 業務管理システムの公開ユーザーマニュアル。各ページの生 Markdown は URL 末尾に .md を付けて取得できます。", // i18n-ignore
    "",
  ];
  for (const page of manualSource.getPages("ja")) {
    const desc = page.data.description ? `: ${page.data.description}` : "";
    lines.push(`- [${page.data.title}](${page.url}.md)${desc}`);
  }
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
