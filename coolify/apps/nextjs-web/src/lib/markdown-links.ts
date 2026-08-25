/**
 * markdown-links.ts — Markdown 本文から外部 URL を拾う（純関数）。
 *
 * 拾った URL は保存時に link_index へ登録し（mintShortLinks）、描画時は
 * `/l/<code>` に差し替えて外部リンク確認ページを必ず経由させる。こうすると
 * link_blacklist による事後ブロックが**既に保存済みの文書にも遡って効く**。
 *
 * **本文そのものは書き換えない。** ソースを短縮 URL に置換してしまうと、
 * 人が書いた覚えのない差分が出て行差分と行コメントの追従が濁る。
 */

const LINK_PATTERNS = [
  // [表示](https://example.com)
  /\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g,
  // <https://example.com>
  /<(https?:\/\/[^\s>]+)>/g,
  // 素の URL（行中のどこでも）
  /(?<![("<])\bhttps?:\/\/[^\s<>()[\]"']+/g,
];

/** 末尾の句読点は URL に含めない（「…example.com。」のような書き方への保険）。 */
function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?、。）)\]]+$/, "");
}

export function collectMarkdownLinks(body: string): string[] {
  if (!body) return [];
  const found = new Set<string>();
  for (const pattern of LINK_PATTERNS) {
    // グローバル正規表現は lastIndex を持つので、使う前に必ず戻す。
    pattern.lastIndex = 0;
    let match = pattern.exec(body);
    while (match !== null) {
      const url = trimTrailing(match[1] ?? match[0]);
      if (url) found.add(url);
      match = pattern.exec(body);
    }
  }
  return [...found];
}
