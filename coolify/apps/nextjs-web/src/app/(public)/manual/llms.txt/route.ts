/**
 * /manual/llms.txt — 公開マニュアルの LLM 向けインデックス。
 * ja ページを一覧（1 行 = タイトル + URL + 説明）。生 Markdown は
 * /manual/ja/<slug>.md（rewrites → /llms-manual）で取得できる。
 * 管理マニュアル（internal）版は存在させない。
 */

import { manualSource } from "@/lib/manual-source";

export const revalidate = false;

export function GET(): Response {
  const lines = [
    "# CKK マニュアル",
    "",
    "> CKK 業務管理システムの公開ユーザーマニュアル。各ページの生 Markdown は URL 末尾に .md を付けて取得できます。",
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
